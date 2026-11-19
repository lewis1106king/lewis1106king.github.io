import { movedMeters, type LatLng } from '../domain/rules';
import { bearing } from '../map/geo';
import type { MissionData, Waypoint, Zone } from '../mission/types';

export const ARRIVE_M = 22;
export const SIM_STEP_M = 18;

const labels = ['대기', '이동 중', '도착', '촬영 완료', '확인'] as const;

export function stepLabel(step: Waypoint['step']): string {
  return { wait: '대기', enroute: '이동 중', arrived: '도착', shot: '촬영 완료', confirmed: '확인' }[step];
}

export function routeCenter(zone: Zone): LatLng | null {
  if (zone.path.length < 3) return null;
  return {
    lat: zone.path.reduce((sum, point) => sum + point.lat, 0) / zone.path.length,
    lng: zone.path.reduce((sum, point) => sum + point.lng, 0) / zone.path.length,
  };
}

function stampFor(value: string): string {
  return value || new Date().toISOString();
}

function syncSteps(data: MissionData): MissionData {
  const waypoints = data.waypoints ?? [];
  return {
    ...data,
    zones: data.zones.map((zone) => {
      const point = waypoints.find((item) => item.zoneId === zone.id);
      return point ? { ...zone, surveyStep: point.step, assigneeId: point.step === 'confirmed' ? zone.assigneeId : point.assigneeId } : zone;
    }),
  };
}

export function buildRoute(data: MissionData, selfId: string): MissionData {
  const stamp = new Date().toISOString();
  const waypoints: Waypoint[] = [];
  data.zones.forEach((zone) => {
    const center = routeCenter(zone);
    if (!center) return;
    waypoints.push({
      id: `wp-${zone.id}`,
      zoneId: zone.id,
      lat: center.lat,
      lng: center.lng,
      label: zone.label,
      assigneeId: zone.assigneeId || selfId,
      order: waypoints.length,
      step: 'wait',
      updatedAt: stamp,
    });
  });
  if (!waypoints.length) return data;
  const lead = waypoints.find((point) => point.assigneeId === selfId) ?? waypoints[0];
  lead.step = 'enroute';
  return syncSteps({ ...data, waypoints });
}

export function applyCraft(data: MissionData, selfId: string, fix: {
  lat: number; lng: number; alt: number | null; heading: number | null; speed: number | null; battery: number | null;
}): MissionData {
  const current = data.members.find((member) => member.userId === selfId);
  if (!current || current.droneStatus === 'lost') return data;
  const stamp = new Date().toISOString();
  const trail = current.lat === null || movedMeters({ lat: current.lat, lng: current.lng ?? fix.lng }, fix) > 4
    ? [...current.trail, { lat: fix.lat, lng: fix.lng }].slice(-30)
    : current.trail;
  return {
    ...data,
    members: data.members.map((member) => member.userId === selfId ? {
      ...member,
      lat: fix.lat,
      lng: fix.lng,
      alt: fix.alt,
      heading: fix.heading,
      speed: fix.speed,
      battery: fix.battery ?? member.battery,
      trail,
      droneStatus: 'flying',
      updatedAt: stamp,
    } : member),
  };
}

export function placeCraft(data: MissionData, selfId: string, point: LatLng): MissionData {
  return {
    ...data,
    members: data.members.map((member) => member.userId === selfId ? {
      ...member,
      lat: point.lat,
      lng: point.lng,
      alt: member.alt ?? 30,
      droneStatus: 'flying',
      battery: member.battery !== null && member.battery <= 15 ? member.battery : 76,
      updatedAt: new Date().toISOString(),
    } : member),
  };
}

export function activePoint(data: MissionData, selfId: string): Waypoint | null {
  return (data.waypoints ?? [])
    .filter((point) => point.assigneeId === selfId && point.step !== 'confirmed')
    .sort((a, b) => a.order - b.order)[0] ?? null;
}

export function markArrival(data: MissionData): MissionData {
  let changed = false;
  const waypoints = (data.waypoints ?? []).map((point) => {
    if (point.step !== 'enroute') return point;
    const member = data.members.find((item) => item.userId === point.assigneeId);
    if (!member || member.lat === null || member.lng === null || member.droneStatus === 'lost') return point;
    if (movedMeters({ lat: member.lat, lng: member.lng }, point) > ARRIVE_M) return point;
    changed = true;
    return { ...point, step: 'arrived' as const, updatedAt: stampFor(member.updatedAt) };
  });
  return changed ? syncSteps({ ...data, waypoints }) : data;
}

export function markShot(data: MissionData, pointId: string): MissionData {
  const point = (data.waypoints ?? []).find((item) => item.id === pointId);
  if (!point || point.step !== 'arrived') return data;
  const stamp = new Date().toISOString();
  return syncSteps({
    ...data,
    waypoints: (data.waypoints ?? []).map((item) => item.id === pointId ? { ...item, step: 'shot' as const, updatedAt: stamp } : item),
  });
}

export function confirmNext(data: MissionData, pointId: string): MissionData {
  const point = (data.waypoints ?? []).find((item) => item.id === pointId);
  if (!point || (point.step !== 'shot' && point.step !== 'arrived')) return data;
  const stamp = new Date().toISOString();
  const mine = (data.waypoints ?? []).filter((item) => item.assigneeId === point.assigneeId).sort((a, b) => a.order - b.order);
  const index = mine.findIndex((item) => item.id === pointId);
  const next = mine.slice(index + 1).find((item) => item.step === 'wait');
  return syncSteps({
    ...data,
    waypoints: (data.waypoints ?? []).map((item) => {
      if (item.id === pointId) return { ...item, step: 'confirmed' as const, updatedAt: stamp };
      if (next && item.id === next.id) return { ...item, step: 'enroute' as const, updatedAt: stamp };
      return item;
    }),
  });
}

export function autoFollow(data: MissionData): MissionData {
  if (!data.mission.autoRun) return data;
  return (data.waypoints ?? []).filter((point) => point.step === 'shot').reduce((next, point) => confirmNext(next, point.id), data);
}

export function setAutoRun(data: MissionData, autoRun: boolean): MissionData {
  return { ...data, mission: { ...data.mission, autoRun, autoRunAt: new Date().toISOString() } };
}

export function flyToward(from: LatLng, to: LatLng, step = SIM_STEP_M): { lat: number; lng: number; heading: number; speed: number; done: boolean } {
  const distance = movedMeters(from, to);
  const heading = bearing(from, to);
  if (distance <= Math.max(step, ARRIVE_M)) {
    return { lat: to.lat, lng: to.lng, heading, speed: 0, done: true };
  }
  const ratio = step / distance;
  return {
    lat: from.lat + (to.lat - from.lat) * ratio,
    lng: from.lng + (to.lng - from.lng) * ratio,
    heading,
    speed: Math.round(step / 0.25),
    done: false,
  };
}

export function southOf(point: LatLng, meters: number): LatLng {
  return { lat: point.lat - meters / 111_320, lng: point.lng };
}

export { labels };
