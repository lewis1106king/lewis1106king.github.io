import { useEffect, useMemo, useState } from 'react';
import {
  AlertTriangle,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronRight,
  CircleDot,
  ClipboardCheck,
  Download,
  Eye,
  FileImage,
  History,
  MapPinned,
  Play,
  Radio,
  RefreshCcw,
  Search,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  UsersRound,
  X,
} from 'lucide-react';

type DroneId = 'A' | 'B' | 'C';
type TaskStatus = 'unassigned' | 'assigned' | 'in_progress' | 'completed' | 'interrupted';
type ObservationStatus = 'unverified' | 'confirmed' | 'recheck';
type DroneAvailability = 'ready' | 'operating' | 'unavailable';

interface Evidence {
  id: string;
  label: string;
  capturedAt: string;
  location: string;
  memo: string;
}

interface Zone {
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
}

interface HistoryEvent {
  id: string;
  time: string;
  kind: '배정' | '관측' | '중단' | '인계 필요' | '승인 인계' | '상태 변경';
  message: string;
  zoneId?: string;
}

const taskMeta: Record<TaskStatus, { label: string; symbol: string; tone: string }> = {
  unassigned: { label: '미배정', symbol: '○', tone: 'neutral' },
  assigned: { label: '배정됨', symbol: '›', tone: 'blue' },
  in_progress: { label: '진행 중', symbol: '▶', tone: 'blue' },
  completed: { label: '완료', symbol: '✓', tone: 'green' },
  interrupted: { label: '중단', symbol: '■', tone: 'red' },
};

const observationMeta: Record<ObservationStatus, { label: string; symbol: string; tone: string }> = {
  unverified: { label: '미확인', symbol: '○', tone: 'neutral' },
  confirmed: { label: '확인 완료', symbol: '✓', tone: 'green' },
  recheck: { label: '재확인 필요', symbol: '!', tone: 'amber' },
};

const initialZones = (): Zone[] => [
  {
    id: 'Z-01', number: 1, droneId: 'A', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-01', label: '관측 프레임 01', capturedAt: '13:47', location: 'A-01 격자', memo: '지형과 진입로 확인 완료' }],
    note: '확인 절차 완료', candidate: null,
  },
  {
    id: 'Z-02', number: 2, droneId: 'A', taskStatus: 'in_progress', observationStatus: 'unverified',
    evidence: [{ id: 'EV-02', label: '관측 프레임 02', capturedAt: '13:52', location: 'A-02 격자', memo: '추가 확인 진행 중' }],
    note: '현재 관측 진행', candidate: null,
  },
  { id: 'Z-03', number: 3, droneId: 'A', taskStatus: 'assigned', observationStatus: 'unverified', evidence: [], note: 'A의 대기 작업', candidate: null },
  { id: 'Z-04', number: 4, droneId: 'A', taskStatus: 'assigned', observationStatus: 'recheck', evidence: [], note: '이전 자료 부족', candidate: '추가 관측 필요' },
  {
    id: 'Z-05', number: 5, droneId: 'B', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-05', label: '관측 프레임 05', capturedAt: '13:41', location: 'B-01 격자', memo: '확인 절차 완료' }],
    note: '완료 기록 보존', candidate: null,
  },
  {
    id: 'Z-06', number: 6, droneId: 'B', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-06', label: '관측 프레임 06', capturedAt: '13:45', location: 'B-02 격자', memo: '확인 절차 완료' }],
    note: '완료 기록 보존', candidate: null,
  },
  {
    id: 'Z-07', number: 7, droneId: 'B', taskStatus: 'in_progress', observationStatus: 'unverified',
    evidence: [
      { id: 'EV-07A', label: '관측 프레임 07-A', capturedAt: '13:56', location: 'B-03 격자', memo: '수풀 가장자리 확인 전' },
      { id: 'EV-07B', label: '관측 프레임 07-B', capturedAt: '13:58', location: 'B-03 격자', memo: '추가 관측 필요' },
    ],
    note: '진행 중인 관측 작업', candidate: '후보 1건 · 추가 확인 필요',
  },
  {
    id: 'Z-08', number: 8, droneId: 'B', taskStatus: 'assigned', observationStatus: 'recheck',
    evidence: [{ id: 'EV-08', label: '이전 관측 메모', capturedAt: '13:50', location: 'B-04 격자', memo: '시야 가림으로 재확인 요청' }],
    note: '시작 전 재확인 작업', candidate: '확인 보류',
  },
  {
    id: 'Z-09', number: 9, droneId: 'C', taskStatus: 'completed', observationStatus: 'confirmed',
    evidence: [{ id: 'EV-09', label: '관측 프레임 09', capturedAt: '13:44', location: 'C-01 격자', memo: '확인 절차 완료' }],
    note: '확인 절차 완료', candidate: null,
  },
  {
    id: 'Z-10', number: 10, droneId: 'C', taskStatus: 'in_progress', observationStatus: 'unverified',
    evidence: [{ id: 'EV-10', label: '관측 프레임 10', capturedAt: '13:57', location: 'C-02 격자', memo: '현재 관측 진행' }],
    note: '현재 관측 진행', candidate: null,
  },
  { id: 'Z-11', number: 11, droneId: null, taskStatus: 'unassigned', observationStatus: 'unverified', evidence: [], note: '담당 작업 없음', candidate: null },
  { id: 'Z-12', number: 12, droneId: null, taskStatus: 'unassigned', observationStatus: 'unverified', evidence: [], note: '담당 작업 없음', candidate: null },
];

const initialHistory = (): HistoryEvent[] => [
  { id: 'H-01', time: '13:44', kind: '관측', zoneId: 'Z-09', message: 'Z-09 관측 확인 절차가 완료되었습니다.' },
  { id: 'H-02', time: '13:45', kind: '관측', zoneId: 'Z-06', message: 'Z-06 관측 확인 절차가 완료되었습니다.' },
  { id: 'H-03', time: '13:47', kind: '관측', zoneId: 'Z-01', message: 'Z-01 관측 확인 절차가 완료되었습니다.' },
  { id: 'H-04', time: '13:56', kind: '배정', zoneId: 'Z-07', message: '기체 B가 Z-07 관측 작업을 시작했습니다.' },
];

const loadLocal = <T,>(key: string, fallback: T): T => {
  try {
    const value = window.localStorage.getItem(key);
    return value ? (JSON.parse(value) as T) : fallback;
  } catch {
    return fallback;
  }
};

const nowTime = () => new Intl.DateTimeFormat('ko-KR', { hour: '2-digit', minute: '2-digit', hour12: false }).format(new Date());

function StatusPill({ tone, symbol, children }: { tone: string; symbol: string; children: string }) {
  return <span className={`status-pill ${tone}`}><b>{symbol}</b>{children}</span>;
}

function App() {
  const [zones, setZones] = useState<Zone[]>(() => loadLocal('sardrone-zones', initialZones()));
  const [history, setHistory] = useState<HistoryEvent[]>(() => loadLocal('sardrone-history', initialHistory()));
  const [bInterrupted, setBInterrupted] = useState<boolean>(() => loadLocal('sardrone-b-interrupted', false));
  const [selectedZoneId, setSelectedZoneId] = useState('Z-07');
  const [handoverDrone, setHandoverDrone] = useState<DroneId>('A');

  useEffect(() => {
    window.localStorage.setItem('sardrone-zones', JSON.stringify(zones));
    window.localStorage.setItem('sardrone-history', JSON.stringify(history));
    window.localStorage.setItem('sardrone-b-interrupted', JSON.stringify(bInterrupted));
  }, [zones, history, bInterrupted]);

  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? zones[0];
  const handoverQueue = zones.filter((zone) => zone.needsHandover);
  const confirmedCount = zones.filter((zone) => zone.observationStatus === 'confirmed').length;
  const activeCount = zones.filter((zone) => zone.taskStatus === 'in_progress').length;

  const droneSummary = useMemo(() => (['A', 'B', 'C'] as DroneId[]).map((id) => {
    const active = zones.filter((zone) => zone.droneId === id && ['assigned', 'in_progress'].includes(zone.taskStatus)).length;
    const completed = zones.filter((zone) => zone.droneId === id && zone.taskStatus === 'completed').length;
    const availability: DroneAvailability = id === 'B' && bInterrupted ? 'unavailable' : active > 0 ? 'operating' : 'ready';
    return { id, active, completed, availability };
  }), [zones, bInterrupted]);

  const addHistory = (kind: HistoryEvent['kind'], message: string, zoneId?: string) => {
    setHistory((current) => [
      { id: `${Date.now()}-${current.length}`, time: nowTime(), kind, message, zoneId },
      ...current,
    ]);
  };

  const triggerBInterruption = () => {
    if (bInterrupted) {
      setSelectedZoneId('Z-07');
      return;
    }

    setZones((current) => current.map((zone) => {
      if (zone.id === 'Z-07' || zone.id === 'Z-08') {
        return {
          ...zone,
          taskStatus: 'interrupted',
          needsHandover: true,
          handoverFrom: 'B',
          handoverReason: '모의 통신 중단으로 관측 확인을 이어갈 수 없음',
        };
      }
      return zone;
    }));
    setBInterrupted(true);
    setSelectedZoneId('Z-07');
    addHistory('중단', '기체 B의 모의 통신 중단이 기록되었습니다. 완료 구역 Z-05·Z-06은 유지됩니다.');
    addHistory('인계 필요', 'Z-07과 Z-08이 인계 필요 목록에 추가되었습니다. 운영자 승인이 필요합니다.');
  };

  const approveHandover = () => {
    if (!selectedZone.needsHandover) return;
    const from = selectedZone.handoverFrom ?? 'B';
    const zoneId = selectedZone.id;

    setZones((current) => current.map((zone) => zone.id === zoneId
      ? {
        ...zone,
        droneId: handoverDrone,
        taskStatus: 'assigned',
        needsHandover: false,
        handoverFrom: from,
      }
      : zone));
    addHistory('승인 인계', `${zoneId}의 새 작업이 ${from}에서 ${handoverDrone}(으)로 인계되었습니다. 기존 증거와 사유는 보존됩니다.`, zoneId);
  };

  const updateObservation = (status: ObservationStatus) => {
    setZones((current) => current.map((zone) => zone.id === selectedZone.id
      ? { ...zone, observationStatus: status }
      : zone));
    addHistory('상태 변경', `${selectedZone.id}의 관측 상태를 ‘${observationMeta[status].label}’로 변경했습니다.`, selectedZone.id);
  };

  const advanceTask = (status: TaskStatus) => {
    if (selectedZone.taskStatus === 'interrupted') return;
    setZones((current) => current.map((zone) => zone.id === selectedZone.id
      ? { ...zone, taskStatus: status }
      : zone));
    addHistory('상태 변경', `${selectedZone.id}의 작업 상태를 ‘${taskMeta[status].label}’로 변경했습니다.`, selectedZone.id);
  };

  const resetDemo = () => {
    setZones(initialZones());
    setHistory(initialHistory());
    setBInterrupted(false);
    setSelectedZoneId('Z-07');
    setHandoverDrone('A');
    window.localStorage.removeItem('sardrone-zones');
    window.localStorage.removeItem('sardrone-history');
    window.localStorage.removeItem('sardrone-b-interrupted');
  };

  const exportHistory = () => {
    const rows = [
      ['time', 'kind', 'zone_id', 'message'],
      ...history.map((event) => [event.time, event.kind, event.zoneId ?? '', event.message]),
    ];
    const csv = rows.map((row) => row.map((item) => `"${item.replaceAll('"', '""')}"`).join(',')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const href = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = href;
    link.download = 'S-수색관제-변경이력.csv';
    link.click();
    URL.revokeObjectURL(href);
  };

  return (
    <div className="app-shell">
      <header className="topbar">
        <div className="brand">
          <div className="brand-mark" aria-label="팀 S?">S?</div>
          <div>
            <p className="eyebrow">TEAM S? · SEARCH OPERATIONS</p>
            <h1>다중 드론 협력 수색 관제</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="simulation-chip"><ShieldAlert size={15} /> 가상 시뮬레이션 · 실제 비행 명령 없음</div>
          <button className="button ghost" onClick={exportHistory}><Download size={16} /> 이력 내보내기</button>
          <button className="button outline" onClick={resetDemo}><RefreshCcw size={16} /> 초기화</button>
          <button className="button critical" onClick={triggerBInterruption}><TriangleAlert size={16} /> B 중단 시연</button>
        </div>
      </header>

      <main className="workspace">
        <section className="mission-brief">
          <div>
            <div className="section-kicker"><MapPinned size={15} /> 모의 수색 건 · SAR-001</div>
            <h2>모의 재난 수색 001</h2>
            <p>비행 기록과 <strong>관측 확인</strong>, 그리고 중단된 작업의 <strong>인계 이력</strong>을 분리해 관리합니다.</p>
          </div>
          <div className="mission-metrics" aria-label="수색 현황 요약">
            <div><span>확인 완료</span><b>{confirmedCount}<small>/ 12</small></b></div>
            <div><span>진행 작업</span><b>{activeCount}</b></div>
            <div><span>인계 필요</span><b className={handoverQueue.length ? 'metric-alert' : ''}>{handoverQueue.length}</b></div>
          </div>
        </section>

        <section className="command-layout">
          <aside className="side-panel fleet-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">FLEET</p><h3>가상 기체</h3></div>
              <Radio size={18} />
            </div>
            <div className="fleet-list">
              {droneSummary.map((drone) => (
                <div className={`drone-card ${drone.availability}`} key={drone.id}>
                  <div className="drone-badge">{drone.id}</div>
                  <div className="drone-copy">
                    <b>기체 {drone.id}</b>
                    <span>{drone.availability === 'unavailable' ? '중단 기록됨' : drone.availability === 'operating' ? '작업 수행 중' : '대기 가능'}</span>
                  </div>
                  <div className="drone-count"><b>{drone.active}</b><span>활성</span><small>{drone.completed} 완료</small></div>
                </div>
              ))}
            </div>
            <div className="legend-block">
              <p>표시 원칙</p>
              <span><b>작업</b> 배정·진행·완료·중단</span>
              <span><b>관측</b> 미확인·확인 완료·재확인 필요</span>
              <small>색상과 글자·기호를 함께 사용합니다.</small>
            </div>
          </aside>

          <section className="map-panel">
            <div className="panel-heading map-heading">
              <div>
                <p className="eyebrow">COMMON SEARCH MAP</p>
                <h3>수색 구역 현황</h3>
              </div>
              <div className="map-tools"><span><CircleDot size={14} /> 3 × 4 모의 구역</span><span><History size={14} /> 인계 이력 보존</span></div>
            </div>
            <div className="map-explainer"><Sparkles size={15} /> <b>차별점:</b> 드론이 지나간 구역과 운영자가 관측 자료를 확인한 구역은 같은 상태가 아닙니다.</div>
            <div className="map-stage">
              <div className="map-label north">N</div>
              <div className="map-label west">W</div>
              <div className="map-label east">E</div>
              <div className="terrain-note">MOCK TERRAIN / GRID REFERENCE</div>
              <div className="zone-grid">
                {zones.map((zone) => {
                  const task = taskMeta[zone.taskStatus];
                  const observation = observationMeta[zone.observationStatus];
                  const selected = zone.id === selectedZoneId;
                  return (
                    <button
                      type="button"
                      key={zone.id}
                      onClick={() => setSelectedZoneId(zone.id)}
                      className={`zone-card ${selected ? 'selected' : ''} ${zone.needsHandover ? 'handover' : ''}`}
                      aria-pressed={selected}
                    >
                      <span className="zone-top"><b>{zone.id}</b><span className="drone-token">{zone.droneId ?? '—'}</span></span>
                      <span className={`zone-state ${task.tone}`}><b>{task.symbol}</b> 작업: {task.label}</span>
                      <span className={`zone-state ${observation.tone}`}><b>{observation.symbol}</b> 관측: {observation.label}</span>
                      <span className="zone-foot">
                        <span><FileImage size={12} /> {zone.evidence.length}</span>
                        {zone.needsHandover ? <span className="handover-token"><ArrowRightLeft size={12} /> 인계 필요</span> : zone.handoverFrom ? <span className="handover-token"><ArrowRight size={12} /> {zone.handoverFrom}→{zone.droneId}</span> : <span>{zone.candidate ? '후보 있음' : '기록 정상'}</span>}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>
          </section>

          <aside className="side-panel detail-panel">
            <div className="panel-heading">
              <div><p className="eyebrow">ZONE DETAIL</p><h3>{selectedZone.id} 수색 증거함</h3></div>
              <Eye size={18} />
            </div>
            <div className="selected-summary">
              <div className="selected-zone-number">{String(selectedZone.number).padStart(2, '0')}</div>
              <div><span>현재 담당</span><b>기체 {selectedZone.droneId ?? '미배정'}</b><small>{selectedZone.note}</small></div>
            </div>
            <div className="status-stack">
              <StatusPill {...taskMeta[selectedZone.taskStatus]}>{`작업 ${taskMeta[selectedZone.taskStatus].label}`}</StatusPill>
              <StatusPill {...observationMeta[selectedZone.observationStatus]}>{`관측 ${observationMeta[selectedZone.observationStatus].label}`}</StatusPill>
            </div>
            <div className="evidence-box">
              <div className="box-title"><span><FileImage size={15} /> 연결된 수색 증거</span><b>{selectedZone.evidence.length}건</b></div>
              {selectedZone.evidence.length ? selectedZone.evidence.map((evidence) => (
                <div className="evidence-row" key={evidence.id}>
                  <div className="evidence-frame">IMG</div>
                  <div><b>{evidence.label}</b><span>{evidence.capturedAt} · {evidence.location}</span><small>{evidence.memo}</small></div>
                </div>
              )) : <div className="empty-note">연결된 관측 자료가 없습니다.</div>}
              {selectedZone.candidate && <div className="candidate-note"><Search size={14} /><span><b>발견 후보</b>{selectedZone.candidate}</span></div>}
            </div>

            <div className="action-row">
              <button className="button mini" onClick={() => advanceTask('in_progress')} disabled={selectedZone.taskStatus === 'interrupted' || selectedZone.taskStatus === 'completed'}><Play size={14} /> 작업 시작</button>
              <button className="button mini" onClick={() => advanceTask('completed')} disabled={selectedZone.taskStatus === 'interrupted' || selectedZone.taskStatus === 'unassigned'}><ClipboardCheck size={14} /> 작업 완료</button>
            </div>
            <div className="action-row observation-actions">
              <button className="button mini success" onClick={() => updateObservation('confirmed')}><Check size={14} /> 확인 완료</button>
              <button className="button mini warning" onClick={() => updateObservation('recheck')}><AlertTriangle size={14} /> 재확인</button>
            </div>

            <div className="handover-box">
              <div className="box-title"><span><ArrowRightLeft size={15} /> 작업 인계</span></div>
              {selectedZone.needsHandover ? (
                <>
                  <p><b>이전 담당:</b> 기체 {selectedZone.handoverFrom}</p>
                  <p><b>중단 사유:</b> {selectedZone.handoverReason}</p>
                  <p><b>보존 자료:</b> 사진·메모 {selectedZone.evidence.length}건 유지</p>
                  <label>새 담당 기체
                    <select value={handoverDrone} onChange={(event) => setHandoverDrone(event.target.value as DroneId)}>
                      <option value="A">기체 A</option>
                      <option value="C">기체 C</option>
                    </select>
                  </label>
                  <button className="button handover-approve" onClick={approveHandover}><ClipboardCheck size={15} /> 운영자 승인 후 재배정</button>
                </>
              ) : selectedZone.handoverFrom ? (
                <div className="handover-complete"><Check size={16} /><div><b>인계 이력 보존됨</b><span>기체 {selectedZone.handoverFrom}의 기록을 유지한 채 기체 {selectedZone.droneId}의 새 작업이 연결되었습니다.</span></div></div>
              ) : <div className="empty-note">이 구역은 현재 인계 대상이 아닙니다.</div>}
            </div>
          </aside>
        </section>

        <section className="timeline-panel">
          <div className="timeline-heading">
            <div><p className="eyebrow">AUDIT TRAIL</p><h3>변경 이력 · 덮어쓰기 대신 연결</h3></div>
            <span><UsersRound size={15} /> 운영자 승인 기록</span>
          </div>
          <div className="history-list">
            {history.slice(0, 8).map((event) => (
              <div className="history-item" key={event.id}>
                <time>{event.time}</time>
                <span className={`history-kind ${event.kind.replaceAll(' ', '-')}`}>{event.kind}</span>
                <p>{event.message}</p>
                {event.zoneId && <button onClick={() => setSelectedZoneId(event.zoneId!)}>{event.zoneId}<ChevronRight size={13} /></button>}
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;
