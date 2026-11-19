import type { DroneStatus, HandoverStatus, ObservationStatus, Role, TaskStatus } from '../domain/rules';

export type Mission = {
  id: string;
  title: string;
  joinCode: string;
  createdBy: string;
  createdAt: string;
  autoRun?: boolean;
  autoRunAt?: string;
};

export type SurveyStep = 'wait' | 'enroute' | 'arrived' | 'shot' | 'confirmed';

export type Waypoint = {
  id: string;
  zoneId: string | null;
  lat: number;
  lng: number;
  label: string;
  assigneeId: string;
  order: number;
  step: SurveyStep;
  updatedAt: string;
};

export type Member = {
  userId: string;
  role: Role;
  callsign: string;
  droneName: string;
  droneStatus: DroneStatus;
  battery: number | null;
  lat: number | null;
  lng: number | null;
  accuracy: number | null;
  alt?: number | null;
  heading: number | null;
  speed: number | null;
  camera: boolean;
  trail: { lat: number; lng: number }[];
  updatedAt: string;
};

export type Zone = {
  id: string;
  missionId: string;
  label: string;
  path: { lat: number; lng: number }[];
  taskStatus: TaskStatus;
  observationStatus: ObservationStatus;
  reviewReason: string;
  memo: string;
  assigneeId: string | null;
  surveyStep?: SurveyStep | null;
  updatedAt: string;
};

export type PointKind = 'person' | 'hazard' | 'entry' | 'clue';

export type LastSeen = {
  lat: number;
  lng: number;
  radius: number;
  note: string;
  at: string;
  by: string;
};

export type InterestPoint = {
  id: string;
  lat: number;
  lng: number;
  kind: PointKind;
  label: string;
  memo: string;
  createdBy: string;
  createdAt: string;
};

export type Handover = {
  id: string;
  zoneId: string;
  fromUser: string;
  toUser: string | null;
  previousStatus: TaskStatus;
  interruptionReason: string;
  approvalReason: string | null;
  status: HandoverStatus;
  requestedAt: string;
  decidedAt: string | null;
};

export type Photo = {
  id: string;
  zoneId: string;
  storagePath: string;
  memo: string;
  uploadedBy: string;
  createdAt: string;
  ready: boolean;
  url: string | null;
};

export type Activity = {
  id: string;
  kind: string;
  message: string;
  actorId: string | null;
  createdAt: string;
};

export type Notice = {
  id: string;
  message: string;
  readAt: string | null;
  createdAt: string;
};

export type MissionData = {
  mission: Mission;
  members: Member[];
  zones: Zone[];
  points: InterestPoint[];
  handovers: Handover[];
  photos: Photo[];
  events: Activity[];
  notices: Notice[];
  waypoints: Waypoint[];
  lastSeen: LastSeen | null;
};
