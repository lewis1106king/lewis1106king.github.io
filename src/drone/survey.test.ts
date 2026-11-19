import type { MissionData, Zone } from '../mission/types';
import { dropDrone } from '../sync/handover';
import { ARRIVE_M, activePoint, buildRoute, confirmNext, flyToward, markArrival, markShot, southOf } from './survey';

function fail(message: string): never {
  throw new Error(message);
}

function zone(id: string, lat: number): Zone {
  return {
    id, missionId: 'ABC123', label: id, path: [
      { lat, lng: 127 }, { lat: lat + 0.0004, lng: 127 }, { lat, lng: 127.0004 },
    ],
    taskStatus: 'in_progress', observationStatus: 'unverified', reviewReason: '', memo: '',
    assigneeId: 'a', updatedAt: '2026-11-19T00:00:00.000Z',
  };
}

function board(): MissionData {
  return {
    mission: { id: 'ABC123', title: '새 수색', joinCode: 'ABC123', createdBy: 'a', createdAt: '2026-11-19T00:00:00.000Z' },
    members: [
      { userId: 'a', role: 'operator', callsign: '나', droneName: '', droneStatus: 'flying', battery: 80, lat: 37.5, lng: 127, accuracy: 5, heading: 0, speed: 0, camera: false, trail: [], updatedAt: '2026-11-19T00:00:00.000Z' },
      { userId: 'b', role: 'pilot', callsign: '상현', droneName: '', droneStatus: 'flying', battery: 80, lat: 37.51, lng: 127, accuracy: 5, heading: 0, speed: 0, camera: false, trail: [], updatedAt: '2026-11-19T00:00:00.000Z' },
    ],
    zones: [zone('구역1', 37.5), zone('구역2', 37.502)],
    points: [], handovers: [], photos: [], events: [], notices: [], waypoints: [],
  };
}

const routed = buildRoute(board(), 'a');
if (routed.waypoints?.[0]?.step !== 'enroute' || routed.waypoints?.[1]?.step !== 'wait') fail('첫 지점만 이동 중이어야 합니다.');
if (routed.zones[0]?.surveyStep !== 'enroute') fail('구역 기록에 단계가 남아야 합니다.');

const moved = flyToward({ lat: 37.5, lng: 127 }, { lat: 37.501, lng: 127 }, 18);
if (!moved.done && moved.lat <= 37.5) fail('목표 쪽으로 이동해야 합니다.');
const near = flyToward({ lat: 37.5001, lng: 127 }, { lat: 37.50012, lng: 127 }, 18);
if (!near.done) fail('가까운 목표는 도착으로 봅니다.');

const started = {
  ...routed,
  members: routed.members.map((member) => member.userId === 'a' ? {
    ...member,
    lat: routed.waypoints![0].lat,
    lng: routed.waypoints![0].lng,
  } : member),
};
const arrived = markArrival(started);
if (arrived.waypoints?.[0]?.step !== 'arrived') fail(`${ARRIVE_M}m 안이면 도착입니다.`);
const shot = markShot(arrived, arrived.waypoints![0].id);
const next = confirmNext(shot, shot.waypoints![0].id);
if (next.waypoints?.[0]?.step !== 'confirmed' || next.waypoints?.[1]?.step !== 'enroute') fail('확인 후 다음 지점으로 가야 합니다.');

const dropped = dropDrone(next, 'a', 'lost', Date.parse('2026-11-19T00:00:05.000Z'));
const rest = activePoint(dropped, 'b');
if (rest?.label !== '구역2' || rest.step !== 'enroute') fail('끊기면 남은 지점이 다른 드론에게 가야 합니다.');
if (dropped.zones.find((item) => item.id === '구역2')?.assigneeId !== 'b') fail('구역 담당도 함께 넘어가야 합니다.');

const seeded = southOf(routed.waypoints![0], 90);
if (seeded.lat >= routed.waypoints![0].lat) fail('시작 위치는 목표보다 남쪽입니다.');

console.log('survey tests passed');
