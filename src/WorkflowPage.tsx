import {
  type FormEvent,
  type ReactNode,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRightLeft,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  ClipboardCheck,
  Download,
  FileText,
  History,
  Info,
  ListFilter,
  MapPinned,
  Play,
  RefreshCcw,
  Save,
  Search,
  ShieldAlert,
  TriangleAlert,
  UserRoundCheck,
  XCircle,
} from 'lucide-react';
import { observationMeta, taskMeta } from './data';
import type { DroneId, ObservationStatus, TaskStatus } from './types';
import {
  activeTask,
  applyCommand,
  createWorkflow,
  csvHistory,
  latestReview,
  latestTask,
  projectZones,
  validateWorkflow,
  type Handover,
  type Material,
  type Review,
  type Task,
  type WorkflowState,
} from './workflow';
import './workflow.css';

const STORAGE_KEY = 's-question-workflow-v3';
const DRONES: DroneId[] = ['A', 'B', 'C'];

type NarrowTab = 'tasks' | 'grid' | 'details';
type TaskFilter = 'all' | 'active' | 'handover' | 'unassigned' | 'done';
type SaveTone = 'neutral' | 'success' | 'warning' | 'error';
type Command = Parameters<typeof applyCommand>[1];

interface SaveStatus {
  tone: SaveTone;
  message: string;
}

interface LoadResult {
  state: WorkflowState;
  status: SaveStatus;
  storageProblem: boolean;
}

function loadWorkflow(): LoadResult {
  const fallback = createWorkflow();
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      return {
        state: fallback,
        storageProblem: false,
        status: { tone: 'neutral', message: '초기 가상 시나리오를 열었습니다. 아직 브라우저에 저장하지 않았습니다.' },
      };
    }
    const parsed: unknown = JSON.parse(raw);
    if (!validateWorkflow(parsed)) {
      return {
        state: fallback,
        storageProblem: true,
        status: { tone: 'error', message: 'v3 저장값 형식이 유효하지 않습니다. 기존 값은 삭제하지 않았습니다. “새 시연본 저장”을 선택하면 현재 가상 시나리오를 새로 저장할 수 있습니다.' },
      };
    }
    return {
      state: parsed,
      storageProblem: false,
      status: { tone: 'success', message: `브라우저에 저장된 시연본(rev. ${parsed.revision})을 불러왔습니다.` },
    };
  } catch {
    return {
      state: fallback,
      storageProblem: true,
      status: { tone: 'error', message: 'v3 저장값을 읽을 수 없습니다. 기존 값은 그대로 보존했습니다. 새 시연본을 저장하려면 초기화를 확인하세요.' },
    };
  }
}

function kst(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return iso;
  return new Intl.DateTimeFormat('ko-KR', {
    timeZone: 'Asia/Seoul',
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', second: '2-digit',
    hour12: false,
  }).format(date);
}

function downloadText(content: string, filename: string, type: string) {
  const blob = new Blob([content], { type });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function StatusPill({ status, type }: { status: TaskStatus | ObservationStatus; type: 'task' | 'review' }) {
  const meta = type === 'task'
    ? taskMeta[status as TaskStatus]
    : observationMeta[status as ObservationStatus];
  return <span className={`workflowStatus workflowStatus--${meta.tone}`}>{meta.symbol} {meta.label}</span>;
}

function DroneSelect({ name, value, disabled = false }: { name: string; value?: DroneId; disabled?: boolean }) {
  return (
    <select name={name} defaultValue={value ?? 'A'} disabled={disabled} aria-label="담당 기체">
      {DRONES.map((drone) => <option key={drone} value={drone}>기체 {drone}</option>)}
    </select>
  );
}

function Field({
  label,
  name,
  placeholder,
  required = true,
  multiline = false,
  defaultValue,
}: {
  label: string;
  name: string;
  placeholder: string;
  required?: boolean;
  multiline?: boolean;
  defaultValue?: string;
}) {
  return (
    <label className="workflowField">
      <span>{label}{required ? <em aria-hidden="true"> · 필수</em> : null}</span>
      {multiline
        ? <textarea name={name} rows={3} required={required} defaultValue={defaultValue} placeholder={placeholder} />
        : <input name={name} required={required} defaultValue={defaultValue} placeholder={placeholder} />}
    </label>
  );
}

function formatTaskAssignee(task: Task | undefined) {
  return task ? `기체 ${task.droneId}` : '담당 없음';
}

function taskDescription(task: Task | undefined) {
  if (!task) return '아직 작업이 배정되지 않았습니다.';
  if (task.status === 'interrupted') return `기체 ${task.droneId}의 작업이 중단되어 원본 작업으로 남아 있습니다.`;
  if (task.status === 'completed') return `기체 ${task.droneId}의 작업은 완료 기록으로 남아 있습니다.`;
  return `기체 ${task.droneId}의 현재 작업입니다.`;
}

export default function WorkflowPage({ onBack }: { onBack: () => void }) {
  const loadRef = useRef<LoadResult | null>(null);
  if (loadRef.current === null) loadRef.current = loadWorkflow();
  const initialLoad = loadRef.current;

  const [workflow, setWorkflow] = useState<WorkflowState>(initialLoad.state);
  const [selectedZoneId, setSelectedZoneId] = useState('Z-07');
  const [taskFilter, setTaskFilter] = useState<TaskFilter>('all');
  const [search, setSearch] = useState('');
  const [narrowTab, setNarrowTab] = useState<NarrowTab>('grid');
  const [guideOpen, setGuideOpen] = useState(false);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>(initialLoad.status);
  const [storageProblem, setStorageProblem] = useState(initialLoad.storageProblem);
  const [remoteReview, setRemoteReview] = useState<WorkflowState | null>(null);
  const [handoverReviewed, setHandoverReviewed] = useState(false);

  const zones = useMemo(() => projectZones(workflow), [workflow]);
  const selectedZone = zones.find((zone) => zone.id === selectedZoneId) ?? zones[0];
  const selectedId = selectedZone?.id ?? 'Z-01';
  const currentTask = activeTask(workflow, selectedId);
  const latest = latestTask(workflow, selectedId);
  const currentReview = latestReview(workflow, selectedId);
  const previousTask = latest?.previousTaskId
    ? workflow.tasks.find((task) => task.id === latest.previousTaskId)
    : undefined;
  const zoneTasks = workflow.tasks.filter((task) => task.zoneId === selectedId);
  const zoneMaterials = workflow.materials.filter((material) => material.zoneId === selectedId);
  const zoneReviews = workflow.reviews.filter((review) => review.zoneId === selectedId);
  const zoneHandovers = workflow.handovers.filter((handover) => handover.zoneId === selectedId);
  const zoneAudit = workflow.history.filter((audit) => audit.zoneId === selectedId || Boolean(latest && audit.taskId === latest.id));
  const isBlocked = storageProblem || remoteReview !== null;

  const filteredZones = useMemo(() => {
    const query = search.trim().toLowerCase();
    return zones.filter((zone) => {
      const latestForZone = latestTask(workflow, zone.id);
      const filterMatches = taskFilter === 'all'
        || (taskFilter === 'active' && (zone.taskStatus === 'assigned' || zone.taskStatus === 'in_progress'))
        || (taskFilter === 'handover' && zone.needsHandover)
        || (taskFilter === 'unassigned' && !latestForZone)
        || (taskFilter === 'done' && zone.taskStatus === 'completed');
      const searchMatches = !query || [zone.id, zone.droneId ?? '', taskMeta[zone.taskStatus].label, observationMeta[zone.observationStatus].label]
        .join(' ').toLowerCase().includes(query);
      return filterMatches && searchMatches;
    });
  }, [search, taskFilter, workflow, zones]);

  const handoverQueue = zones.filter((zone) => zone.needsHandover);
  const activeCount = zones.filter((zone) => zone.taskStatus === 'assigned' || zone.taskStatus === 'in_progress').length;
  const confirmedCount = zones.filter((zone) => zone.observationStatus === 'confirmed').length;

  const selectZone = (zoneId: string, tab: NarrowTab = 'details') => {
    setSelectedZoneId(zoneId);
    setNarrowTab(tab);
    setHandoverReviewed(false);
  };

  const verifyStoredRevision = (): string | null => {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (!raw) {
        if (workflow.revision > 0) {
          setStorageProblem(true);
          setHandoverReviewed(false);
          return '저장본이 사라져 자동 덮어쓰기를 막았습니다. 초기화 확인 후 새 시연본을 시작하세요.';
        }
        return null;
      }
      const parsed: unknown = JSON.parse(raw);
      if (!validateWorkflow(parsed)) return '저장소의 v3 값이 유효하지 않아 덮어쓰지 않았습니다. 새 시연본 저장을 사용하세요.';
      if (JSON.stringify(parsed) !== JSON.stringify(workflow)) {
        setRemoteReview(parsed);
        setHandoverReviewed(false);
        return `다른 탭의 저장본(rev. ${parsed.revision})이 감지되었습니다. 먼저 다른 탭 버전을 검토하세요.`;
      }
      return null;
    } catch {
      return '브라우저 저장소를 다시 읽을 수 없어 변경을 적용하지 않았습니다.';
    }
  };

  const commit = (command: Command, successMessage: string) => {
    if (isBlocked) {
      setSaveStatus({ tone: 'warning', message: storageProblem
        ? '유효하지 않은 저장값을 보존 중이라 변경할 수 없습니다. 새 시연본 저장을 먼저 확인하세요.'
        : '다른 탭 버전 검토 전에는 변경을 저장할 수 없습니다.' });
      return false;
    }
    const storageError = verifyStoredRevision();
    if (storageError) {
      setSaveStatus({ tone: 'warning', message: storageError });
      return false;
    }
    try {
      const next = applyCommand(workflow, command);
      if (next === workflow) {
        setSaveStatus({ tone: 'neutral', message: '이미 반영된 요청입니다. 저장본은 변경하지 않았습니다.' });
        return true;
      }
      // 성공 안내보다 먼저 브라우저 저장을 수행합니다. 실패하면 화면 상태도 바꾸지 않습니다.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setWorkflow(next);
      setSaveStatus({ tone: 'success', message: `${successMessage} 브라우저 저장(rev. ${next.revision})을 완료했습니다.` });
      return true;
    } catch (error) {
      setSaveStatus({ tone: 'error', message: error instanceof Error ? error.message : '변경 내용을 저장하지 못했습니다.' });
      return false;
    }
  };

  const submitCommand = (event: FormEvent<HTMLFormElement>, makeCommand: (data: FormData) => Command, successMessage: string) => {
    event.preventDefault();
    const form = event.currentTarget;
    const committed = commit(makeCommand(new FormData(form)), successMessage);
    if (committed) form.reset();
  };

  const triggerBInterruption = () => {
    const committed = commit({ type: 'interruptB', expectedRevision: workflow.revision }, '기체 B 중단 시연을 기록했습니다.');
    if (committed) selectZone('Z-07');
  };

  const resetFixture = () => {
    if (remoteReview) {
      setSaveStatus({ tone: 'warning', message: '다른 탭의 저장본을 먼저 검토·반영한 뒤 초기화를 다시 선택하세요.' });
      return;
    }
    if (!window.confirm('현재 v3 시연본을 초기 가상 시나리오로 바꿀까요? 기존 v2 저장값은 건드리지 않습니다.')) return;
    const next = createWorkflow();
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        let parsed: unknown;
        try { parsed = JSON.parse(raw); } catch { parsed = null; }
        if (validateWorkflow(parsed) && JSON.stringify(parsed) !== JSON.stringify(workflow)) {
          setRemoteReview(parsed);
          setHandoverReviewed(false);
          setSaveStatus({ tone: 'warning', message: '초기화 직전 다른 저장본을 발견했습니다. 덮어쓰지 않았으니 최신 내용을 먼저 검토하세요.' });
          return;
        }
        if (!validateWorkflow(parsed) && !storageProblem) {
          setStorageProblem(true);
          setSaveStatus({ tone: 'warning', message: '새로운 손상 저장값을 발견해 보존했습니다. 초기화를 다시 확인해야 새 시연본으로 복구됩니다.' });
          return;
        }
      }
      // 삭제가 아니라 명시적으로 새 시연본을 저장하므로, 구버전 키는 보존됩니다.
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      setWorkflow(next);
      setSelectedZoneId('Z-07');
      setRemoteReview(null);
      setStorageProblem(false);
      setHandoverReviewed(false);
      setSaveStatus({ tone: 'success', message: `초기 가상 시나리오를 브라우저에 저장했습니다(rev. ${next.revision}). v2 저장값은 유지했습니다.` });
    } catch {
      setSaveStatus({ tone: 'error', message: '새 시연본을 저장하지 못했습니다. 화면 상태는 바꾸지 않았습니다.' });
    }
  };

  const acceptRemoteReview = () => {
    if (!remoteReview) return;
    setWorkflow(remoteReview);
    setSelectedZoneId((id) => projectZones(remoteReview).some((zone) => zone.id === id) ? id : 'Z-07');
    setRemoteReview(null);
    setHandoverReviewed(false);
    setSaveStatus({ tone: 'success', message: `다른 탭의 저장본(rev. ${remoteReview.revision})을 검토하고 이 화면에 반영했습니다.` });
  };

  const exportJson = () => {
    try {
      downloadText(JSON.stringify(workflow, null, 2), `S-수색관제-전체상태-rev${workflow.revision}.json`, 'application/json;charset=utf-8');
      setSaveStatus({ tone: 'success', message: '전체 workflow state JSON을 내보냈습니다. 실제 서버·파일 보관은 하지 않습니다.' });
    } catch {
      setSaveStatus({ tone: 'error', message: 'JSON 내보내기를 만들지 못했습니다. 브라우저 다운로드 설정을 확인하세요.' });
    }
  };

  const exportHistory = () => {
    try {
      downloadText(csvHistory(workflow), `S-수색관제-변경이력-rev${workflow.revision}.csv`, 'text/csv;charset=utf-8');
      setSaveStatus({ tone: 'success', message: '감사 이력을 UTF-8 CSV로 내보냈습니다.' });
    } catch {
      setSaveStatus({ tone: 'error', message: 'CSV 이력을 만들지 못했습니다. 브라우저 다운로드 설정을 확인하세요.' });
    }
  };

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key !== STORAGE_KEY) return;
      setHandoverReviewed(false);
      if (event.newValue === null) {
        setRemoteReview(null);
        setStorageProblem(true);
        setSaveStatus({ tone: 'warning', message: '다른 탭에서 v3 저장본이 사라졌습니다. 자동 덮어쓰기를 막았습니다. 새 시연본 저장으로만 다시 시작할 수 있습니다.' });
        return;
      }
      try {
        const parsed: unknown = JSON.parse(event.newValue);
        if (!validateWorkflow(parsed)) {
          setRemoteReview(null);
          setStorageProblem(true);
          setSaveStatus({ tone: 'warning', message: '다른 탭에서 유효하지 않은 v3 저장값이 감지되었습니다. 현재 화면의 저장을 중단했습니다.' });
          return;
        }
        setStorageProblem(false);
        if (JSON.stringify(parsed) !== JSON.stringify(workflow)) {
          setRemoteReview(parsed);
          setSaveStatus({ tone: 'warning', message: `다른 탭의 새 저장본(rev. ${parsed.revision})이 감지되었습니다. 검토 전까지 변경을 중지합니다.` });
        }
      } catch {
        setStorageProblem(true);
        setSaveStatus({ tone: 'warning', message: '다른 탭의 저장값을 읽지 못했습니다. 현재 화면의 저장을 중단했습니다.' });
      }
    };
    window.addEventListener('storage', onStorage);
    return () => window.removeEventListener('storage', onStorage);
  }, [workflow]);

  if (!selectedZone) {
    return <main className="workflowShell"><p className="workflowEmpty">가상 구역을 불러오지 못했습니다. 초기화로 새 시연본을 저장해 보세요.</p></main>;
  }

  const canStart = currentTask?.status === 'assigned';
  const canComplete = currentTask?.status === 'in_progress';
  const canInterrupt = currentTask?.status === 'assigned' || currentTask?.status === 'in_progress';
  const canCorrect = latest?.status === 'completed' && !currentTask;
  const canHandover = latest?.status === 'interrupted' && selectedZone.needsHandover;
  const dynamicNote = currentTask
    ? taskDescription(currentTask)
    : previousTask
      ? `현재 활성 작업은 없고, 이전 담당은 기체 ${previousTask.droneId}입니다. 새 인계 작업은 기존 작업과 별개의 ID를 가집니다.`
      : taskDescription(latest);

  return (
    <div className="workflowShell">
      <header className="workflowHeader">
        <div className="workflowBrand">
          <button className="workflowBack" type="button" onClick={onBack}><ArrowLeft size={16} /> 소개</button>
          <span className="workflowMark" aria-hidden="true">S<span>?</span></span>
          <div>
            <p>TEAM S? · VIRTUAL WORKFLOW</p>
            <h1>다중 드론 수색 관제</h1>
          </div>
        </div>
        <div className="workflowHeaderActions">
          <span className="workflowSimulation"><ShieldAlert size={15} /> 시뮬레이션</span>
          <button type="button" className="button subtle small" onClick={() => setGuideOpen((value) => !value)} aria-expanded={guideOpen}><Info size={15} /> 안내</button>
          <button type="button" className="button subtle small" onClick={exportJson}><Download size={15} /> 전체 JSON</button>
          <button type="button" className="button subtle small" onClick={exportHistory}><History size={15} /> CSV 이력</button>
          <button type="button" className="button subtle small" onClick={resetFixture}><RefreshCcw size={15} /> 초기화</button>
          <button type="button" className="button critical small" onClick={triggerBInterruption} disabled={isBlocked || workflow.bInterrupted}><TriangleAlert size={15} /> B 중단 시연</button>
        </div>
      </header>

      <main className="workflowMain">
        {guideOpen && (
          <section className="workflowGuide" aria-label="시연 안내">
            <div><p className="workflowEyebrow">PRESENTER GUIDE</p><h2>시연 순서</h2></div>
            <ol>
              <li><b>1. B 중단</b><span>Z-07·Z-08의 미완료 작업만 중단됩니다. 완료된 05·06은 보존됩니다.</span></li>
              <li><b>2. 원본 확인</b><span>중단 사유, 원본 작업 ID, 자료와 관측 검토 사유를 각각 확인합니다.</span></li>
              <li><b>3. 승인 인계</b><span>검토 확인과 사유를 남기면 새 작업 ID가 배정됨 상태로 생성됩니다.</span></li>
              <li><b>4. 이력 내보내기</b><span>전체 상태 JSON 또는 감사 이력 CSV를 브라우저에서만 내보낼 수 있습니다.</span></li>
            </ol>
          </section>
        )}

        <section className="workflowOverview" aria-label="시연 개요">
          <div>
            <p className="workflowEyebrow">모의 재난 수색 001 · 가상 시연</p>
            <h2>중단된 수색을, 기록과 함께 이어갑니다.</h2>
            <p>작업 진행 · 자료 확인 · 승인 인계를 구분합니다. 이 브라우저에만 저장되며, 서버·계정·실제 파일은 연결하지 않았습니다.</p>
          </div>
          <div className="workflowMetrics">
            <span><b>{activeCount}</b> 활성 작업</span>
            <span><b>{confirmedCount}</b> 관측 확인</span>
            <span className={handoverQueue.length ? 'workflowMetric--amber' : ''}><b>{handoverQueue.length}</b> 인계 대기</span>
          </div>
        </section>

        <section className={`workflowSaveStatus workflowSaveStatus--${saveStatus.tone}`} aria-live="polite">
          <Save size={16} /><span><b>저장 상태</b> {saveStatus.message}</span>
          <small>다른 탭 변경 확인은 최선의 브라우저 검토일 뿐, 서버 잠금이나 다중 사용자 동기화가 아닙니다.</small>
        </section>

        {remoteReview && (
          <section className="workflowConflict" aria-live="assertive">
            <AlertTriangle size={20} />
            <div><b>다른 탭 버전 검토가 필요합니다.</b><p>현재 rev. {workflow.revision}과 저장된 rev. {remoteReview.revision}이 다릅니다. 승인·저장 기능을 잠시 막았습니다.</p></div>
            <button className="button warning small" type="button" onClick={acceptRemoteReview}>다른 탭 버전 검토·반영</button>
          </section>
        )}
        {storageProblem && (
          <section className="workflowConflict workflowConflict--error" aria-live="assertive">
            <XCircle size={20} /><div><b>유효하지 않은 저장값을 보존 중입니다.</b><p>자동 삭제나 덮어쓰기를 하지 않습니다. 아래 “초기화”에서 새 시연본 저장을 명시적으로 확인할 수 있습니다.</p></div>
          </section>
        )}

        <nav className="workflowTabs" aria-label="작업 공간 전환">
          <button type="button" aria-pressed={narrowTab === 'tasks'} onClick={() => setNarrowTab('tasks')}>작업 목록</button>
          <button type="button" aria-pressed={narrowTab === 'grid'} onClick={() => setNarrowTab('grid')}>구역 그리드</button>
          <button type="button" aria-pressed={narrowTab === 'details'} onClick={() => setNarrowTab('details')}>선택 상세</button>
        </nav>

        <section className="workflowWorkspace" data-tab={narrowTab}>
          <aside className="workflowPanel workflowTasks" aria-label="작업 목록과 필터">
            <div className="workflowPanelHeading"><div><p className="workflowEyebrow">TASK FILTER</p><h3>작업 목록</h3></div><ListFilter size={18} /></div>
            <label className="workflowSearch"><Search size={15} /><span className="srOnly">작업 검색</span><input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="구역·상태·기체 검색" /></label>
            <div className="workflowFilters" aria-label="작업 필터">
              {([
                ['all', '전체'], ['active', '활성'], ['handover', '인계 대기'], ['unassigned', '미배정'], ['done', '완료'],
              ] as [TaskFilter, string][]).map(([value, label]) => (
                <button type="button" key={value} aria-pressed={taskFilter === value} onClick={() => setTaskFilter(value)}>{label}</button>
              ))}
            </div>
            <p className="workflowListMeta">{filteredZones.length}개 구역 · 현재 기록 기준</p>
            <div className="workflowTaskList">
              {filteredZones.length ? filteredZones.map((zone) => {
                const task = latestTask(workflow, zone.id);
                const selected = zone.id === selectedId;
                return <button type="button" className={`workflowTaskRow ${selected ? 'is-selected' : ''} ${zone.needsHandover ? 'is-handover' : ''}`} key={zone.id} onClick={() => selectZone(zone.id)} aria-pressed={selected}>
                  <span className="workflowZoneNumber">{zone.id.replace('Z-', '')}</span>
                  <span className="workflowTaskRowContent"><b>{zone.id}</b><small>{task ? `${task.id} · ${formatTaskAssignee(task)}` : '초기 배정 필요'}</small><StatusPill status={zone.taskStatus} type="task" /></span>
                  {zone.needsHandover ? <span className="workflowQueueFlag">인계</span> : <ChevronRight size={15} />}
                </button>;
              }) : <p className="workflowEmpty">필터에 맞는 구역이 없습니다.</p>}
            </div>
            <section className="workflowQueue" aria-label="인계 대기열">
              <div><ArrowRightLeft size={16} /><b>인계 대기열</b><span>{handoverQueue.length}</span></div>
              {handoverQueue.length ? handoverQueue.map((zone) => <button type="button" key={zone.id} onClick={() => selectZone(zone.id)}>{zone.id} · {latestTask(workflow, zone.id)?.id ?? '원본 확인'}</button>) : <p>현재 승인 대기 인계가 없습니다.</p>}
            </section>
          </aside>

          <section className="workflowPanel workflowGridPanel" aria-label="가상 수색 구역 그리드">
            <div className="workflowPanelHeading"><div><p className="workflowEyebrow">VIRTUAL SEARCH GRID</p><h3>가상 구역도</h3></div><MapPinned size={18} /></div>
            <p className="workflowGridNote"><Info size={15} /> 작업 상태와 관측 검토 상태는 독립적으로 유지됩니다. 실제 지도나 비행 데이터는 아닙니다.</p>
            <div className="workflowGrid">
              {zones.map((zone) => {
                const latestForZone = latestTask(workflow, zone.id);
                const zoneReview = latestReview(workflow, zone.id);
                const selected = zone.id === selectedId;
                return <button type="button" key={zone.id} onClick={() => selectZone(zone.id)} className={`workflowZoneCard ${selected ? 'is-selected' : ''} ${zone.needsHandover ? 'is-handover' : ''}`} aria-pressed={selected}>
                  <span className="workflowZoneTop"><b>{zone.id}</b><span>{zone.droneId ?? '—'}</span></span>
                  <StatusPill status={zone.taskStatus} type="task" />
                  <StatusPill status={zone.observationStatus} type="review" />
                  <span className="workflowZoneBottom">{latestForZone ? latestForZone.id : '작업 없음'} {zone.needsHandover ? <strong>인계 필요</strong> : zoneReview ? <em>검토 기록</em> : null}</span>
                </button>;
              })}
            </div>
          </section>

          <aside className="workflowPanel workflowDetail" aria-label="선택 구역 상세" key={selectedId}>
            <div className="workflowPanelHeading"><div><p className="workflowEyebrow">SELECTED ZONE</p><h3>{selectedZone.id} 상세</h3></div><ClipboardCheck size={18} /></div>
            <section className="workflowSelectionSummary">
              <span>{String(selectedZone.number).padStart(2, '0')}</span>
              <div><small>현재 담당</small><b>{formatTaskAssignee(currentTask)}</b><p>{dynamicNote}</p></div>
            </section>
            <div className="workflowStatusPair"><StatusPill status={selectedZone.taskStatus} type="task" /><StatusPill status={selectedZone.observationStatus} type="review" /></div>
            <p className="workflowUpdated">마지막 업데이트: {kst(workflow.updatedAt)} KST · rev. {workflow.revision}</p>

            <section className="workflowCard">
              <h4><FileText size={16} /> 원본 작업과 관측 검토</h4>
              <dl className="workflowFacts">
                <div><dt>현재 작업</dt><dd>{currentTask ? `${currentTask.id} · 기체 ${currentTask.droneId} · ${taskMeta[currentTask.status].label}` : '활성 작업 없음'}</dd></div>
                <div><dt>최신 작업</dt><dd>{latest ? `${latest.id} · ${taskMeta[latest.status].label}` : '작업 없음'}</dd></div>
                <div><dt>이전 담당</dt><dd>{previousTask ? `기체 ${previousTask.droneId} · ${previousTask.id}` : latest?.status === 'interrupted' ? `기체 ${latest.droneId} · ${latest.id}` : '이전 인계 기록 없음'}</dd></div>
                <div><dt>최신 검토</dt><dd>{currentReview ? `${observationMeta[currentReview.status].label} · ${currentReview.reason}` : '검토 기록 없음'}</dd></div>
              </dl>
              {latest?.interruptionReason && <p className="workflowReason"><b>중단 사유</b>{latest.interruptionReason}</p>}
              {selectedId === 'Z-08' && currentReview && <p className="workflowReason workflowReason--amber"><b>Z-08 검토 사유</b>{currentReview.reason}</p>}
              <details className="workflowDetails" open={Boolean(canHandover)}>
                <summary>원본 자료 참조 {zoneMaterials.length}건 확인</summary>
                <MaterialList materials={zoneMaterials} tasks={workflow.tasks} />
              </details>
            </section>

            <section className="workflowCard">
              <h4><UserRoundCheck size={16} /> 작업 제어</h4>
              {!latest && (
                <form className="workflowForm" onSubmit={(event) => submitCommand(event, (data) => ({
                  type: 'assign', zoneId: selectedId, droneId: data.get('drone') as DroneId, reason: String(data.get('reason') ?? '').trim(), expectedRevision: workflow.revision,
                }), `${selectedId}에 초기 작업을 배정했습니다.`)}>
                  <p className="workflowHint">이 구역에는 아직 작업이 없습니다. 사유를 남겨 초기 작업을 만드세요.</p>
                  <label className="workflowField"><span>담당 기체</span><DroneSelect name="drone" /></label>
                  <Field label="배정 사유" name="reason" placeholder="예: 미배정 구역의 가상 관측 시작" />
                  <button className="button primary small" disabled={isBlocked} type="submit">초기 작업 배정</button>
                </form>
              )}
              {(canStart || canComplete || canInterrupt) && currentTask && (
                <form className="workflowForm" onSubmit={(event) => {
                  event.preventDefault();
                  const data = new FormData(event.currentTarget);
                  const submitter = (event.nativeEvent as SubmitEvent).submitter;
                  const action = submitter instanceof HTMLButtonElement ? submitter.value : '';
                  const reason = String(data.get('reason') ?? '').trim();
                  const command: Command = action === 'interrupt'
                    ? { type: 'interrupt', taskId: currentTask.id, reason, expectedRevision: workflow.revision }
                    : { type: 'taskStatus', taskId: currentTask.id, status: action as 'in_progress' | 'completed', reason, expectedRevision: workflow.revision };
                  const labels: Record<string, string> = { in_progress: '작업을 시작으로 변경했습니다.', completed: '작업을 완료로 기록했습니다.', interrupt: '작업 중단을 기록했습니다.' };
                  submitCommand(event, () => command, labels[action]);
                }}>
                  <p className="workflowHint">현재 작업 ID: <code>{currentTask.id}</code> · 각 변경은 독립 사유와 감사 이력을 남깁니다.</p>
                  <Field label="변경 사유" name="reason" placeholder="상태 변경의 근거를 입력하세요" />
                  <div className="workflowActionRow">
                    {canStart && <button className="button primary small" type="submit" name="action" value="in_progress" disabled={isBlocked}><Play size={14} /> 시작</button>}
                    {canComplete && <button className="button success small" type="submit" name="action" value="completed" disabled={isBlocked}><CheckCircle2 size={14} /> 완료</button>}
                    {canInterrupt && <button className="button critical small" type="submit" name="action" value="interrupt" disabled={isBlocked}><TriangleAlert size={14} /> 일반 중단</button>}
                  </div>
                </form>
              )}
              {canCorrect && latest && (
                <form className="workflowForm" onSubmit={(event) => submitCommand(event, (data) => ({
                  type: 'correctCompletion', taskId: latest.id, reason: String(data.get('reason') ?? '').trim(), expectedRevision: workflow.revision,
                }), '완료 기록을 배정 상태로 정정했습니다. 관측 검토 상태는 바꾸지 않았습니다.')}>
                  <p className="workflowHint">완료 정정은 활성 작업이 없을 때만 가능합니다. 관측 검토는 변경하지 않습니다.</p>
                  <Field label="완료 정정 사유" name="reason" placeholder="정정이 필요한 근거를 입력하세요" />
                  <button className="button warning small" disabled={isBlocked} type="submit">완료 기록 정정</button>
                </form>
              )}
              {latest?.status === 'interrupted' && !canHandover && <p className="workflowHint">이 중단 작업에는 현재 인계 생성 조건이 맞지 않습니다. 원본 작업과 이력을 보존합니다.</p>}
            </section>

            {canHandover && latest && (
              <section className="workflowCard workflowHandover">
                <h4><ArrowRightLeft size={16} /> 승인 인계</h4>
                <p className="workflowHint">원본 <code>{latest.id}</code> · 이전 담당 기체 {latest.droneId}. 자료는 복제하지 않고 원본 작업 ID에 연결된 채 남습니다.</p>
                <form className="workflowForm" onChange={(event) => {
                  if (!(event.target instanceof HTMLInputElement && event.target.type === 'checkbox')) setHandoverReviewed(false);
                }} onSubmit={(event) => submitCommand(event, (data) => ({
                  type: 'handover', taskId: latest.id, droneId: data.get('drone') as DroneId, reason: String(data.get('reason') ?? '').trim(), requestId: crypto.randomUUID(), expectedRevision: workflow.revision,
                }), '인계를 승인했습니다. 새 작업은 배정됨 상태로 생성되며 원본 자료는 보존됩니다.')}>
                  <label className="workflowField"><span>새 담당 기체</span><DroneSelect name="drone" value={selectedId === 'Z-08' || latest.droneId === 'A' ? 'C' : 'A'} /></label>
                  <Field label="승인 사유" name="reason" placeholder="인계 승인 판단의 근거를 입력하세요" />
                  <label className="workflowCheck"><input type="checkbox" checked={handoverReviewed} onChange={(event) => setHandoverReviewed(event.target.checked)} required /><span>중단 사유와 원본 자료를 검토했으며, 확인 완료가 구조·인명 확인을 뜻하지 않음을 이해했습니다.</span></label>
                  <button className="button primary small" disabled={isBlocked || !handoverReviewed} type="submit">새 작업으로 승인 인계</button>
                </form>
              </section>
            )}

            <section className="workflowCard">
              <h4><CheckCircle2 size={16} /> 관측 검토</h4>
              <p className="workflowHint">작업 변경과 별개입니다. 확인 완료는 구조·인명 발견 또는 실제 성과를 뜻하지 않습니다.</p>
              <form className="workflowForm" key={selectedId} onSubmit={(event) => submitCommand(event, (data) => ({
                type: 'review', zoneId: selectedId, status: data.get('status') as ObservationStatus, reason: String(data.get('reason') ?? '').trim(), expectedRevision: workflow.revision,
              }), '관측 검토 상태와 사유를 기록했습니다.')}>
                <label className="workflowField"><span>검토 상태</span><select name="status" defaultValue={currentReview?.status ?? selectedZone.observationStatus}><option value="unverified">미확인</option><option value="confirmed">확인 완료</option><option value="recheck">재확인 필요</option></select></label>
                <Field label="검토 사유" name="reason" placeholder="예: 자료의 시야 가림으로 재확인이 필요함" defaultValue={selectedId === 'Z-08' ? currentReview?.reason : undefined} />
                <button className="button subtle small" disabled={isBlocked} type="submit">검토 사유 저장</button>
              </form>
            </section>

            <section className="workflowCard">
              <h4><FileText size={16} /> 텍스트 자료 참조</h4>
              <p className="workflowHint">실제 파일 업로드·보관은 제공하지 않습니다. 텍스트 참조와 메모만 추가합니다.</p>
              <form className="workflowForm" onSubmit={(event) => submitCommand(event, (data) => ({
                type: 'material', zoneId: selectedId, label: String(data.get('label') ?? '').trim(), memo: String(data.get('memo') ?? '').trim(), expectedRevision: workflow.revision,
              }), '원본 작업 연결을 유지한 텍스트 자료 참조를 추가했습니다.')}>
                <Field label="자료 참조명" name="label" placeholder="예: 가상 관측 메모 추가본" />
                <Field label="메모" name="memo" placeholder="파일이 아닌 텍스트 메모를 입력하세요" multiline />
                <button className="button subtle small" disabled={isBlocked} type="submit">텍스트 참조 추가</button>
              </form>
              <MaterialList materials={zoneMaterials} tasks={workflow.tasks} />
            </section>

            <details className="workflowDetails">
              <summary><span><History size={16} /> 과거 작업 · 인계 · 감사 이력</span><ChevronDown size={16} /></summary>
              <div className="workflowDetailsBody">
                <HistoryGroup title="모든 작업" empty="이 구역의 작업이 아직 없습니다." count={zoneTasks.length}><TaskList tasks={zoneTasks} /></HistoryGroup>
                <HistoryGroup title="승인 인계" empty="승인된 인계 기록이 없습니다." count={zoneHandovers.length}><HandoverList handovers={zoneHandovers} /></HistoryGroup>
                <HistoryGroup title="관측 검토 이력" empty="검토 기록이 없습니다." count={zoneReviews.length}><ReviewList reviews={zoneReviews} /></HistoryGroup>
                <HistoryGroup title="감사 이력" empty="감사 이력이 없습니다." count={zoneAudit.length}><AuditList history={zoneAudit} /></HistoryGroup>
              </div>
            </details>
          </aside>
        </section>
      </main>
    </div>
  );
}

function HistoryGroup({ title, empty, count, children }: { title: string; empty: string; count: number; children: ReactNode }) {
  return <section className="workflowHistoryGroup"><h5>{title}</h5>{count ? children : <p>{empty}</p>}</section>;
}

function MaterialList({ materials, tasks }: { materials: Material[]; tasks: Task[] }) {
  if (!materials.length) return <p className="workflowEmptySmall">연결된 자료 참조가 없습니다.</p>;
  return <ul className="workflowRecordList">
    {materials.map((material) => {
      const source = material.taskId ? tasks.find((task) => task.id === material.taskId) : undefined;
      return <li key={material.id}><b>{material.label}</b><span>{material.reference}</span><p>{material.memo}</p><small>원본 작업: {source ? `${source.id} · 기체 ${source.droneId}` : '작업 없음'} · 시뮬레이션 · {kst(material.createdAt)} KST</small></li>;
    })}
  </ul>;
}

function TaskList({ tasks }: { tasks: Task[] }) {
  return tasks.length ? <ul className="workflowRecordList">{tasks.map((task) => <li key={task.id}><b>{task.id} · 기체 {task.droneId}</b><span>{taskMeta[task.status].label} · {kst(task.updatedAt)} KST</span>{task.previousTaskId && <p>이전 원본 작업: {task.previousTaskId}</p>}{task.interruptionReason && <p>중단 사유: {task.interruptionReason}</p>}</li>)}</ul> : [];
}

function HandoverList({ handovers }: { handovers: Handover[] }) {
  return handovers.length ? <ul className="workflowRecordList">{handovers.map((handover) => <li key={handover.id}><b>{handover.from} → {handover.to} · {handover.toTaskId}</b><span>원본 {handover.fromTaskId} · {kst(handover.approvedAt)} KST</span><p>중단: {handover.interruptionReason}</p><p>승인: {handover.approvalReason} · {handover.actor}</p></li>)}</ul> : [];
}

function ReviewList({ reviews }: { reviews: Review[] }) {
  return reviews.length ? <ul className="workflowRecordList">{reviews.map((review) => <li key={review.id}><b>{observationMeta[review.status].label}</b><span>{kst(review.at)} KST · {review.actor}</span><p>{review.reason}</p></li>)}</ul> : [];
}

function AuditList({ history }: { history: WorkflowState['history'] }) {
  return history.length ? <ul className="workflowRecordList">{history.map((audit) => <li key={audit.id}><b>{audit.kind}</b><span>{kst(audit.time)} KST · {audit.actor}</span><p>{audit.message}</p><small>사유: {audit.reason}</small></li>)}</ul> : [];
}
