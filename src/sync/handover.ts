import { movedMeters, type LatLng } from '../domain/rules';
import type { Member, MissionData, Zone } from '../mission/types';

export const STALE_MS = 12_000;
export const ZONE_CAP = 3;
const LOW_BATTERY = 15;

function time(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function center(zone: Zone): LatLng | null {
  if (!zone.path.length) return null;
  return {
    lat: zone.path.reduce((sum, point) => sum + point.lat, 0) / zone.path.length,
    lng: zone.path.reduce((sum, point) => sum + point.lng, 0) / zone.path.length,
  };
}

export function downReason(member: Member, nowMs: number): string | null {
  if (member.droneStatus === 'lost') return '연결이 끊겼습니다';
  if (member.battery !== null && member.battery <= LOW_BATTERY) return '배터리가 없습니다';
  if (nowMs - time(member.updatedAt) > STALE_MS) return '응답이 없습니다';
  return null;
}

function cause(member: Member, reason: string): string {
  if (reason.startsWith('연결')) return `lost:${member.updatedAt}`;
  if (reason.startsWith('배터리')) return `battery:${member.updatedAt}`;
  return `silent:${member.updatedAt}`;
}

function load(data: MissionData, userId: string): number {
  return data.zones.filter((zone) => zone.assigneeId === userId && zone.taskStatus !== 'completed').length;
}

function pick(data: MissionData, zone: Zone, fromId: string, nowMs: number): Member | null {
  const origin = center(zone);
  const candidates = data.members.filter((member) => (
    member.userId !== fromId && !downReason(member, nowMs) && load(data, member.userId) < ZONE_CAP
  ));
  if (!candidates.length) return null;
  return [...candidates].sort((left, right) => {
    const distance = (member: Member) => (
      origin && member.lat !== null && member.lng !== null
        ? movedMeters(origin, { lat: member.lat, lng: member.lng })
        : Number.POSITIVE_INFINITY
    );
    const gap = distance(left) - distance(right);
    if (gap !== 0) return gap;
    const work = load(data, left.userId) - load(data, right.userId);
    if (work !== 0) return work;
    return left.userId.localeCompare(right.userId);
  })[0];
}

function callsign(data: MissionData, userId: string): string {
  return data.members.find((member) => member.userId === userId)?.callsign || '드론';
}

function handZone(data: MissionData, zone: Zone, from: Member, reason: string, nowMs: number): MissionData {
  const id = `auto:${zone.id}:${from.userId}:${cause(from, reason)}`.slice(0, 180);
  if (data.handovers.some((item) => item.id === id)) return data;
  const target = pick(data, zone, from.userId, nowMs);
  if (!target) return data;
  const stamp = new Date(Math.max(time(zone.updatedAt), time(from.updatedAt)) + 1000).toISOString();
  const message = `${zone.label}을 ${callsign(data, target.userId)}에게 넘겼습니다. ${reason}`.slice(0, 80);
  return {
    ...data,
    zones: data.zones.map((item) => item.id === zone.id ? {
      ...item,
      assigneeId: target.userId,
      taskStatus: 'assigned',
      updatedAt: stamp,
    } : item),
    handovers: [...data.handovers, {
      id,
      zoneId: zone.id,
      fromUser: from.userId,
      toUser: target.userId,
      previousStatus: zone.taskStatus,
      interruptionReason: reason,
      approvalReason: '자동',
      status: 'approved',
      requestedAt: stamp,
      decidedAt: stamp,
    }],
    events: [{ id, kind: 'handover', message, actorId: null, createdAt: stamp }, ...data.events].slice(0, 40),
    notices: [{ id, message, readAt: null, createdAt: stamp }, ...data.notices].slice(0, 20),
  };
}

export function autoAssign(data: MissionData, nowMs: number): MissionData {
  let next = data;
  for (const member of data.members) {
    const reason = downReason(member, nowMs);
    if (!reason) continue;
    const zones = next.zones.filter((zone) => zone.assigneeId === member.userId && zone.taskStatus !== 'completed');
    for (const zone of zones) next = handZone(next, zone, member, reason, nowMs);
  }
  return next;
}

export function dropDrone(data: MissionData, selfId: string, kind: 'lost' | 'battery', nowMs = Date.now()): MissionData {
  const stamp = new Date(nowMs).toISOString();
  const members = data.members.map((member) => member.userId === selfId ? {
    ...member,
    droneStatus: kind === 'lost' ? 'lost' as const : member.droneStatus,
    battery: kind === 'battery' ? 8 : member.battery,
    updatedAt: stamp,
  } : member);
  return autoAssign({ ...data, members }, nowMs + 1);
}

export function undoHandover(data: MissionData, handoverId: string): MissionData {
  const handover = data.handovers.find((item) => item.id === handoverId && item.status === 'approved');
  if (!handover) return data;
  const zone = data.zones.find((item) => item.id === handover.zoneId);
  if (!zone) return data;
  const stamp = new Date().toISOString();
  const message = `${zone.label} 인계를 되돌렸습니다.`;
  return {
    ...data,
    zones: data.zones.map((item) => item.id === zone.id ? {
      ...item,
      assigneeId: handover.fromUser,
      taskStatus: handover.previousStatus,
      updatedAt: stamp,
    } : item),
    handovers: data.handovers.map((item) => item.id === handoverId ? { ...item, status: 'rejected' as const, decidedAt: stamp } : item),
    events: [{ id: `undo:${handoverId}`.slice(0, 180), kind: 'undo', message, actorId: null, createdAt: stamp }, ...data.events].slice(0, 40),
    notices: [{ id: `undo:${handoverId}`.slice(0, 180), message, readAt: null, createdAt: stamp }, ...data.notices].slice(0, 20),
  };
}
