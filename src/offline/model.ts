import { createInitialDemo } from '../data';
import type { DroneId, ObservationStatus, TaskStatus } from '../types';

export type FieldMap = FieldImage;

export type FieldImage = {
  name: string;
  mime: 'image/png' | 'image/jpeg' | 'image/webp';
  dataUrl: string;
  bytes: number;
};

export type FieldEvidence = {
  id: string;
  label: string;
  memo: string;
  addedAt: string;
  photo: FieldImage | null;
};

export type FieldHandover = {
  id: string;
  fromDrone: DroneId;
  toDrone: DroneId;
  previousStatus: 'assigned' | 'in_progress';
  interruptionReason: string;
  approvalReason: string;
  approvedBy: string;
  approvedAt: string;
};

export type FieldInterruption = {
  fromDrone: DroneId;
  previousStatus: 'assigned' | 'in_progress';
  reason: string;
  at: string;
};

export type FieldZone = {
  id: string;
  number: number;
  x: number;
  y: number;
  droneId: DroneId | null;
  taskStatus: TaskStatus;
  observationStatus: ObservationStatus;
  reviewReason: string;
  confirmedBy: string | null;
  confirmedAt: string | null;
  evidence: FieldEvidence[];
  memo: string;
  interruption: FieldInterruption | null;
  handovers: FieldHandover[];
  updatedAt: string;
};

export type InterestPoint = {
  id: string;
  x: number;
  y: number;
  label: string;
  memo: string;
  createdAt: string;
};

export type OfflineProject = {
  version: 1;
  title: string;
  createdAt: string;
  updatedAt: string;
  map: FieldMap | null;
  zones: FieldZone[];
  points: InterestPoint[];
};

export type ProjectLoad =
  | { ok: true; project: OfflineProject }
  | { ok: false; message: string };

export const MAX_IMAGE_BYTES = 2 * 1024 * 1024;
export const MAX_PHOTO_BYTES = 1024 * 1024;
export const MAX_PROJECT_BYTES = 5 * 1024 * 1024;

const droneIds: readonly DroneId[] = ['A', 'B', 'C'];
const taskStatuses: readonly TaskStatus[] = ['unassigned', 'assigned', 'in_progress', 'completed', 'interrupted'];
const observationStatuses: readonly ObservationStatus[] = ['unverified', 'confirmed', 'recheck'];
const zoneIds = Array.from({ length: 12 }, (_, index) => `Z-${String(index + 1).padStart(2, '0')}`);
const zoneLayouts = [
  { x: 12, y: 18 }, { x: 37, y: 18 }, { x: 62, y: 18 }, { x: 87, y: 18 },
  { x: 12, y: 50 }, { x: 37, y: 50 }, { x: 62, y: 50 }, { x: 87, y: 50 },
  { x: 12, y: 82 }, { x: 37, y: 82 }, { x: 62, y: 82 }, { x: 87, y: 82 },
] as const;
let generatedIdSequence = 0;

const now = (): string => new Date().toISOString();
const utf8Bytes = (value: string): number => new TextEncoder().encode(value).byteLength;
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);
const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;
const isString = (value: unknown): value is string => typeof value === 'string';
const isCoordinate = (value: unknown): value is number =>
  typeof value === 'number' && Number.isFinite(value) && value >= 0 && value <= 100;
const isMapByteCount = (value: unknown): value is number =>
  typeof value === 'number' && Number.isSafeInteger(value) && value >= 0 && value <= MAX_IMAGE_BYTES;
const isZoneNumber = (value: unknown): value is number =>
  typeof value === 'number' && Number.isInteger(value) && value >= 1 && value <= zoneIds.length;
const isIsoDate = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};
const isDroneId = (value: unknown): value is DroneId =>
  typeof value === 'string' && (droneIds as readonly string[]).includes(value);
const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === 'string' && (taskStatuses as readonly string[]).includes(value);
const isObservationStatus = (value: unknown): value is ObservationStatus =>
  typeof value === 'string' && (observationStatuses as readonly string[]).includes(value);

export function isSupportedMapType(type: string): type is FieldMap['mime'] {
  return type === 'image/png' || type === 'image/jpeg' || type === 'image/webp';
}

/** atob 없이 RFC 4648 표준 Base64 payload의 실제 디코드 바이트 수를 구한다. */
function base64Value(charCode: number): number {
  if (charCode >= 65 && charCode <= 90) return charCode - 65;
  if (charCode >= 97 && charCode <= 122) return charCode - 97 + 26;
  if (charCode >= 48 && charCode <= 57) return charCode - 48 + 52;
  if (charCode === 43) return 62;
  if (charCode === 47) return 63;
  return -1;
}

function decodedBase64ByteLength(payload: string): number | null {
  if (payload.length % 4 !== 0) return null;

  const padding = payload.endsWith('==') ? 2 : payload.endsWith('=') ? 1 : 0;
  const contentLength = payload.length - padding;
  for (let index = 0; index < contentLength; index += 1) {
    if (base64Value(payload.charCodeAt(index)) < 0) return null;
  }
  for (let index = contentLength; index < payload.length; index += 1) {
    if (payload.charCodeAt(index) !== 61) return null;
  }

  if (padding === 2) {
    const finalValue = base64Value(payload.charCodeAt(contentLength - 1));
    if (finalValue < 0 || (finalValue & 0x0f) !== 0) return null;
  }
  if (padding === 1) {
    const finalValue = base64Value(payload.charCodeAt(contentLength - 1));
    if (finalValue < 0 || (finalValue & 0x03) !== 0) return null;
  }

  return (payload.length / 4) * 3 - padding;
}

export function dataUrlPayloadBytes(dataUrl: string, mime: string): number | null {
  const prefix = `data:${mime};base64,`;
  if (!dataUrl.startsWith(prefix)) return null;
  return decodedBase64ByteLength(dataUrl.slice(prefix.length));
}

export function isFieldImage(value: unknown, maxBytes = MAX_IMAGE_BYTES): value is FieldImage {
  if (!isRecord(value)
    || !isNonEmptyString(value.name)
    || !isString(value.mime)
    || !isSupportedMapType(value.mime)
    || !isString(value.dataUrl)
    || !isMapByteCount(value.bytes)
    || value.bytes > maxBytes) return false;

  const decodedBytes = dataUrlPayloadBytes(value.dataUrl, value.mime);
  return decodedBytes !== null && decodedBytes === value.bytes;
}

function isValidMap(value: unknown): value is FieldMap {
  return isFieldImage(value, MAX_IMAGE_BYTES);
}

function isValidPhoto(value: unknown): value is FieldImage {
  return isFieldImage(value, MAX_PHOTO_BYTES);
}

function isInterruption(value: unknown): value is FieldInterruption {
  return isRecord(value)
    && isDroneId(value.fromDrone)
    && (value.previousStatus === 'assigned' || value.previousStatus === 'in_progress')
    && isNonEmptyString(value.reason)
    && isIsoDate(value.at);
}

function isHandover(value: unknown): value is FieldHandover {
  return isRecord(value)
    && isNonEmptyString(value.id)
    && isDroneId(value.fromDrone)
    && isDroneId(value.toDrone)
    && (value.previousStatus === 'assigned' || value.previousStatus === 'in_progress')
    && isNonEmptyString(value.interruptionReason)
    && isNonEmptyString(value.approvalReason)
    && isNonEmptyString(value.approvedBy)
    && isIsoDate(value.approvedAt);
}

function cloneProject(project: OfflineProject): OfflineProject {
  return {
    ...project,
    map: project.map ? { ...project.map } : null,
    zones: project.zones.map((zone) => ({
      ...zone,
      interruption: zone.interruption ? { ...zone.interruption } : null,
      handovers: zone.handovers.map((handover) => ({ ...handover })),
      evidence: zone.evidence.map((evidence) => ({
        ...evidence,
        photo: evidence.photo ? { ...evidence.photo } : null,
      })),
    })),
    points: project.points.map((point) => ({ ...point })),
  };
}

function requireProject(project: OfflineProject): void {
  if (!validateOfflineProject(project)) throw new Error('프로젝트 형식이 올바르지 않습니다.');
}

function requireProjectSize(project: OfflineProject): void {
  if (utf8Bytes(JSON.stringify(project)) > MAX_PROJECT_BYTES) {
    throw new Error('프로젝트 데이터가 5MB 제한을 초과했습니다.');
  }
}

function generatedId(prefix: string, used: Set<string>): string {
  do {
    const uuid = globalThis.crypto?.randomUUID?.();
    const suffix = uuid ?? `${Date.now().toString(36)}-${(++generatedIdSequence).toString(36)}`;
    const id = `${prefix}-${suffix}`;
    if (!used.has(id)) return id;
  } while (true);
}

/** src/data.ts의 가상 시연 구역과 자료를 새 객체로 독립 복사한다. */
export function createOfflineProject(): OfflineProject {
  const timestamp = now();
  const demo = createInitialDemo();
  return {
    version: 1,
    title: '연습 수색 기록',
    createdAt: timestamp,
    updatedAt: timestamp,
    map: null,
    zones: demo.zones.map((zone, index) => ({
      id: zone.id,
      number: zone.number,
      x: zoneLayouts[index]?.x ?? 50,
      y: zoneLayouts[index]?.y ?? 50,
      droneId: zone.droneId,
      taskStatus: zone.taskStatus,
      observationStatus: zone.observationStatus,
      reviewReason: zone.observationStatus === 'recheck'
        ? (zone.evidence[0]?.memo ?? zone.note)
        : zone.note,
      confirmedBy: zone.observationStatus === 'confirmed' ? '시연 운영자' : null,
      confirmedAt: zone.observationStatus === 'confirmed' ? timestamp : null,
      evidence: zone.evidence.map((evidence) => ({
        id: evidence.id,
        label: evidence.label,
        memo: evidence.memo,
        addedAt: timestamp,
        photo: null,
      })),
      memo: zone.note,
      interruption: null,
      handovers: [],
      updatedAt: timestamp,
    })),
    points: [],
  };
}

/** 담당·자료·메모가 없는 12개 구역으로 현장 기록을 시작한다. */
export function createEmptyProject(): OfflineProject {
  const timestamp = now();
  return {
    version: 1,
    title: '현장 수색 기록',
    createdAt: timestamp,
    updatedAt: timestamp,
    map: null,
    zones: zoneIds.map((id, index) => ({
      id,
      number: index + 1,
      x: zoneLayouts[index]?.x ?? 50,
      y: zoneLayouts[index]?.y ?? 50,
      droneId: null,
      taskStatus: 'unassigned',
      observationStatus: 'unverified',
      reviewReason: '',
      confirmedBy: null,
      confirmedAt: null,
      evidence: [],
      memo: '',
      interruption: null,
      handovers: [],
      updatedAt: timestamp,
    })),
    points: [],
  };
}

/** 외부 JSON은 저장 모델의 고정 12개 구역·날짜·상태·좌표·용량 규칙을 모두 통과해야 한다. */
export function validateOfflineProject(value: unknown): value is OfflineProject {
  if (!isRecord(value)
    || value.version !== 1
    || !isString(value.title)
    || !isIsoDate(value.createdAt)
    || !isIsoDate(value.updatedAt)
    || (value.map !== null && !isValidMap(value.map))
    || !Array.isArray(value.zones)
    || !Array.isArray(value.points)
    || value.zones.length !== zoneIds.length) return false;

  const expectedZoneIds = new Set(zoneIds);
  const seenZoneIds = new Set<string>();
  const seenZoneNumbers = new Set<number>();
  const seenEvidenceIds = new Set<string>();
  const seenHandoverIds = new Set<string>();

  for (const zone of value.zones) {
    if (!isRecord(zone)
      || !isNonEmptyString(zone.id)
      || !expectedZoneIds.has(zone.id)
      || seenZoneIds.has(zone.id)
      || !isZoneNumber(zone.number)
      || seenZoneNumbers.has(zone.number)
      || !isCoordinate(zone.x)
      || !isCoordinate(zone.y)
      || (zone.droneId !== null && !isDroneId(zone.droneId))
      || !isTaskStatus(zone.taskStatus)
      || !isObservationStatus(zone.observationStatus)
      || !isString(zone.reviewReason)
      || (zone.confirmedBy !== null && !isNonEmptyString(zone.confirmedBy))
      || (zone.confirmedAt !== null && !isIsoDate(zone.confirmedAt))
      || !Array.isArray(zone.evidence)
      || !isString(zone.memo)
      || (zone.interruption !== null && !isInterruption(zone.interruption))
      || (zone.interruption !== null && zone.taskStatus !== 'interrupted')
      || !Array.isArray(zone.handovers)
      || !isIsoDate(zone.updatedAt)) return false;

    seenZoneIds.add(zone.id);
    seenZoneNumbers.add(zone.number);
    for (const evidence of zone.evidence) {
      if (!isRecord(evidence)
        || !isNonEmptyString(evidence.id)
        || seenEvidenceIds.has(evidence.id)
        || !isNonEmptyString(evidence.label)
        || !isString(evidence.memo)
        || (evidence.photo !== null && !isValidPhoto(evidence.photo))
        || !isIsoDate(evidence.addedAt)) return false;
      seenEvidenceIds.add(evidence.id);
    }
    for (const handover of zone.handovers) {
      if (!isHandover(handover) || seenHandoverIds.has(handover.id)) return false;
      seenHandoverIds.add(handover.id);
    }
  }

  if (seenZoneIds.size !== zoneIds.length || seenZoneNumbers.size !== zoneIds.length) return false;

  const seenPointIds = new Set<string>();
  for (const point of value.points) {
    if (!isRecord(point)
      || !isNonEmptyString(point.id)
      || seenPointIds.has(point.id)
      || !isCoordinate(point.x)
      || !isCoordinate(point.y)
      || !isNonEmptyString(point.label)
      || !isString(point.memo)
      || !isIsoDate(point.createdAt)) return false;
    seenPointIds.add(point.id);
  }
  return true;
}

function normalizeProject(value: unknown): unknown {
  if (!isRecord(value) || !Array.isArray(value.zones)) return value;
  return {
    ...value,
    zones: value.zones.map((zone) => {
      if (!isRecord(zone)) return zone;
      return {
        ...zone,
        interruption: zone.interruption === undefined ? null : zone.interruption,
        handovers: zone.handovers === undefined ? [] : zone.handovers,
        evidence: Array.isArray(zone.evidence)
          ? zone.evidence.map((item) => (isRecord(item) && item.photo === undefined ? { ...item, photo: null } : item))
          : zone.evidence,
      };
    }),
  };
}

export function parseOfflineProject(text: string, bytes?: number): ProjectLoad {
  const actualBytes = utf8Bytes(text);
  if (bytes !== undefined && (!Number.isSafeInteger(bytes) || bytes < 0)) {
    return { ok: false, message: '프로젝트 파일 크기가 올바르지 않습니다.' };
  }
  if (Math.max(actualBytes, bytes ?? 0) > MAX_PROJECT_BYTES) {
    return { ok: false, message: '프로젝트 파일이 5MB 제한을 초과했습니다.' };
  }

  let parsed: unknown;
  try {
    parsed = normalizeProject(JSON.parse(text) as unknown);
  } catch {
    return { ok: false, message: '프로젝트 JSON을 읽을 수 없습니다.' };
  }

  if (isRecord(parsed) && isRecord(parsed.map) && typeof parsed.map.bytes === 'number' && parsed.map.bytes > MAX_IMAGE_BYTES) {
    return { ok: false, message: '도면 이미지가 2MB 제한을 초과했습니다.' };
  }
  if (isRecord(parsed) && isRecord(parsed.map) && !isValidMap(parsed.map)) {
    return { ok: false, message: '도면 이미지 크기 또는 데이터가 올바르지 않습니다.' };
  }
  if (!validateOfflineProject(parsed)) {
    return { ok: false, message: '프로젝트 형식 또는 값이 올바르지 않습니다.' };
  }
  return { ok: true, project: cloneProject(parsed) };
}

export function serializeOfflineProject(project: OfflineProject): string {
  requireProject(project);
  const serialized = JSON.stringify(project);
  if (utf8Bytes(serialized) > MAX_PROJECT_BYTES) {
    throw new Error('프로젝트 데이터가 5MB 제한을 초과했습니다.');
  }
  return serialized;
}

export function updateZone(
  project: OfflineProject,
  zoneId: string,
  patch: Partial<Omit<FieldZone, 'id' | 'number' | 'x' | 'y' | 'evidence'>>,
): OfflineProject {
  requireProject(project);
  const next = cloneProject(project);
  const index = next.zones.findIndex((zone) => zone.id === zoneId);
  if (index < 0) throw new Error('존재하지 않는 구역입니다.');

  const zone = next.zones[index];
  if (zone.interruption && patch.droneId !== undefined && patch.droneId !== zone.droneId) {
    throw new Error('인계 대기 중에는 승인으로만 담당 기체를 바꿉니다.');
  }
  if (zone.interruption && patch.taskStatus !== undefined && patch.taskStatus !== 'interrupted') {
    throw new Error('인계 대기 중입니다. 승인하거나 중단을 취소한 뒤 작업 상태를 바꾸세요.');
  }
  const updated: FieldZone = { ...zone };
  if (patch.droneId !== undefined) updated.droneId = patch.droneId;
  if (patch.taskStatus !== undefined) updated.taskStatus = patch.taskStatus;
  if (patch.observationStatus !== undefined) updated.observationStatus = patch.observationStatus;
  if (patch.reviewReason !== undefined) updated.reviewReason = patch.reviewReason;
  if (patch.confirmedBy !== undefined) updated.confirmedBy = patch.confirmedBy;
  if (patch.confirmedAt !== undefined) updated.confirmedAt = patch.confirmedAt;
  if (patch.memo !== undefined) updated.memo = patch.memo;
  updated.updatedAt = now();
  next.zones[index] = updated;
  next.updatedAt = updated.updatedAt;
  requireProject(next);
  requireProjectSize(next);
  return next;
}

export function addEvidence(
  project: OfflineProject,
  zoneId: string,
  input: { label: string; memo: string },
): OfflineProject {
  requireProject(project);
  const label = input.label.trim();
  if (!label) throw new Error('자료 참조명을 입력하세요.');
  const next = cloneProject(project);
  const zone = next.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error('존재하지 않는 구역입니다.');
  const timestamp = now();
  const used = new Set(next.zones.flatMap((candidate) => candidate.evidence.map((evidence) => evidence.id)));
  zone.evidence.push({
    id: generatedId('EVIDENCE', used),
    label,
    memo: input.memo,
    addedAt: timestamp,
    photo: null,
  });
  zone.updatedAt = timestamp;
  next.updatedAt = timestamp;
  requireProject(next);
  requireProjectSize(next);
  return next;
}

export function addInterestPoint(
  project: OfflineProject,
  input: { x: number; y: number; label: string; memo: string },
): OfflineProject {
  requireProject(project);
  if (!isCoordinate(input.x) || !isCoordinate(input.y)) {
    throw new Error('관심 지점 좌표는 0~100 범위여야 합니다.');
  }
  const next = cloneProject(project);
  const timestamp = now();
  const label = input.label.trim() || `관심 지점 ${next.points.length + 1}`;
  const used = new Set(next.points.map((point) => point.id));
  next.points.push({
    id: generatedId('POINT', used),
    x: input.x,
    y: input.y,
    label,
    memo: input.memo,
    createdAt: timestamp,
  });
  next.updatedAt = timestamp;
  requireProject(next);
  requireProjectSize(next);
  return next;
}

export function addPhotoEvidence(
  project: OfflineProject,
  zoneId: string,
  input: { label: string; memo: string; photo: FieldImage },
): OfflineProject {
  requireProject(project);
  if (!isValidPhoto(input.photo)) {
    throw new Error('사진은 PNG, JPEG 또는 WebP 형식의 1MB 이하 이미지여야 합니다.');
  }
  const label = input.label.trim() || input.photo.name;
  const next = cloneProject(project);
  const zone = next.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error('존재하지 않는 구역입니다.');
  const timestamp = now();
  const used = new Set(next.zones.flatMap((candidate) => candidate.evidence.map((evidence) => evidence.id)));
  zone.evidence.push({
    id: generatedId('EVIDENCE', used),
    label,
    memo: input.memo,
    addedAt: timestamp,
    photo: { ...input.photo, name: input.photo.name.trim() || label },
  });
  zone.updatedAt = timestamp;
  next.updatedAt = timestamp;
  requireProject(next);
  requireProjectSize(next);
  return next;
}

export function removeEvidence(project: OfflineProject, zoneId: string, evidenceId: string): OfflineProject {
  requireProject(project);
  const next = cloneProject(project);
  const zone = next.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error('존재하지 않는 구역입니다.');
  const before = zone.evidence.length;
  zone.evidence = zone.evidence.filter((evidence) => evidence.id !== evidenceId);
  if (zone.evidence.length === before) throw new Error('삭제할 자료를 찾지 못했습니다.');
  const timestamp = now();
  zone.updatedAt = timestamp;
  next.updatedAt = timestamp;
  requireProject(next);
  return next;
}

export function interruptZone(project: OfflineProject, zoneId: string, reason: string): OfflineProject {
  requireProject(project);
  const interruptionReason = reason.trim();
  if (!interruptionReason) throw new Error('중단 사유를 입력하세요.');
  const next = cloneProject(project);
  const zone = next.zones.find((candidate) => candidate.id === zoneId);
  if (!zone) throw new Error('존재하지 않는 구역입니다.');
  if (zone.interruption) throw new Error('이미 인계를 기다리는 구역입니다. 승인하거나 중단을 취소하세요.');
  if (!zone.droneId) throw new Error('담당 기체가 없는 구역은 중단 인계를 시작할 수 없습니다.');
  if (zone.taskStatus !== 'assigned' && zone.taskStatus !== 'in_progress') {
    throw new Error('배정됨 또는 진행 중인 작업만 중단할 수 있습니다.');
  }
  const timestamp = now();
  zone.interruption = {
    fromDrone: zone.droneId,
    previousStatus: zone.taskStatus,
    reason: interruptionReason,
    at: timestamp,
  };
  zone.taskStatus = 'interrupted';
  zone.updatedAt = timestamp;
  next.updatedAt = timestamp;
  requireProject(next);
  requireProjectSize(next);
  return next;
}

export function approveHandover(
  project: OfflineProject,
  zoneId: string,
  input: { toDrone: DroneId; approvalReason: string; approvedBy: string },
): OfflineProject {
  requireProject(project);
  const approvalReason = input.approvalReason.trim();
  const approvedBy = input.approvedBy.trim();
  if (!approvalReason) throw new Error('승인 사유를 입력하세요.');
  if (!approvedBy) throw new Error('승인자를 입력하세요.');
  if (!isDroneId(input.toDrone)) throw new Error('새 담당 기체를 선택하세요.');
  const next = cloneProject(project);
  const zone = next.zones.find((candidate) => candidate.id === zoneId);
  if (!zone?.interruption) throw new Error('승인할 중단 작업이 없습니다.');
  const timestamp = now();
  const used = new Set(next.zones.flatMap((candidate) => candidate.handovers.map((handover) => handover.id)));
  zone.handovers.push({
    id: generatedId('HANDOVER', used),
    fromDrone: zone.interruption.fromDrone,
    toDrone: input.toDrone,
    previousStatus: zone.interruption.previousStatus,
    interruptionReason: zone.interruption.reason,
    approvalReason,
    approvedBy,
    approvedAt: timestamp,
  });
  zone.droneId = input.toDrone;
  zone.taskStatus = 'assigned';
  zone.interruption = null;
  zone.updatedAt = timestamp;
  next.updatedAt = timestamp;
  requireProject(next);
  requireProjectSize(next);
  return next;
}

export function cancelInterruption(project: OfflineProject, zoneId: string): OfflineProject {
  requireProject(project);
  const next = cloneProject(project);
  const zone = next.zones.find((candidate) => candidate.id === zoneId);
  if (!zone?.interruption) throw new Error('취소할 중단 대기가 없습니다.');
  const timestamp = now();
  zone.droneId = zone.interruption.fromDrone;
  zone.taskStatus = zone.interruption.previousStatus;
  zone.interruption = null;
  zone.updatedAt = timestamp;
  next.updatedAt = timestamp;
  requireProject(next);
  return next;
}

export function updateInterestPoint(
  project: OfflineProject,
  pointId: string,
  input: { label?: string; memo?: string },
): OfflineProject {
  requireProject(project);
  const next = cloneProject(project);
  const point = next.points.find((candidate) => candidate.id === pointId);
  if (!point) throw new Error('관심 지점을 찾지 못했습니다.');
  if (input.label !== undefined) {
    const label = input.label.trim();
    if (!label) throw new Error('관심 지점 이름을 입력하세요.');
    point.label = label;
  }
  if (input.memo !== undefined) point.memo = input.memo;
  next.updatedAt = now();
  requireProject(next);
  requireProjectSize(next);
  return next;
}

export function removeInterestPoint(project: OfflineProject, pointId: string): OfflineProject {
  requireProject(project);
  const next = cloneProject(project);
  const before = next.points.length;
  next.points = next.points.filter((point) => point.id !== pointId);
  if (next.points.length === before) throw new Error('관심 지점을 찾지 못했습니다.');
  next.updatedAt = now();
  requireProject(next);
  return next;
}

export function setMap(project: OfflineProject, map: FieldMap | null): OfflineProject {
  requireProject(project);
  if (map !== null && map.bytes > MAX_IMAGE_BYTES) {
    throw new Error('도면 이미지가 2MB 제한을 초과했습니다.');
  }
  if (map !== null && !isValidMap(map as unknown)) {
    throw new Error('도면은 PNG, JPEG 또는 WebP 형식의 올바른 2MB 이하 이미지여야 합니다.');
  }
  const next = cloneProject(project);
  next.map = map ? { ...map } : null;
  next.updatedAt = now();
  requireProject(next);
  requireProjectSize(next);
  return next;
}
