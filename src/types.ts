export type DroneId = 'A' | 'B' | 'C';

export type TaskStatus = 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'interrupted';

export type ObservationStatus = 'unverified' | 'confirmed' | 'recheck';

export interface Evidence {
  id: string;
  label: string;
  reference: string;
  memo: string;
}

export interface HandoverRecord {
  from: DroneId;
  to: DroneId;
  reason: string;
  approvedAt: string;
}

export interface InterruptedWork {
  droneId: DroneId;
  taskStatus: Exclude<TaskStatus, 'interrupted'>;
  interruptedAt: string;
}

export interface Zone {
  id: string;
  number: number;
  droneId: DroneId | null;
  taskStatus: TaskStatus;
  observationStatus: ObservationStatus;
  evidence: Evidence[];
  note: string;
  candidate: string | null;
  needsHandover?: boolean;
  handoverFrom?: DroneId;
  handoverReason?: string;
  handover?: HandoverRecord;
  interruptedWork?: InterruptedWork;
}

export type HistoryKind = '배정' | '관측' | '중단' | '인계 필요' | '승인 인계' | '상태 변경' | '자료 참조';

export interface HistoryEvent {
  id: string;
  time: string;
  kind: HistoryKind;
  message: string;
  zoneId?: string;
}

export interface DemoState {
  version: 1;
  zones: Zone[];
  history: HistoryEvent[];
  bInterrupted: boolean;
}

export type NoticeTone = 'info' | 'success' | 'warning' | 'error';

export interface Notice {
  id: number;
  tone: NoticeTone;
  message: string;
}
