import { movedMeters, type DroneStatus, type LatLng, type Role } from '../domain/rules';
import { bearing } from '../map/geo';
import type { LastSeen, MissionData, PointKind, Zone } from '../mission/types';
function now(): string {
  return new Date().toISOString();
}

function round(value: number): number {
  return Math.round(value * 1e5) / 1e5;
}

function makeCode(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(3));
  return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('').toUpperCase();
}

export function freshMission(selfId: string, name: string): MissionData {
  const stamp = now();
  const code = makeCode();
  return {
    mission: { id: code, title: '새 수색', joinCode: code, createdBy: selfId, createdAt: stamp },
    members: [{
      userId: selfId,
      role: 'operator',
      callsign: name.trim() || '나',
      droneName: '',
      droneStatus: 'ground',
      battery: null,
      lat: null,
      lng: null,
      accuracy: null,
      heading: null,
      speed: null,
      camera: false,
      trail: [],
      updatedAt: stamp,
    }],
    zones: [],
    points: [],
    handovers: [],
    photos: [],
    events: [],
    notices: [],
    waypoints: [],
    lastSeen: null,
  };
}

export function ensureMember(data: MissionData, selfId: string, name: string, role: Role): MissionData {
  const stamp = now();
  const callsign = name.trim() || '나';
  const existing = data.members.find((member) => member.userId === selfId);
  if (existing) {
    if (existing.callsign === callsign) return data;
    return {
      ...data,
      members: data.members.map((member) => member.userId === selfId ? { ...member, callsign, updatedAt: stamp } : member),
    };
  }
  return {
    ...data,
    members: [...data.members, {
      userId: selfId,
      role,
      callsign,
      droneName: '',
      droneStatus: 'ground',
      battery: null,
      lat: null,
      lng: null,
      accuracy: null,
      heading: null,
      speed: null,
      camera: false,
      trail: [],
      updatedAt: stamp,
    }],
  };
}

export function addZone(data: MissionData, selfId: string, label: string, path: LatLng[]): MissionData {
  const stamp = now();
  const zone: Zone = {
    id: crypto.randomUUID(),
    missionId: data.mission.id,
    label,
    path,
    taskStatus: 'in_progress',
    observationStatus: 'unverified',
    reviewReason: '',
    memo: '',
    assigneeId: selfId,
    updatedAt: stamp,
  };
  return { ...data, zones: [...data.zones, zone] };
}

export function completeZone(data: MissionData, zoneId: string): MissionData {
  const stamp = now();
  return {
    ...data,
    zones: data.zones.map((zone) => zone.id === zoneId ? {
      ...zone,
      taskStatus: 'completed',
      observationStatus: 'confirmed',
      updatedAt: stamp,
    } : zone),
  };
}

export function addPhoto(data: MissionData, zoneId: string, selfId: string, url: string): MissionData {
  if (data.photos.length >= 16) return data;
  const stamp = now();
  const id = crypto.randomUUID();
  return {
    ...data,
    photos: [...data.photos, {
      id,
      zoneId,
      storagePath: id,
      memo: '',
      uploadedBy: selfId,
      createdAt: stamp,
      ready: true,
      url,
    }],
  };
}

export function moveMember(
  data: MissionData,
  selfId: string,
  position: { lat: number; lng: number; accuracy: number | null },
  droneStatus: DroneStatus,
): MissionData {
  const current = data.members.find((member) => member.userId === selfId);
  if (!current || current.droneStatus === 'lost') return data;
  if (current.battery !== null && current.battery <= 15) return data;
  const stamp = now();
  return {
    ...data,
    members: data.members.map((member) => member.userId === selfId ? {
      ...member,
      lat: round(position.lat),
      lng: round(position.lng),
      accuracy: position.accuracy,
      droneStatus,
      updatedAt: stamp,
    } : member),
  };
}

export type Fix = {
  lat: number;
  lng: number;
  accuracy: number | null;
  heading: number | null;
  speed: number | null;
};

export function beat(data: MissionData, selfId: string, position: Fix | null): MissionData {
  const current = data.members.find((member) => member.userId === selfId);
  if (!current || current.droneStatus === 'lost') return data;
  if (current.battery !== null && current.battery <= 15) return data;
  const stamp = now();
  const lat = position ? round(position.lat) : current.lat;
  const lng = position ? round(position.lng) : current.lng;
  const previous = current.lat !== null && current.lng !== null ? { lat: current.lat, lng: current.lng } : null;
  const nextPoint = lat !== null && lng !== null ? { lat, lng } : null;
  const moved = previous && nextPoint ? movedMeters(previous, nextPoint) : 0;
  const elapsed = Math.max(1, (Date.parse(stamp) - Date.parse(current.updatedAt)) / 1000);
  const heading = position?.heading ?? (previous && nextPoint && moved > 3 ? Math.round(bearing(previous, nextPoint)) : current.heading);
  const speed = position?.speed ?? (moved > 3 ? Math.round((moved / elapsed) * 10) / 10 : current.speed);
  const trail = nextPoint && (!previous || moved > 4)
    ? [...current.trail, nextPoint].slice(-30)
    : current.trail;
  return {
    ...data,
    members: data.members.map((member) => member.userId === selfId ? {
      ...member,
      lat,
      lng,
      accuracy: position ? position.accuracy : member.accuracy,
      heading,
      speed,
      trail,
      droneStatus: position ? 'flying' : 'ready',
      updatedAt: stamp,
    } : member),
  };
}

export function setLevel(data: MissionData, selfId: string, level: number): MissionData {
  const current = data.members.find((member) => member.userId === selfId);
  if (!current || current.droneStatus === 'lost') return data;
  if (current.battery !== null && current.battery <= 15) return data;
  const battery = Math.max(0, Math.min(100, Math.round(level)));
  if (current.battery === battery) return data;
  return {
    ...data,
    members: data.members.map((member) => member.userId === selfId ? { ...member, battery, updatedAt: now() } : member),
  };
}

export function setSharing(data: MissionData, selfId: string, camera: boolean): MissionData {
  if (!data.members.some((member) => member.userId === selfId)) return data;
  const stamp = now();
  return {
    ...data,
    members: data.members.map((member) => member.userId === selfId ? { ...member, camera, updatedAt: stamp } : member),
  };
}

export function setLastSeen(data: MissionData, selfId: string, point: LatLng, note: string): MissionData {
  const seen: LastSeen = {
    lat: round(point.lat),
    lng: round(point.lng),
    radius: 500,
    note: note.trim().slice(0, 80),
    at: now(),
    by: selfId,
  };
  return { ...data, lastSeen: seen };
}

export function addMark(data: MissionData, selfId: string, kind: PointKind, point: LatLng, memo: string): MissionData {
  const names: Record<PointKind, string> = { person: '발견', hazard: '위험', entry: '입구', clue: '의심' };
  return {
    ...data,
    points: [...data.points, {
      id: crypto.randomUUID(),
      lat: round(point.lat),
      lng: round(point.lng),
      kind,
      label: names[kind],
      memo: memo.trim().slice(0, 80),
      createdBy: selfId,
      createdAt: now(),
    }],
  };
}

export function moveVertex(data: MissionData, zoneId: string, index: number, point: LatLng): MissionData {
  const stamp = now();
  return {
    ...data,
    zones: data.zones.map((zone) => zone.id === zoneId ? {
      ...zone,
      path: zone.path.map((item, itemIndex) => itemIndex === index ? { lat: round(point.lat), lng: round(point.lng) } : item),
      updatedAt: stamp,
    } : zone),
  };
}
