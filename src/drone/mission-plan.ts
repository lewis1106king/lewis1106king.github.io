import type { LatLng } from '../domain/rules';
import { movedMeters } from '../domain/rules';
import {
  CMD,
  commandLongPacket,
  missionCountPacket,
  missionItemPacket,
  modePacket,
  type MavMessage,
  type PlanItem,
} from './mavlink-frame';
import { lawnmower } from './lawn';

export type Upload = {
  items: PlanItem[];
  done: boolean;
  result: number | null;
};

export function surveyMission(path: LatLng[], spacing: number, alt: number, home: LatLng): { items: PlanItem[]; legs: LatLng[] } {
  const legs = lawnmower(path, spacing);
  const height = Math.min(120, Math.max(10, alt));
  const gap = Math.min(80, Math.max(15, spacing));
  const homeItem: PlanItem = { command: CMD.navWaypoint, frame: 0, lat: home.lat, lng: home.lng, alt: 0, p1: 0, p2: 0, p3: 0, p4: 0 };
  const camera: PlanItem = { command: CMD.cameraDistance, frame: 2, lat: 0, lng: 0, alt: 0, p1: gap, p2: 0, p3: 0, p4: 0 };
  const route = legs.map((leg): PlanItem => ({
    command: CMD.navWaypoint,
    frame: 6,
    lat: leg.lat,
    lng: leg.lng,
    alt: height,
    p1: 0,
    p2: 5,
    p3: 0,
    p4: Number.NaN,
  }));
  const rtl: PlanItem = { command: CMD.rtl, frame: 6, lat: 0, lng: 0, alt: 0, p1: 0, p2: 0, p3: 0, p4: 0 };
  return { items: [homeItem, camera, ...route, rtl], legs };
}

export function legIndex(seq: number): number | null {
  const index = seq - 2;
  return index >= 0 ? index : null;
}

export function openUpload(items: PlanItem[]): { upload: Upload; frames: Uint8Array[] } {
  return { upload: { items, done: false, result: null }, frames: [missionCountPacket(items.length)] };
}

export function continueUpload(upload: Upload, message: MavMessage): { upload: Upload; frames: Uint8Array[] } {
  if (message.id === 40 || message.id === 51) {
    const item = upload.items[message.seq];
    if (!item) return { upload, frames: [] };
    return { upload, frames: [missionItemPacket(message.seq, item)] };
  }
  if (message.id === 47) return { upload: { ...upload, done: true, result: message.result }, frames: [] };
  return { upload, frames: [] };
}

export function autoFrames(): Uint8Array[] {
  return [modePacket(3), commandLongPacket(CMD.missionStart, [0, 0, 0, 0, 0, 0, 0])];
}

export function pauseFrames(): Uint8Array[] {
  return [modePacket(5), commandLongPacket(CMD.pause, [0, 0, 0, 0, 0, 0, 0])];
}

export function resumeFrames(): Uint8Array[] {
  return [commandLongPacket(CMD.pause, [1, 0, 0, 0, 0, 0, 0]), modePacket(3)];
}

export function landFrames(): Uint8Array[] {
  return [commandLongPacket(CMD.land, [0, 0, 0, 0, 0, 0, 0])];
}

export function armTakeoffFrames(alt: number): Uint8Array[] {
  return [
    commandLongPacket(CMD.arm, [1, 0, 0, 0, 0, 0, 0]),
    commandLongPacket(CMD.takeoff, [0, 0, 0, 0, 0, 0, alt]),
  ];
}

export function preflight(input: { linked: boolean; gpsFix: number; battery: number | null }): string[] {
  const reasons: string[] = [];
  if (!input.linked) reasons.push('연결이 없습니다.');
  if (input.gpsFix < 3) reasons.push('GPS가 3D가 아닙니다.');
  if (input.battery === null) reasons.push('배터리를 모릅니다.');
  else if (input.battery < 30) reasons.push('배터리가 30%보다 낮습니다.');
  return reasons;
}

export function homeMeters(from: LatLng | null, home: LatLng | null): number | null {
  if (!from || !home) return null;
  return Math.round(movedMeters(from, home));
}
