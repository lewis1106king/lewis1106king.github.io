import { isJoinCode } from '../domain/rules';
import type { Activity, Handover, InterestPoint, Member, Mission, MissionData, Notice, Photo, Zone } from '../mission/types';

export type Wire = {
  v: 1;
  mission: Mission;
  members: Member[];
  zones: Zone[];
  points: InterestPoint[];
  handovers: Handover[];
  photos: Array<Omit<Photo, 'url'>>;
  events: Activity[];
  notices: Notice[];
};

function time(value: string | null | undefined): number {
  const parsed = Date.parse(value ?? '');
  return Number.isFinite(parsed) ? parsed : 0;
}

function clip(value: unknown, max: number): string {
  return typeof value === 'string' ? value.slice(0, max) : '';
}

function finite(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? value : null;
}

export function toWire(data: MissionData): Wire {
  return {
    v: 1,
    mission: data.mission,
    members: data.members,
    zones: data.zones,
    points: data.points,
    handovers: data.handovers,
    photos: data.photos.slice(0, 8).map(({ url, ...photo }) => ({ ...photo, ready: photo.ready || Boolean(url) })),
    events: data.events.slice(0, 40),
    notices: data.notices.slice(0, 20),
  };
}

export function fromWire(value: unknown): MissionData | null {
  if (!value || typeof value !== 'object') return null;
  const wire = value as Partial<Wire>;
  if (wire.v !== 1 || !wire.mission || !isJoinCode(String(wire.mission.joinCode ?? ''))) return null;
  const mission = wire.mission;
  return {
    mission: {
      id: clip(mission.id, 40) || mission.joinCode,
      title: clip(mission.title, 40) || '새 수색',
      joinCode: mission.joinCode.toUpperCase(),
      createdBy: clip(mission.createdBy, 80),
      createdAt: clip(mission.createdAt, 40),
    },
    members: (Array.isArray(wire.members) ? wire.members : []).slice(0, 24).map((member) => ({
      userId: clip(member.userId, 80),
      role: member.role === 'operator' ? 'operator' as const : 'pilot' as const,
      callsign: clip(member.callsign, 24) || '나',
      droneName: clip(member.droneName, 24),
      droneStatus: ['ground', 'ready', 'flying', 'returning', 'landed', 'lost'].includes(member.droneStatus) ? member.droneStatus : 'ground',
      battery: typeof member.battery === 'number' && member.battery >= 0 && member.battery <= 100 ? Math.round(member.battery) : null,
      lat: finite(member.lat),
      lng: finite(member.lng),
      accuracy: finite(member.accuracy),
      heading: finite(member.heading),
      speed: finite(member.speed),
      camera: Boolean(member.camera),
      trail: (Array.isArray(member.trail) ? member.trail : []).slice(-30).flatMap((point) => {
        const lat = finite(point?.lat);
        const lng = finite(point?.lng);
        return lat === null || lng === null ? [] : [{ lat, lng }];
      }),
      updatedAt: clip(member.updatedAt, 40),
    })).filter((member) => member.userId),
    zones: (Array.isArray(wire.zones) ? wire.zones : []).slice(0, 40).map((zone) => ({
      id: clip(zone.id, 80),
      missionId: clip(zone.missionId, 40),
      label: clip(zone.label, 24) || '구역',
      path: (Array.isArray(zone.path) ? zone.path : []).slice(0, 24).flatMap((point) => {
        const lat = finite(point?.lat);
        const lng = finite(point?.lng);
        return lat === null || lng === null ? [] : [{ lat, lng }];
      }),
      taskStatus: zone.taskStatus,
      observationStatus: zone.observationStatus,
      reviewReason: clip(zone.reviewReason, 140),
      memo: clip(zone.memo, 140),
      assigneeId: zone.assigneeId ? clip(zone.assigneeId, 80) : null,
      updatedAt: clip(zone.updatedAt, 40),
    })).filter((zone) => zone.id),
    points: (Array.isArray(wire.points) ? wire.points : []).slice(0, 40).flatMap((point) => {
      const lat = finite(point?.lat);
      const lng = finite(point?.lng);
      if (lat === null || lng === null || !point?.id) return [];
      const kind = point.kind === 'hazard' || point.kind === 'entry' ? point.kind : 'person' as const;
      return [{
        id: clip(point.id, 80),
        lat,
        lng,
        kind,
        label: clip(point.label, 24) || '표시',
        memo: clip(point.memo, 80),
        createdBy: clip(point.createdBy, 80),
        createdAt: clip(point.createdAt, 40),
      }];
    }),
    handovers: (Array.isArray(wire.handovers) ? wire.handovers : []).slice(0, 40).map((item) => ({
      ...item,
      interruptionReason: clip(item.interruptionReason, 140),
      approvalReason: item.approvalReason ? clip(item.approvalReason, 140) : null,
    })),
    photos: (Array.isArray(wire.photos) ? wire.photos : []).slice(0, 8).map((photo) => ({
      id: clip(photo.id, 80),
      zoneId: clip(photo.zoneId, 80),
      storagePath: clip(photo.storagePath, 80),
      memo: clip(photo.memo, 80),
      uploadedBy: clip(photo.uploadedBy, 80),
      createdAt: clip(photo.createdAt, 40),
      ready: Boolean(photo.ready),
      url: null,
    })).filter((photo) => photo.id),
    events: (Array.isArray(wire.events) ? wire.events : []).slice(0, 40),
    notices: (Array.isArray(wire.notices) ? wire.notices : []).slice(0, 20),
  };
}

function prefer<T>(local: T[], remote: T[], idOf: (item: T) => string, stamp: (item: T) => string): T[] {
  const map = new Map<string, T>();
  for (const item of [...local, ...remote]) {
    const id = idOf(item);
    if (!id) continue;
    const prev = map.get(id);
    if (!prev || time(stamp(item)) >= time(stamp(prev))) map.set(id, item);
  }
  return [...map.values()];
}

export function mergeMission(local: MissionData | null, remote: MissionData): MissionData {
  if (!local) return remote;
  const mission = time(local.mission.createdAt) <= time(remote.mission.createdAt) ? local.mission : remote.mission;
  const photos = new Map<string, Photo>();
  for (const photo of [...local.photos, ...remote.photos]) {
    const prev = photos.get(photo.id);
    if (!prev) photos.set(photo.id, photo);
    else photos.set(photo.id, { ...photo, url: photo.url || prev.url, ready: photo.ready || prev.ready || Boolean(photo.url || prev.url) });
  }
  return {
    mission,
    members: prefer(local.members, remote.members, (member) => member.userId, (member) => member.updatedAt),
    zones: prefer(local.zones, remote.zones, (zone) => zone.id, (zone) => zone.updatedAt),
    points: prefer(local.points, remote.points, (point) => point.id, (point) => point.createdAt),
    handovers: prefer(local.handovers, remote.handovers, (item) => item.id, (item) => item.decidedAt ?? item.requestedAt),
    photos: [...photos.values()],
    events: prefer(local.events, remote.events, (item) => item.id, (item) => item.createdAt).sort((a, b) => time(b.createdAt) - time(a.createdAt)).slice(0, 40),
    notices: prefer(local.notices, remote.notices, (item) => item.id, (item) => item.createdAt).slice(0, 20),
  };
}

export function canonical(data: MissionData): string {
  const wire = toWire(data);
  const byId = <T extends { id: string }>(items: T[]) => [...items].sort((a, b) => a.id.localeCompare(b.id));
  return JSON.stringify({
    mission: wire.mission,
    members: [...wire.members].sort((a, b) => a.userId.localeCompare(b.userId)),
    zones: byId(wire.zones),
    points: byId(wire.points),
    handovers: byId(wire.handovers),
    photos: byId(wire.photos),
    events: byId(wire.events),
    notices: byId(wire.notices),
  });
}
