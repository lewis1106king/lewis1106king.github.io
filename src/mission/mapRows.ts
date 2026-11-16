import type { DroneStatus, HandoverStatus, ObservationStatus, Role, TaskStatus } from '../domain/rules';
import type { Activity, Handover, InterestPoint, Member, Mission, Notice, Photo, Zone } from './types';

type Row = Record<string, unknown>;

const asString = (value: unknown, fallback = ''): string => (typeof value === 'string' ? value : fallback);
const asNumber = (value: unknown): number | null => (typeof value === 'number' && Number.isFinite(value) ? value : null);

export function mapMission(row: Row): Mission {
  return {
    id: asString(row.id),
    title: asString(row.title),
    joinCode: asString(row.join_code),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
  };
}

export function mapMember(row: Row): Member {
  return {
    userId: asString(row.user_id),
    role: asString(row.role, 'pilot') as Role,
    callsign: asString(row.callsign),
    droneName: asString(row.drone_name),
    droneStatus: asString(row.drone_status, 'ground') as DroneStatus,
    lat: asNumber(row.lat),
    lng: asNumber(row.lng),
    accuracy: asNumber(row.accuracy),
    updatedAt: asString(row.updated_at),
  };
}

export function mapZone(row: Row): Zone {
  const path = Array.isArray(row.path) ? row.path.flatMap((point) => {
    if (!point || typeof point !== 'object') return [];
    const lat = asNumber((point as Row).lat);
    const lng = asNumber((point as Row).lng);
    return lat === null || lng === null ? [] : [{ lat, lng }];
  }) : [];
  return {
    id: asString(row.id),
    missionId: asString(row.mission_id),
    label: asString(row.label),
    path,
    taskStatus: asString(row.task_status, 'unassigned') as TaskStatus,
    observationStatus: asString(row.observation_status, 'unverified') as ObservationStatus,
    reviewReason: asString(row.review_reason),
    memo: asString(row.memo),
    assigneeId: typeof row.assignee_id === 'string' ? row.assignee_id : null,
    updatedAt: asString(row.updated_at),
  };
}

export function mapPoint(row: Row): InterestPoint {
  return {
    id: asString(row.id),
    lat: asNumber(row.lat) ?? 0,
    lng: asNumber(row.lng) ?? 0,
    label: asString(row.label),
    memo: asString(row.memo),
    createdBy: asString(row.created_by),
    createdAt: asString(row.created_at),
  };
}

export function mapHandover(row: Row): Handover {
  return {
    id: asString(row.id),
    zoneId: asString(row.zone_id),
    fromUser: asString(row.from_user),
    toUser: typeof row.to_user === 'string' ? row.to_user : null,
    previousStatus: asString(row.previous_status, 'assigned') as TaskStatus,
    interruptionReason: asString(row.interruption_reason),
    approvalReason: typeof row.approval_reason === 'string' ? row.approval_reason : null,
    status: asString(row.status, 'pending') as HandoverStatus,
    requestedAt: asString(row.requested_at),
    decidedAt: typeof row.decided_at === 'string' ? row.decided_at : null,
  };
}

export function mapPhoto(row: Row): Photo {
  return {
    id: asString(row.id),
    zoneId: asString(row.zone_id),
    storagePath: asString(row.storage_path),
    memo: asString(row.memo),
    uploadedBy: asString(row.uploaded_by),
    createdAt: asString(row.created_at),
    url: null,
  };
}

export function mapActivity(row: Row): Activity {
  return {
    id: asString(row.id),
    kind: asString(row.kind),
    message: asString(row.message),
    actorId: typeof row.actor_id === 'string' ? row.actor_id : null,
    createdAt: asString(row.created_at),
  };
}

export function mapNotice(row: Row): Notice {
  return {
    id: asString(row.id),
    message: asString(row.message),
    readAt: typeof row.read_at === 'string' ? row.read_at : null,
    createdAt: asString(row.created_at),
  };
}
