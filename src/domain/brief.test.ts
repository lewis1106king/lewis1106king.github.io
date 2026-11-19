import { briefingText, zoneCover } from './brief';
import type { MissionData } from '../mission/types';

const empty: MissionData = {
  mission: { id: 'ABC123', title: '새 수색', joinCode: 'ABC123', createdBy: 'a', createdAt: '2026-11-20T00:00:00.000Z' },
  members: [{
    userId: 'a', role: 'operator', callsign: '나', droneName: '', droneStatus: 'ground', battery: null,
    lat: null, lng: null, accuracy: null, heading: null, speed: null, camera: false, trail: [], updatedAt: '2026-11-20T00:00:00.000Z',
  }],
  zones: [],
  points: [],
  handovers: [],
  photos: [],
  events: [],
  notices: [],
  waypoints: [],
  lastSeen: { lat: 37.6, lng: 126.7, radius: 500, note: '운동장', at: '2026-11-20T00:00:00.000Z', by: 'a' },
};
const text = briefingText(empty);
if (!text.includes('ABC123') || !text.includes('최종 목격') || !text.includes('수색이 끝났다는 뜻은 아닙니다')) {
  throw new Error('요약에 코드와 한계가 있어야 합니다.');
}
const cover = zoneCover([
  { lat: 37, lng: 127 }, { lat: 37.01, lng: 127 }, { lat: 37, lng: 127.01 },
], []);
if (cover.total < 1 || cover.seen !== 0) throw new Error('발자국이 없으면 미수색입니다.');
console.log('brief tests passed');
