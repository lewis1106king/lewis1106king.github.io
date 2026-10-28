import { createInitialDemo, handoverReason } from './data';
import type {
  DroneId,
  HistoryEvent,
  ObservationStatus,
  TaskStatus,
  Zone,
} from './types';

export interface Task {
  id: string;
  zoneId: string;
  droneId: DroneId;
  status: Exclude<TaskStatus, 'unassigned'>;
  createdAt: string;
  updatedAt: string;
  interruptionReason?: string;
  priorStatus?: TaskStatus;
  previousTaskId?: string;
}

export interface Handover {
  id: string;
  zoneId: string;
  fromTaskId: string;
  toTaskId: string;
  from: DroneId;
  to: DroneId;
  interruptionReason: string;
  approvalReason: string;
  approvedAt: string;
  actor: string;
  /** 클라이언트 재시도 중복 제거용 식별자이며 서버 저장을 의미하지 않는다. */
  requestId?: string;
}

export interface Material {
  id: string;
  zoneId: string;
  taskId: string | null;
  label: string;
  reference: string;
  memo: string;
  createdAt: string;
  source: 'simulation';
}

export interface Review {
  id: string;
  zoneId: string;
  status: ObservationStatus;
  reason: string;
  at: string;
  actor: string;
}

export interface Audit {
  id: string;
  time: string;
  kind: string;
  message: string;
  zoneId?: string;
  taskId?: string;
  before: unknown;
  after: unknown;
  reason: string;
  actor: string;
}

export interface WorkflowState {
  version: 2;
  revision: number;
  updatedAt: string;
  tasks: Task[];
  materials: Material[];
  reviews: Review[];
  handovers: Handover[];
  history: Audit[];
  bInterrupted: boolean;
}

export type WorkflowCommand =
  | { type: 'interruptB'; expectedRevision: number }
  | { type: 'assign'; zoneId: string; droneId: DroneId; reason: string; expectedRevision: number }
  | { type: 'taskStatus'; taskId: string; status: 'in_progress' | 'completed'; reason: string; expectedRevision: number }
  | { type: 'interrupt'; taskId: string; reason: string; expectedRevision: number }
  | { type: 'correctCompletion'; taskId: string; reason: string; expectedRevision: number }
  | { type: 'review'; zoneId: string; status: ObservationStatus; reason: string; expectedRevision: number }
  | { type: 'material'; zoneId: string; label: string; memo: string; expectedRevision: number }
  | { type: 'handover'; taskId: string; droneId: DroneId; reason: string; requestId: string; expectedRevision: number };

const ACTOR = '시연 운영자';
const INITIAL_TIME = '2026-10-28T00:00:00.000Z';
const droneIds: readonly DroneId[] = ['A', 'B', 'C'];
const taskStatuses: readonly TaskStatus[] = ['unassigned', 'assigned', 'in_progress', 'completed', 'interrupted'];
const observationStatuses: readonly ObservationStatus[] = ['unverified', 'confirmed', 'recheck'];
let fallbackIdSequence = 0;

/** Zone의 표시용 정적 메타데이터는 초기 fixture에서만 가져오며 WorkflowState에는 저장하지 않는다. */
const zoneBlueprints = createInitialDemo().zones.map((zone) => ({
  id: zone.id,
  number: zone.number,
  candidate: zone.candidate,
  note: zone.note,
}));
const validZoneIds = new Set(zoneBlueprints.map((zone) => zone.id));

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value);

const isDroneId = (value: unknown): value is DroneId =>
  typeof value === 'string' && (droneIds as readonly string[]).includes(value);

const isTaskStatus = (value: unknown): value is TaskStatus =>
  typeof value === 'string' && (taskStatuses as readonly string[]).includes(value);

const isObservationStatus = (value: unknown): value is ObservationStatus =>
  typeof value === 'string' && (observationStatuses as readonly string[]).includes(value);

const isNonEmptyString = (value: unknown): value is string =>
  typeof value === 'string' && value.trim().length > 0;

const isIsoTime = (value: unknown): value is string => {
  if (typeof value !== 'string' || value.length === 0) return false;
  const parsed = new Date(value);
  return !Number.isNaN(parsed.getTime()) && parsed.toISOString() === value;
};

const isJsonValue = (value: unknown, seen = new Set<object>()): boolean => {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (Array.isArray(value)) return value.every((item) => isJsonValue(item, seen));
  if (!isRecord(value) || seen.has(value)) return false;
  seen.add(value);
  const valid = Object.values(value).every((item) => isJsonValue(item, seen));
  seen.delete(value);
  return valid;
};

const clone = <T>(value: T): T => JSON.parse(JSON.stringify(value)) as T;
const now = (): string => new Date().toISOString();

function idFor(prefix: string, state: WorkflowState): string {
  const used = new Set([
    ...state.tasks.map((item) => item.id),
    ...state.materials.map((item) => item.id),
    ...state.reviews.map((item) => item.id),
    ...state.handovers.map((item) => item.id),
    ...state.history.map((item) => item.id),
  ]);
  do {
    const uuid = globalThis.crypto?.randomUUID?.();
    const value = uuid ?? `${Date.now().toString(36)}-${(++fallbackIdSequence).toString(36)}`;
    const id = `${prefix}-${value}`;
    if (!used.has(id)) return id;
  } while (true);
}

function requireReason(value: string, label = '사유'): string {
  const normalized = value.trim();
  if (!normalized) throw new Error(`${label}를 입력하세요.`);
  return normalized;
}

function requireKnownZone(zoneId: string): void {
  if (!validZoneIds.has(zoneId)) throw new Error('존재하지 않는 구역입니다.');
}

function requireExpectedRevision(state: WorkflowState, expectedRevision: number): void {
  if (!Number.isInteger(expectedRevision)) throw new Error('기대 리비전이 필요합니다.');
  if (state.revision !== expectedRevision) {
    throw new Error('버전 충돌: 최신 상태를 확인한 뒤 다시 시도하세요.');
  }
}

function requireUsableState(state: WorkflowState): void {
  if (!validateWorkflow(state)) throw new Error('워크플로 상태가 올바르지 않아 명령을 적용할 수 없습니다.');
}

interface AuditInput {
  kind: string;
  message: string;
  zoneId?: string;
  taskId?: string;
  before: unknown;
  after: unknown;
  reason: string;
}

function commit(state: WorkflowState, audits: AuditInput[]): WorkflowState {
  const timestamp = now();
  state.revision += 1;
  state.updatedAt = timestamp;
  for (const audit of audits) {
    state.history.push({
      id: idFor('AUDIT', state),
      time: timestamp,
      kind: audit.kind,
      message: audit.message,
      ...(audit.zoneId ? { zoneId: audit.zoneId } : {}),
      ...(audit.taskId ? { taskId: audit.taskId } : {}),
      before: clone(audit.before),
      after: clone(audit.after),
      reason: audit.reason,
      actor: ACTOR,
    });
  }
  requireUsableState(state);
  return state;
}

function initialAudit(event: HistoryEvent): Audit {
  return {
    id: `AUDIT-INITIAL-${event.id}`,
    time: event.time,
    kind: event.kind,
    message: event.message,
    ...(event.zoneId ? { zoneId: event.zoneId } : {}),
    before: null,
    after: null,
    reason: event.message,
    actor: ACTOR,
  };
}

/** src/data.ts fixture를 정규화한다. 08의 재확인 근거는 기존 자료 메모에서 별도 검토 기록으로 명시적으로 매핑한다. */
export function createWorkflow(): WorkflowState {
  const demo = createInitialDemo();
  const tasks: Task[] = [];
  const materials: Material[] = [];
  const reviews: Review[] = [];

  for (const zone of demo.zones) {
    const taskId = zone.droneId ? `TASK-INITIAL-${zone.id}` : null;
    if (zone.droneId && zone.taskStatus !== 'unassigned') {
      tasks.push({
        id: taskId as string,
        zoneId: zone.id,
        droneId: zone.droneId,
        status: zone.taskStatus,
        createdAt: INITIAL_TIME,
        updatedAt: INITIAL_TIME,
      });
    }
    for (const evidence of zone.evidence) {
      materials.push({
        id: evidence.id,
        zoneId: zone.id,
        taskId,
        label: evidence.label,
        reference: evidence.reference,
        memo: evidence.memo,
        createdAt: INITIAL_TIME,
        source: 'simulation',
      });
    }
    reviews.push({
      id: `REVIEW-INITIAL-${zone.id}`,
      zoneId: zone.id,
      status: zone.observationStatus,
      reason: zone.id === 'Z-08' ? (zone.evidence[0]?.memo ?? zone.note) : zone.note,
      at: INITIAL_TIME,
      actor: ACTOR,
    });
  }

  return {
    version: 2,
    revision: 0,
    updatedAt: INITIAL_TIME,
    tasks,
    materials,
    reviews,
    handovers: [],
    history: demo.history.map(initialAudit),
    bInterrupted: demo.bInterrupted,
  };
}

export function activeTask(state: WorkflowState, zoneId: string): Task | undefined {
  for (let index = state.tasks.length - 1; index >= 0; index -= 1) {
    const task = state.tasks[index];
    if (task.zoneId === zoneId && (task.status === 'assigned' || task.status === 'in_progress')) return task;
  }
  return undefined;
}

export function latestTask(state: WorkflowState, zoneId: string): Task | undefined {
  for (let index = state.tasks.length - 1; index >= 0; index -= 1) {
    if (state.tasks[index].zoneId === zoneId) return state.tasks[index];
  }
  return undefined;
}

export function latestReview(state: WorkflowState, zoneId: string): Review | undefined {
  for (let index = state.reviews.length - 1; index >= 0; index -= 1) {
    if (state.reviews[index].zoneId === zoneId) return state.reviews[index];
  }
  return undefined;
}

/** 저장 모델을 다시 Zone 모양으로 투영한다. 이 결과를 저장하거나 다시 명령의 입력으로 사용하지 않는다. */
export function projectZones(state: WorkflowState): Zone[] {
  return zoneBlueprints.map((blueprint) => {
    const active = activeTask(state, blueprint.id);
    const latest = latestTask(state, blueprint.id);
    const displayTask = active ?? latest;
    const review = latestReview(state, blueprint.id);
    const outgoing = latest ? state.handovers.find((handover) => handover.fromTaskId === latest.id) : undefined;
    const incoming = latest ? state.handovers.find((handover) => handover.toTaskId === latest.id) : undefined;
    const prior = incoming ? state.tasks.find((task) => task.id === incoming.fromTaskId) : undefined;
    const materials = state.materials
      .filter((material) => material.zoneId === blueprint.id)
      .map((material) => ({
        id: material.id,
        label: material.label,
        reference: material.reference,
        memo: material.memo,
      }));

    const zone: Zone = {
      id: blueprint.id,
      number: blueprint.number,
      droneId: displayTask?.droneId ?? null,
      taskStatus: displayTask?.status ?? 'unassigned',
      observationStatus: review?.status ?? 'unverified',
      evidence: materials,
      note: review?.reason ?? blueprint.note,
      candidate: blueprint.candidate,
      needsHandover: Boolean(latest && latest.status === 'interrupted' && !outgoing),
    };

    if (latest?.status === 'interrupted') {
      zone.handoverFrom = latest.droneId;
      zone.handoverReason = latest.interruptionReason;
      zone.interruptedWork = {
        droneId: latest.droneId,
        taskStatus: (latest.priorStatus === 'assigned' || latest.priorStatus === 'in_progress') ? latest.priorStatus : 'assigned',
        interruptedAt: latest.updatedAt,
      };
    }
    if (incoming && prior) {
      zone.handover = {
        from: incoming.from,
        to: incoming.to,
        reason: incoming.approvalReason,
        approvedAt: incoming.approvedAt,
      };
      zone.handoverFrom = incoming.from;
      zone.handoverReason = incoming.interruptionReason;
      zone.interruptedWork = {
        droneId: prior.droneId,
        taskStatus: (prior.priorStatus === 'assigned' || prior.priorStatus === 'in_progress') ? prior.priorStatus : 'assigned',
        interruptedAt: prior.updatedAt,
      };
    }
    return zone;
  });
}

export function validateWorkflow(value: unknown): value is WorkflowState {
  if (!isRecord(value) || value.version !== 2 || !Number.isInteger(value.revision) || (value.revision as number) < 0 || !isIsoTime(value.updatedAt) || typeof value.bInterrupted !== 'boolean') return false;
  if (!Array.isArray(value.tasks) || !Array.isArray(value.materials) || !Array.isArray(value.reviews) || !Array.isArray(value.handovers) || !Array.isArray(value.history)) return false;

  const ids = new Set<string>();
  const addId = (id: unknown): id is string => {
    if (!isNonEmptyString(id) || ids.has(id)) return false;
    ids.add(id);
    return true;
  };
  const tasks = value.tasks as unknown[];
  const materials = value.materials as unknown[];
  const reviews = value.reviews as unknown[];
  const handovers = value.handovers as unknown[];
  const history = value.history as unknown[];
  const tasksById = new Map<string, Task>();
  const activeByZone = new Set<string>();

  for (const item of tasks) {
    if (!isRecord(item) || !addId(item.id) || !isNonEmptyString(item.zoneId) || !validZoneIds.has(item.zoneId) || !isDroneId(item.droneId) || !isTaskStatus(item.status) || item.status === 'unassigned' || !isIsoTime(item.createdAt) || !isIsoTime(item.updatedAt)) return false;
    if (item.interruptionReason !== undefined && !isNonEmptyString(item.interruptionReason)) return false;
    if (item.priorStatus !== undefined && (!isTaskStatus(item.priorStatus) || item.priorStatus === 'unassigned')) return false;
    if (item.previousTaskId !== undefined && !isNonEmptyString(item.previousTaskId)) return false;
    if (item.status === 'interrupted' && (!isNonEmptyString(item.interruptionReason) || (item.priorStatus !== 'assigned' && item.priorStatus !== 'in_progress'))) return false;
    if ((item.status === 'assigned' || item.status === 'in_progress') && activeByZone.has(item.zoneId)) return false;
    if (item.status === 'assigned' || item.status === 'in_progress') activeByZone.add(item.zoneId);
    tasksById.set(item.id, item as unknown as Task);
  }

  const materialsById = new Set<string>();
  for (const item of materials) {
    if (!isRecord(item) || !addId(item.id) || !isNonEmptyString(item.zoneId) || !validZoneIds.has(item.zoneId) || (item.taskId !== null && typeof item.taskId !== 'string') || !isNonEmptyString(item.label) || !isNonEmptyString(item.reference) || !isNonEmptyString(item.memo) || !isIsoTime(item.createdAt) || item.source !== 'simulation') return false;
    if (materialsById.has(item.id)) return false;
    materialsById.add(item.id);
    if (item.taskId !== null) {
      const ownerTaskId = item.taskId;
      if (!isNonEmptyString(ownerTaskId)) return false;
      const owner = tasksById.get(ownerTaskId);
      if (!owner || owner.zoneId !== item.zoneId) return false;
    }
  }

  for (const item of reviews) {
    if (!isRecord(item) || !addId(item.id) || !isNonEmptyString(item.zoneId) || !validZoneIds.has(item.zoneId) || !isObservationStatus(item.status) || !isNonEmptyString(item.reason) || !isIsoTime(item.at) || !isNonEmptyString(item.actor)) return false;
  }

  const fromTasks = new Set<string>();
  const toTasks = new Set<string>();
  const handoverByTo = new Map<string, Handover>();
  for (const item of handovers) {
    if (!isRecord(item) || !addId(item.id) || !isNonEmptyString(item.zoneId) || !validZoneIds.has(item.zoneId) || !isNonEmptyString(item.fromTaskId) || !isNonEmptyString(item.toTaskId) || !isDroneId(item.from) || !isDroneId(item.to) || !isNonEmptyString(item.interruptionReason) || !isNonEmptyString(item.approvalReason) || !isIsoTime(item.approvedAt) || !isNonEmptyString(item.actor)) return false;
    if (item.requestId !== undefined && !isNonEmptyString(item.requestId)) return false;
    const fromTask = tasksById.get(item.fromTaskId);
    const toTask = tasksById.get(item.toTaskId);
    if (!fromTask || !toTask || fromTask.id === toTask.id || fromTask.zoneId !== item.zoneId || toTask.zoneId !== item.zoneId || fromTask.droneId !== item.from || toTask.droneId !== item.to || fromTask.status !== 'interrupted' || toTask.previousTaskId !== fromTask.id || fromTasks.has(fromTask.id) || toTasks.has(toTask.id)) return false;
    fromTasks.add(fromTask.id);
    toTasks.add(toTask.id);
    handoverByTo.set(toTask.id, item as unknown as Handover);
  }

  for (const task of tasksById.values()) {
    if (task.previousTaskId !== undefined) {
      const previous = tasksById.get(task.previousTaskId);
      if (!previous || previous.zoneId !== task.zoneId || !handoverByTo.has(task.id)) return false;
      const visited = new Set<string>([task.id]);
      let cursor: Task | undefined = task;
      while (cursor?.previousTaskId) {
        if (visited.has(cursor.previousTaskId)) return false;
        visited.add(cursor.previousTaskId);
        cursor = tasksById.get(cursor.previousTaskId);
        if (!cursor) return false;
      }
    }
  }

  for (const item of history) {
    if (!isRecord(item) || !addId(item.id) || !isNonEmptyString(item.time) || !isNonEmptyString(item.kind) || !isNonEmptyString(item.message) || !isNonEmptyString(item.reason) || !isNonEmptyString(item.actor) || !isJsonValue(item.before) || !isJsonValue(item.after)) return false;
    if (item.zoneId !== undefined && (!isNonEmptyString(item.zoneId) || !validZoneIds.has(item.zoneId))) return false;
    if (item.taskId !== undefined) {
      if (!isNonEmptyString(item.taskId)) return false;
      const task = tasksById.get(item.taskId);
      if (!task || (item.zoneId !== undefined && task.zoneId !== item.zoneId)) return false;
    }
  }
  return true;
}

function taskOrThrow(state: WorkflowState, taskId: string): Task {
  const task = state.tasks.find((candidate) => candidate.id === taskId);
  if (!task) throw new Error('존재하지 않는 작업입니다.');
  return task;
}

export function applyCommand(state: WorkflowState, command: WorkflowCommand): WorkflowState {
  requireUsableState(state);
  if (!Number.isInteger(command.expectedRevision)) throw new Error('기대 리비전이 필요합니다.');

  // requestId 기반 인계 재시도는 낡은 revision이어도 같은 source+payload만 안전하게 멱등 처리한다.
  if (command.type === 'handover') {
    const previous = state.handovers.find((handover) => handover.fromTaskId === command.taskId && handover.requestId === command.requestId);
    if (previous) {
      if (previous.to === command.droneId && previous.approvalReason === command.reason.trim()) return state;
      throw new Error('중복 인계 요청의 대상 또는 승인 사유가 기존 요청과 다릅니다.');
    }
  }

  // 이미 목표 상태인 동일 명령은 저장하지 않는 안전한 no-op이다.
  if (command.type === 'taskStatus') {
    const task = state.tasks.find((candidate) => candidate.id === command.taskId);
    if (task?.status === command.status) return state;
  }
  if (command.type === 'interrupt' && state.tasks.find((candidate) => candidate.id === command.taskId)?.status === 'interrupted') return state;
  if (command.type === 'interruptB' && state.bInterrupted) return state;

  requireExpectedRevision(state, command.expectedRevision);
  const next = clone(state);

  switch (command.type) {
    case 'interruptB': {
      const affected = next.tasks.filter((task) => (task.zoneId === 'Z-07' || task.zoneId === 'Z-08') && task.droneId === 'B' && (task.status === 'assigned' || task.status === 'in_progress'));
      const audits: AuditInput[] = [];
      for (const task of affected) {
        const before = clone(task);
        task.priorStatus = task.status;
        task.status = 'interrupted';
        task.interruptionReason = handoverReason;
        task.updatedAt = now();
        audits.push({
          kind: '중단',
          message: `${task.zoneId}의 기체 B 작업을 중단했습니다.`,
          zoneId: task.zoneId,
          taskId: task.id,
          before,
          after: clone(task),
          reason: handoverReason,
        });
      }
      const beforeB = next.bInterrupted;
      next.bInterrupted = true;
      audits.push({
        kind: '중단',
        message: '기체 B 중단 시연을 기록했습니다.',
        before: beforeB,
        after: true,
        reason: handoverReason,
      });
      return commit(next, audits);
    }

    case 'assign': {
      requireKnownZone(command.zoneId);
      const reason = requireReason(command.reason, '배정 사유');
      if (latestTask(next, command.zoneId)) throw new Error('초기 배정은 작업 이력이 없는 구역에서만 할 수 있습니다.');
      const timestamp = now();
      const task: Task = {
        id: idFor('TASK', next),
        zoneId: command.zoneId,
        droneId: command.droneId,
        status: 'assigned',
        createdAt: timestamp,
        updatedAt: timestamp,
      };
      next.tasks.push(task);
      return commit(next, [{
        kind: '배정',
        message: `${command.zoneId}에 기체 ${command.droneId} 작업을 최초 배정했습니다.`,
        zoneId: task.zoneId,
        taskId: task.id,
        before: null,
        after: task,
        reason,
      }]);
    }

    case 'taskStatus': {
      const reason = requireReason(command.reason, '상태 변경 사유');
      const task = taskOrThrow(next, command.taskId);
      const before = clone(task);
      if (command.status === 'in_progress' && task.status !== 'assigned') throw new Error('배정된 작업만 진행으로 시작할 수 있습니다.');
      if (command.status === 'completed' && task.status !== 'in_progress') throw new Error('진행 중인 작업만 완료할 수 있습니다.');
      task.status = command.status;
      task.updatedAt = now();
      return commit(next, [{
        kind: '상태 변경',
        message: `${task.zoneId} 작업 상태를 ${command.status}로 변경했습니다.`,
        zoneId: task.zoneId,
        taskId: task.id,
        before,
        after: task,
        reason,
      }]);
    }

    case 'interrupt': {
      const reason = requireReason(command.reason, '중단 사유');
      const task = taskOrThrow(next, command.taskId);
      if (task.status !== 'assigned' && task.status !== 'in_progress') throw new Error('배정 또는 진행 중인 작업만 중단할 수 있습니다.');
      const before = clone(task);
      task.priorStatus = task.status;
      task.status = 'interrupted';
      task.interruptionReason = reason;
      task.updatedAt = now();
      return commit(next, [{
        kind: '중단',
        message: `${task.zoneId} 작업을 중단했습니다.`,
        zoneId: task.zoneId,
        taskId: task.id,
        before,
        after: task,
        reason,
      }]);
    }

    case 'correctCompletion': {
      const reason = requireReason(command.reason, '완료 정정 사유');
      const task = taskOrThrow(next, command.taskId);
      if (task.status === 'assigned') return state;
      if (task.status !== 'completed') throw new Error('완료된 작업만 배정 상태로 정정할 수 있습니다.');
      if (activeTask(next, task.zoneId)) throw new Error('진행 중 또는 배정된 작업이 있어 완료를 정정할 수 없습니다.');
      const before = clone(task);
      task.status = 'assigned';
      task.updatedAt = now();
      return commit(next, [{
        kind: '상태 변경',
        message: `${task.zoneId}의 완료 기록을 배정 상태로 정정했습니다.`,
        zoneId: task.zoneId,
        taskId: task.id,
        before,
        after: task,
        reason,
      }]);
    }

    case 'review': {
      requireKnownZone(command.zoneId);
      const reason = requireReason(command.reason, '검토 사유');
      const review: Review = {
        id: idFor('REVIEW', next),
        zoneId: command.zoneId,
        status: command.status,
        reason,
        at: now(),
        actor: ACTOR,
      };
      next.reviews.push(review);
      return commit(next, [{
        kind: '관측',
        message: `${command.zoneId} 검토 상태를 ${command.status}로 기록했습니다.`,
        zoneId: command.zoneId,
        before: latestReview(state, command.zoneId) ?? null,
        after: review,
        reason,
      }]);
    }

    case 'material': {
      requireKnownZone(command.zoneId);
      const label = requireReason(command.label, '자료 이름');
      const memo = requireReason(command.memo, '자료 메모');
      const owner = latestTask(next, command.zoneId);
      const material: Material = {
        id: idFor('MATERIAL', next),
        zoneId: command.zoneId,
        taskId: owner?.id ?? null,
        label,
        reference: `시뮬레이션 텍스트 참조 · ${command.zoneId}`,
        memo,
        createdAt: now(),
        source: 'simulation',
      };
      next.materials.push(material);
      return commit(next, [{
        kind: '자료 참조',
        message: `${command.zoneId}에 시뮬레이션 텍스트 자료를 추가했습니다.`,
        zoneId: command.zoneId,
        taskId: material.taskId ?? undefined,
        before: null,
        after: material,
        reason: memo,
      }]);
    }

    case 'handover': {
      const approvalReason = requireReason(command.reason, '승인 사유');
      const requestId = requireReason(command.requestId, '요청 식별자');
      const source = taskOrThrow(next, command.taskId);
      if (source.status !== 'interrupted' || !source.interruptionReason) throw new Error('중단 사유가 보존된 중단 작업만 인계할 수 있습니다.');
      if (next.handovers.some((handover) => handover.fromTaskId === source.id)) throw new Error('이미 인계된 원본 작업입니다.');
      if (activeTask(next, source.zoneId)) throw new Error('해당 구역에 이미 활성 작업이 있어 인계할 수 없습니다.');
      const timestamp = now();
      const replacement: Task = {
        id: idFor('TASK', next),
        zoneId: source.zoneId,
        droneId: command.droneId,
        status: 'assigned',
        createdAt: timestamp,
        updatedAt: timestamp,
        previousTaskId: source.id,
      };
      next.tasks.push(replacement);
      const handover: Handover = {
        id: idFor('HANDOVER', next),
        zoneId: source.zoneId,
        fromTaskId: source.id,
        toTaskId: replacement.id,
        from: source.droneId,
        to: command.droneId,
        interruptionReason: source.interruptionReason,
        approvalReason,
        approvedAt: timestamp,
        actor: ACTOR,
        requestId,
      };
      next.handovers.push(handover);
      return commit(next, [{
        kind: '승인 인계',
        message: `${source.zoneId}의 중단 작업을 기체 ${command.droneId}에 새 작업으로 인계했습니다.`,
        zoneId: source.zoneId,
        taskId: replacement.id,
        before: source,
        after: { source, replacement, handover },
        reason: approvalReason,
      }]);
    }
  }
}

function csvText(value: unknown): string {
  const raw = typeof value === 'string' ? value : JSON.stringify(value) ?? '';
  const safe = /^[\t\r\n ]*[=+\-@]/.test(raw) ? `'${raw}` : raw;
  return `"${safe.replace(/"/g, '""')}"`;
}

/** UTF-8 BOM과 전 필드 인용으로 스프레드시트에서 안전하게 여는 감사 CSV를 만든다. */
export function csvHistory(state: WorkflowState): string {
  const header = ['id', 'time', 'kind', 'message', 'zoneId', 'taskId', 'before', 'after', 'reason', 'actor'];
  const rows = state.history.map((audit) => [
    audit.id,
    audit.time,
    audit.kind,
    audit.message,
    audit.zoneId ?? '',
    audit.taskId ?? '',
    audit.before,
    audit.after,
    audit.reason,
    audit.actor,
  ].map(csvText).join(','));
  return `\uFEFF${header.map(csvText).join(',')}\r\n${rows.join('\r\n')}`;
}
