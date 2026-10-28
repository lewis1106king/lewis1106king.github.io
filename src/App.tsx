import {
  type FormEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  ArrowRightLeft,
  Check,
  ChevronRight,
  ClipboardCheck,
  Download,
  Eye,
  FileImage,
  History,
  Info,
  MapPinned,
  Play,
  RefreshCcw,
  Search,
  ShieldAlert,
  Sparkles,
  TriangleAlert,
  UsersRound,
  X,
} from 'lucide-react';
import {
  createInitialDemo,
  handoverReason,
  observationMeta,
  recommendedDrone,
  taskMeta,
} from './data';
import type {
  DemoState,
  DroneId,
  HistoryEvent,
  HistoryKind,
  Notice,
  NoticeTone,
  ObservationStatus,
  TaskStatus,
  Zone,
} from './types';

const STORAGE_KEY = 's-question-sar-demo-v2';

type View = 'intro' | 'demo';
type NarrowPanel = 'map' | 'detail' | 'fleet';

interface LoadedDemo {
  state: DemoState;
  notice: Notice | null;
}

const nowTime = () => new Intl.DateTimeFormat('ko-KR', {
  hour: '2-digit',
  minute: '2-digit',
  hour12: false,
}).format(new Date());

const makeHistory = (kind: HistoryKind, message: string, zoneId?: string): HistoryEvent => ({
  id: `${Date.now()}-${Math.random().toString(16).slice(2)}`,
  time: nowTime(),
  kind,
  message,
  zoneId,
});

const makeNotice = (tone: NoticeTone, message: string): Notice => ({
  id: Date.now(),
  tone,
  message,
});

const validZoneIds = new Set(Array.from({ length: 12 }, (_, index) => `Z-${String(index + 1).padStart(2, '0')}`));
const validTaskStatuses = new Set<TaskStatus>(['unassigned', 'assigned', 'in_progress', 'completed', 'interrupted']);
const validObservationStatuses = new Set<ObservationStatus>(['unverified', 'confirmed', 'recheck']);
const validHistoryKinds = new Set<HistoryKind>(['배정', '관측', '중단', '인계 필요', '승인 인계', '상태 변경', '자료 참조']);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object';
}

function isDroneId(value: unknown): value is DroneId {
  return value === 'A' || value === 'B' || value === 'C';
}

function isEvidence(value: unknown): value is Zone['evidence'][number] {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.label === 'string'
    && typeof value.reference === 'string'
    && typeof value.memo === 'string';
}

function isInterruptedWork(value: unknown): value is NonNullable<Zone['interruptedWork']> {
  if (!isRecord(value)) return false;
  return isDroneId(value.droneId)
    && validTaskStatuses.has(value.taskStatus as TaskStatus)
    && value.taskStatus !== 'interrupted'
    && typeof value.interruptedAt === 'string';
}

function isHandover(value: unknown): value is NonNullable<Zone['handover']> {
  if (!isRecord(value)) return false;
  return isDroneId(value.from)
    && isDroneId(value.to)
    && typeof value.reason === 'string'
    && typeof value.approvedAt === 'string';
}

function isZone(value: unknown): value is Zone {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<Zone>;
  const validOptionalDrone = candidate.handoverFrom === undefined || isDroneId(candidate.handoverFrom);
  const validOptionalBoolean = candidate.needsHandover === undefined || typeof candidate.needsHandover === 'boolean';
  const validOptionalString = candidate.handoverReason === undefined || typeof candidate.handoverReason === 'string';
  const validOptionalHandover = candidate.handover === undefined || isHandover(candidate.handover);
  const validOptionalInterruptedWork = candidate.interruptedWork === undefined || isInterruptedWork(candidate.interruptedWork);

  return typeof candidate.id === 'string'
    && validZoneIds.has(candidate.id)
    && typeof candidate.number === 'number'
    && (candidate.droneId === null || isDroneId(candidate.droneId))
    && validTaskStatuses.has(candidate.taskStatus as TaskStatus)
    && validObservationStatuses.has(candidate.observationStatus as ObservationStatus)
    && Array.isArray(candidate.evidence)
    && candidate.evidence.every(isEvidence)
    && typeof candidate.note === 'string'
    && (candidate.candidate === null || typeof candidate.candidate === 'string')
    && validOptionalDrone
    && validOptionalBoolean
    && validOptionalString
    && validOptionalHandover
    && validOptionalInterruptedWork;
}

function isHistoryEvent(value: unknown): value is HistoryEvent {
  if (!isRecord(value)) return false;
  return typeof value.id === 'string'
    && typeof value.time === 'string'
    && validHistoryKinds.has(value.kind as HistoryKind)
    && typeof value.message === 'string'
    && (value.zoneId === undefined || (typeof value.zoneId === 'string' && validZoneIds.has(value.zoneId)));
}

function isDemoState(value: unknown): value is DemoState {
  if (!isRecord(value)) return false;
  const candidate = value as Partial<DemoState>;
  if (candidate.version !== 1 || !Array.isArray(candidate.zones) || !Array.isArray(candidate.history)) return false;
  if (candidate.zones.length !== 12 || !candidate.zones.every(isZone) || !candidate.history.every(isHistoryEvent)) return false;
  const zoneIds = new Set(candidate.zones.map((zone) => zone.id));
  return zoneIds.size === 12 && typeof candidate.bInterrupted === 'boolean';
}

function loadDemoState(): LoadedDemo {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) return { state: createInitialDemo(), notice: null };

    const parsed: unknown = JSON.parse(raw);
    if (!isDemoState(parsed)) {
      window.localStorage.removeItem(STORAGE_KEY);
      return {
        state: createInitialDemo(),
        notice: makeNotice('warning', '저장된 시연 자료 형식이 맞지 않아 초기 가상 시나리오로 열었습니다.'),
      };
    }

    return { state: parsed, notice: null };
  } catch {
    return {
      state: createInitialDemo(),
      notice: makeNotice('warning', '브라우저 저장 자료를 읽을 수 없어 초기 가상 시나리오로 열었습니다.'),
    };
  }
}

function StatusLine({
  label,
  symbol,
  tone,
  prefix,
}: {
  label: string;
  symbol: string;
  tone: string;
  prefix: string;
}) {
  return (
    <span className={`status-line ${tone}`}>
      <b aria-hidden="true">{symbol}</b>
      <span>{prefix}: {label}</span>
    </span>
  );
}

function SMark() {
  return <span className="s-mark" aria-label="팀 S?">S<span>?</span></span>;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ZonePreview({ zones }: { zones: Zone[] }) {
  return (
    <div className="preview-map" aria-label="가상 수색 구역도 미리보기">
      <div className="preview-map-caption">
        <span>가상 구역도</span>
        <small>시연 데이터 미리보기</small>
      </div>
      <div className="preview-grid">
        {zones.map((zone) => (
          <div className={`preview-zone ${zone.needsHandover ? 'handover' : ''}`} key={zone.id}>
            <div><b>{zone.id}</b><span>{zone.droneId ?? '—'}</span></div>
            <small>{taskMeta[zone.taskStatus].symbol} {taskMeta[zone.taskStatus].label}</small>
            <small>{observationMeta[zone.observationStatus].symbol} {observationMeta[zone.observationStatus].label}</small>
          </div>
        ))}
      </div>
      <p><Info size={14} /> 실제 지도·비행 데이터가 아닌 가상 시연 구역입니다.</p>
    </div>
  );
}

function IntroPage({ zones, onOpenDemo }: { zones: Zone[]; onOpenDemo: () => void }) {
  return (
    <div className="intro-shell" id="top">
      <header className="intro-header">
        <button className="brand-button" onClick={() => scrollToSection('top')} aria-label="소개 첫 화면으로 이동">
          <SMark />
          <span>TEAM S?</span>
        </button>
        <nav className="intro-nav" aria-label="제품 탐색">
          <button onClick={() => scrollToSection('problem')}>해결하는 문제</button>
          <button onClick={() => scrollToSection('how')}>작동 방식</button>
          <button className="nav-demo" onClick={onOpenDemo}>시연하기 <ArrowRight size={15} /></button>
        </nav>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="kicker">TEAM S? · MULTI-DRONE SEARCH OPERATIONS</p>
            <span className="scope-badge"><ShieldAlert size={15} /> 가상 시제품 · 실제 비행 제어 없음</span>
            <h1>수색은 이어지고,<br />기록은 남습니다.</h1>
            <p className="hero-description">여러 드론의 수색 기록과 중단 작업의 인계를 한곳에서.</p>
            <div className="hero-actions">
              <button className="button primary large" onClick={onOpenDemo}>가상 시연 시작 <ArrowRight size={17} /></button>
              <button className="button subtle large" onClick={() => scrollToSection('how')}>작동 방식 보기</button>
            </div>
            <p className="hero-footnote">작업 진행, 관측 확인, 인계 이력을 수색 구역별로 분리해 연결합니다.</p>
          </div>
          <ZonePreview zones={zones} />
        </section>

        <section className="section-block problem-section" id="problem">
          <div className="section-heading">
            <p className="kicker">THE PROBLEM</p>
            <h2>비행한 구역과 확인한 구역은 다릅니다.</h2>
            <p>드론이 구역을 지나갔다는 기록만으로 관측 자료까지 검토됐다고 판단할 수는 없습니다.</p>
          </div>
          <div className="problem-contrast">
            <article>
              <span className="section-number">01</span>
              <h3>비행 기록</h3>
              <p>어느 기체가 어느 구역의 작업을 수행했는지 남깁니다.</p>
              <span className="example-line">예: B · Z-07 · 진행 중</span>
            </article>
            <div className="contrast-divider" aria-hidden="true"><ArrowRightLeft size={18} /></div>
            <article>
              <span className="section-number">02</span>
              <h3>관측 확인</h3>
              <p>사진·메모 같은 자료를 운영자가 확인했는지 따로 남깁니다.</p>
              <span className="example-line">예: Z-07 · 미확인</span>
            </article>
            <article className="problem-callout">
              <span className="section-number">03</span>
              <h3>중단 후 인계</h3>
              <p>완료 구역은 보존하고, 확인이 남은 구역만 새 작업으로 이어야 합니다.</p>
              <span className="example-line">예: B → A · 증거 보존</span>
            </article>
          </div>
        </section>

        <section className="section-block relationship-section" id="how">
          <div className="section-heading compact">
            <p className="kicker">HOW IT WORKS</p>
            <h2>한 구역에 세 가지 기록을 연결합니다.</h2>
          </div>
          <div className="relationship-flow" aria-label="작업 진행, 관측 확인, 인계 이력의 관계">
            <article>
              <span className="relationship-icon">①</span>
              <h3>작업 진행</h3>
              <p>배정됨, 진행 중, 완료, 중단을 기록합니다.</p>
            </article>
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <article>
              <span className="relationship-icon">②</span>
              <h3>관측 확인</h3>
              <p>미확인, 확인 완료, 재확인 필요를 별도로 판단합니다.</p>
            </article>
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <article>
              <span className="relationship-icon">③</span>
              <h3>인계 이력</h3>
              <p>담당이 바뀌어도 이전 자료와 중단 사유를 남깁니다.</p>
            </article>
          </div>
        </section>

        <section className="section-block handover-section">
          <div className="section-heading compact">
            <p className="kicker">DEMO SCENARIO</p>
            <h2>B 중단 뒤, 필요한 구역만 이어갑니다.</h2>
            <p>완료된 Z-05·Z-06은 그대로 두고 Z-07·Z-08만 운영자 검토와 승인 뒤 새 작업으로 배정합니다.</p>
          </div>
          <ol className="scenario-steps">
            <li><span>1</span><div><b>B 중단</b><p>Z-07·Z-08만 인계 필요로 표시합니다.</p></div></li>
            <li><span>2</span><div><b>운영자 승인</b><p>기존 자료와 사유를 보고 새 담당을 정합니다.</p></div></li>
            <li><span>3</span><div><b>A·C에 새 작업 배정</b><p>작업 상태는 배정됨으로 시작하고 이전 기록은 유지합니다.</p></div></li>
          </ol>
          <button className="button primary" onClick={onOpenDemo}>B 중단 시연으로 이동 <ArrowRight size={16} /></button>
        </section>

        <section className="section-block scope-section">
          <div>
            <p className="kicker">CURRENT SCOPE</p>
            <h2>지금 제공하는 것과 아닌 것을 구분합니다.</h2>
          </div>
          <div className="scope-columns">
            <article>
              <h3><Check size={18} /> 현재 제공</h3>
              <ul>
                <li>가상 구역별 작업·관측 상태</li>
                <li>가상 관측 자료 참조와 메모</li>
                <li>B 중단, 승인 인계, 변경 이력</li>
                <li>브라우저 안의 시연 상태 저장과 CSV 내보내기</li>
              </ul>
            </article>
            <article>
              <h3><X size={18} /> 현재 제외</h3>
              <ul>
                <li>실제 드론 제어와 자동 비행</li>
                <li>실제 위치·통신·배터리 데이터</li>
                <li>자동 인명 판별과 구조 성과 보장</li>
                <li>서버 저장, 계정, 다중 사용자 동기화</li>
              </ul>
            </article>
          </div>
        </section>
      </main>

      <footer className="intro-footer">
        <SMark />
        <p>팀 S? · 다중 드론 협력 수색 관제 시스템</p>
        <button onClick={onOpenDemo}>가상 시연 열기 <ArrowRight size={14} /></button>
      </footer>
    </div>
  );
}

function App() {
  const loadRef = useRef<LoadedDemo | null>(null);
  if (loadRef.current === null) loadRef.current = loadDemoState();
  const initialLoad = loadRef.current;

  const [view, setView] = useState<View>(() => (window.location.hash === '#demo' ? 'demo' : 'intro'));
  const [demo, setDemo] = useState<DemoState>(() => initialLoad.state);
  const [selectedZoneId, setSelectedZoneId] = useState('Z-07');
  const [handoverDrone, setHandoverDrone] = useState<DroneId>('A');
  const [handoverReviewed, setHandoverReviewed] = useState(false);
  const [narrowPanel, setNarrowPanel] = useState<NarrowPanel>('map');
  const [guideOpen, setGuideOpen] = useState(true);
  const [resetOpen, setResetOpen] = useState(false);
  const [notice, setNotice] = useState<Notice | null>(() => initialLoad.notice);
  const [evidenceLabel, setEvidenceLabel] = useState('');
  const [evidenceMemo, setEvidenceMemo] = useState('');
  const bInterruptionLock = useRef(false);
  const resetTriggerRef = useRef<HTMLButtonElement>(null);
  const cancelResetRef = useRef<HTMLButtonElement>(null);
  const resetDialogRef = useRef<HTMLElement>(null);
  const wasResetOpenRef = useRef(false);

  const selectedZone = demo.zones.find((zone) => zone.id === selectedZoneId) ?? demo.zones[0];
  const handoverQueue = demo.zones.filter((zone) => zone.needsHandover);

  const droneSummary = useMemo(() => (['A', 'B', 'C'] as DroneId[]).map((id) => {
    const current = demo.zones.filter((zone) => zone.droneId === id && zone.taskStatus === 'in_progress').length;
    const pending = demo.zones.filter((zone) => zone.droneId === id && zone.taskStatus === 'assigned').length;
    const completed = demo.zones.filter((zone) => zone.droneId === id && zone.taskStatus === 'completed').length;
    const unavailable = id === 'B' && demo.bInterrupted;
    return { id, current, pending, completed, unavailable };
  }), [demo]);

  const confirmedCount = demo.zones.filter((zone) => zone.observationStatus === 'confirmed').length;
  const activeCount = demo.zones.filter((zone) => zone.taskStatus === 'in_progress').length;

  const showNotice = (tone: NoticeTone, message: string) => setNotice(makeNotice(tone, message));

  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(demo));
    } catch {
      setNotice(makeNotice('warning', '이 브라우저에서는 시연 상태를 저장하지 못했습니다. 새로고침하면 초기 상태로 열릴 수 있습니다.'));
    }
  }, [demo]);

  useEffect(() => {
    if (!notice) return undefined;
    const timer = window.setTimeout(() => setNotice(null), 5600);
    return () => window.clearTimeout(timer);
  }, [notice]);

  useEffect(() => {
    const handleKeyboard = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        if (resetOpen) {
          event.preventDefault();
          setResetOpen(false);
        } else if (guideOpen) {
          setGuideOpen(false);
        }
        return;
      }

      if (!resetOpen || event.key !== 'Tab') return;
      const focusable = Array.from(resetDialogRef.current?.querySelectorAll<HTMLElement>(
        'button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      ) ?? []);
      if (!focusable.length) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener('keydown', handleKeyboard);
    return () => window.removeEventListener('keydown', handleKeyboard);
  }, [guideOpen, resetOpen]);

  useEffect(() => {
    if (resetOpen) {
      wasResetOpenRef.current = true;
      window.requestAnimationFrame(() => cancelResetRef.current?.focus());
      return;
    }
    if (wasResetOpenRef.current) {
      wasResetOpenRef.current = false;
      window.requestAnimationFrame(() => resetTriggerRef.current?.focus());
    }
  }, [resetOpen]);

  const openDemo = () => {
    setView('demo');
    window.history.replaceState(null, '', '#demo');
  };

  const returnToIntro = () => {
    setView('intro');
    window.history.replaceState(null, '', window.location.pathname);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const selectZone = (zoneId: string, panel: NarrowPanel = 'detail') => {
    const zone = demo.zones.find((item) => item.id === zoneId);
    setSelectedZoneId(zoneId);
    setNarrowPanel(panel);
    setHandoverDrone(recommendedDrone(zoneId));
    setHandoverReviewed(false);
    if (zone?.needsHandover) showNotice('info', `${zoneId}의 기존 자료와 중단 사유를 먼저 확인한 뒤 새 작업을 승인하세요.`);
  };

  const triggerBInterruption = () => {
    if (bInterruptionLock.current || demo.bInterrupted) {
      selectZone('Z-07');
      showNotice('info', '기체 B 중단은 이미 기록되어 있습니다. 남은 인계 대상만 확인하세요.');
      return;
    }

    const plannedTargets = demo.zones.filter((zone) => (
      (zone.id === 'Z-07' || zone.id === 'Z-08')
      && zone.droneId === 'B'
      && zone.taskStatus !== 'completed'
      && zone.taskStatus !== 'interrupted'
    ));
    const plannedTargetIds = plannedTargets.map((zone) => zone.id);
    bInterruptionLock.current = true;

    setDemo((current) => {
      if (current.bInterrupted) return current;

      const targets = current.zones.filter((zone) => (
        (zone.id === 'Z-07' || zone.id === 'Z-08')
        && zone.droneId === 'B'
        && zone.taskStatus !== 'completed'
        && zone.taskStatus !== 'interrupted'
      ));
      const targetStatusById = new Map(targets.map((zone) => [zone.id, zone.taskStatus]));
      const targetIds = new Set(targets.map((zone) => zone.id));
      const targetLabel = targets.map((zone) => zone.id).join('·');
      const interruptedAt = nowTime();

      return {
        ...current,
        bInterrupted: true,
        zones: current.zones.map((zone) => {
          const priorTaskStatus = targetStatusById.get(zone.id);
          if (!targetIds.has(zone.id) || !priorTaskStatus) return zone;
          return {
            ...zone,
            taskStatus: 'interrupted',
            needsHandover: true,
            handoverFrom: 'B',
            handoverReason,
            interruptedWork: {
              droneId: 'B',
              taskStatus: priorTaskStatus as Exclude<TaskStatus, 'interrupted'>,
              interruptedAt,
            },
          };
        }),
        history: [
          ...(targetLabel ? [makeHistory('인계 필요', `${targetLabel}만 인계 필요 목록에 추가되었습니다. 운영자 승인이 필요합니다.`)] : []),
          makeHistory('중단', targetLabel
            ? `기체 B의 가상 중단이 기록되었습니다. 완료 구역은 보존되고 ${targetLabel}만 인계 대상으로 바뀌었습니다.`
            : '기체 B의 가상 중단이 기록되었습니다. 이미 완료된 구역만 있어 새 인계 대상은 없습니다.'),
          ...current.history,
        ],
      };
    });

    if (plannedTargetIds.length) {
      const firstTarget = plannedTargetIds[0];
      setSelectedZoneId(firstTarget);
      setHandoverDrone(recommendedDrone(firstTarget));
      showNotice('warning', `B 중단 시연을 실행했습니다. ${plannedTargetIds.join('·')}만 인계 대상이며 완료 구역은 보존됩니다.`);
    } else {
      showNotice('info', 'B 중단은 기록했지만 이미 완료된 구역만 있어 새 인계 대상은 없습니다.');
    }
    setNarrowPanel('detail');
    setHandoverReviewed(false);
  };

  const updateTask = (status: TaskStatus) => {
    if (selectedZone.taskStatus === 'completed' || selectedZone.taskStatus === 'interrupted' || selectedZone.taskStatus === 'unassigned') {
      showNotice('warning', '이 구역의 현재 작업 상태에서는 상태를 변경할 수 없습니다.');
      return;
    }

    setDemo((current) => ({
      ...current,
      zones: current.zones.map((zone) => zone.id === selectedZone.id ? { ...zone, taskStatus: status } : zone),
      history: [
        makeHistory('상태 변경', `${selectedZone.id}의 작업 상태를 ‘${taskMeta[status].label}’으로 표시했습니다.`, selectedZone.id),
        ...current.history,
      ],
    }));
    showNotice('success', `${selectedZone.id}의 작업 상태가 ‘${taskMeta[status].label}’으로 바뀌었습니다.`);
  };

  const updateObservation = (status: ObservationStatus) => {
    setDemo((current) => ({
      ...current,
      zones: current.zones.map((zone) => zone.id === selectedZone.id ? { ...zone, observationStatus: status } : zone),
      history: [
        makeHistory('상태 변경', `${selectedZone.id}의 관측 상태를 ‘${observationMeta[status].label}’으로 표시했습니다.`, selectedZone.id),
        ...current.history,
      ],
    }));
    showNotice('success', `${selectedZone.id}의 관측 상태가 ‘${observationMeta[status].label}’으로 바뀌었습니다.`);
  };

  const approveHandover = () => {
    if (!selectedZone.needsHandover || !selectedZone.handoverFrom || !selectedZone.handoverReason) {
      showNotice('warning', '현재 선택한 구역은 인계 대상이 아닙니다.');
      return;
    }
    if (!handoverReviewed) {
      showNotice('warning', '기존 자료와 중단 사유를 확인했다는 표시를 먼저 선택하세요.');
      return;
    }

    const from = selectedZone.handoverFrom;
    const reason = selectedZone.handoverReason;
    const target = handoverDrone;
    const zoneId = selectedZone.id;

    setDemo((current) => {
      const currentZone = current.zones.find((zone) => zone.id === zoneId);
      if (!currentZone?.needsHandover) return current;

      const nextZone: Zone = {
        ...currentZone,
        droneId: target,
        taskStatus: 'assigned',
        needsHandover: false,
        handoverFrom: from,
        handover: {
          from,
          to: target,
          reason,
          approvedAt: nowTime(),
        },
      };

      return {
        ...current,
        zones: current.zones.map((zone) => zone.id === zoneId ? nextZone : zone),
        history: [
          makeHistory('승인 인계', `${zoneId}의 새 작업을 기체 ${from}에서 기체 ${target}(으)로 배정했습니다. 기존 자료와 중단 사유는 보존됩니다.`, zoneId),
          ...current.history,
        ],
      };
    });
    setHandoverReviewed(false);
    showNotice('success', `${zoneId}을 기체 ${target}의 새 작업으로 배정했습니다. 실제 비행을 시작한 것은 아닙니다.`);
  };

  const addEvidenceReference = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const label = evidenceLabel.trim();
    const memo = evidenceMemo.trim();
    if (!label || !memo) {
      showNotice('warning', '자료 참조 이름과 메모를 모두 입력하세요. 실제 파일을 업로드하지는 않습니다.');
      return;
    }

    const zoneId = selectedZone.id;
    setDemo((current) => ({
      ...current,
      zones: current.zones.map((zone) => zone.id === zoneId ? {
        ...zone,
        evidence: [
          ...zone.evidence,
          {
            id: `EV-${Date.now()}`,
            label,
            reference: `가상 자료 참조 · ${zoneId}`,
            memo,
          },
        ],
      } : zone),
      history: [
        makeHistory('자료 참조', `${zoneId}에 가상 자료 참조를 추가했습니다: ${label}\n메모: ${memo}`, zoneId),
        ...current.history,
      ],
    }));
    setEvidenceLabel('');
    setEvidenceMemo('');
    showNotice('success', '가상 자료 참조와 메모를 추가했습니다. 실제 파일 업로드나 보관은 수행하지 않습니다.');
  };

  const resetDemo = () => {
    bInterruptionLock.current = false;
    setDemo(createInitialDemo());
    setSelectedZoneId('Z-07');
    setHandoverDrone('A');
    setHandoverReviewed(false);
    setNarrowPanel('map');
    setResetOpen(false);
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // The next persistence effect will attempt to save the initial state.
    }
    showNotice('success', '가상 시연을 초기 상태로 복원했습니다.');
  };

  const exportHistory = () => {
    try {
      const rows = [
        ['time', 'kind', 'zone_id', 'message'],
        ...demo.history.map((event) => [event.time, event.kind, event.zoneId ?? '', event.message]),
      ];
      const csv = rows
        .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(','))
        .join('\n');
      const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
      const href = URL.createObjectURL(blob);
      const link = document.createElement('a');
      link.href = href;
      link.download = 'S-수색관제-변경이력.csv';
      document.body.appendChild(link);
      link.click();
      link.remove();
      URL.revokeObjectURL(href);
      showNotice('success', '변경 이력을 UTF-8 CSV 파일로 내보냈습니다.');
    } catch {
      showNotice('error', 'CSV 파일을 만들지 못했습니다. 이 브라우저의 다운로드 설정을 확인한 뒤 다시 시도하세요.');
    }
  };

  if (view === 'intro') {
    return <IntroPage zones={demo.zones} onOpenDemo={openDemo} />;
  }

  const isTaskChangeDisabled = selectedZone.taskStatus === 'completed'
    || selectedZone.taskStatus === 'interrupted'
    || selectedZone.taskStatus === 'unassigned';

  return (
    <div className="demo-shell">
      <header className="demo-header">
        <div className="demo-brand-group">
          <button className="back-button" onClick={returnToIntro}><ArrowLeft size={16} /> 소개</button>
          <div className="demo-brand-divider" aria-hidden="true" />
          <SMark />
          <div>
            <p className="kicker">TEAM S? · VIRTUAL SEARCH DEMO</p>
            <h1>모의 재난 수색 001</h1>
          </div>
        </div>
        <div className="demo-header-actions">
          <span className="simulation-badge"><ShieldAlert size={15} /> 가상 시연 · 실제 비행 제어 없음</span>
          <button className="button subtle small" onClick={() => setGuideOpen((current) => !current)}><Sparkles size={15} /> 시연 안내</button>
          <button className="button subtle small" onClick={exportHistory}><Download size={15} /> 이력 내보내기</button>
          <button className="button subtle small" ref={resetTriggerRef} onClick={() => setResetOpen(true)}><RefreshCcw size={15} /> 초기화</button>
          <button className="button critical small" onClick={triggerBInterruption}><TriangleAlert size={15} /> B 중단 시연</button>
        </div>
      </header>

      <main className="demo-main">
        {guideOpen && (
          <section className="guide-card" aria-label="발표 시연 안내">
            <div className="guide-heading">
              <div><p className="kicker">PRESENTER GUIDE</p><h2>발표 시연 순서</h2></div>
              <button className="icon-button" onClick={() => setGuideOpen(false)} aria-label="시연 안내 닫기"><X size={17} /></button>
            </div>
            <ol>
              <li><b>① Z-07 확인</b><span>사진 참조가 있어도 관측은 아직 미확인인 점을 봅니다.</span><button onClick={() => selectZone('Z-07')}>Z-07 열기</button></li>
              <li><b>② B 중단</b><span>완료된 05·06은 보존되고 07·08만 인계 대상으로 바뀝니다.</span><button onClick={triggerBInterruption}>B 중단 실행</button></li>
              <li><b>③ 인계 승인</b><span>이전 자료와 사유를 확인한 뒤 새 작업으로 배정합니다.</span><button onClick={() => selectZone('Z-07')}>인계 패널 보기</button></li>
              <li><b>④ 자료 유지 확인</b><span>인계 뒤에도 B의 자료와 사유, 변경 이력이 남습니다.</span><button onClick={() => selectZone('Z-07')}>자료 확인</button></li>
            </ol>
          </section>
        )}

        <section className="demo-overview">
          <div>
            <p className="kicker">SEARCH WORKSPACE</p>
            <h2>가상 수색 구역을 중심으로 기록을 연결합니다.</h2>
            <p>작업이 진행됐는지, 관측 자료가 확인됐는지, 중단된 작업을 누가 이어받았는지를 별도로 표시합니다.</p>
          </div>
          <div className="overview-statements" aria-label="가상 시연 상태">
            <span><b>{confirmedCount}</b> 확인 완료</span>
            <span><b>{activeCount}</b> 진행 중</span>
            <span className={handoverQueue.length ? 'attention' : ''}><b>{handoverQueue.length}</b> 인계 필요</span>
          </div>
        </section>

        <p className="storage-note"><Info size={15} /> 현재 상태는 이 브라우저의 저장 공간에만 유지됩니다. 백업·서버 저장·다중 사용자 동기화 기능은 제공하지 않습니다.</p>

        <div className="workspace-tabs" aria-label="시연 화면 영역 전환">
          <button type="button" aria-pressed={narrowPanel === 'map'} onClick={() => setNarrowPanel('map')}>가상 구역도</button>
          <button type="button" aria-pressed={narrowPanel === 'detail'} onClick={() => setNarrowPanel('detail')}>선택 구역</button>
          <button type="button" aria-pressed={narrowPanel === 'fleet'} onClick={() => setNarrowPanel('fleet')}>기체 요약</button>
        </div>

        <section className="demo-workspace" data-active-panel={narrowPanel}>
          <aside className="workspace-panel fleet-panel" aria-label="가상 기체 요약">
            <div className="panel-heading">
              <div><p className="kicker">FLEET</p><h3>가상 기체</h3></div>
              <UsersRound size={18} />
            </div>
            <p className="panel-description">실제 통신·배터리 값이 아닌, 시연용 작업 상태만 표시합니다.</p>
            <div className="fleet-list">
              {droneSummary.map((drone) => (
                <article className={`drone-summary ${drone.unavailable ? 'unavailable' : ''}`} key={drone.id}>
                  <span className="drone-id">{drone.id}</span>
                  <div>
                    <b>기체 {drone.id}</b>
                    <span>{drone.unavailable ? '중단 기록됨' : drone.current ? '현재 작업 있음' : '현재 작업 없음'}</span>
                  </div>
                  <div className="drone-work-counts">
                    <span>진행 {drone.current}</span>
                    <span>대기 {drone.pending}</span>
                    <span>완료 {drone.completed}</span>
                  </div>
                </article>
              ))}
            </div>
            <div className="status-legend">
              <h4>표시 원칙</h4>
              <p><b>작업</b> · 작업 없음, 배정됨, 진행 중, 완료, 중단</p>
              <p><b>관측</b> · 미확인, 확인 완료, 재확인 필요</p>
              <small>상태는 색상뿐 아니라 기호와 문장으로 구분합니다.</small>
            </div>
          </aside>

          <section className="workspace-panel map-panel" aria-label="가상 수색 구역도">
            <div className="panel-heading map-panel-heading">
              <div><p className="kicker">VIRTUAL SEARCH GRID</p><h3>가상 구역도</h3></div>
              <span className="grid-label"><MapPinned size={15} /> 3행 × 4열 · 실제 지도 아님</span>
            </div>
            <p className="map-explainer"><Sparkles size={16} /><span><b>핵심:</b> 드론이 작업한 상태와 운영자가 자료를 확인한 상태는 서로 다릅니다.</span></p>
            <div className="zone-grid">
              {demo.zones.map((zone) => {
                const task = taskMeta[zone.taskStatus];
                const observation = observationMeta[zone.observationStatus];
                const isSelected = zone.id === selectedZone.id;
                return (
                  <button
                    type="button"
                    key={zone.id}
                    onClick={() => selectZone(zone.id)}
                    className={`zone-card ${isSelected ? 'selected' : ''} ${zone.needsHandover ? 'handover' : ''}`}
                    aria-pressed={isSelected}
                  >
                    <span className="zone-top"><b>{zone.id}</b><span className="drone-token">{zone.droneId ?? '—'}</span></span>
                    <StatusLine {...task} prefix="작업" />
                    <StatusLine {...observation} prefix="관측" />
                    <span className="zone-foot">
                      <span><FileImage size={13} /> 가상 자료 {zone.evidence.length}</span>
                      {zone.needsHandover ? <span className="handover-flag"><ArrowRightLeft size={13} /> 인계 필요</span>
                        : zone.handover ? <span className="handover-flag"><ArrowRight size={13} /> {zone.handover.from}→{zone.handover.to}</span>
                          : <span>{zone.candidate ? '추가 확인 있음' : '기록 연결됨'}</span>}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>

          <aside className="workspace-panel detail-panel" aria-label="선택 구역 상세">
            <div className="panel-heading">
              <div><p className="kicker">SELECTED ZONE</p><h3>{selectedZone.id} 상세</h3></div>
              <Eye size={18} />
            </div>
            <div className="selected-zone-summary">
              <span>{String(selectedZone.number).padStart(2, '0')}</span>
              <div><small>현재 담당</small><b>{selectedZone.droneId ? `기체 ${selectedZone.droneId}` : '담당 없음'}</b><p>{selectedZone.note}</p></div>
            </div>
            <div className="detail-statuses">
              <StatusLine {...taskMeta[selectedZone.taskStatus]} prefix="작업" />
              <StatusLine {...observationMeta[selectedZone.observationStatus]} prefix="관측" />
            </div>

            <section className="detail-card evidence-card">
              <div className="detail-card-heading"><span><FileImage size={16} /> 가상 관측 자료</span><b>{selectedZone.evidence.length}건</b></div>
              <p className="detail-hint">자료 참조와 메모만 관리합니다. 실제 파일 업로드·보관 기능은 없습니다.</p>
              {selectedZone.evidence.length ? selectedZone.evidence.map((evidence) => (
                <article className="evidence-row" key={evidence.id}>
                  <span className="evidence-mark">REF</span>
                  <div><b>{evidence.label}</b><small>{evidence.reference}</small><p>{evidence.memo}</p></div>
                </article>
              )) : <p className="empty-state">연결된 가상 관측 자료가 없습니다.</p>}
              {selectedZone.candidate && <p className="candidate-note"><Search size={15} /><span><b>발견 후보</b>{selectedZone.candidate}</span></p>}
              <form className="evidence-form" onSubmit={addEvidenceReference}>
                <label>자료 참조 이름
                  <input value={evidenceLabel} onChange={(event) => setEvidenceLabel(event.target.value)} placeholder="예: 추가 관측 메모" />
                </label>
                <label>메모
                  <textarea value={evidenceMemo} onChange={(event) => setEvidenceMemo(event.target.value)} placeholder="참조 내용을 적습니다. 쉼표와 줄바꿈도 기록할 수 있습니다." rows={2} />
                </label>
                <button className="button subtle full" type="submit"><FileImage size={15} /> 가상 자료 참조 추가</button>
              </form>
            </section>

            <section className="detail-card action-card">
              <div className="detail-card-heading"><span><Play size={16} /> 상태 표시</span></div>
              <p className="detail-hint">상태 표시는 실제 비행 시작이나 구조 판단을 실행하지 않습니다.</p>
              <div className="action-row">
                <button className="button subtle full" disabled={isTaskChangeDisabled || selectedZone.taskStatus === 'in_progress'} onClick={() => updateTask('in_progress')}><Play size={15} /> 작업을 진행 중으로 표시</button>
                <button className="button subtle full" disabled={isTaskChangeDisabled} onClick={() => updateTask('completed')}><ClipboardCheck size={15} /> 작업을 완료로 표시</button>
              </div>
              <div className="action-row">
                <button className="button success full" onClick={() => updateObservation('confirmed')}><Check size={15} /> 관측 확인 완료</button>
                <button className="button warning full" onClick={() => updateObservation('recheck')}><AlertTriangle size={15} /> 관측 재확인 필요</button>
              </div>
            </section>

            <section className="detail-card handover-card">
              <div className="detail-card-heading"><span><ArrowRightLeft size={16} /> 작업 인계</span></div>
              {selectedZone.needsHandover ? (
                <>
                  <div className="handover-facts">
                    <p><b>이전 담당</b><span>기체 {selectedZone.handoverFrom}</span></p>
                    {selectedZone.interruptedWork && <p><b>중단 전 작업</b><span>{taskMeta[selectedZone.interruptedWork.taskStatus].label} · {selectedZone.interruptedWork.interruptedAt} 기록</span></p>}
                    <p><b>중단 사유</b><span>{selectedZone.handoverReason}</span></p>
                    <p><b>보존 자료</b><span>가상 자료·메모 {selectedZone.evidence.length}건</span></p>
                  </div>
                  <label className="select-label">새 담당 기체
                    <select value={handoverDrone} onChange={(event) => { setHandoverDrone(event.target.value as DroneId); setHandoverReviewed(false); }}>
                      <option value="A">기체 A</option>
                      <option value="C">기체 C</option>
                    </select>
                  </label>
                  <div className="handover-preview">
                    <span>승인 전 미리보기</span>
                    <b>B → {handoverDrone}</b>
                    <p>새 작업은 <strong>배정됨</strong>으로 기록됩니다. 기존 관측 상태와 자료는 바꾸지 않습니다.</p>
                  </div>
                  <label className="review-check">
                    <input type="checkbox" checked={handoverReviewed} onChange={(event) => setHandoverReviewed(event.target.checked)} />
                    <span>기존 자료와 중단 사유를 확인했습니다.</span>
                  </label>
                  <button className="button primary full" disabled={!handoverReviewed} onClick={approveHandover}><ClipboardCheck size={16} /> 운영자 승인 후 새 작업 배정</button>
                </>
              ) : selectedZone.handover ? (
                <div className="handover-complete">
                  <Check size={17} />
                  <div>
                    <b>인계 이력 보존됨</b>
                    <p>기체 {selectedZone.handover.from}의 자료와 사유를 유지한 채 기체 {selectedZone.handover.to}에 새 작업이 배정되었습니다.</p>
                    {selectedZone.interruptedWork && <p>중단 전 작업 상태: {taskMeta[selectedZone.interruptedWork.taskStatus].label} · {selectedZone.interruptedWork.interruptedAt} 기록</p>}
                  </div>
                </div>
              ) : selectedZone.taskStatus === 'completed' ? (
                <p className="empty-state"><Check size={15} /> 완료 구역은 보존되며 인계 대상으로 바꾸지 않습니다.</p>
              ) : (
                <p className="empty-state">이 구역은 현재 인계 대상이 아닙니다.</p>
              )}
            </section>
          </aside>
        </section>

        <section className="history-panel" aria-label="변경 이력">
          <div className="panel-heading">
            <div><p className="kicker">CHANGE HISTORY</p><h3>변경 이력 · 덮어쓰기 대신 연결</h3></div>
            <span className="history-caption"><History size={16} /> 운영자 조작 기록</span>
          </div>
          <div className="history-list">
            {demo.history.slice(0, 10).map((event) => (
              <article className="history-row" key={event.id}>
                <time>{event.time}</time>
                <span className={`history-kind ${event.kind.replaceAll(' ', '-')}`}>{event.kind}</span>
                <p>{event.message}</p>
                {event.zoneId && <button onClick={() => selectZone(event.zoneId!)}>{event.zoneId}<ChevronRight size={14} /></button>}
              </article>
            ))}
          </div>
        </section>
      </main>

      {notice && (
        <div className={`toast ${notice.tone}`} role="status">
          <span>{notice.message}</span>
          <button onClick={() => setNotice(null)} aria-label="안내 닫기"><X size={16} /></button>
        </div>
      )}

      {resetOpen && (
        <div className="modal-backdrop" role="presentation" onMouseDown={(event) => { if (event.currentTarget === event.target) setResetOpen(false); }}>
          <section className="confirm-dialog" ref={resetDialogRef} role="dialog" aria-modal="true" aria-labelledby="reset-title" aria-describedby="reset-description">
            <p className="kicker">RESET DEMO</p>
            <h2 id="reset-title">가상 시연을 초기화할까요?</h2>
            <p id="reset-description">현재 구역 상태, 추가한 가상 자료 참조, 변경 이력이 이 브라우저에서 초기 시나리오로 바뀝니다.</p>
            <div className="dialog-actions">
              <button className="button subtle" ref={cancelResetRef} onClick={() => setResetOpen(false)}>취소하고 유지</button>
              <button className="button critical" onClick={resetDemo}><RefreshCcw size={15} /> 초기화 확인</button>
            </div>
          </section>
        </div>
      )}
    </div>
  );
}

export default App;
