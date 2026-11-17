import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { isValidPath, movedMeters, taskLabel, type LatLng } from '../domain/rules';
import { reportHtml } from '../domain/report';
import Press from '../components/Press';
import MapCanvas from '../mission/MapCanvas';
import { useMission } from '../mission/useMission';

export default function MissionScreen({ code, selfId, onBack }: { code: string; selfId: string; onBack: () => void }) {
  const mission = useMission(code, selfId);
  const data = mission.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [drawing, setDrawing] = useState(false);
  const self = mission.self;
  const point = useRef<{ lat: number; lng: number; accuracy: number | null } | null>(null);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition((position) => {
      const next = { lat: position.coords.latitude, lng: position.coords.longitude, accuracy: position.coords.accuracy };
      const last = point.current;
      point.current = next;
      if (last && movedMeters(last, next) < 8) return;
      mission.beat(next);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 4000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [mission.beat]);

  useEffect(() => {
    const timer = window.setInterval(() => mission.beat(point.current), 5000);
    mission.beat(point.current);
    return () => window.clearInterval(timer);
  }, [mission.beat]);

  if (!data) {
    return (
      <main className="flow">
        <div className="skeleton title" />
        <div className="skeleton card" />
        <p className="sub">{mission.error || '지도를 준비하고 있어요.'}</p>
        {mission.error ? <Press onClick={onBack}>홈으로</Press> : null}
      </main>
    );
  }

  const zone = data.zones.find((item) => item.id === selectedId) ?? (data.zones.length === 1 ? data.zones[0] : null);
  const photos = data.photos.filter((photo) => photo.zoneId === zone?.id && photo.url);
  const owner = data.members.find((member) => member.userId === zone?.assigneeId);
  const notice = [...data.notices].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const auto = data.handovers.find((item) => item.zoneId === zone?.id && item.status === 'approved' && item.approvalReason === '자동');

  const saveZone = () => {
    if (!isValidPath(draft)) return;
    mission.createZone(`구역 ${data.zones.length + 1}`, draft);
    setDraft([]);
    setDrawing(false);
  };

  const downloadReport = () => {
    const html = reportHtml({
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
    const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = '수색-보고.html';
    link.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 800);
  };

  return (
    <div
      className="board"
      data-live={mission.live ? '1' : '0'}
      data-zones={data.zones.length}
      data-members={data.members.length}
      data-self={selfId}
      data-assignee={zone?.assigneeId ?? ''}
      data-status={zone?.taskStatus ?? ''}
      data-photos={photos.length}
      data-notice={notice?.message ?? ''}
    >
      <header className="float-bar">
        <button className="text-link" type="button" onClick={onBack}>코드</button>
        <b>{data.mission.joinCode}</b>
        <span className={mission.live ? 'dot on' : 'dot'} aria-label={mission.live ? '연결됨' : '연결 중'} />
      </header>
      <MapCanvas
        zones={data.zones}
        points={data.points}
        members={data.members}
        selfId={selfId}
        selectedZoneId={zone?.id ?? null}
        draft={draft}
        showLocate
        active
        onPick={drawing ? (next) => setDraft((value) => value.length >= 24 ? value : [...value, next]) : undefined}
        onSelectZone={(id) => { setSelectedId(id); setDrawing(false); }}
      />
      <motion.section
        className="sheet"
        initial={{ y: 36, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      >
        <span className="grab" aria-hidden="true" />
        {notice ? (
          <motion.p className="toast" role="status" initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }}>
            {notice.message}
          </motion.p>
        ) : null}
        {mission.error ? <p className="error" role="alert">{mission.error}</p> : null}
        {drawing ? (
          <>
            <h2>지도를 누르세요.</h2>
            <p className="sub">{draft.length}점</p>
            <div className="pair">
              <button className="press press-quiet" type="button" onClick={() => setDraft((value) => value.slice(0, -1))}>취소</button>
              <Press disabled={!isValidPath(draft)} onClick={saveZone}>저장</Press>
            </div>
          </>
        ) : zone ? (
          <>
            <h2>{zone.label}</h2>
            <p className="sub">{owner?.callsign ?? '대기'} · {taskLabel[zone.taskStatus]}</p>
            <div className="pair">
              {zone.taskStatus === 'completed' ? <p className="done">완료</p> : <Press onClick={() => mission.completeZone(zone.id)}>완료</Press>}
              <label className="press press-quiet file">
                사진
                <input type="file" accept="image/*" onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void mission.uploadPhoto(zone.id, file);
                }} />
              </label>
            </div>
            {photos[0]?.url ? <img className="shot" src={photos[0].url} alt="" /> : null}
            {auto ? <button className="text-link" type="button" onClick={() => mission.undoHandover(auto.id)}>되돌리기</button> : null}
          </>
        ) : (
          <>
            <h2>{data.zones.length ? '구역을 누르세요.' : '첫 구역을 그리세요.'}</h2>
            <Press onClick={() => { setDrawing(true); setSelectedId(null); }}>구역 그리기</Press>
            <button className="text-link" type="button" onClick={downloadReport}>보고서</button>
          </>
        )}
        {self?.droneStatus === 'lost' ? <p className="sub">이 드론은 멈췄습니다.</p> : (
          <div className="links">
            <button className="text-link" type="button" onClick={() => mission.dropLink()}>연결 끊기</button>
            <button className="text-link" type="button" onClick={() => mission.drainBattery()}>배터리 부족</button>
          </div>
        )}
      </motion.section>
    </div>
  );
}
