import type {
  DemoState,
  DroneId,
  HistoryEvent,
  ObservationStatus,
  TaskStatus,
  Zone,
} from './types';

export const taskMeta: Record<TaskStatus, { label: string; symbol: string; tone: string }> = {
  unassigned: { label: '작업 없음', symbol: '○', tone: 'neutral' },
  assigned: { label: '배정됨', symbol: '›', tone: 'blue' },
  in_progress: { label: '진행 중', symbol: '▶', tone: 'blue' },
  completed: { label: '완료', symbol: '✓', tone: 'green' },
  interrupted: { label: '중단', symbol: '■', tone: 'red' },
};

export const observationMeta: Record<ObservationStatus, { label: string; symbol: string; tone: string }> = {
  unverified: { label: '미확인', symbol: '○', tone: 'neutral' },
  confirmed: { label: '확인 완료', symbol: '✓', tone: 'green' },
  recheck: { label: '재확인 필요', symbol: '!', tone: 'amber' },
};

const baseZones: Zone[] = [
  {
    id: 'Z-01', number: 1, droneId: 'A', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-01', label: '가상 관측 자료 01', reference: '가상 구역도 · Z-01', memo: '지형과 진입로 확인 절차를 마침' }],
    note: '확인 절차 완료', candidate: null,
  },
  {
    id: 'Z-02', number: 2, droneId: 'A', taskStatus: 'in_progress', observationStatus: 'unverified',
    evidence: [{ id: 'EV-02', label: '가상 관측 자료 02', reference: '가상 구역도 · Z-02', memo: '자료 검토 전, 관측 작업 진행 중' }],
    note: '현재 관측 진행', candidate: null,
  },
  { id: 'Z-03', number: 3, droneId: 'A', taskStatus: 'assigned', observationStatus: 'unverified', evidence: [], note: 'A의 대기 작업', candidate: null },
  { id: 'Z-04', number: 4, droneId: 'A', taskStatus: 'assigned', observationStatus: 'recheck', evidence: [], note: '이전 자료 재확인 필요', candidate: '추가 관측 필요' },
  {
    id: 'Z-05', number: 5, droneId: 'B', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-05', label: '가상 관측 자료 05', reference: '가상 구역도 · Z-05', memo: '확인 절차 완료' }],
    note: '완료 기록 보존', candidate: null,
  },
  {
    id: 'Z-06', number: 6, droneId: 'B', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-06', label: '가상 관측 자료 06', reference: '가상 구역도 · Z-06', memo: '확인 절차 완료' }],
    note: '완료 기록 보존', candidate: null,
  },
  {
    id: 'Z-07', number: 7, droneId: 'B', taskStatus: 'in_progress', observationStatus: 'unverified',
    evidence: [
      { id: 'EV-07A', label: '가상 관측 자료 07-A', reference: '가상 구역도 · Z-07', memo: '수풀 가장자리: 운영자 확인 전' },
      { id: 'EV-07B', label: '가상 관측 자료 07-B', reference: '가상 구역도 · Z-07', memo: '추가 관측 자료와 함께 검토 필요' },
    ],
    note: '진행 중인 관측 작업', candidate: '발견 후보 1건 · 추가 확인 필요',
  },
  {
    id: 'Z-08', number: 8, droneId: 'B', taskStatus: 'assigned', observationStatus: 'recheck',
    evidence: [{ id: 'EV-08', label: '가상 관측 메모 08', reference: '가상 구역도 · Z-08', memo: '시야 가림으로 재확인 요청' }],
    note: '시작 전 재확인 작업', candidate: '확인 보류',
  },
  {
    id: 'Z-09', number: 9, droneId: 'C', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-09', label: '가상 관측 자료 09', reference: '가상 구역도 · Z-09', memo: '확인 절차 완료' }],
    note: '확인 절차 완료', candidate: null,
  },
  {
    id: 'Z-10', number: 10, droneId: 'C', taskStatus: 'in_progress', observationStatus: 'unverified',
    evidence: [{ id: 'EV-10', label: '가상 관측 자료 10', reference: '가상 구역도 · Z-10', memo: '자료 검토 전, 관측 작업 진행 중' }],
    note: '현재 관측 진행', candidate: null,
  },
  { id: 'Z-11', number: 11, droneId: null, taskStatus: 'unassigned', observationStatus: 'unverified', evidence: [], note: '담당 작업 없음', candidate: null },
  { id: 'Z-12', number: 12, droneId: null, taskStatus: 'unassigned', observationStatus: 'unverified', evidence: [], note: '담당 작업 없음', candidate: null },
];

const baseHistory: HistoryEvent[] = [
  { id: 'H-01', time: '시작 전', kind: '관측', zoneId: 'Z-09', message: 'Z-09의 관측 확인 절차가 완료되어 있습니다.' },
  { id: 'H-02', time: '시작 전', kind: '관측', zoneId: 'Z-06', message: 'Z-06의 관측 확인 절차가 완료되어 있습니다.' },
  { id: 'H-03', time: '시작 전', kind: '관측', zoneId: 'Z-01', message: 'Z-01의 관측 확인 절차가 완료되어 있습니다.' },
  { id: 'H-04', time: '시작 전', kind: '배정', zoneId: 'Z-07', message: '기체 B에 Z-07 가상 관측 작업이 배정되어 있습니다.' },
];

const cloneZones = (): Zone[] => baseZones.map((zone) => ({
  ...zone,
  evidence: zone.evidence.map((evidence) => ({ ...evidence })),
}));

const cloneHistory = (): HistoryEvent[] => baseHistory.map((event) => ({ ...event }));

export const createInitialDemo = (): DemoState => ({
  version: 1,
  zones: cloneZones(),
  history: cloneHistory(),
  bInterrupted: false,
});

export const recommendedDrone = (zoneId: string): DroneId => (zoneId === 'Z-08' ? 'C' : 'A');

export const handoverReason = '모의 기체 B 중단으로 관측 확인을 이어갈 수 없음';
