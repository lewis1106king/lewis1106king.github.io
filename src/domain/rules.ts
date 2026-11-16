export type TaskStatus = 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'interrupted';
export type ObservationStatus = 'unverified' | 'confirmed' | 'recheck';
export type DroneStatus = 'ground' | 'ready' | 'flying' | 'returning' | 'landed' | 'lost';
export type Role = 'operator' | 'pilot';
export type HandoverStatus = 'pending' | 'approved' | 'rejected';

export type LatLng = { lat: number; lng: number };

export type ZoneRecord = {
  id: string;
  label: string;
  taskStatus: TaskStatus;
  observationStatus: ObservationStatus;
  assigneeId: string | null;
  photoCount: number;
};

export type HandoverRecord = {
  id: string;
  zoneId: string;
  status: HandoverStatus;
  previousStatus: TaskStatus;
  toUserId: string | null;
};

export const taskLabel: Record<TaskStatus, string> = {
  unassigned: '배정 전',
  assigned: '배정',
  in_progress: '진행',
  completed: '완료',
  interrupted: '중단',
};

export const observationLabel: Record<ObservationStatus, string> = {
  unverified: '미확인',
  confirmed: '확인 완료',
  recheck: '재확인',
};

export const droneLabel: Record<DroneStatus, string> = {
  ground: '지상',
  ready: '준비',
  flying: '비행',
  returning: '복귀',
  landed: '착륙',
  lost: '통신 두절',
};

export const roleLabel: Record<Role, string> = {
  operator: '운영자',
  pilot: '조종',
};

export function normalizeJoinCode(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-F0-9]/g, '').slice(0, 6);
}

export function isJoinCode(value: string): boolean {
  return /^[A-F0-9]{6}$/.test(value);
}

export function isValidPath(path: LatLng[]): boolean {
  return path.length >= 3 && path.length <= 24 && path.every((point) => (
    Number.isFinite(point.lat) && Number.isFinite(point.lng)
    && point.lat >= -90 && point.lat <= 90
    && point.lng >= -180 && point.lng <= 180
  ));
}

export function movedMeters(from: LatLng, to: LatLng): number {
  const lat = (to.lat - from.lat) * 111_320;
  const lng = (to.lng - from.lng) * 111_320 * Math.cos((from.lat * Math.PI) / 180);
  return Math.hypot(lat, lng);
}

export function canEditZone(input: { operator: boolean; assigneeId: string | null; selfId: string }): boolean {
  if (input.operator) return true;
  return input.assigneeId === null || input.assigneeId === input.selfId;
}

export function canRequestHandover(zone: ZoneRecord, pending: boolean): boolean {
  return !pending && (zone.taskStatus === 'assigned' || zone.taskStatus === 'in_progress');
}

/** 승인 시 담당을 바꾸고 작업은 배정이 됩니다. 반려는 작업 상태만 되돌리고 담당은 건드리지 않습니다. */
export function approvalResult(input: {
  approve: boolean;
  previousStatus: TaskStatus;
  toUserId: string | null;
}): { taskStatus: TaskStatus; assigneeId?: string } {
  if (!input.approve) return { taskStatus: input.previousStatus };
  if (!input.toUserId) throw new Error('새 담당을 선택하세요.');
  return { taskStatus: 'assigned', assigneeId: input.toUserId };
}

export function unresolvedReasons(zone: ZoneRecord, pendingHandover: boolean): string[] {
  const reasons: string[] = [];
  if (zone.observationStatus !== 'confirmed') reasons.push('관측이 확인 완료가 아닙니다.');
  if (zone.photoCount === 0) reasons.push('사진이 없습니다.');
  if (zone.taskStatus !== 'completed') reasons.push(`작업은 ${taskLabel[zone.taskStatus]}입니다.`);
  if (pendingHandover) reasons.push('인계 승인을 기다리는 중입니다.');
  return reasons;
}

export function escapeHtml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll("'", '&#39;');
}
