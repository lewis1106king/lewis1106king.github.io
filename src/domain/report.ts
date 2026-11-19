import { escapeHtml, observationLabel, taskLabel, unresolvedReasons, type ZoneRecord } from './rules';

export type ReportInput = {
  title: string;
  generatedAt: string;
  zones: Array<ZoneRecord & { memo: string; reviewReason: string }>;
  pendingZoneIds: string[];
  extra?: string;
};

export function reportHtml(input: ReportInput): string {
  const rows = input.zones.map((zone) => {
    const reasons = unresolvedReasons(zone, input.pendingZoneIds.includes(zone.id));
    if (!reasons.length) return '';
    const items = reasons.map((reason) => `<li>${escapeHtml(reason)}</li>`).join('');
    return `<section><h2>${escapeHtml(zone.label)}</h2><ul>${items}</ul><p>메모: ${escapeHtml(zone.memo || '없음')}</p><p>관측 사유: ${escapeHtml(zone.reviewReason || '없음')}</p><p>작업 ${escapeHtml(taskLabel[zone.taskStatus])} · 관측 ${escapeHtml(observationLabel[zone.observationStatus])} · 사진 ${zone.photoCount}장</p></section>`;
  }).filter(Boolean).join('');
  const extra = input.extra ? `<pre>${escapeHtml(input.extra)}</pre>` : '';
  return `<!doctype html><html lang="ko"><head><meta charset="utf-8"><title>${escapeHtml(input.title)} 수색 기록</title><style>body{font-family:sans-serif;max-width:760px;margin:32px auto;line-height:1.55;color:#191f28}h1{font-size:28px}section{border-top:1px solid #e5e8eb;padding:16px 0}pre{white-space:pre-wrap}</style></head><body><h1>${escapeHtml(input.title)}</h1><p>만든 시각 ${escapeHtml(input.generatedAt)}</p>${extra}${rows || '<p>미해결 구역이 없습니다.</p>'}<p><strong>한계:</strong> 이 기록은 점검을 위한 것입니다. 수색이 끝났거나 사람이 있는지 판정하지 않습니다. 기체를 조종한 기록도 아닙니다.</p></body></html>`;
}
