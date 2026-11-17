import type { DroneStatus, LatLng, Role } from '../domain/rules';
import type { MissionData, Zone } from '../mission/types';
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
      updatedAt: stamp,
    }],
    zones: [],
    points: [],
    handovers: [],
    photos: [],
    events: [],
    notices: [],
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
  if (data.photos.length >= 8) return data;
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

export function beat(
  data: MissionData,
  selfId: string,
  position: { lat: number; lng: number; accuracy: number | null } | null,
): MissionData {
  const current = data.members.find((member) => member.userId === selfId);
  if (!current || current.droneStatus === 'lost') return data;
  if (current.battery !== null && current.battery <= 15) return data;
  const stamp = now();
  return {
    ...data,
    members: data.members.map((member) => member.userId === selfId ? {
      ...member,
      lat: position ? round(position.lat) : member.lat,
      lng: position ? round(position.lng) : member.lng,
      accuracy: position ? position.accuracy : member.accuracy,
      droneStatus: position ? 'flying' : 'ready',
      updatedAt: stamp,
    } : member),
  };
}
