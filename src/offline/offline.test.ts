import {
  MAX_IMAGE_BYTES,
  MAX_PROJECT_BYTES,
  addEvidence,
  addInterestPoint,
  createOfflineProject,
  parseOfflineProject,
  serializeOfflineProject,
  updateZone,
  validateOfflineProject,
} from './model';
import { createUnresolvedReport, reportHtml } from './report';
import { inspectProject } from './validation';

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: expected ${String(expected)}, got ${String(actual)}`);
}

function ok(value: unknown, message: string): asserts value {
  if (!value) throw new Error(message);
}

function hasIssue(issues: ReturnType<typeof inspectProject>, zoneId: string, kind: string): boolean {
  return issues.some((issue) => issue.zoneId === zoneId && issue.kind === kind);
}

// 생성은 data.ts의 12개 구역과 가상 자료를 독립 복사하고, JSON 왕복 후에도 유효하다.
const initial = createOfflineProject();
equal(initial.version, 1, '오프라인 프로젝트 버전');
equal(initial.zones.length, 12, '초기 구역 수');
equal(initial.zones[0].id, 'Z-01', '초기 첫 구역');
ok(initial.zones.every((zone) => zone.x >= 0 && zone.x <= 100 && zone.y >= 0 && zone.y <= 100), '초기 좌표 범위');
ok(validateOfflineProject(initial), '초기 프로젝트 유효');
const initialSnapshot = JSON.stringify(initial);
const loaded = parseOfflineProject(serializeOfflineProject(initial));
ok(loaded.ok, '직렬화 JSON 복원');
equal(loaded.project.zones.length, 12, '복원 구역 수');
equal(JSON.stringify(initial), initialSnapshot, 'JSON 복원은 기존 프로젝트를 변경하지 않음');

// 버전과 파일 용량이 잘못된 JSON은 기존 상태를 반환하거나 변경하지 않는 실패 결과여야 한다.
const invalidVersion = parseOfflineProject(JSON.stringify({ ...initial, version: 2 }));
ok(!invalidVersion.ok, '다른 버전 거부');
const oversized = parseOfflineProject(serializeOfflineProject(initial), MAX_PROJECT_BYTES + 1);
ok(!oversized.ok && oversized.message.includes('5MB'), '프로젝트 용량 초과 안내');

// 도면은 엄격한 표준 Base64 Data URL의 실제 크기와 bytes 메타데이터가 정확히 일치해야 한다.
const minimalPngPayload = 'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9sJ6sAAAAASUVORK5CYII=';
const minimalPngMap = {
  name: '최소 도면.png',
  mime: 'image/png' as const,
  dataUrl: `data:image/png;base64,${minimalPngPayload}`,
  bytes: 68,
};
const withMap = { ...initial, map: minimalPngMap };
ok(validateOfflineProject(withMap), '정상 최소 PNG Data URL과 bytes 허용');
const loadedWithMap = parseOfflineProject(JSON.stringify(withMap));
ok(loadedWithMap.ok, '정상 PNG 도면 JSON 복원');

const mismatchedMap = { ...withMap, map: { ...minimalPngMap, bytes: 67 } };
ok(!validateOfflineProject(mismatchedMap), '도면 bytes 메타와 실제 Base64 payload 불일치 거부');
const mismatchedMapLoad = parseOfflineProject(JSON.stringify(mismatchedMap));
ok(!mismatchedMapLoad.ok && mismatchedMapLoad.message.includes('도면 이미지'), '도면 bytes 불일치 안내');

const oversizedPayload = 'AAAA'.repeat(Math.floor(MAX_IMAGE_BYTES / 3) + 1);
const forgedOversizedMap = {
  ...withMap,
  map: {
    ...minimalPngMap,
    dataUrl: `data:image/png;base64,${oversizedPayload}`,
    bytes: MAX_IMAGE_BYTES,
  },
};
ok(!validateOfflineProject(forgedOversizedMap), '2MB 초과 payload를 2MB 메타로 위조한 도면 거부');
const forgedOversizedLoad = parseOfflineProject(JSON.stringify(forgedOversizedMap));
ok(!forgedOversizedLoad.ok && forgedOversizedLoad.message.includes('도면 이미지 크기 또는 데이터'), '위조된 도면 크기 안내');

const malformedMap = {
  ...withMap,
  map: { ...minimalPngMap, dataUrl: `data:image/png;base64,${minimalPngPayload} ` },
};
ok(!validateOfflineProject(malformedMap), '공백이 있는 Base64 도면 거부');
const nonCanonicalPaddingMap = {
  ...withMap,
  map: { ...minimalPngMap, dataUrl: 'data:image/png;base64,AB==', bytes: 1 },
};
ok(!validateOfflineProject(nonCanonicalPaddingMap), '허용되지 않는 Base64 패딩 도면 거부');

// 관심 지점과 자료 참조 추가는 불변으로 동작한다.
const withPoint = addInterestPoint(initial, { x: 50, y: 50, label: '', memo: '도면에서 지정한 지점' });
equal(withPoint.points.length, 1, '관심 지점 추가');
equal(withPoint.points[0].label, '관심 지점 1', '기본 관심 지점 이름');
equal(initial.points.length, 0, '관심 지점 추가 원본 불변');
const withEvidence = addEvidence(withPoint, 'Z-03', { label: '현장 메모', memo: '현장 기록 참조' });
equal(withEvidence.zones.find((zone) => zone.id === 'Z-03')?.evidence.length, 1, '자료 참조 추가');
equal(withPoint.zones.find((zone) => zone.id === 'Z-03')?.evidence.length, 0, '자료 참조 추가 원본 불변');
ok(validateOfflineProject(withEvidence), '추가 후 프로젝트 유효');

// 여섯 점검 규칙은 각각 한 번씩 생성한다.
let checked = createOfflineProject();
checked = updateZone(checked, 'Z-04', { reviewReason: '' });
checked = updateZone(checked, 'Z-01', { confirmedBy: null, confirmedAt: null });
checked = updateZone(checked, 'Z-05', { observationStatus: 'unverified' });
const issues = inspectProject(checked);
ok(hasIssue(issues, 'Z-03', 'no-evidence'), '자료 없음 점검');
ok(hasIssue(issues, 'Z-02', 'review-pending'), '자료가 있지만 미확인 점검');
ok(hasIssue(issues, 'Z-04', 'recheck-reason-missing'), '재확인 사유 없음 점검');
ok(hasIssue(issues, 'Z-01', 'confirmed-metadata-missing'), '확인 메타데이터 없음 점검');
ok(hasIssue(issues, 'Z-11', 'unassigned-work'), '담당 없는 미완료 작업 점검');
ok(hasIssue(issues, 'Z-05', 'completed-with-open-review'), '완료 작업 관측 미확인 점검');
equal(new Set(issues.map((issue) => issue.id)).size, issues.length, '같은 규칙의 중복 점검 없음');

// 보고서의 미해결 구역은 중복하지 않고, HTML 사용자 입력은 이스케이프한다.
const unsafeProject = addEvidence(withEvidence, 'Z-04', { label: '<img src=x onerror=alert(1)>', memo: '"위험" & 메모' });
const report = createUnresolvedReport({ ...unsafeProject, title: '<현장 & 보고>' });
equal(report.unresolvedZoneIds.filter((zoneId) => zoneId === 'Z-04').length, 1, '미해결 구역 중복 제거');
const html = reportHtml(report);
ok(html.includes('&lt;현장 &amp; 보고&gt;'), '프로젝트 제목 HTML 이스케이프');
ok(html.includes('&lt;img src=x onerror=alert(1)&gt;'), '자료 이름 HTML 이스케이프');
ok(!html.includes('<img src=x onerror=alert(1)>'), '사용자 HTML 미삽입');
ok(html.includes('수색 종료·안전·인명 부재를 판정하지 않습니다.'), '보고서 한계 명시');

console.log('offline tests passed');
