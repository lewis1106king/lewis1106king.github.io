import { createInitialDemo } from '../data';
import type { DroneId, ObservationStatus, TaskStatus } from '../types';

export type FieldMap = {
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

function isValidMap(value: unknown): value is FieldMap {
  if (!isRecord(value)
    || !isNonEmptyString(value.name)
    || !isString(value.mime)
    || !isSupportedMapType(value.mime)
    || !isString(value.dataUrl)
    || !isMapByteCount(value.bytes)) return false;

  const prefix = `data:${value.mime};base64,`;
  if (!value.dataUrl.startsWith(prefix)) return false;
  const decodedBytes = decodedBase64ByteLength(value.dataUrl.slice(prefix.length));
  return decodedBytes !== null && decodedBytes === value.bytes && decodedBytes <= MAX_IMAGE_BYTES;
}

function cloneProject(project: OfflineProject): OfflineProject {
  return {
    ...project,
    map: project.map ? { ...project.map } : null,
    zones: project.zones.map((zone) => ({
      ...zone,
      evidence: zone.evidence.map((evidence) => ({ ...evidence })),
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
    title: '오프라인 현장 수색 상황판',
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
      })),
      memo: zone.note,
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
      || !isIsoDate(zone.updatedAt)) return false;

    seenZoneIds.add(zone.id);
    seenZoneNumbers.add(zone.number);
    for (const evidence of zone.evidence) {
      if (!isRecord(evidence)
        || !isNonEmptyString(evidence.id)
        || seenEvidenceIds.has(evidence.id)
        || !isNonEmptyString(evidence.label)
        || !isString(evidence.memo)
        || !isIsoDate(evidence.addedAt)) return false;
      seenEvidenceIds.add(evidence.id);
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
    parsed = JSON.parse(text) as unknown;
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
