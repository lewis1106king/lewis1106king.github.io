import type { MissionData } from '../mission/types';
import { addZone, approveStop, completeZone, ensureMember, requestStop } from './edit';
import { canonical, fromWire, mergeMission, toWire } from './merge';

function equal(actual: unknown, expected: unknown, message: string): void {
  const left = JSON.stringify(actual);
  const right = JSON.stringify(expected);
  if (left !== right) throw new Error(`${message}: ${left} !== ${right}`);
}

function mission(code: string): MissionData {
  return {
    mission: { id: code, title: '새 수색', joinCode: code, createdBy: 'a', createdAt: '2026-11-17T00:00:00.000Z' },
    members: [{
      userId: 'a', role: 'operator', callsign: '나', droneName: '', droneStatus: 'ground',
      lat: null, lng: null, accuracy: null, updatedAt: '2026-11-17T00:00:00.000Z',
    }],
    zones: [], points: [], handovers: [], photos: [], events: [], notices: [],
  };
}

const local = addZone(mission('ABC123'), 'a', '구역 1', [
  { lat: 37.5, lng: 127 }, { lat: 37.51, lng: 127 }, { lat: 37.5, lng: 127.02 },
]);
const remote = ensureMember(mission('ABC123'), 'b', '상현', 'pilot');
const merged = mergeMission(local, remote);
if (merged.zones.length !== 1 || merged.members.length !== 2) throw new Error('구역과 사람이 함께 남아야 합니다.');

const done = completeZone(local, local.zones[0].id);
const olderWins = mergeMission(done, local);
if (olderWins.zones[0]?.taskStatus !== 'completed') throw new Error('더 최근 구역 상태가 이겨야 합니다.');

const withPhoto = {
  ...local,
  photos: [{
    id: 'p1', zoneId: local.zones[0].id, storagePath: 'p1', memo: '', uploadedBy: 'a',
    createdAt: '2026-11-17T00:01:00.000Z', ready: true, url: 'data:image/jpeg;base64,abc',
  }],
};
const remotePhoto = fromWire(toWire(withPhoto));
if (!remotePhoto || remotePhoto.photos[0]?.url !== null || remotePhoto.photos[0]?.ready !== true) throw new Error('전송본은 사진 본문을 빼야 합니다.');
const kept = mergeMission(withPhoto, remotePhoto);
if (kept.photos[0]?.url !== 'data:image/jpeg;base64,abc') throw new Error('이미 가진 사진을 유지해야 합니다.');

const stopped = requestStop(local, local.zones[0].id, 'b', '통신이 끊겼어요');
const approved = approveStop(stopped, stopped.handovers[0].id, 'a');
if (approved.handovers[0]?.status !== 'approved' || approved.zones[0]?.taskStatus !== 'assigned') throw new Error('승인 후 배정이어야 합니다.');

const again = fromWire(toWire(merged));
if (!again) throw new Error('전송 본문을 다시 읽어야 합니다.');
equal(canonical(mergeMission(merged, again)), canonical(merged), '같은 상태는 다시 보내지 않을 만큼 같아야 합니다.');
