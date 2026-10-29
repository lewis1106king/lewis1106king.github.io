import {
  type ChangeEvent,
  type FormEvent,
  type MouseEvent,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import {
  AlertTriangle,
  ArrowLeft,
  CheckCircle2,
  ClipboardCheck,
  Download,
  FileImage,
  FileText,
  FolderOpen,
  Info,
  ListTree,
  MapPinned,
  MapPin,
  Plus,
  Printer,
  Save,
} from 'lucide-react';
import type { DroneId, ObservationStatus, TaskStatus } from '../types';
import {
  addEvidence,
  addInterestPoint,
  createOfflineProject,
  isSupportedMapType,
  MAX_IMAGE_BYTES,
  MAX_PROJECT_BYTES,
  parseOfflineProject,
  serializeOfflineProject,
  setMap,
  updateZone,
  type FieldZone,
  type OfflineProject,
} from './model';
import { createUnresolvedReport, reportHtml } from './report';
import './offline.css';

type NarrowTab = 'map' | 'zones' | 'inspection';
type NoticeTone = 'neutral' | 'success' | 'warning' | 'error';

type BoardNotice = {
  tone: NoticeTone;
  message: string;
};

const DRONES: DroneId[] = ['A', 'B', 'C'];

const TASK_LABEL: Record<TaskStatus, string> = {
  unassigned: '작업 없음',
  assigned: '배정됨',
  in_progress: '진행 중',
  completed: '완료',
  interrupted: '중단',
};

const TASK_TONE: Record<TaskStatus, string> = {
  unassigned: 'neutral',
  assigned: 'blue',
  in_progress: 'blue',
  completed: 'green',
  interrupted: 'red',
};

const OBSERVATION_LABEL: Record<ObservationStatus, string> = {
  unverified: '미확인',
  confirmed: '확인 완료',
  recheck: '재확인 필요',
};

const OBSERVATION_TONE: Record<ObservationStatus, string> = {
  unverified: 'neutral',
  confirmed: 'green',
  recheck: 'amber',
};

function formatTime(value: string | null) {
  if (!value) return '기록 없음';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', {
    year: 'numeric', month: '2-digit', day: '2-digit',
    hour: '2-digit', minute: '2-digit', hour12: false,
  }).format(date);
}

function toDateTimeLocal(value: string | null) {
  if (!value) return '';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '';
  const pad = (number: number) => String(number).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function toIso(value: string) {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

function downloadText(content: string, filename: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}

function readMapAspectRatio(dataUrl: string): Promise<number> {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => {
      const { naturalWidth, naturalHeight } = image;
      const aspectRatio = naturalWidth / naturalHeight;
      if (!naturalWidth || !naturalHeight || !Number.isFinite(aspectRatio)) {
        reject(new Error('도면 이미지의 가로·세로 크기를 확인하지 못했습니다.'));
        return;
      }
      resolve(aspectRatio);
    };
    image.onerror = () => reject(new Error('도면 이미지 형식을 확인하지 못했습니다. 다른 파일을 선택해 보세요.'));
    image.src = dataUrl;
  });
}

function StatusPill({
  status,
  type,
}: {
  status: TaskStatus | ObservationStatus;
  type: 'task' | 'observation';
}) {
  const label = type === 'task'
    ? TASK_LABEL[status as TaskStatus]
    : OBSERVATION_LABEL[status as ObservationStatus];
  const tone = type === 'task'
    ? TASK_TONE[status as TaskStatus]
    : OBSERVATION_TONE[status as ObservationStatus];
  return <span className={`fieldStatus fieldStatus--${tone}`}>{label}</span>;
}

function ZoneMarker({
  zone,
  selected,
  onSelect,
}: {
  zone: FieldZone;
  selected: boolean;
  onSelect: () => void;
}) {
  return (
    <button
      type="button"
      className={`fieldZoneMarker fieldZoneMarker--${OBSERVATION_TONE[zone.observationStatus]} ${selected ? 'fieldIsSelected' : ''}`}
      style={{ left: `${zone.x}%`, top: `${zone.y}%` }}
      onClick={(event) => {
        event.stopPropagation();
        onSelect();
      }}
      aria-pressed={selected}
      aria-label={`${zone.id}, ${TASK_LABEL[zone.taskStatus]}, ${OBSERVATION_LABEL[zone.observationStatus]}`}
    >
      <span>{String(zone.number).padStart(2, '0')}</span>
      <small>{zone.droneId ?? '—'}</small>
    </button>
  );
}

export default function OfflineBoardPage({ onBack }: { onBack: () => void }) {
  const [project, setProject] = useState<OfflineProject>(() => createOfflineProject());
  const [selectedZoneId, setSelectedZoneId] = useState('Z-01');
  const [narrowTab, setNarrowTab] = useState<NarrowTab>('map');
  const [interestMode, setInterestMode] = useState(false);
  const [mapAspectRatio, setMapAspectRatio] = useState<number | null>(null);
  const [isMapPreparing, setIsMapPreparing] = useState(false);
  const [notice, setNotice] = useState<BoardNotice>({
    tone: 'neutral',
    message: '초기 가상 현장 작업본을 열었습니다. 이 화면은 브라우저에 자동 보관하지 않습니다.',
  });
  const mapInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const projectRef = useRef(project);
  const mapLoadTokenRef = useRef(0);
  const projectLoadTokenRef = useRef(0);

  useEffect(() => {
    projectRef.current = project;
  }, [project]);

  useEffect(() => {
    if (!project.zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(project.zones[0]?.id ?? '');
    }
  }, [project, selectedZoneId]);

  const selectedZone = project.zones.find((zone) => zone.id === selectedZoneId) ?? project.zones[0];
  const report = useMemo(() => createUnresolvedReport(project), [project]);
  const issuesByZone = useMemo(() => {
    const grouped = new Map<string, typeof report.issues>();
    report.issues.forEach((issue) => {
      const existing = grouped.get(issue.zoneId) ?? [];
      grouped.set(issue.zoneId, [...existing, issue]);
    });
    return grouped;
  }, [report.issues]);
  const unresolvedZones = report.unresolvedZoneIds
    .map((zoneId) => project.zones.find((zone) => zone.id === zoneId))
    .filter((zone): zone is FieldZone => Boolean(zone));
  const confirmedCount = project.zones.filter((zone) => zone.observationStatus === 'confirmed').length;

  const setBoardNotice = (tone: NoticeTone, message: string) => setNotice({ tone, message });
  const replaceProject = (next: OfflineProject) => {
    projectRef.current = next;
    setProject(next);
  };

  const selectZone = (zoneId: string, moveToDetail = false) => {
    setSelectedZoneId(zoneId);
    if (moveToDetail) setNarrowTab('zones');
  };

  const updateSelectedZone = (patch: Partial<Omit<FieldZone, 'id' | 'number' | 'x' | 'y' | 'evidence'>>, message: string) => {
    if (!selectedZone) return;
    try {
      const next = updateZone(project, selectedZone.id, patch);
      replaceProject(next);
      setBoardNotice('success', message);
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '구역 기록을 바꾸지 못했습니다.');
    }
  };

  const handleMapSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const loadToken = mapLoadTokenRef.current + 1;
    mapLoadTokenRef.current = loadToken;
    const mime = file.type;
    if (!isSupportedMapType(mime)) {
      setIsMapPreparing(false);
      setBoardNotice('error', '도면은 PNG, JPEG 또는 WebP 파일만 선택할 수 있습니다.');
      return;
    }
    if (file.size > MAX_IMAGE_BYTES) {
      setIsMapPreparing(false);
      setBoardNotice('error', `도면 파일이 ${Math.round(MAX_IMAGE_BYTES / 1024 / 1024)}MB 제한을 넘습니다.`);
      return;
    }

    setInterestMode(false);
    setIsMapPreparing(true);
    setBoardNotice('neutral', `“${file.name}” 도면의 실제 크기를 확인하는 중입니다. 준비가 끝날 때까지 관심 지점을 추가할 수 없습니다.`);
    const reader = new FileReader();
    reader.onerror = () => {
      if (mapLoadTokenRef.current !== loadToken) return;
      setIsMapPreparing(false);
      setBoardNotice('error', '도면 파일을 읽지 못했습니다. 다른 파일을 선택해 보세요.');
    };
    reader.onload = async () => {
      if (mapLoadTokenRef.current !== loadToken) return;
      if (typeof reader.result !== 'string') {
        setIsMapPreparing(false);
        setBoardNotice('error', '도면 파일 형식을 읽지 못했습니다.');
        return;
      }
      try {
        const aspectRatio = await readMapAspectRatio(reader.result);
        if (mapLoadTokenRef.current !== loadToken) return;
        const next = setMap(projectRef.current, {
          name: file.name,
          mime,
          dataUrl: reader.result,
          bytes: file.size,
        });
        setMapAspectRatio(aspectRatio);
        replaceProject(next);
        setIsMapPreparing(false);
        setBoardNotice('success', `“${file.name}” 도면을 현재 작업본에 반영했습니다.`);
      } catch (error) {
        if (mapLoadTokenRef.current !== loadToken) return;
        setIsMapPreparing(false);
        setBoardNotice('error', error instanceof Error ? error.message : '도면을 현재 작업본에 반영하지 못했습니다.');
      }
    };
    reader.readAsDataURL(file);
  };

  const handleProjectLoad = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const loadToken = projectLoadTokenRef.current + 1;
    projectLoadTokenRef.current = loadToken;
    const projectAtLoadStart = projectRef.current;
    if (file.size > MAX_PROJECT_BYTES) {
      setBoardNotice('error', `프로젝트 JSON이 ${Math.round(MAX_PROJECT_BYTES / 1024 / 1024)}MB 제한을 넘습니다.`);
      return;
    }

    setBoardNotice('neutral', `“${file.name}” 프로젝트 JSON을 읽는 중입니다. 읽는 동안 편집하면 완료 시 교체 여부를 확인합니다.`);
    const reader = new FileReader();
    reader.onerror = () => {
      if (projectLoadTokenRef.current !== loadToken) return;
      setBoardNotice('error', '프로젝트 JSON을 읽지 못했습니다. 파일을 다시 확인해 주세요.');
    };
    reader.onload = async () => {
      if (projectLoadTokenRef.current !== loadToken) return;
      const loaded = parseOfflineProject(String(reader.result ?? ''), file.size);
      if (!loaded.ok) {
        setBoardNotice('error', loaded.message);
        return;
      }

      let loadedMapAspectRatio: number | null = null;
      if (loaded.project.map) {
        try {
          loadedMapAspectRatio = await readMapAspectRatio(loaded.project.map.dataUrl);
        } catch (error) {
          if (projectLoadTokenRef.current !== loadToken) return;
          setBoardNotice('error', error instanceof Error ? error.message : '프로젝트 도면을 준비하지 못했습니다. 현재 작업본은 유지합니다.');
          return;
        }
      }

      if (projectLoadTokenRef.current !== loadToken) return;
      if (projectRef.current !== projectAtLoadStart) {
        const shouldReplace = window.confirm(`“${file.name}” 프로젝트를 읽는 동안 현재 작업본이 변경되었습니다. 현재 편집을 이 파일의 작업본으로 교체하시겠습니까? 취소하면 현재 편집을 유지합니다.`);
        if (projectLoadTokenRef.current !== loadToken) return;
        if (!shouldReplace) {
          setBoardNotice('warning', '프로젝트 불러오기를 취소했습니다. 현재 편집을 그대로 유지합니다.');
          return;
        }
      }

      setMapAspectRatio(loadedMapAspectRatio);
      replaceProject(loaded.project);
      setSelectedZoneId(loaded.project.zones[0]?.id ?? '');
      setInterestMode(false);
      setBoardNotice('success', `“${file.name}”의 현장 작업본을 화면에 불러왔습니다.`);
    };
    reader.readAsText(file, 'utf-8');
  };

  const saveProject = () => {
    try {
      downloadText(
        serializeOfflineProject(project),
        `${project.title.replace(/[^가-힣a-zA-Z0-9_-]/g, '-') || '현장-작업본'}.json`,
        'application/json;charset=utf-8',
      );
      setBoardNotice('success', '현재 작업본 JSON을 내려받기 파일로 만들었습니다.');
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '프로젝트 JSON을 만들지 못했습니다.');
    }
  };

  const downloadReport = () => {
    try {
      downloadText(
        reportHtml(report),
        `${project.title.replace(/[^가-힣a-zA-Z0-9_-]/g, '-') || '현장-작업본'}-미해결-점검.html`,
        'text/html;charset=utf-8',
      );
      setBoardNotice('success', '미해결 구역 보고서 HTML을 내려받기 파일로 만들었습니다.');
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '보고서 HTML을 만들지 못했습니다.');
    }
  };

  const handlePrint = () => {
    setNarrowTab('inspection');
    setBoardNotice('neutral', '인쇄 대화상자를 열었습니다. 인쇄 내용은 미해결 구역 점검 미리보기입니다.');
    window.setTimeout(() => window.print(), 0);
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    if (isMapPreparing) {
      setBoardNotice('warning', '새 도면을 준비하는 중입니다. 도면의 실제 크기 확인이 끝난 뒤 관심 지점을 추가해 주세요.');
      return;
    }
    if (!interestMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clamp = (value: number) => Math.min(100, Math.max(0, value));
    const x = Number(clamp(((event.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const y = Number(clamp(((event.clientY - rect.top) / rect.height) * 100).toFixed(2));
    try {
      const nextNumber = project.points.length + 1;
      const next = addInterestPoint(project, {
        x,
        y,
        label: `관심 지점 ${nextNumber}`,
        memo: '',
      });
      replaceProject(next);
      setBoardNotice('success', `관심 지점 ${nextNumber}을(를) 도면 좌표 ${x}%, ${y}%에 추가했습니다.`);
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '관심 지점을 추가하지 못했습니다.');
    }
  };

  const addZoneEvidence = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedZone) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get('label') ?? '').trim();
    const memo = String(data.get('memo') ?? '').trim();
    if (!label) {
      setBoardNotice('warning', '자료 참조명을 입력해 주세요.');
      return;
    }
    try {
      replaceProject(addEvidence(project, selectedZone.id, { label, memo }));
      form.reset();
      setBoardNotice('success', `${selectedZone.id}에 자료 참조를 추가했습니다.`);
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '자료 참조를 추가하지 못했습니다.');
    }
  };

  const handleObservationStatus = (status: ObservationStatus) => {
    if (!selectedZone) return;
    if (status === 'confirmed') {
      updateSelectedZone({
        observationStatus: status,
        confirmedBy: selectedZone.confirmedBy?.trim() || '현장 운영자',
        confirmedAt: selectedZone.confirmedAt || new Date().toISOString(),
      }, `${selectedZone.id}의 관측 상태를 확인 완료로 기록했습니다.`);
      return;
    }
    updateSelectedZone({
      observationStatus: status,
      confirmedBy: null,
      confirmedAt: null,
    }, `${selectedZone.id}의 관측 상태를 ${OBSERVATION_LABEL[status]}으로 기록했습니다.`);
  };

  return (
    <div className="fieldShell">
      <header className="fieldHeader">
        <div className="fieldBrand">
          <button className="fieldBack" type="button" onClick={onBack}><ArrowLeft size={16} /> 소개</button>
          <span className="fieldMark" aria-hidden="true">S<span>?</span></span>
          <div>
            <p>TEAM S? · OFFLINE FIELD BOARD</p>
            <h1>오프라인 현장 수색 상황판</h1>
          </div>
        </div>
        <div className="fieldHeaderActions">
          <span className="fieldSimulation"><Info size={15} /> 가상 현장 기록</span>
          <input ref={mapInputRef} className="fieldSrOnly" type="file" accept="image/png,image/jpeg,image/webp" aria-label="현장 도면 파일 선택" onChange={handleMapSelect} />
          <input ref={projectInputRef} className="fieldSrOnly" type="file" accept="application/json,.json" aria-label="프로젝트 JSON 파일 불러오기" onChange={handleProjectLoad} />
          <button type="button" className="button subtle small" onClick={() => mapInputRef.current?.click()}><FileImage size={15} /> 도면 선택</button>
          <button type="button" className="button subtle small" onClick={saveProject}><Save size={15} /> 프로젝트 저장</button>
          <button type="button" className="button subtle small" onClick={() => projectInputRef.current?.click()}><FolderOpen size={15} /> 프로젝트 불러오기</button>
          <button type="button" className="button subtle small" onClick={downloadReport}><Download size={15} /> 보고서 HTML</button>
          <button type="button" className="button subtle small" onClick={handlePrint}><Printer size={15} /> 인쇄</button>
        </div>
      </header>

      <main className="fieldMain">
        <section className="fieldOverview" aria-label="현장 상황판 안내">
          <div>
            <p className="fieldEyebrow">OFFLINE FIELD WORKSPACE · VIRTUAL DEMO</p>
            <h2>{project.title}</h2>
            <p>도면·구역 기록·관심 지점·점검 목록을 한 화면에서 검토하는 가상 현장 작업본입니다. 실제 GIS 지도, 좌표 보정, GPS, 기체 제어 또는 영상 자료와 연결하지 않습니다.</p>
          </div>
          <div className="fieldMetrics" aria-label="현재 작업본 요약">
            <span><b>{project.zones.length}</b> 구역</span>
            <span><b>{project.points.length}</b> 관심 지점</span>
            <span><b>{confirmedCount}</b> 관측 확인</span>
            <span className={report.issues.length ? 'fieldMetric--amber' : ''}><b>{report.issues.length}</b> 점검 항목</span>
          </div>
        </section>

        <section className={`fieldNotice fieldNotice--${notice.tone}`} aria-live="polite">
          {notice.tone === 'error' || notice.tone === 'warning' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
          <span><b>작업 안내</b> {notice.message}</span>
          <small>도면과 JSON은 이 브라우저에서 선택·읽기·내려받기만 합니다. 서버 보관이나 공유 기능은 제공하지 않습니다.</small>
        </section>

        <nav className="fieldTabs" aria-label="현장 상황판 탭">
          <button type="button" aria-pressed={narrowTab === 'map'} onClick={() => setNarrowTab('map')}>도면</button>
          <button type="button" aria-pressed={narrowTab === 'zones'} onClick={() => setNarrowTab('zones')}>구역</button>
          <button type="button" aria-pressed={narrowTab === 'inspection'} onClick={() => setNarrowTab('inspection')}>점검</button>
        </nav>

        <section className="fieldWorkspace" data-tab={narrowTab}>
          <aside className="fieldPanel fieldListPanel" aria-label="구역 및 관심 지점 목록">
            <div className="fieldPanelHeading">
              <div><p className="fieldEyebrow">ZONE &amp; POINT LIST</p><h3>구역 / 관심 지점</h3></div>
              <ListTree size={18} />
            </div>
            <p className="fieldPanelDescription">구역을 선택하면 기록과 자료 참조를 수정할 수 있습니다.</p>
            <div className="fieldZoneList">
              {project.zones.map((zone) => {
                const selected = zone.id === selectedZone?.id;
                const issueCount = issuesByZone.get(zone.id)?.length ?? 0;
                return (
                  <button
                    type="button"
                    className={`fieldZoneRow ${selected ? 'fieldIsSelected' : ''}`}
                    key={zone.id}
                    onClick={() => selectZone(zone.id, true)}
                    aria-pressed={selected}
                  >
                    <span className="fieldZoneNumber">{String(zone.number).padStart(2, '0')}</span>
                    <span className="fieldZoneRowCopy">
                      <b>{zone.id}</b>
                      <small>기체 {zone.droneId ?? '없음'} · 자료 {zone.evidence.length}건</small>
                      <span><StatusPill status={zone.taskStatus} type="task" /><StatusPill status={zone.observationStatus} type="observation" /></span>
                    </span>
                    {issueCount > 0 ? <em>{issueCount}</em> : null}
                  </button>
                );
              })}
            </div>
            <section className="fieldPointList" aria-label="관심 지점 목록">
              <div><MapPin size={15} /><b>관심 지점</b><span>{project.points.length}</span></div>
              {project.points.length ? (
                <ul>
                  {project.points.map((point) => <li key={point.id}><b>{point.label}</b><span>{point.x.toFixed(1)}%, {point.y.toFixed(1)}%{point.memo ? ` · ${point.memo}` : ''}</span></li>)}
                </ul>
              ) : <p>도면에서 관심 지점 추가를 켠 뒤 위치를 선택해 보세요.</p>}
            </section>
          </aside>

          <section className="fieldPanel fieldMapPanel" aria-label="현장 도면">
            <div className="fieldPanelHeading fieldMapHeading">
              <div><p className="fieldEyebrow">FIELD DRAWING</p><h3>현장 도면</h3></div>
              <span className="fieldCoordinateLabel"><MapPinned size={15} /> 좌표 보정 전</span>
            </div>
            <p className="fieldMapNote"><Info size={15} /> 도면은 파일로 선택한 이미지 또는 격자 자리표시자입니다. 실제 GIS 지도가 아닙니다.</p>
            <div className="fieldMapTools">
              <button
                type="button"
                className={`button ${interestMode ? 'primary' : 'subtle'} small`}
                disabled={isMapPreparing}
                title={isMapPreparing ? '새 도면을 준비하는 동안 관심 지점을 추가할 수 없습니다.' : undefined}
                onClick={() => {
                  setInterestMode((value) => !value);
                  setBoardNotice('neutral', interestMode ? '관심 지점 추가를 마쳤습니다.' : '도면의 빈 위치를 선택하면 관심 지점을 추가합니다.');
                }}
                aria-pressed={interestMode}
              >
                <Plus size={15} /> 관심 지점 {interestMode ? '추가 중' : '추가'}
              </button>
              {project.map ? <span><FileImage size={14} /> {project.map.name}</span> : <span>선택한 도면 없음 · 격자 표시</span>}
            </div>
            {isMapPreparing ? <p className="fieldMapPreparing" role="status">새 도면의 실제 가로·세로 비율을 확인하고 있습니다. 준비가 끝날 때까지 관심 지점 추가는 잠시 막습니다.</p> : null}
            <div
              className={`fieldMapStage ${interestMode ? 'fieldIsPointing' : ''} ${isMapPreparing ? 'fieldIsPreparing' : ''}`}
              style={{ aspectRatio: mapAspectRatio ? `${mapAspectRatio} / 1` : '4 / 3' }}
              onClick={handleMapClick}
              role={interestMode ? 'button' : undefined}
              tabIndex={interestMode ? 0 : undefined}
              aria-busy={isMapPreparing}
              aria-label={interestMode ? '관심 지점을 추가할 도면 영역' : '현장 도면 영역'}
              onKeyDown={(event) => {
                if (interestMode && (event.key === 'Enter' || event.key === ' ')) {
                  event.preventDefault();
                  setBoardNotice('warning', '키보드로는 위치 좌표를 정할 수 없습니다. 도면의 원하는 위치를 선택해 주세요.');
                }
              }}
            >
              {project.map ? <img src={project.map.dataUrl} alt={`${project.map.name} 현장 도면`} className="fieldMapImage" /> : null}
              <div className="fieldGridPlaceholder" aria-hidden="true" />
              {project.zones.map((zone) => <ZoneMarker key={zone.id} zone={zone} selected={zone.id === selectedZone?.id} onSelect={() => selectZone(zone.id, true)} />)}
              {project.points.map((point) => (
                <button
                  type="button"
                  className="fieldPointMarker"
                  key={point.id}
                  style={{ left: `${point.x}%`, top: `${point.y}%` }}
                  onClick={(event) => {
                    event.stopPropagation();
                    setBoardNotice('neutral', `${point.label} · 도면 좌표 ${point.x.toFixed(1)}%, ${point.y.toFixed(1)}%`);
                  }}
                  aria-label={`${point.label}, 도면 좌표 ${point.x.toFixed(1)}%, ${point.y.toFixed(1)}%`}
                ><MapPin size={16} /></button>
              ))}
              {!project.map ? <p className="fieldMapPlaceholderText">도면 없음<br /><span>점선 격자 위에서 구역과 관심 지점을 검토합니다.</span></p> : null}
              <span className="fieldMapCaption fieldMapCaption--top">현장 도면 · 좌표 보정 전</span>
              <span className="fieldMapCaption fieldMapCaption--bottom">실제 GIS 지도 아님</span>
            </div>
            <p className="fieldMapFootnote">자료 유무와 관측 상태는 수색 성공, 인명 발견·부재 또는 안전을 뜻하지 않습니다.</p>
          </section>

          <aside className="fieldPanel fieldDetailPanel" aria-label="선택 구역 기록 및 점검 보고">
            <div className="fieldDetailBlock">
              <div className="fieldPanelHeading">
                <div><p className="fieldEyebrow">SELECTED ZONE · RECORD</p><h3>{selectedZone ? `${selectedZone.id} 기록` : '선택 구역 없음'}</h3></div>
                <ClipboardCheck size={18} />
              </div>
              {selectedZone ? <>
                <div className="fieldSelectionSummary">
                  <span>{String(selectedZone.number).padStart(2, '0')}</span>
                  <div><small>현재 담당</small><b>기체 {selectedZone.droneId ?? '없음'}</b><p>마지막 변경: {formatTime(selectedZone.updatedAt)}</p></div>
                </div>
                <div className="fieldStatusPair"><StatusPill status={selectedZone.taskStatus} type="task" /><StatusPill status={selectedZone.observationStatus} type="observation" /></div>

                <section className="fieldCard">
                  <h4>구역 정보</h4>
                  <div className="fieldFormGrid">
                    <label className="fieldFormLabel">담당 기체
                      <select value={selectedZone.droneId ?? ''} onChange={(event) => updateSelectedZone({ droneId: (event.target.value || null) as DroneId | null }, `${selectedZone.id}의 담당 기체를 변경했습니다.`)}>
                        <option value="">없음</option>
                        {DRONES.map((drone) => <option key={drone} value={drone}>기체 {drone}</option>)}
                      </select>
                    </label>
                    <label className="fieldFormLabel">작업 상태
                      <select value={selectedZone.taskStatus} onChange={(event) => updateSelectedZone({ taskStatus: event.target.value as TaskStatus }, `${selectedZone.id}의 작업 상태를 ${TASK_LABEL[event.target.value as TaskStatus]}으로 기록했습니다.`)}>
                        <option value="unassigned">작업 없음</option>
                        <option value="assigned">배정됨</option>
                        <option value="in_progress">진행 중</option>
                        <option value="completed">완료</option>
                        <option value="interrupted">중단</option>
                      </select>
                    </label>
                  </div>
                  <label className="fieldFormLabel">관측 상태
                    <select value={selectedZone.observationStatus} onChange={(event) => handleObservationStatus(event.target.value as ObservationStatus)}>
                      <option value="unverified">미확인</option>
                      <option value="confirmed">확인 완료</option>
                      <option value="recheck">재확인 필요</option>
                    </select>
                  </label>
                  <label className="fieldFormLabel">관측 사유
                    <textarea rows={2} value={selectedZone.reviewReason} onChange={(event) => updateSelectedZone({ reviewReason: event.target.value }, `${selectedZone.id}의 관측 사유를 기록했습니다.`)} placeholder="예: 시야 가림으로 추가 관측이 필요함" />
                  </label>
                  <label className="fieldFormLabel">현장 메모
                    <textarea rows={3} value={selectedZone.memo} onChange={(event) => updateSelectedZone({ memo: event.target.value }, `${selectedZone.id}의 현장 메모를 기록했습니다.`)} placeholder="가상 현장 메모를 입력하세요" />
                  </label>
                  {selectedZone.observationStatus === 'confirmed' ? <div className="fieldConfirmFields">
                    <p><Info size={14} /> 확인 완료는 수색 성과나 안전을 뜻하지 않습니다.</p>
                    <label className="fieldFormLabel">확인자
                      <input value={selectedZone.confirmedBy ?? ''} onChange={(event) => updateSelectedZone({ confirmedBy: event.target.value || null }, `${selectedZone.id}의 확인자 기록을 변경했습니다.`)} placeholder="현장 운영자" />
                    </label>
                    <label className="fieldFormLabel">확인 시각
                      <input type="datetime-local" value={toDateTimeLocal(selectedZone.confirmedAt)} onChange={(event) => updateSelectedZone({ confirmedAt: toIso(event.target.value) }, `${selectedZone.id}의 확인 시각을 변경했습니다.`)} />
                    </label>
                  </div> : null}
                </section>

                <section className="fieldCard">
                  <h4><FileText size={16} /> 자료 참조 <span>{selectedZone.evidence.length}</span></h4>
                  <p className="fieldHint">실제 파일을 보관하지 않습니다. 자료를 구분하기 위한 참조명과 메모만 기록합니다.</p>
                  {selectedZone.evidence.length ? <ul className="fieldEvidenceList">
                    {selectedZone.evidence.map((evidence) => <li key={evidence.id}><b>{evidence.label}</b><small>{formatTime(evidence.addedAt)}</small>{evidence.memo ? <p>{evidence.memo}</p> : null}</li>)}
                  </ul> : <p className="fieldEmptySmall">아직 자료 참조가 없습니다.</p>}
                  <form className="fieldEvidenceForm" onSubmit={addZoneEvidence}>
                    <label className="fieldFormLabel">자료 참조명<input name="label" required placeholder="예: 가상 관측 메모 추가본" /></label>
                    <label className="fieldFormLabel">메모<textarea name="memo" rows={2} placeholder="파일이 아닌 텍스트 메모" /></label>
                    <button className="button subtle small" type="submit"><Plus size={14} /> 자료 참조 추가</button>
                  </form>
                </section>
              </> : <p className="fieldEmpty">불러온 프로젝트에 선택할 구역이 없습니다.</p>}
            </div>

            <section className="fieldInspection" aria-label="점검 및 보고서 미리보기">
              <div className="fieldInspectionHeading">
                <div><p className="fieldEyebrow">INSPECTION · REPORT</p><h3>점검 / 보고</h3></div>
                <span className={report.issues.length ? 'fieldIsAttention' : ''}>{report.issues.length}건</span>
              </div>
              <p className="fieldInspectionNote">점검 항목은 내려받기나 내보내기를 막지 않습니다. 자료 유무와 상태는 수색 성공, 인명 발견·부재 또는 안전을 뜻하지 않습니다.</p>
              <div className="fieldIssueList">
                {report.issues.length ? report.issues.map((issue) => (
                  <button type="button" className={`fieldIssue fieldIssue--${issue.severity}`} key={issue.id} onClick={() => {
                    selectZone(issue.zoneId, true);
                    setBoardNotice('neutral', `${issue.zoneId}의 점검 항목을 열었습니다.`);
                  }}>
                    <span>{issue.severity === 'attention' ? '!' : 'i'}</span><div><b>{issue.zoneId} · {issue.title}</b><p>{issue.message}</p></div>
                  </button>
                )) : <p className="fieldAllClear"><CheckCircle2 size={16} /> 현재 점검할 항목이 없습니다.</p>}
              </div>

              <div className="fieldReportPreview">
                <div><h4>미해결 구역 보고서 미리보기</h4><span>{formatTime(report.generatedAt)}</span></div>
                <p>{project.title} · 도면 {project.map?.name ?? '선택 없음'} · 전체 {project.zones.length}개 구역</p>
                {unresolvedZones.length ? <ul>
                  {unresolvedZones.map((zone) => <li key={zone.id}>
                    <b>{zone.id} · 자료 {zone.evidence.length}건</b>
                    <span>{(issuesByZone.get(zone.id) ?? []).map((issue) => issue.title).join(' · ')}</span>
                    {zone.evidence.length ? <small>자료 참조: {zone.evidence.map((evidence) => evidence.label).join(', ')}</small> : null}
                  </li>)}
                </ul> : <p className="fieldEmptySmall">현재 미해결 구역이 없습니다.</p>}
                <small className="fieldLimitNote">이 보고서는 수색 종료·안전·인명 부재를 판정하지 않습니다.</small>
                <div className="fieldReportActions">
                  <button type="button" className="button subtle small" onClick={downloadReport}><Download size={14} /> HTML 내려받기</button>
                  <button type="button" className="button subtle small" onClick={handlePrint}><Printer size={14} /> 인쇄</button>
                </div>
              </div>
            </section>
          </aside>
        </section>
      </main>
    </div>
  );
}
