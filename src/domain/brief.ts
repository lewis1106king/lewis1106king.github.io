import { cellCovers, searchGrid } from '../map/geo';
import type { MissionData } from '../mission/types';

export function zoneCover(path: { lat: number; lng: number }[], trails: { lat: number; lng: number }[], stepMeters = 40): { seen: number; total: number } {
  const cells = searchGrid(path, stepMeters);
  const seen = cells.filter((cell) => trails.some((point) => cellCovers(cell, point))).length;
  return { seen, total: cells.length };
}

export function briefingText(data: MissionData, stepMeters = 40): string {
  const trails = data.members.flatMap((member) => member.trail);
  const zones = data.zones.map((zone) => {
    const cover = zoneCover(zone.path, trails, stepMeters);
    const ratio = cover.total ? Math.round((cover.seen / cover.total) * 100) : 0;
    return `${zone.label}: ${cover.total && ratio === 0 ? '미수색' : `수색 ${ratio}%`}`;
  });
  const clues = data.points.filter((point) => point.kind === 'clue').map((point) => (
    `의심 ${point.lat.toFixed(5)}, ${point.lng.toFixed(5)} ${point.memo || point.label}`
  ));
  const seen = data.lastSeen
    ? `최종 목격 ${data.lastSeen.lat.toFixed(5)}, ${data.lastSeen.lng.toFixed(5)} 반경 ${data.lastSeen.radius}m ${data.lastSeen.note}`
    : '최종 목격 없음';
  const people = data.members.map((member) => member.callsign).join(', ') || '없음';
  return [
    `수색 ${data.mission.joinCode}`,
    seen,
    zones.length ? zones.join('\n') : '구역 없음',
    clues.length ? clues.join('\n') : '의심 지점 없음',
    `함께 ${people}`,
    '이 글은 지금까지의 기록입니다. 수색이 끝났다는 뜻은 아닙니다.',
  ].join('\n');
}
