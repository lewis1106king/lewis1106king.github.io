import type { MissionData, Zone } from '../mission/types';
import { autoAssign, dropDrone, STALE_MS, undoHandover, ZONE_CAP } from './handover';

function fail(message: string): never {
  throw new Error(message);
}

const freshAt = '2026-11-17T00:00:20.000Z';
const now = Date.parse(freshAt);

function member(id: string, callsign: string, lat: number, lng: number, at = freshAt) {
  return {
    userId: id, role: 'pilot' as const, callsign, droneName: '', droneStatus: 'flying' as const,
    battery: null, lat, lng, accuracy: 10, updatedAt: at,
  };
}

function zone(id: string, assigneeId: string, lat: number, lng: number, memo = ''): Zone {
  return {
    id, missionId: 'ABC123', label: '구역 1', path: [
      { lat, lng }, { lat: lat + 0.01, lng }, { lat, lng: lng + 0.01 },
    ],
    taskStatus: 'in_progress', observationStatus: 'unverified', reviewReason: '', memo,
    assigneeId, updatedAt: '2026-11-17T00:00:00.000Z',
  };
}

function board(zones: Zone[], extra = member('near', '가까운', 37.5, 127)): MissionData {
  return {
    mission: { id: 'ABC123', title: '새 수색', joinCode: 'ABC123', createdBy: 'down', createdAt: '2026-11-17T00:00:00.000Z' },
    members: [
      member('down', '나', 37.2, 127.2),
      extra,
      member('far', '먼', 35.1, 129.1),
    ],
    zones,
    points: [],
    handovers: [],
    photos: [{
      id: 'p1', zoneId: zones[0]?.id ?? 'z', storagePath: 'p1', memo: '현장', uploadedBy: 'down',
      createdAt: '2026-11-17T00:00:00.000Z', ready: true, url: 'data:image/jpeg;base64,abc',
    }],
    events: [],
    notices: [],
  };
}

const moved = dropDrone(board([zone('z', 'down', 37.5, 127, '메모')]), 'down', 'lost', now);
if (moved.zones[0]?.assigneeId !== 'near') fail('가장 가까운 드론이 이어받아야 합니다.');
if (moved.zones[0]?.memo !== '메모') fail('메모는 그대로여야 합니다.');
if (moved.photos[0]?.url !== 'data:image/jpeg;base64,abc') fail('사진은 그대로여야 합니다.');
if (moved.handovers[0]?.status !== 'approved' || moved.handovers[0]?.approvalReason !== '자동') fail('인계는 자동 완료여야 합니다.');
if (!moved.notices[0]?.message.includes('가까운')) fail('알림에 새 담당이 있어야 합니다.');
if (autoAssign(moved, now) === moved) { /* same reference when nothing changes */ }
if (autoAssign(moved, now).zones[0]?.assigneeId !== 'near') fail('같은 인계를 다시 하면 안 됩니다.');

const busy = board([zone('z', 'down', 37.5, 127)]);
busy.zones.push(
  { ...zone('a', 'near', 37.5, 127), id: 'a', label: '가' },
  { ...zone('b', 'near', 37.5, 127), id: 'b', label: '나' },
  { ...zone('c', 'near', 37.5, 127), id: 'c', label: '다' },
);
if (busy.zones.filter((item) => item.assigneeId === 'near').length !== ZONE_CAP) fail('용량 준비');
const spilled = dropDrone(busy, 'down', 'lost', now);
if (spilled.zones.find((item) => item.id === 'z')?.assigneeId !== 'far') fail('가득 찬 드론 대신 다음 드론이 받아야 합니다.');

const drained = board([zone('z', 'down', 37.5, 127)]);
const low = dropDrone(drained, 'down', 'battery', now);
if (low.members.find((item) => item.userId === 'down')?.battery !== 8) fail('배터리가 낮아야 합니다.');
if (low.zones[0]?.assigneeId !== 'near') fail('배터리 부족도 자동 인계여야 합니다.');

const quiet = board([zone('z', 'down', 37.5, 127)]);
quiet.members = quiet.members.map((item) => item.userId === 'down' ? { ...item, updatedAt: '2026-11-17T00:00:00.000Z' } : item);
const silent = autoAssign(quiet, Date.parse('2026-11-17T00:00:00.000Z') + STALE_MS + 1000);
if (silent.zones[0]?.assigneeId !== 'near') fail('응답이 없으면 넘깁니다.');

const undone = undoHandover(moved, moved.handovers[0].id);
if (undone.zones[0]?.assigneeId !== 'down') fail('되돌리면 이전 드론입니다.');
if (autoAssign(undone, Date.parse(undone.members.find((item) => item.userId === 'down')?.updatedAt ?? '') + 5000).zones[0]?.assigneeId !== 'down') {
  fail('되돌린 인계는 자동으로 다시 하지 않습니다.');
}

const finished = board([{ ...zone('z', 'down', 37.5, 127), taskStatus: 'completed' }]);
if (dropDrone(finished, 'down', 'lost', now).zones[0]?.assigneeId !== 'down') fail('끝난 구역은 넘기지 않습니다.');

console.log('handover tests passed');
