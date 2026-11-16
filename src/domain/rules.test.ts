import {
  approvalResult,
  canRequestHandover,
  escapeHtml,
  isJoinCode,
  isValidPath,
  movedMeters,
  normalizeJoinCode,
  unresolvedReasons,
  type ZoneRecord,
} from './rules';

function equal<T>(actual: T, expected: T, message: string): void {
  if (actual !== expected) throw new Error(`${message}: ${String(actual)} !== ${String(expected)}`);
}

function ok(value: unknown, message: string): void {
  if (!value) throw new Error(message);
}

equal(normalizeJoinCode(' ab12-cd '), 'AB12CD', '참여 코드 정규화');
ok(isJoinCode('AB12CD'), '여섯 자리 코드');
ok(!isJoinCode('ab12'), '짧은 코드 거부');
ok(isValidPath([{ lat: 37.5, lng: 127 }, { lat: 37.6, lng: 127 }, { lat: 37.55, lng: 127.1 }]), '세 점 구역');
ok(!isValidPath([{ lat: 37.5, lng: 127 }, { lat: 37.6, lng: 127 }]), '두 점 거부');
ok(movedMeters({ lat: 37.5, lng: 127 }, { lat: 37.5, lng: 127 }) < 1, '같은 위치');
ok(movedMeters({ lat: 37.5, lng: 127 }, { lat: 37.51, lng: 127 }) > 1000, '위도 이동');

const zone: ZoneRecord = {
  id: 'z',
  label: '구역 1',
  taskStatus: 'in_progress',
  observationStatus: 'unverified',
  assigneeId: 'pilot',
  photoCount: 1,
};
ok(canRequestHandover(zone, false), '진행 중 인계 가능');
ok(!canRequestHandover(zone, true), '대기 중 인계 중복 금지');
ok(!canRequestHandover({ ...zone, taskStatus: 'completed' }, false), '완료 구역 인계 금지');

const approved = approvalResult({ approve: true, previousStatus: 'in_progress', toUserId: 'next' });
equal(approved.taskStatus, 'assigned', '승인 후 배정');
equal(approved.assigneeId, 'next', '승인 후 새 담당');
const rejected = approvalResult({ approve: false, previousStatus: 'in_progress', toUserId: null });
equal(rejected.taskStatus, 'in_progress', '반려 시 이전 작업');
let missing = false;
try {
  approvalResult({ approve: true, previousStatus: 'assigned', toUserId: null });
} catch {
  missing = true;
}
ok(missing, '담당 없는 승인 거부');

const reasons = unresolvedReasons(zone, true);
ok(reasons.some((reason) => reason.includes('관측')), '미확인 사유');
ok(reasons.some((reason) => reason.includes('인계')), '인계 대기 사유');
ok(!unresolvedReasons({ ...zone, taskStatus: 'completed', observationStatus: 'confirmed', photoCount: 2 }, false).length, '해결된 구역');
ok(escapeHtml('<img alt="사진">').includes('&lt;img'), '보고서 이스케이프');

console.log('domain tests passed');
