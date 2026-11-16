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
  Trash2,
  WifiOff,
} from 'lucide-react';
import type { DroneId, ObservationStatus, TaskStatus } from '../types';
import { prepareImageFile, readImageAspectRatio } from './imageFile';
import {
  addEvidence,
  addInterestPoint,
  addPhotoEvidence,
  approveHandover,
  cancelInterruption,
  createEmptyProject,
  createOfflineProject,
  interruptZone,
  isSupportedMapType,
  MAX_IMAGE_BYTES,
  MAX_PHOTO_BYTES,
  MAX_PROJECT_BYTES,
  parseOfflineProject,
  removeEvidence,
  removeInterestPoint,
  serializeOfflineProject,
  setMap,
  updateInterestPoint,
  updateZone,
  type FieldZone,
  type OfflineProject,
} from './model';
import { createUnresolvedReport, reportHtml } from './report';
import { readBoard, writeBoard, type BoardMode } from './storage';
import './offline.css';

type NarrowTab = 'map' | 'zones' | 'inspection';
type NoticeTone = 'neutral' | 'success' | 'warning' | 'error';
type BoardNotice = { tone: NoticeTone; message: string };
type PendingDialog = 'reset' | 'cancel-interrupt' | 'replace-import' | null;

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

function withEuro(label: string) {
  const code = label.charCodeAt(label.length - 1);
  if (Number.isNaN(code) || code < 0xac00 || code > 0xd7a3) return `${label}로`;
  const batchim = (code - 0xac00) % 28;
  return `${label}${batchim === 0 || batchim === 8 ? '로' : '으로'}`;
}

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
  window.setTimeout(() => URL.revokeObjectURL(url), 1500);
}

function freshProject(mode: BoardMode) {
  return mode === 'field' ? createEmptyProject() : createOfflineProject();
}

function StatusPill({ status, type }: { status: TaskStatus | ObservationStatus; type: 'task' | 'observation' }) {
  const label = type === 'task' ? TASK_LABEL[status as TaskStatus] : OBSERVATION_LABEL[status as ObservationStatus];
  const tone = type === 'task' ? TASK_TONE[status as TaskStatus] : OBSERVATION_TONE[status as ObservationStatus];
  return <span className={`fieldStatus fieldStatus--${tone}`}>{label}</span>;
}

function ZoneMarker({ zone, selected, onSelect }: { zone: FieldZone; selected: boolean; onSelect: () => void }) {
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
      aria-label={`${zone.id}, 작업 ${TASK_LABEL[zone.taskStatus]}, 관측 ${OBSERVATION_LABEL[zone.observationStatus]}`}
    >
      <span>{String(zone.number).padStart(2, '0')}</span>
      <small>{zone.droneId ?? '—'}</small>
    </button>
  );
}

export default function OfflineBoardPage({
  mode,
  onBack,
  onMode,
}: {
  mode: BoardMode;
  onBack: () => void;
  onMode: (mode: BoardMode) => void;
}) {
  const [project, setProject] = useState<OfflineProject | null>(null);
  const [storageReady, setStorageReady] = useState(false);
  const [storageNote, setStorageNote] = useState('이 기기의 기록을 확인하고 있습니다.');
  const [selectedZoneId, setSelectedZoneId] = useState(() => sessionStorage.getItem(`s-board-zone-${mode}`) || 'Z-01');
  const [narrowTab, setNarrowTab] = useState<NarrowTab>('map');
  const [interestMode, setInterestMode] = useState(false);
  const [mapAspectRatio, setMapAspectRatio] = useState<number | null>(null);
  const [isMapPreparing, setIsMapPreparing] = useState(false);
  const [online, setOnline] = useState(() => navigator.onLine);
  const [notice, setNotice] = useState<BoardNotice>({
    tone: 'neutral',
    message: '기록을 불러오는 중입니다.',
  });
  const [draft, setDraft] = useState({ reviewReason: '', memo: '', confirmedBy: '' });
  const [interruptReason, setInterruptReason] = useState('');
  const [approvalReason, setApprovalReason] = useState('');
  const [approvedBy, setApprovedBy] = useState('현장 운영자');
  const [nextDrone, setNextDrone] = useState<DroneId>('A');
  const [handoverChecked, setHandoverChecked] = useState(false);
  const [dialog, setDialog] = useState<PendingDialog>(null);
  const [photoName, setPhotoName] = useState('');
  const [pendingImport, setPendingImport] = useState<OfflineProject | null>(null);
  const mapInputRef = useRef<HTMLInputElement>(null);
  const projectInputRef = useRef<HTMLInputElement>(null);
  const photoInputRef = useRef<HTMLInputElement>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const projectRef = useRef<OfflineProject | null>(null);
  const loadedModeRef = useRef<BoardMode | null>(null);
  const saveChainRef = useRef(Promise.resolve());
  const mapLoadTokenRef = useRef(0);
  const projectLoadTokenRef = useRef(0);

  const replaceProject = (next: OfflineProject) => {
    projectRef.current = next;
    setProject(next);
  };

  useEffect(() => {
    let cancelled = false;
    loadedModeRef.current = null;
    setStorageReady(false);
    setProject(null);
    projectRef.current = null;
    setStorageNote('이 기기의 기록을 확인하고 있습니다.');
    readBoard(mode).then((result) => {
      if (cancelled) return;
      if (result.status === 'ok') {
        replaceProject(result.project);
        loadedModeRef.current = mode;
        setStorageReady(true);
        setStorageNote('이 기기에 저장된 기록을 열었습니다. 다른 기기와는 동기화되지 않습니다.');
        setNotice({ tone: 'success', message: mode === 'practice' ? '연습 모드 기록을 이어서 열었습니다.' : '현장 모드 기록을 이어서 열었습니다.' });
        return;
      }
      const fresh = freshProject(mode);
      replaceProject(fresh);
      if (result.status === 'invalid') {
        setStorageReady(false);
        setStorageNote(`저장된 기록을 읽지 못했습니다. ${result.message} 초기화를 확인하기 전에는 이 기기 저장본을 덮어쓰지 않습니다.`);
        setNotice({ tone: 'warning', message: '저장본 형식이 맞지 않습니다. 백업 파일이 있으면 불러오고, 없으면 초기화로 새 기록을 저장하세요.' });
        return;
      }
      loadedModeRef.current = mode;
      setStorageReady(true);
      setStorageNote(mode === 'field'
        ? '빈 현장 기록을 시작했습니다. 이후 변경은 이 기기에 자동 저장됩니다.'
        : '연습용 가상 자료를 열었습니다. 이후 변경은 이 기기에 자동 저장됩니다.');
      setNotice({
        tone: 'neutral',
        message: mode === 'field'
          ? '현장 모드는 빈 구역 12개에서 시작합니다. 실제 기체나 좌표는 연결되지 않습니다.'
          : '연습 모드는 가상 구역 자료입니다. Z-07을 중단하면 승인 인계를 시험할 수 있습니다.',
      });
    }).catch(() => {
      if (cancelled) return;
      replaceProject(freshProject(mode));
      setStorageReady(false);
      setStorageNote('브라우저 저장소를 열지 못했습니다. 새로고침하면 저장되지 않은 변경이 사라질 수 있으니 백업 파일을 받아 두세요.');
      setNotice({ tone: 'error', message: '이 기기 자동 저장을 시작하지 못했습니다.' });
    });
    return () => { cancelled = true; };
  }, [mode]);

  useEffect(() => {
    if (!storageReady || !project || loadedModeRef.current !== mode) return;
    const snapshot = project;
    const activeMode = mode;
    saveChainRef.current = saveChainRef.current
      .catch(() => undefined)
      .then(async () => {
        if (loadedModeRef.current !== activeMode || projectRef.current !== snapshot) return;
        await writeBoard(activeMode, snapshot);
        if (projectRef.current === snapshot) {
          setStorageNote(`이 기기에 자동 저장했습니다 · ${formatTime(snapshot.updatedAt)}. 서버에는 올라가지 않습니다.`);
        }
      })
      .catch(() => {
        if (projectRef.current === snapshot) setStorageNote('자동 저장에 실패했습니다. 백업 파일을 내려받아 두세요.');
      });
  }, [mode, project, storageReady]);

  useEffect(() => {
    const flush = () => {
      const snapshot = projectRef.current;
      const activeMode = loadedModeRef.current;
      if (!storageReady || !snapshot || activeMode !== mode) return;
      saveChainRef.current = saveChainRef.current
        .catch(() => undefined)
        .then(() => writeBoard(activeMode, snapshot));
    };
    window.addEventListener('pagehide', flush);
    return () => window.removeEventListener('pagehide', flush);
  }, [mode, storageReady]);

  useEffect(() => {
    const sync = () => setOnline(navigator.onLine);
    window.addEventListener('online', sync);
    window.addEventListener('offline', sync);
    window.addEventListener('pageshow', sync);
    return () => {
      window.removeEventListener('online', sync);
      window.removeEventListener('offline', sync);
      window.removeEventListener('pageshow', sync);
    };
  }, []);

  useEffect(() => {
    if (!project?.map) {
      setMapAspectRatio(null);
      return;
    }
    let cancelled = false;
    readImageAspectRatio(project.map.dataUrl).then((ratio) => {
      if (!cancelled) setMapAspectRatio(ratio);
    }).catch(() => {
      if (!cancelled) setMapAspectRatio(null);
    });
    return () => { cancelled = true; };
  }, [project?.map?.dataUrl]);

  useEffect(() => {
    const dialogNode = dialogRef.current;
    if (!dialogNode) return;
    if (dialog && !dialogNode.open) dialogNode.showModal();
    if (!dialog && dialogNode.open) dialogNode.close();
  }, [dialog]);

  const selectedZone = project?.zones.find((zone) => zone.id === selectedZoneId) ?? project?.zones[0] ?? null;

  useEffect(() => {
    if (!project) return;
    if (!project.zones.some((zone) => zone.id === selectedZoneId)) {
      setSelectedZoneId(project.zones[0]?.id ?? 'Z-01');
    }
  }, [project, selectedZoneId]);

  useEffect(() => {
    if (!selectedZone) return;
    setDraft({
      reviewReason: selectedZone.reviewReason,
      memo: selectedZone.memo,
      confirmedBy: selectedZone.confirmedBy ?? '',
    });
  }, [selectedZone?.id, selectedZone?.reviewReason, selectedZone?.memo, selectedZone?.confirmedBy]);

  useEffect(() => {
    setInterruptReason('');
    setApprovalReason('');
    setHandoverChecked(false);
    const current = selectedZone?.interruption?.fromDrone ?? selectedZone?.droneId;
    setNextDrone(current === 'A' ? 'C' : 'A');
  }, [selectedZone?.id]);

  const report = useMemo(() => (project ? createUnresolvedReport(project) : null), [project]);
  const issuesByZone = useMemo(() => {
    const grouped = new Map<string, NonNullable<typeof report>['issues']>();
    report?.issues.forEach((issue) => {
      const existing = grouped.get(issue.zoneId) ?? [];
      grouped.set(issue.zoneId, [...existing, issue]);
    });
    return grouped;
  }, [report]);
  const unresolvedZones = report?.unresolvedZoneIds
    .map((zoneId) => project?.zones.find((zone) => zone.id === zoneId))
    .filter((zone): zone is FieldZone => Boolean(zone)) ?? [];
  const confirmedCount = project?.zones.filter((zone) => zone.observationStatus === 'confirmed').length ?? 0;
  const droneCounts = DRONES.map((drone) => ({
    drone,
    count: project?.zones.filter((zone) => zone.droneId === drone).length ?? 0,
  }));

  const setBoardNotice = (tone: NoticeTone, message: string) => setNotice({ tone, message });

  const runMutation = (mutate: (current: OfflineProject) => OfflineProject, message: string) => {
    const current = projectRef.current;
    if (!current) return;
    try {
      replaceProject(mutate(current));
      setBoardNotice('success', message);
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '기록을 바꾸지 못했습니다.');
    }
  };

  const updateSelectedZone = (patch: Partial<Omit<FieldZone, 'id' | 'number' | 'x' | 'y' | 'evidence' | 'interruption' | 'handovers'>>, message: string) => {
    if (!selectedZone) return;
    runMutation((current) => updateZone(current, selectedZone.id, patch), message);
  };

  const selectZone = (zoneId: string, moveToDetail = false) => {
    setSelectedZoneId(zoneId);
    sessionStorage.setItem(`s-board-zone-${mode}`, zoneId);
    if (moveToDetail) setNarrowTab('zones');
  };

  useEffect(() => {
    const saved = sessionStorage.getItem(`s-board-zone-${mode}`);
    if (saved) setSelectedZoneId(saved);
  }, [mode]);

  const handleMapSelect = (event: ChangeEvent<HTMLInputElement>) => {
    const input = event.currentTarget;
    const file = input.files?.[0];
    input.value = '';
    if (!file) return;
    const loadToken = mapLoadTokenRef.current + 1;
    mapLoadTokenRef.current = loadToken;
    const declared = file.type === 'image/jpg' ? 'image/jpeg' : file.type;
    if (declared && !isSupportedMapType(declared)) {
      setBoardNotice('error', '도면은 PNG, JPEG 또는 WebP 파일만 선택할 수 있습니다.');
      return;
    }
    setInterestMode(false);
    setIsMapPreparing(true);
    setBoardNotice('neutral', `“${file.name || '도면'}” 크기를 확인하고 있습니다. 준비 중에는 관심 지점을 추가할 수 없습니다.`);
    prepareImageFile(file, MAX_IMAGE_BYTES).then(async (image) => {
      if (mapLoadTokenRef.current !== loadToken || !projectRef.current) return;
      const aspectRatio = await readImageAspectRatio(image.dataUrl);
      if (mapLoadTokenRef.current !== loadToken || !projectRef.current) return;
      const next = setMap(projectRef.current, image);
      setMapAspectRatio(aspectRatio);
      replaceProject(next);
      setIsMapPreparing(false);
      setBoardNotice('success', `“${image.name}” 도면을 현재 기록과 백업에 포함했습니다.`);
    }).catch((error: unknown) => {
      if (mapLoadTokenRef.current !== loadToken) return;
      setIsMapPreparing(false);
      setBoardNotice('error', error instanceof Error ? error.message : '도면을 반영하지 못했습니다.');
    });
  };

  const applyImportedProject = (loaded: OfflineProject, filename: string) => {
    setMapAspectRatio(null);
    replaceProject(loaded);
    setSelectedZoneId((current) => loaded.zones.some((zone) => zone.id === current) ? current : (loaded.zones[0]?.id ?? 'Z-01'));
    setInterestMode(false);
    loadedModeRef.current = mode;
    setStorageReady(true);
    setBoardNotice('success', `“${filename}”에서 구역, 메모, 사진, 도면, 관심 지점, 인계 기록을 불러왔습니다.`);
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
      setBoardNotice('error', `백업 JSON이 ${Math.round(MAX_PROJECT_BYTES / 1024 / 1024)}MB 제한을 넘습니다.`);
      return;
    }
    setBoardNotice('neutral', `“${file.name}” 백업을 읽는 중입니다.`);
    const reader = new FileReader();
    reader.onerror = () => {
      if (projectLoadTokenRef.current !== loadToken) return;
      setBoardNotice('error', '백업 JSON을 읽지 못했습니다. 파일을 다시 확인해 주세요.');
    };
    reader.onload = async () => {
      if (projectLoadTokenRef.current !== loadToken) return;
      const loaded = parseOfflineProject(String(reader.result ?? ''), file.size);
      if (!loaded.ok) {
        setBoardNotice('error', loaded.message);
        return;
      }
      if (loaded.project.map) {
        try {
          await readImageAspectRatio(loaded.project.map.dataUrl);
        } catch (error) {
          if (projectLoadTokenRef.current !== loadToken) return;
          setBoardNotice('error', error instanceof Error ? error.message : '백업 속 도면을 열지 못했습니다. 현재 기록은 유지합니다.');
          return;
        }
      }
      if (projectLoadTokenRef.current !== loadToken) return;
      if (projectRef.current && projectAtLoadStart && JSON.stringify(projectRef.current) !== JSON.stringify(projectAtLoadStart)) {
        setPendingImport(loaded.project);
        setDialog('replace-import');
        setBoardNotice('warning', '백업을 읽는 동안 현재 기록이 바뀌었습니다. 교체할지 확인해 주세요.');
        return;
      }
      applyImportedProject(loaded.project, file.name);
    };
    reader.readAsText(file, 'utf-8');
  };

  const saveProject = () => {
    if (!project) return;
    try {
      const stamp = new Date().toISOString().slice(0, 10);
      downloadText(
        serializeOfflineProject(project),
        `수색연결-${mode === 'field' ? '현장' : '연습'}-${stamp}.json`,
        'application/json;charset=utf-8',
      );
      setBoardNotice('success', '전체 백업 JSON을 내려받았습니다. 사진과 도면 Data URL이 파일 안에 들어 있습니다.');
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '백업 JSON을 만들지 못했습니다.');
    }
  };

  const downloadReport = () => {
    if (!project || !report) return;
    try {
      downloadText(reportHtml(report), `수색연결-미해결-점검.html`, 'text/html;charset=utf-8');
      setBoardNotice('success', '미해결 구역 보고서 HTML을 내려받았습니다.');
    } catch (error) {
      setBoardNotice('error', error instanceof Error ? error.message : '보고서 HTML을 만들지 못했습니다.');
    }
  };

  const handlePrint = () => {
    setNarrowTab('inspection');
    setBoardNotice('neutral', '인쇄 대화상자를 열었습니다. 인쇄 내용은 미해결 구역 점검입니다.');
    window.setTimeout(() => window.print(), 0);
  };

  const handleMapClick = (event: MouseEvent<HTMLDivElement>) => {
    if (!project) return;
    if (isMapPreparing) {
      setBoardNotice('warning', '도면을 준비하는 중입니다. 끝난 뒤 관심 지점을 추가해 주세요.');
      return;
    }
    if (!interestMode) return;
    const rect = event.currentTarget.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    const clamp = (value: number) => Math.min(100, Math.max(0, value));
    const x = Number(clamp(((event.clientX - rect.left) / rect.width) * 100).toFixed(2));
    const y = Number(clamp(((event.clientY - rect.top) / rect.height) * 100).toFixed(2));
    runMutation(
      (current) => addInterestPoint(current, { x, y, label: '', memo: '' }),
      `관심 지점을 도면의 ${x}%, ${y}% 위치에 추가했습니다.`,
    );
  };

  const addPointFromForm = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const form = event.currentTarget;
    const data = new FormData(form);
    const x = Number(data.get('x'));
    const y = Number(data.get('y'));
    runMutation((current) => addInterestPoint(current, {
      x,
      y,
      label: String(data.get('label') ?? ''),
      memo: String(data.get('memo') ?? ''),
    }), '좌표로 관심 지점을 추가했습니다.');
    form.reset();
  };

  const addZoneEvidence = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!selectedZone) return;
    const form = event.currentTarget;
    const data = new FormData(form);
    const label = String(data.get('label') ?? '').trim();
    const memo = String(data.get('memo') ?? '').trim();
    const file = photoInputRef.current?.files?.[0];
    if (!label && !file) {
      setBoardNotice('warning', '자료 이름 또는 사진 파일을 입력해 주세요.');
      return;
    }
    if (!file) {
      runMutation((current) => addEvidence(current, selectedZone.id, { label, memo }), `${selectedZone.id}에 메모 자료를 추가했습니다.`);
      form.reset();
      setPhotoName('');
      return;
    }
    prepareImageFile(file, MAX_PHOTO_BYTES).then((photo) => {
      if (!projectRef.current) return;
      const next = addPhotoEvidence(projectRef.current, selectedZone.id, {
        label: label || photo.name,
        memo,
        photo,
      });
      replaceProject(next);
      form.reset();
      if (photoInputRef.current) photoInputRef.current.value = '';
      setPhotoName('');
      setBoardNotice('success', `${selectedZone.id}에 사진을 첨부했습니다. 백업 파일과 이 기기 저장에 포함됩니다.`);
    }).catch((error: unknown) => {
      setBoardNotice('error', error instanceof Error ? error.message : '사진을 첨부하지 못했습니다.');
    });
  };

  const commitDraft = (field: 'reviewReason' | 'memo' | 'confirmedBy') => {
    if (!selectedZone) return;
    if (field === 'confirmedBy') {
      const next = draft.confirmedBy.trim();
      if ((selectedZone.confirmedBy ?? '') === next) return;
      updateSelectedZone({ confirmedBy: next || null }, `${selectedZone.id}의 확인자를 기록했습니다.`);
      return;
    }
    if (selectedZone[field] === draft[field]) return;
    updateSelectedZone(
      { [field]: draft[field] },
      field === 'memo' ? `${selectedZone.id}의 현장 메모를 기록했습니다.` : `${selectedZone.id}의 관측 사유를 기록했습니다.`,
    );
  };

  const handleObservationStatus = (status: ObservationStatus) => {
    if (!selectedZone) return;
    if (status === 'confirmed') {
      updateSelectedZone({
        observationStatus: status,
        confirmedBy: selectedZone.confirmedBy?.trim() || draft.confirmedBy.trim() || '현장 운영자',
        confirmedAt: selectedZone.confirmedAt || new Date().toISOString(),
      }, `${selectedZone.id}의 관측 상태를 확인 완료로 기록했습니다.`);
      return;
    }
    updateSelectedZone({
      observationStatus: status,
      confirmedBy: null,
      confirmedAt: null,
    }, `${selectedZone.id}의 관측 상태를 ${withEuro(OBSERVATION_LABEL[status])} 기록했습니다.`);
  };

  const confirmDialog = async () => {
    const currentDialog = dialog;
    setDialog(null);
    if (currentDialog === 'replace-import' && pendingImport) {
      applyImportedProject(pendingImport, '선택한 백업');
      setPendingImport(null);
      return;
    }
    if (currentDialog === 'cancel-interrupt' && selectedZone) {
      runMutation((current) => cancelInterruption(current, selectedZone.id), `${selectedZone.id}의 중단을 취소하고 이전 작업을 복원했습니다. 승인 이력은 추가되지 않습니다.`);
      return;
    }
    if (currentDialog === 'reset') {
      const fresh = freshProject(mode);
      try {
        await writeBoard(mode, fresh);
        loadedModeRef.current = mode;
        replaceProject(fresh);
        setStorageReady(true);
        setSelectedZoneId('Z-01');
        setStorageNote('초기 기록을 이 기기에 저장했습니다.');
        setBoardNotice('success', mode === 'field' ? '빈 현장 기록으로 다시 시작했습니다.' : '연습 데이터를 처음 상태로 되돌렸습니다.');
      } catch (error) {
        setBoardNotice('error', error instanceof Error ? error.message : '초기 기록을 저장하지 못했습니다. 화면은 바꾸지 않았습니다.');
      }
    }
  };

  const photoCount = selectedZone?.evidence.filter((item) => item.photo).length ?? 0;

  return (
    <div className="fieldShell">
      <header className="fieldHeader">
        <div className="fieldBrand">
          <button className="fieldBack" type="button" onClick={onBack}><ArrowLeft size={16} /> 소개</button>
          <span className="fieldMark" aria-hidden="true">S<span>?</span></span>
          <div>
            <p>팀 S? · 수색 연결</p>
            <h1>{mode === 'field' ? '현장 모드' : '연습 모드'} 상황판</h1>
          </div>
        </div>
        <div className="fieldModeSwitch" role="group" aria-label="기록 모드">
          <button type="button" aria-pressed={mode === 'practice'} onClick={() => onMode('practice')}>연습 모드</button>
          <button type="button" aria-pressed={mode === 'field'} onClick={() => onMode('field')}>현장 모드</button>
        </div>
        <p className={`fieldOnline ${online ? '' : 'is-offline'}`}>
          {online ? <Info size={15} /> : <WifiOff size={15} />}
          {online
            ? '연결됨 · 기록은 이 기기에만 있습니다'
            : '오프라인 · 이 기기 기록으로 계속할 수 있습니다'}
        </p>
      </header>

      <div className="fieldToolbar">
        <input ref={mapInputRef} className="fieldSrOnly" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="현장 도면 파일 선택" onChange={handleMapSelect} />
        <input ref={projectInputRef} className="fieldSrOnly" type="file" accept="application/json,.json" aria-label="백업 JSON 불러오기" onChange={handleProjectLoad} />
        <button type="button" className="button subtle small" disabled={!project} onClick={() => mapInputRef.current?.click()}><FileImage size={15} /> 도면 첨부</button>
        <button type="button" className="button subtle small" disabled={!project} onClick={saveProject}><Download size={15} /> 백업 내려받기</button>
        <button type="button" className="button subtle small" disabled={!project} onClick={() => projectInputRef.current?.click()}><FolderOpen size={15} /> 백업 불러오기</button>
        <button type="button" className="button subtle small" disabled={!project} onClick={downloadReport}><FileText size={15} /> 보고서</button>
        <button type="button" className="button subtle small" disabled={!project} onClick={handlePrint}><Printer size={15} /> 인쇄</button>
        <button type="button" className="button subtle small" disabled={!project} onClick={() => setDialog('reset')}>
          {mode === 'field' ? '빈 기록으로' : '연습 데이터 초기화'}
        </button>
      </div>

      <main className="fieldMain">
        {!project || !report || !selectedZone ? (
          <p className="fieldLoading" role="status">기록을 불러오는 중입니다.</p>
        ) : (
          <>
            <section className="fieldOverview" aria-label="상황판 안내">
              <div>
                <p className="fieldEyebrow">{mode === 'field' ? '빈 구역에서 직접 기록' : '가상 자료로 흐름 연습'}</p>
                <h2>{project.title}</h2>
                <p>
                  작업 상태, 관측 확인, 승인 인계를 구역마다 나눕니다. 사진과 도면은 이 브라우저에 보관되고 백업 JSON에 포함됩니다.
                  실제 GIS, GPS, 기체 제어는 없습니다.
                </p>
              </div>
              <div className="fieldMetrics" aria-label="현재 기록 요약">
                <span><b>{project.zones.length}</b> 구역</span>
                <span><b>{project.points.length}</b> 관심 지점</span>
                <span><b>{confirmedCount}</b> 관측 확인</span>
                <span className={report.issues.length ? 'fieldMetric--amber' : ''}><b>{report.issues.length}</b> 점검 항목</span>
              </div>
            </section>

            <section className={`fieldNotice fieldNotice--${notice.tone}`} aria-live="polite">
              {notice.tone === 'error' || notice.tone === 'warning' ? <AlertTriangle size={16} /> : <CheckCircle2 size={16} />}
              <span>{notice.message}</span>
              <small>{storageNote}</small>
            </section>

            <nav className="fieldTabs" aria-label="상황판 영역">
              <button type="button" aria-pressed={narrowTab === 'map'} onClick={() => setNarrowTab('map')}>도면</button>
              <button type="button" aria-pressed={narrowTab === 'zones'} onClick={() => setNarrowTab('zones')}>구역 기록</button>
              <button type="button" aria-pressed={narrowTab === 'inspection'} onClick={() => setNarrowTab('inspection')}>점검</button>
            </nav>

            <section className="fieldWorkspace" data-tab={narrowTab}>
              <aside className="fieldPanel fieldListPanel" aria-label="구역 및 관심 지점">
                <div className="fieldPanelHeading">
                  <div><p className="fieldEyebrow">구역 목록</p><h3>구역과 담당</h3></div>
                  <ListTree size={18} />
                </div>
                <p className="fieldDroneSummary">
                  {droneCounts.map((item) => <span key={item.drone}>기체 {item.drone} <b>{item.count}</b></span>)}
                  <span>없음 <b>{project.zones.filter((zone) => zone.droneId === null).length}</b></span>
                </p>
                <div className="fieldZoneList">
                  {project.zones.map((zone) => {
                    const selected = zone.id === selectedZone.id;
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
                          <b>{zone.id}{zone.interruption ? ' · 인계 대기' : ''}</b>
                          <small>기체 {zone.droneId ?? '없음'} · 자료 {zone.evidence.length}건{zone.evidence.some((item) => item.photo) ? ' · 사진 있음' : ''}</small>
                          <span><StatusPill status={zone.taskStatus} type="task" /><StatusPill status={zone.observationStatus} type="observation" /></span>
                        </span>
                        {issueCount > 0 ? <em aria-label={`점검 ${issueCount}건`}>{issueCount}</em> : null}
                      </button>
                    );
                  })}
                </div>
                <section className="fieldPointList" aria-label="관심 지점 목록">
                  <div><MapPin size={15} /><b>관심 지점</b><span>{project.points.length}</span></div>
                  {project.points.length ? (
                    <ul>
                      {project.points.map((point) => (
                        <li key={point.id}>
                          <label>이름
                            <input
                              defaultValue={point.label}
                              key={`${point.id}-label-${point.label}`}
                              onBlur={(event) => {
                                const next = event.target.value.trim();
                                if (!next || next === point.label) return;
                                runMutation((current) => updateInterestPoint(current, point.id, { label: next }), `${next} 이름을 기록했습니다.`);
                              }}
                            />
                          </label>
                          <label>메모
                            <input
                              defaultValue={point.memo}
                              key={`${point.id}-memo`}
                              onBlur={(event) => {
                                if (event.target.value === point.memo) return;
                                runMutation((current) => updateInterestPoint(current, point.id, { memo: event.target.value }), `${point.label} 메모를 기록했습니다.`);
                              }}
                            />
                          </label>
                          <button type="button" className="button subtle small" onClick={() => runMutation((current) => removeInterestPoint(current, point.id), `${point.label}을 삭제했습니다.`)}>
                            <Trash2 size={14} /> 삭제
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : <p>도면을 누르거나 아래 좌표로 관심 지점을 추가하세요.</p>}
                </section>
              </aside>

              <section className="fieldPanel fieldMapPanel" aria-label="현장 도면">
                <div className="fieldPanelHeading fieldMapHeading">
                  <div><p className="fieldEyebrow">현장 도면</p><h3>구역 위치</h3></div>
                  <span className="fieldCoordinateLabel"><MapPinned size={15} /> 화면 비율 좌표 · GPS 아님</span>
                </div>
                <p className="fieldMapNote"><Info size={15} /> 도면은 첨부한 이미지이거나 빈 격자입니다. 실제 지도 좌표로 보정하지 않습니다.</p>
                <div className="fieldMapTools">
                  <button
                    type="button"
                    className={`button ${interestMode ? 'primary' : 'subtle'} small`}
                    disabled={isMapPreparing}
                    aria-pressed={interestMode}
                    onClick={() => {
                      setInterestMode((value) => !value);
                      setBoardNotice('neutral', interestMode ? '관심 지점 추가를 마쳤습니다.' : '도면의 빈 곳을 누르면 관심 지점이 추가됩니다. 키보드로는 아래 좌표 입력을 사용하세요.');
                    }}
                  >
                    <Plus size={15} /> {interestMode ? '위치 선택 중' : '도면에서 추가'}
                  </button>
                  {project.map ? (
                    <span>
                      <FileImage size={14} /> {project.map.name}
                      <button type="button" className="fieldTextButton" onClick={() => runMutation((current) => setMap(current, null), '도면을 기록에서 뺐습니다. 구역 위치는 그대로입니다.')}>도면 제거</button>
                    </span>
                  ) : <span>첨부한 도면 없음 · 격자 표시</span>}
                </div>
                {isMapPreparing ? <p className="fieldMapPreparing" role="status">도면의 가로·세로 비율을 확인하고 있습니다.</p> : null}
                <div
                  className={`fieldMapStage ${interestMode ? 'fieldIsPointing' : ''} ${isMapPreparing ? 'fieldIsPreparing' : ''}`}
                  style={{ aspectRatio: mapAspectRatio ? `${mapAspectRatio} / 1` : '4 / 3' }}
                  onClick={handleMapClick}
                >
                  {project.map ? <img src={project.map.dataUrl} alt={`${project.map.name} 현장 도면`} className="fieldMapImage" /> : null}
                  <div className="fieldGridPlaceholder" aria-hidden="true" />
                  {project.zones.map((zone) => (
                    <ZoneMarker key={zone.id} zone={zone} selected={zone.id === selectedZone.id} onSelect={() => selectZone(zone.id, true)} />
                  ))}
                  {project.points.map((point) => (
                    <button
                      type="button"
                      className="fieldPointMarker"
                      key={point.id}
                      style={{ left: `${point.x}%`, top: `${point.y}%` }}
                      onClick={(event) => {
                        event.stopPropagation();
                        setBoardNotice('neutral', `${point.label} · 도면 ${point.x.toFixed(1)}%, ${point.y.toFixed(1)}%${point.memo ? ` · ${point.memo}` : ''}`);
                      }}
                      aria-label={`${point.label}, 도면 ${point.x.toFixed(1)}%, ${point.y.toFixed(1)}%`}
                    ><MapPin size={16} /></button>
                  ))}
                  <span className="fieldMapCaption fieldMapCaption--top">{project.map ? '현장 도면 · 좌표 보정 전' : '도면 없음 · 격자 표시'}</span>
                  <span className="fieldMapCaption fieldMapCaption--bottom">실제 GIS·GPS 아님</span>
                </div>
                <form className="fieldPointForm" onSubmit={addPointFromForm}>
                  <label>가로 %<input name="x" type="number" min="0" max="100" step="0.1" required defaultValue="50" /></label>
                  <label>세로 %<input name="y" type="number" min="0" max="100" step="0.1" required defaultValue="50" /></label>
                  <label>이름<input name="label" placeholder="진입로" /></label>
                  <label>메모<input name="memo" placeholder="다음 담당자에게 전달할 내용" /></label>
                  <button className="button subtle small" type="submit"><Plus size={14} /> 좌표로 추가</button>
                </form>
                <p className="fieldMapFootnote">자료가 있거나 확인 완료여도 수색 성공, 인명 발견, 안전을 뜻하지 않습니다.</p>
              </section>

              <aside className="fieldPanel fieldDetailPanel" aria-label="선택 구역 기록">
                <div className="fieldDetailBlock">
                  <div className="fieldPanelHeading">
                    <div><p className="fieldEyebrow">선택 구역</p><h3>{selectedZone.id} 기록</h3></div>
                    <ClipboardCheck size={18} />
                  </div>
                  <div className="fieldSelectionSummary">
                    <span>{String(selectedZone.number).padStart(2, '0')}</span>
                    <div>
                      <small>현재 담당</small>
                      <b>기체 {selectedZone.droneId ?? '없음'}</b>
                      <p>마지막 변경 {formatTime(selectedZone.updatedAt)}</p>
                    </div>
                  </div>
                  <div className="fieldStatusPair">
                    <StatusPill status={selectedZone.taskStatus} type="task" />
                    <StatusPill status={selectedZone.observationStatus} type="observation" />
                  </div>

                  <section className="fieldCard">
                    <h4>작업과 관측</h4>
                    <div className="fieldFormGrid">
                      <label className="fieldFormLabel">담당 기체
                        <select
                          value={selectedZone.droneId ?? ''}
                          disabled={Boolean(selectedZone.interruption)}
                          onChange={(event) => updateSelectedZone({ droneId: (event.target.value || null) as DroneId | null }, `${selectedZone.id}의 담당 기체를 바꿨습니다.`)}
                        >
                          <option value="">없음</option>
                          {DRONES.map((drone) => <option key={drone} value={drone}>기체 {drone}</option>)}
                        </select>
                      </label>
                      <label className="fieldFormLabel">작업 상태
                        <select
                          value={selectedZone.taskStatus}
                          disabled={Boolean(selectedZone.interruption)}
                          onChange={(event) => {
                            const status = event.target.value as TaskStatus;
                            if (status === 'interrupted') {
                              setBoardNotice('warning', '중단은 아래 양식에 사유를 적어야 인계 대기가 됩니다.');
                              return;
                            }
                            updateSelectedZone({ taskStatus: status }, `${selectedZone.id}의 작업 상태를 ${withEuro(TASK_LABEL[status])} 기록했습니다.`);
                          }}
                        >
                          <option value="unassigned">작업 없음</option>
                          <option value="assigned">배정됨</option>
                          <option value="in_progress">진행 중</option>
                          <option value="completed">완료</option>
                          <option value="interrupted" disabled>중단</option>
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
                      <textarea rows={2} value={draft.reviewReason} onChange={(event) => setDraft((value) => ({ ...value, reviewReason: event.target.value }))} onBlur={() => commitDraft('reviewReason')} placeholder="예: 시야가 가려 다시 확인이 필요함" />
                    </label>
                    <label className="fieldFormLabel">현장 메모
                      <textarea rows={3} value={draft.memo} onChange={(event) => setDraft((value) => ({ ...value, memo: event.target.value }))} onBlur={() => commitDraft('memo')} placeholder="다음 담당자가 이어서 볼 메모" />
                    </label>
                    {selectedZone.observationStatus === 'confirmed' ? (
                      <div className="fieldConfirmFields">
                        <p><Info size={14} /> 확인 완료는 관측 자료를 검토했다는 뜻입니다. 구조나 안전을 판정하지 않습니다.</p>
                        <label className="fieldFormLabel">확인자
                          <input value={draft.confirmedBy} onChange={(event) => setDraft((value) => ({ ...value, confirmedBy: event.target.value }))} onBlur={() => commitDraft('confirmedBy')} placeholder="현장 운영자" />
                        </label>
                        <label className="fieldFormLabel">확인 시각
                          <input type="datetime-local" value={toDateTimeLocal(selectedZone.confirmedAt)} onChange={(event) => updateSelectedZone({ confirmedAt: toIso(event.target.value) }, `${selectedZone.id}의 확인 시각을 바꿨습니다.`)} />
                        </label>
                      </div>
                    ) : null}
                  </section>

                  <section className="fieldCard">
                    <h4>승인 인계</h4>
                    {selectedZone.interruption ? (
                      <form className="fieldHandover" onSubmit={(event) => {
                        event.preventDefault();
                        if (!handoverChecked) {
                          setBoardNotice('warning', '이전 작업과 자료를 확인했다는 표시가 필요합니다.');
                          return;
                        }
                        runMutation(
                          (current) => approveHandover(current, selectedZone.id, { toDrone: nextDrone, approvalReason, approvedBy }),
                          `${selectedZone.id}을 기체 ${nextDrone}의 새 배정 작업으로 넘겼습니다. 실제 비행은 시작하지 않습니다.`,
                        );
                        setApprovalReason('');
                        setHandoverChecked(false);
                      }}>
                        <dl>
                          <div><dt>이전 작업</dt><dd>기체 {selectedZone.interruption.fromDrone} · {TASK_LABEL[selectedZone.interruption.previousStatus]}</dd></div>
                          <div><dt>중단 사유</dt><dd>{selectedZone.interruption.reason}</dd></div>
                          <div><dt>유지되는 자료</dt><dd>{selectedZone.evidence.length}건 · 사진 {photoCount}건</dd></div>
                        </dl>
                        <label className="fieldFormLabel">새 담당
                          <select value={nextDrone} onChange={(event) => setNextDrone(event.target.value as DroneId)}>
                            {DRONES.map((drone) => <option key={drone} value={drone}>기체 {drone}</option>)}
                          </select>
                        </label>
                        <label className="fieldFormLabel">승인 사유
                          <textarea rows={2} value={approvalReason} onChange={(event) => setApprovalReason(event.target.value)} required placeholder="예: 인접 구역을 보던 기체에게 남은 확인을 맡김" />
                        </label>
                        <label className="fieldFormLabel">승인자
                          <input value={approvedBy} onChange={(event) => setApprovedBy(event.target.value)} required />
                        </label>
                        <label className="fieldCheck">
                          <input type="checkbox" checked={handoverChecked} onChange={(event) => setHandoverChecked(event.target.checked)} />
                          <span>이전 작업, 중단 사유, 사진·메모를 확인했습니다. 새 작업은 배정됨이며 비행을 시작하지 않습니다.</span>
                        </label>
                        <div className="fieldInlineActions">
                          <button className="button primary small" type="submit" disabled={!handoverChecked}>새 작업으로 승인</button>
                          <button className="button subtle small" type="button" onClick={() => setDialog('cancel-interrupt')}>중단 취소</button>
                        </div>
                      </form>
                    ) : (
                      <form className="fieldHandover" onSubmit={(event) => {
                        event.preventDefault();
                        runMutation((current) => interruptZone(current, selectedZone.id, interruptReason), `${selectedZone.id} 작업을 중단하고 인계 대기로 남겼습니다.`);
                        setInterruptReason('');
                      }}>
                        <p className="fieldHint">배정됨 또는 진행 중인 작업만 중단합니다. 완료 구역과 이미 넘긴 기록은 유지됩니다.</p>
                        <label className="fieldFormLabel">중단 사유
                          <textarea rows={2} value={interruptReason} onChange={(event) => setInterruptReason(event.target.value)} required placeholder="예: 통신이 끊겨 남은 확인을 이어갈 수 없음" />
                        </label>
                        <button className="button warning small" type="submit">이 구역 작업 중단</button>
                      </form>
                    )}
                    {selectedZone.handovers.length ? (
                      <ul className="fieldEvidenceList">
                        {selectedZone.handovers.map((handover) => (
                          <li key={handover.id}>
                            <b>기체 {handover.fromDrone} → {handover.toDrone}</b>
                            <small>{formatTime(handover.approvedAt)} · {handover.approvedBy}</small>
                            <p>이전 작업 {TASK_LABEL[handover.previousStatus]} · 중단: {handover.interruptionReason}</p>
                            <p>승인: {handover.approvalReason}</p>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="fieldEmptySmall">아직 승인된 인계가 없습니다.</p>}
                  </section>

                  <section className="fieldCard">
                    <h4><FileText size={16} /> 사진·메모 <span>{selectedZone.evidence.length}</span></h4>
                    <p className="fieldHint">사진은 이 기기에 저장되고 전체 백업에 포함됩니다. 서버로 올리지 않습니다. 사진 1MB, 도면 2MB, 백업 전체 5MB까지입니다.</p>
                    {selectedZone.evidence.length ? (
                      <ul className="fieldEvidenceList">
                        {selectedZone.evidence.map((evidence) => (
                          <li key={evidence.id}>
                            {evidence.photo ? <img src={evidence.photo.dataUrl} alt={`${evidence.label} 첨부 사진`} /> : null}
                            <b>{evidence.label}</b>
                            <small>{formatTime(evidence.addedAt)}{evidence.photo ? ` · ${evidence.photo.name}` : ''}</small>
                            {evidence.memo ? <p>{evidence.memo}</p> : null}
                            <button type="button" className="button subtle small" onClick={() => runMutation((current) => removeEvidence(current, selectedZone.id, evidence.id), `${evidence.label} 자료를 삭제했습니다.`)}>
                              <Trash2 size={14} /> 삭제
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="fieldEmptySmall">아직 사진이나 메모가 없습니다.</p>}
                    <form className="fieldEvidenceForm" onSubmit={addZoneEvidence}>
                      <label className="fieldFormLabel">자료 이름<input name="label" placeholder="예: 수풀 가장자리" /></label>
                      <label className="fieldFormLabel">메모<textarea name="memo" rows={2} placeholder="사진과 함께 남길 메모" /></label>
                      <div className="fieldFileRow">
                        <input ref={photoInputRef} className="fieldSrOnly" name="photo" type="file" accept="image/png,image/jpeg,image/webp,.png,.jpg,.jpeg,.webp" aria-label="구역 사진 파일 선택" onChange={(event) => setPhotoName(event.target.files?.[0]?.name ?? '')} />
                        <button type="button" className="button subtle small" onClick={() => photoInputRef.current?.click()}>사진 선택</button>
                        <span>{photoName || '선택한 사진 없음'}</span>
                      </div>
                      <button className="button subtle small" type="submit"><Plus size={14} /> 자료 추가</button>
                    </form>
                  </section>
                </div>

                <section className="fieldInspection" aria-label="점검 및 보고서">
                  <div className="fieldInspectionHeading">
                    <div><p className="fieldEyebrow">미해결 점검</p><h3>보고서</h3></div>
                    <span className={report.issues.length ? 'fieldIsAttention' : ''}>{report.issues.length}건</span>
                  </div>
                  <p className="fieldInspectionNote">점검 항목은 저장이나 백업을 막지 않습니다. 수색 종료나 안전을 판정하지 않습니다.</p>
                  <div className="fieldIssueList">
                    {report.issues.length ? report.issues.map((issue) => (
                      <button type="button" className={`fieldIssue fieldIssue--${issue.severity}`} key={issue.id} onClick={() => {
                        selectZone(issue.zoneId, true);
                        setBoardNotice('neutral', `${issue.zoneId} 점검 항목을 열었습니다.`);
                      }}>
                        <span>{issue.severity === 'attention' ? '!' : 'i'}</span>
                        <div><b>{issue.zoneId} · {issue.title}</b><p>{issue.message}</p></div>
                      </button>
                    )) : <p className="fieldAllClear"><CheckCircle2 size={16} /> 현재 점검할 항목이 없습니다.</p>}
                  </div>
                  <div className="fieldReportPreview">
                    <div><h4>미해결 구역</h4><span>{formatTime(report.generatedAt)}</span></div>
                    <p>{project.title} · 도면 {project.map?.name ?? '없음'} · 전체 {project.zones.length}개</p>
                    {unresolvedZones.length ? (
                      <ul>
                        {unresolvedZones.map((zone) => (
                          <li key={zone.id}>
                            <b>{zone.id} · 자료 {zone.evidence.length}건</b>
                            <span>{(issuesByZone.get(zone.id) ?? []).map((issue) => issue.title).join(' · ') || '관측 또는 담당을 다시 확인'}</span>
                          </li>
                        ))}
                      </ul>
                    ) : <p className="fieldEmptySmall">현재 미해결 구역이 없습니다.</p>}
                    <small className="fieldLimitNote">이 보고서는 수색 종료·안전·인명 부재를 판정하지 않습니다.</small>
                  </div>
                </section>
              </aside>
            </section>
          </>
        )}
      </main>

      <dialog
        ref={dialogRef}
        className="fieldDialog"
        aria-labelledby="field-dialog-title"
        onCancel={(event) => {
          event.preventDefault();
          setDialog(null);
          setPendingImport(null);
        }}
      >
        <h2 id="field-dialog-title">
          {dialog === 'reset' ? (mode === 'field' ? '빈 기록으로 다시 시작할까요?' : '연습 데이터를 되돌릴까요?') : dialog === 'cancel-interrupt' ? '승인 없이 중단을 취소할까요?' : '백업으로 현재 기록을 바꿀까요?'}
        </h2>
        <p>
          {dialog === 'reset'
            ? '이 모드의 현재 기록을 처음 상태로 덮어씁니다. 다른 모드의 기록과 이미 받은 백업 파일은 지우지 않습니다.'
            : dialog === 'cancel-interrupt'
              ? '중단 사유는 승인 이력에 남지 않고, 중단 직전 담당과 작업 상태로 돌아갑니다. 사진과 메모는 유지됩니다.'
              : '읽는 동안 바뀐 편집 대신 백업 파일의 구역, 사진, 도면, 인계 기록을 화면에 올립니다.'}
        </p>
        <div className="fieldInlineActions">
          <button type="button" className="button subtle" onClick={() => { setDialog(null); setPendingImport(null); }}>취소</button>
          <button type="button" className="button primary" onClick={() => { void confirmDialog(); }}>계속</button>
        </div>
      </dialog>
    </div>
  );
}
