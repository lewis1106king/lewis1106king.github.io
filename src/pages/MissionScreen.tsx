import { useEffect, useMemo, useState } from 'react';
import {
  canEditZone,
  canRequestHandover,
  droneLabel,
  isValidPath,
  movedMeters,
  observationLabel,
  roleLabel,
  taskLabel,
  unresolvedReasons,
  type DroneStatus,
  type LatLng,
  type ObservationStatus,
  type TaskStatus,
} from '../domain/rules';
import { reportHtml } from '../domain/report';
import MapCanvas from '../mission/MapCanvas';
import type { Zone } from '../mission/types';
import { useMission } from '../mission/useMission';

const tabs = [
  ['map', '지도'],
  ['zones', '구역'],
  ['team', '팀'],
  ['log', '기록'],
  ['report', '보고'],
] as const;

function formatTime(value: string) {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return new Intl.DateTimeFormat('ko-KR', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' }).format(date);
}

export default function MissionScreen({
  missionId,
  selfId,
  onBack,
}: {
  missionId: string;
  selfId: string;
  onBack: () => void;
}) {
  const mission = useMission(missionId, selfId);
  const data = mission.data;
  const [tab, setTab] = useState<(typeof tabs)[number][0]>('map');
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [drawLabel, setDrawLabel] = useState('구역 1');
  const [drawing, setDrawing] = useState(false);
  const [pointMode, setPointMode] = useState(false);
  const [pointLabel, setPointLabel] = useState('관심 지점');
  const [pointMemo, setPointMemo] = useState('');
  const [handoverReason, setHandoverReason] = useState('');
  const [decisionReason, setDecisionReason] = useState('');
  const [nextUser, setNextUser] = useState('');
  const self = mission.self;
  const operator = self?.role === 'operator';
  const zone = data?.zones.find((item) => item.id === selectedId) ?? null;
  const pending = data?.handovers.find((item) => item.zoneId === zone?.id && item.status === 'pending') ?? null;

  useEffect(() => {
    if (!self || !navigator.geolocation) return undefined;
    let lastAt = 0;
    let last: LatLng | null = null;
    const watch = navigator.geolocation.watchPosition((position) => {
      const point = { lat: position.coords.latitude, lng: position.coords.longitude };
      const now = Date.now();
      if (last && movedMeters(last, point) < 8 && now - lastAt < 15000) return;
      last = point;
      lastAt = now;
      void mission.sharePresence({ ...point, accuracy: position.coords.accuracy }, self.droneStatus);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 4000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [self?.userId, self?.droneStatus]);

  const nameOf = (userId: string | null) => data?.members.find((member) => member.userId === userId)?.callsign ?? '없음';

  const report = useMemo(() => {
    if (!data) return '';
    return reportHtml({
      title: data.mission.title,
      generatedAt: new Date().toISOString(),
      pendingZoneIds: data.handovers.filter((item) => item.status === 'pending').map((item) => item.zoneId),
      zones: data.zones.map((item) => ({
        id: item.id,
        label: item.label,
        taskStatus: item.taskStatus,
        observationStatus: item.observationStatus,
        assigneeId: item.assigneeId,
        photoCount: data.photos.filter((photo) => photo.zoneId === item.id).length,
        memo: item.memo,
        reviewReason: item.reviewReason,
      })),
    });
  }, [data]);

  const pick = (point: LatLng) => {
    if (drawing) setDraft((value) => value.length >= 24 ? value : [...value, point]);
    else if (pointMode) void mission.createPoint(pointLabel || '관심 지점', pointMemo, point);
  };

  const saveZone = async () => {
    if (!isValidPath(draft)) {
      mission.clearError();
      return;
    }
    await mission.createZone(drawLabel || `구역 ${(data?.zones.length ?? 0) + 1}`, draft);
    setDraft([]);
    setDrawing(false);
    setDrawLabel(`구역 ${(data?.zones.length ?? 0) + 2}`);
  };

  const download = (content: string, filename: string, type: string) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const link = document.createElement('a');
    link.href = url;
    link.download = filename;
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  if (!data) {
    return <main className="center-note">{mission.error || '임무를 불러오는 중입니다.'}</main>;
  }

  const editable = zone ? canEditZone({ operator, assigneeId: zone.assigneeId, selfId }) : false;
  const unread = data.notices.filter((notice) => !notice.readAt).length;

  return (
    <div className="mission-shell" data-tab={tab}>
      <nav className="rail" aria-label="임무 메뉴">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
      <section className="mission-main">
        <header className="mission-top">
          <div>
            <button className="btn ghost small" type="button" onClick={onBack}>임무 목록</button>
            <h1>{data.mission.title}</h1>
            <p className="quiet">코드 {data.mission.joinCode} · {self ? roleLabel[self.role] : ''} {self?.callsign}</p>
          </div>
          <div className="top-actions">
            <span className={`chip ${mission.live ? 'good' : 'warn'}`}>{mission.live ? '실시간' : '연결 확인 중'}</span>
            {mission.pending ? <span className="chip warn">전송 대기 {mission.pending}</span> : null}
            <button className="btn small bell" type="button" onClick={() => { setTab('log'); void mission.markRead(); }}>
              알림
              {unread ? <em>{unread}</em> : null}
            </button>
          </div>
        </header>
        {mission.error ? <p className="error" role="alert" style={{ margin: '0 16px 10px' }}>{mission.error}</p> : null}
        <div className="stage">
          <MapCanvas
            zones={data.zones}
            points={data.points}
            members={data.members}
            selfId={selfId}
            selectedZoneId={selectedId}
            draft={draft}
            showLocate
            active={tab === 'map'}
            onPick={drawing || pointMode ? pick : undefined}
            onSelectZone={(id) => { setSelectedId(id); setTab('zones'); }}
          />
          <div className="inline-actions" style={{ marginTop: 10 }}>
            <button className="btn small" type="button" aria-pressed={drawing} onClick={() => { setDrawing((value) => !value); setPointMode(false); }}>{drawing ? '그리기 끄기' : '구역 그리기'}</button>
            <button className="btn small" type="button" aria-pressed={pointMode} onClick={() => { setPointMode((value) => !value); setDrawing(false); }}>관심 지점</button>
            {drawing ? (
              <>
                <input aria-label="구역 이름" value={drawLabel} onChange={(event) => setDrawLabel(event.target.value)} style={{ maxWidth: 160 }} />
                <button className="btn small" type="button" onClick={() => setDraft((value) => value.slice(0, -1))}>점 취소</button>
                <button className="btn primary small" type="button" onClick={() => void saveZone()} disabled={!isValidPath(draft)}>구역 저장</button>
              </>
            ) : null}
            {pointMode ? (
              <>
                <input aria-label="관심 지점 이름" value={pointLabel} onChange={(event) => setPointLabel(event.target.value)} style={{ maxWidth: 140 }} />
                <input aria-label="관심 지점 메모" value={pointMemo} onChange={(event) => setPointMemo(event.target.value)} style={{ maxWidth: 180 }} />
              </>
            ) : null}
          </div>
        </div>
      </section>
      <aside className="side">
        {tab === 'map' || tab === 'zones' ? (
          zone ? <ZoneEditor
            zone={zone}
            editable={editable}
            operator={operator}
            members={data.members}
            photos={data.photos.filter((photo) => photo.zoneId === zone.id)}
            pending={pending}
            nameOf={nameOf}
            handoverReason={handoverReason}
            decisionReason={decisionReason}
            nextUser={nextUser}
            onHandoverReason={setHandoverReason}
            onDecisionReason={setDecisionReason}
            onNextUser={setNextUser}
            onChange={(patch) => void mission.updateZone(zone, patch)}
            onRequest={() => void mission.requestHandover(zone.id, handoverReason, nextUser || null)}
            onDecide={(approve) => void mission.decideHandover(pending!.id, approve, decisionReason, nextUser || pending?.toUser || null)}
            onPhoto={(file, memo) => void mission.uploadPhoto(zone.id, file, memo)}
          /> : <div className="stack"><h2>구역</h2>{data.zones.map((item) => (
            <button className="zone-card" key={item.id} type="button" onClick={() => setSelectedId(item.id)}>
              <b>{item.label}</b>
              <div><span className="chip neutral">{taskLabel[item.taskStatus]}</span> <span className="chip neutral">{observationLabel[item.observationStatus]}</span></div>
              <small>{nameOf(item.assigneeId)}</small>
            </button>
          ))}{data.zones.length ? null : <p className="quiet">지도에서 구역 그리기를 켠 뒤 꼭짓점을 찍으세요.</p>}</div>
        ) : null}
        {tab === 'team' ? (
          <div className="stack">
            <h2>팀</h2>
            {self ? (
              <label>내 기체 상태
                <select value={self.droneStatus} onChange={(event) => void mission.setDroneStatus(event.target.value as DroneStatus)}>
                  {(Object.keys(droneLabel) as DroneStatus[]).map((status) => <option key={status} value={status}>{droneLabel[status]}</option>)}
                </select>
              </label>
            ) : null}
            {data.members.map((member) => (
              <article className="person" key={member.userId}>
                <b>{member.callsign}</b>
                <p>{roleLabel[member.role]}{member.droneName ? ` · ${member.droneName}` : ''}</p>
                <small>{droneLabel[member.droneStatus]} · {member.lat === null ? '위치 없음' : `위치 ${formatTime(member.updatedAt)}`}</small>
              </article>
            ))}
            <p className="quiet">기체 상태는 조종자가 직접 고릅니다. 비행 제어기에서 읽은 값이 아닙니다.</p>
          </div>
        ) : null}
        {tab === 'log' ? (
          <div className="stack">
            <h2>알림과 기록</h2>
            <div className="notices">
              {data.notices.map((notice) => <article className="notice-card" key={notice.id}><b>{notice.message}</b><small>{formatTime(notice.createdAt)}{notice.readAt ? '' : ' · 새 알림'}</small></article>)}
            </div>
            {data.events.map((event) => <article key={event.id} className="quiet"><b style={{ color: 'var(--ink)' }}>{event.message}</b><br />{formatTime(event.createdAt)}</article>)}
          </div>
        ) : null}
        {tab === 'report' ? (
          <div className="stack">
            <h2>미해결 보고</h2>
            {data.zones.map((item) => {
              const reasons = unresolvedReasons({
                id: item.id,
                label: item.label,
                taskStatus: item.taskStatus,
                observationStatus: item.observationStatus,
                assigneeId: item.assigneeId,
                photoCount: data.photos.filter((photo) => photo.zoneId === item.id).length,
              }, data.handovers.some((handover) => handover.zoneId === item.id && handover.status === 'pending'));
              if (!reasons.length) return null;
              return <article className="card" key={item.id}><h3>{item.label}</h3><p>{reasons.join(' ')}</p></article>;
            })}
            <button className="btn" type="button" onClick={() => download(report, `${data.mission.title}-보고.html`, 'text/html;charset=utf-8')}>보고서 내려받기</button>
            <button className="btn" type="button" onClick={() => download(JSON.stringify(data, null, 2), `${data.mission.title}-기록.json`, 'application/json')}>이 시점 JSON</button>
            <p className="quiet">JSON은 지금 화면의 기록입니다. 사진 주소는 한 시간 뒤 만료될 수 있고, 원본은 팀 저장소에 남습니다.</p>
          </div>
        ) : null}
      </aside>
      <nav className="bottom-nav" aria-label="모바일 메뉴">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-current={tab === id ? 'page' : undefined} onClick={() => setTab(id)}>{label}</button>
        ))}
      </nav>
    </div>
  );
}

function ZoneEditor({
  zone,
  editable,
  operator,
  members,
  photos,
  pending,
  nameOf,
  handoverReason,
  decisionReason,
  nextUser,
  onHandoverReason,
  onDecisionReason,
  onNextUser,
  onChange,
  onRequest,
  onDecide,
  onPhoto,
}: {
  zone: Zone;
  editable: boolean;
  operator: boolean;
  members: { userId: string; callsign: string }[];
  photos: { id: string; url: string | null; memo: string }[];
  pending: { id: string; interruptionReason: string; fromUser: string; previousStatus: TaskStatus } | null;
  nameOf: (id: string | null) => string;
  handoverReason: string;
  decisionReason: string;
  nextUser: string;
  onHandoverReason: (value: string) => void;
  onDecisionReason: (value: string) => void;
  onNextUser: (value: string) => void;
  onChange: (patch: Partial<Zone>) => void;
  onRequest: () => void;
  onDecide: (approve: boolean) => void;
  onPhoto: (file: File, memo: string) => void;
}) {
  const [memoDraft, setMemoDraft] = useState(zone.memo);
  const [photoMemo, setPhotoMemo] = useState('');
  useEffect(() => setMemoDraft(zone.memo), [zone.id, zone.memo]);
  return (
    <div className="stack">
      <h2>{zone.label}</h2>
      <p className="quiet">담당 {nameOf(zone.assigneeId)} · {formatTime(zone.updatedAt)}</p>
      <div className="inline-actions">
        <span className="chip">{taskLabel[zone.taskStatus]}</span>
        <span className="chip">{observationLabel[zone.observationStatus]}</span>
      </div>
      <label>작업
        <select disabled={!editable || zone.taskStatus === 'interrupted'} value={zone.taskStatus} onChange={(event) => onChange({ taskStatus: event.target.value as TaskStatus })}>
          {(Object.keys(taskLabel) as TaskStatus[]).filter((status) => status !== 'interrupted').map((status) => <option key={status} value={status}>{taskLabel[status]}</option>)}
          {zone.taskStatus === 'interrupted' ? <option value="interrupted">중단</option> : null}
        </select>
      </label>
      <label>관측
        <select disabled={!editable} value={zone.observationStatus} onChange={(event) => onChange({ observationStatus: event.target.value as ObservationStatus })}>
          {(Object.keys(observationLabel) as ObservationStatus[]).map((status) => <option key={status} value={status}>{observationLabel[status]}</option>)}
        </select>
      </label>
      <label>관측 사유
        <input disabled={!editable} value={zone.reviewReason} onChange={(event) => onChange({ reviewReason: event.target.value })} />
      </label>
      {operator ? (
        <label>담당
          <select value={zone.assigneeId ?? ''} onChange={(event) => onChange({ assigneeId: event.target.value || null })}>
            <option value="">없음</option>
            {members.map((member) => <option key={member.userId} value={member.userId}>{member.callsign}</option>)}
          </select>
        </label>
      ) : null}
      <label>메모
        <textarea disabled={!editable} value={memoDraft} onChange={(event) => setMemoDraft(event.target.value)} onBlur={() => { if (memoDraft !== zone.memo) onChange({ memo: memoDraft }); }} />
      </label>
      <div className="photo-grid">
        {photos.map((photo) => photo.url ? <img key={photo.id} src={photo.url} alt={photo.memo || '구역 사진'} /> : <div key={photo.id} className="quiet">사진 주소를 만드는 중</div>)}
      </div>
      <label>사진 메모<input value={photoMemo} onChange={(event) => setPhotoMemo(event.target.value)} /></label>
      <label>사진 올리기
        <input type="file" accept="image/jpeg,image/png,image/webp" onChange={(event) => {
          const file = event.target.files?.[0];
          event.target.value = '';
          if (file) onPhoto(file, photoMemo);
        }} />
      </label>
      {pending ? (
        operator ? (
          <form className="sheet" onSubmit={(event) => { event.preventDefault(); onDecide(true); }}>
            <h3>인계 승인</h3>
            <p>이전 작업 {taskLabel[pending.previousStatus]} · {nameOf(pending.fromUser)}</p>
            <p>중단 사유: {pending.interruptionReason}</p>
            <label>새 담당
              <select value={nextUser} onChange={(event) => onNextUser(event.target.value)} required>
                <option value="">선택</option>
                {members.map((member) => <option key={member.userId} value={member.userId}>{member.callsign}</option>)}
              </select>
            </label>
            <label>승인 사유<textarea value={decisionReason} onChange={(event) => onDecisionReason(event.target.value)} required /></label>
            <div className="inline-actions">
              <button className="btn primary" type="submit">승인하고 배정</button>
              <button className="btn danger" type="button" onClick={() => onDecide(false)}>반려</button>
            </div>
            <p className="quiet">승인해도 비행은 시작하지 않습니다. 사진과 메모는 남습니다.</p>
          </form>
        ) : <p className="ok-note">운영자의 인계 승인을 기다리는 중입니다.</p>
      ) : canRequestHandover({
        id: zone.id,
        label: zone.label,
        taskStatus: zone.taskStatus,
        observationStatus: zone.observationStatus,
        assigneeId: zone.assigneeId,
        photoCount: photos.length,
      }, false) && editable ? (
        <form className="sheet" onSubmit={(event) => { event.preventDefault(); onRequest(); }}>
          <h3>인계 요청</h3>
          <label>중단 사유<textarea value={handoverReason} onChange={(event) => onHandoverReason(event.target.value)} required /></label>
          <label>제안 담당
            <select value={nextUser} onChange={(event) => onNextUser(event.target.value)}>
              <option value="">운영자가 정함</option>
              {members.map((member) => <option key={member.userId} value={member.userId}>{member.callsign}</option>)}
            </select>
          </label>
          <button className="btn" type="submit">중단하고 승인 요청</button>
        </form>
      ) : null}
    </div>
  );
}
