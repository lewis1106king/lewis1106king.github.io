import type { FieldZone, OfflineProject } from './model';
import { inspectProject, type CheckIssue } from './validation';

export type UnresolvedReport = {
  generatedAt: string;
  projectTitle: string;
  inputUpdatedAt: string;
  mapName: string | null;
  zones: FieldZone[];
  issues: CheckIssue[];
  unresolvedZoneIds: string[];
};

const cloneZone = (zone: FieldZone): FieldZone => ({
  ...zone,
  evidence: zone.evidence.map((evidence) => ({ ...evidence })),
});

const escapeHtml = (value: string): string => value
  .replace(/&/g, '&amp;')
  .replace(/</g, '&lt;')
  .replace(/>/g, '&gt;')
  .replace(/"/g, '&quot;')
  .replace(/'/g, '&#39;');

/** 보고서에는 점검 기준상 아직 확인·보완이 필요한 구역을 한 번씩만 담는다. */
export function createUnresolvedReport(project: OfflineProject): UnresolvedReport {
  const issues = inspectProject(project);
  const unresolved = new Set<string>();

  for (const zone of project.zones) {
    if (zone.observationStatus !== 'confirmed'
      || zone.evidence.length === 0
      || (zone.taskStatus !== 'completed' && zone.droneId === null)) {
      unresolved.add(zone.id);
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    projectTitle: project.title,
    inputUpdatedAt: project.updatedAt,
    mapName: project.map?.name ?? null,
    zones: project.zones.map(cloneZone),
    issues: issues.map((issue) => ({ ...issue })),
    unresolvedZoneIds: project.zones
      .map((zone) => zone.id)
      .filter((zoneId) => unresolved.has(zoneId)),
  };
}

/** 사용자 입력을 모두 텍스트로 이스케이프한 독립 인쇄용 HTML을 생성한다. */
export function reportHtml(report: UnresolvedReport): string {
  const issueByZone = new Map<string, CheckIssue[]>();
  for (const issue of report.issues) {
    const current = issueByZone.get(issue.zoneId) ?? [];
    current.push(issue);
    issueByZone.set(issue.zoneId, current);
  }

  const unresolvedZones = report.unresolvedZoneIds
    .map((zoneId) => report.zones.find((zone) => zone.id === zoneId))
    .filter((zone): zone is FieldZone => Boolean(zone));

  const zoneRows = unresolvedZones.length === 0
    ? '<p>현재 점검 기준에서 미해결 구역이 없습니다.</p>'
    : `<ol>${unresolvedZones.map((zone) => {
      const zoneIssues = issueByZone.get(zone.id) ?? [];
      const reasons = zoneIssues.length === 0
        ? '<li>관측 또는 담당 상태를 다시 확인하세요.</li>'
        : zoneIssues.map((issue) => `<li><strong>${escapeHtml(issue.title)}</strong>: ${escapeHtml(issue.message)}</li>`).join('');
      const evidence = zone.evidence.length === 0
        ? '<p>자료 참조: 없음</p>'
        : `<p>자료 참조: ${zone.evidence.map((item) => `${escapeHtml(item.label)}${item.memo ? ` — ${escapeHtml(item.memo)}` : ''}`).join(' / ')}</p>`;
      return `<li><h2>${escapeHtml(zone.id)} · 구역 ${zone.number}</h2><ul>${reasons}</ul>${evidence}</li>`;
    }).join('')}</ol>`;

  const mapName = report.mapName ? escapeHtml(report.mapName) : '선택된 도면 없음';
  return `<!doctype html>
<html lang="ko">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(report.projectTitle)} · 미해결 구역 보고</title>
<style>
body { font-family: system-ui, sans-serif; color: #172033; line-height: 1.55; margin: 2rem auto; max-width: 900px; padding: 0 1rem; }
h1 { margin-bottom: .25rem; } h2 { font-size: 1.05rem; } li { margin: .5rem 0; }
.meta { color: #46536b; } .limit { border-left: 4px solid #d97706; background: #fffbeb; padding: .8rem 1rem; }
</style>
</head>
<body>
<h1>현장 수색 미해결 구역 보고</h1>
<p class="meta">프로젝트: ${escapeHtml(report.projectTitle)}<br>생성 시각: ${escapeHtml(report.generatedAt)}<br>입력 갱신 시각: ${escapeHtml(report.inputUpdatedAt)}<br>도면: ${mapName}<br>전체 구역 수: ${report.zones.length}<br>미해결 구역 수: ${unresolvedZones.length}</p>
<section>
<h2>미해결 구역 및 사유</h2>
${zoneRows}
</section>
<p class="limit"><strong>한계:</strong> 이 보고서는 기록 점검용 가상 시연 자료이며 수색 종료·안전·인명 부재를 판정하지 않습니다.</p>
</body>
</html>`;
}
