import { useEffect, useState } from 'react';
import { motion } from 'framer-motion';
import { canRequestHandover, isValidPath, movedMeters, type LatLng } from '../domain/rules';
import { reportHtml } from '../domain/report';
import Press from '../components/Press';
import MapCanvas from '../mission/MapCanvas';
import { useMission } from '../mission/useMission';

export default function MissionScreen({ missionId, selfId, onBack }: { missionId: string; selfId: string; onBack: () => void }) {
  const mission = useMission(missionId, selfId);
  const data = mission.data;
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [drawing, setDrawing] = useState(false);
  const [mode, setMode] = useState<'actions' | 'stop' | 'more'>('actions');
  const [reason, setReason] = useState('');
  const self = mission.self;

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

  if (!data) {
    return (
      <main className="flow">
        <div className="skeleton title" />
        <div className="skeleton card" />
        <p className="sub">{mission.error || '지도를 준비하고 있어요.'}</p>
      </main>
    );
  }

  const zone = data.zones.find((item) => item.id === selectedId) ?? null;
  const pending = data.handovers.find((item) => item.zoneId === zone?.id && item.status === 'pending') ?? null;
  const operator = self?.role === 'operator';
  const photos = data.photos.filter((photo) => photo.zoneId === zone?.id);

  const pick = (point: LatLng) => {
    if (drawing) setDraft((value) => value.length >= 24 ? value : [...value, point]);
  };

  const saveZone = async () => {
    if (!isValidPath(draft)) return;
    await mission.createZone(`구역 ${data.zones.length + 1}`, draft);
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
    <div className="board">
      <header className="float-bar">
        <button className="text-link" type="button" onClick={onBack}>코드</button>
        <b>{data.mission.joinCode}</b>
        <span className={mission.live ? 'dot on' : 'dot'} aria-label={mission.live ? '실시간 연결' : '연결 확인 중'} />
      </header>
      <MapCanvas
        zones={data.zones}
        points={data.points}
        members={data.members}
        selfId={selfId}
        selectedZoneId={selectedId}
        draft={draft}
        showLocate
        active
        onPick={drawing ? pick : undefined}
        onSelectZone={(id) => { setSelectedId(id); setMode('actions'); setDrawing(false); }}
      />
      <motion.section
        className="sheet"
        initial={{ y: 28, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        transition={{ type: 'spring', stiffness: 280, damping: 30 }}
      >
        <span className="grab" aria-hidden="true" />
        {mission.error ? <p className="error" role="alert">{mission.error}</p> : null}
        {drawing ? (
          <>
            <h2>지도를 눌러<br />구역을 그리세요.</h2>
            <p className="sub">{draft.length}개 점</p>
            <div className="pair">
              <button className="press press-quiet" type="button" onClick={() => setDraft((value) => value.slice(0, -1))}>취소</button>
              <Press disabled={!isValidPath(draft)} onClick={() => void saveZone()}>저장</Press>
            </div>
          </>
        ) : zone && pending && operator ? (
          <>
            <h2>{zone.label}<br />이어받을까요?</h2>
            <p className="sub">{pending.interruptionReason}</p>
            <Press onClick={() => void mission.decideHandover(pending.id, true, '이어서 확인', pending.toUser ?? selfId)}>승인</Press>
          </>
        ) : zone && mode === 'stop' ? (
          <>
            <h2>왜 멈추나요?</h2>
            <textarea value={reason} onChange={(event) => setReason(event.target.value)} placeholder="통신이 끊겼어요" aria-label="중단 이유" />
            <Press disabled={reason.trim().length < 2} onClick={() => { void mission.requestHandover(zone.id, reason, null); setMode('actions'); setReason(''); }}>보내기</Press>
          </>
        ) : zone ? (
          <>
            <h2>{zone.label}</h2>
            <div className="pair">
              <Press onClick={() => void mission.updateZone(zone, { taskStatus: 'completed' })}>완료</Press>
              <label className="press press-quiet file">
                사진
                <input type="file" accept="image/*" onChange={(event) => {
                  const file = event.target.files?.[0];
                  event.target.value = '';
                  if (file) void mission.uploadPhoto(zone.id, file, '');
                }} />
              </label>
            </div>
            {photos[0]?.url ? <img className="shot" src={photos[0].url} alt="" /> : null}
            {canRequestHandover({
              id: zone.id, label: zone.label, taskStatus: zone.taskStatus, observationStatus: zone.observationStatus, assigneeId: zone.assigneeId, photoCount: photos.length,
            }, Boolean(pending)) ? <button className="text-link" type="button" onClick={() => setMode('stop')}>중단 보고</button> : null}
            {pending ? <p className="sub">승인을 기다리고 있어요.</p> : null}
          </>
        ) : (
          <>
            <h2>{data.zones.length ? '구역을 누르세요.' : '첫 구역을 그리세요.'}</h2>
            <Press onClick={() => { setDrawing(true); setSelectedId(null); }}>구역 그리기</Press>
            <button className="text-link" type="button" onClick={downloadReport}>보고서</button>
          </>
        )}
      </motion.section>
    </div>
  );
}
