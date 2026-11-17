import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { isValidPath, movedMeters, taskLabel, type LatLng } from '../domain/rules';
import { reportHtml } from '../domain/report';
import { rectPath, ringArea, ringMeters } from '../map/geo';
import Press from '../components/Press';
import MapCanvas from '../mission/MapCanvas';
import { useMission } from '../mission/useMission';
import type { PointKind } from '../mission/types';
import { CameraHub, frameBlob, type Signal } from '../sync/camera';
import type { Fix } from '../sync/edit';
import { openRoom } from '../sync/room';

type Tool = 'zone' | 'draw' | 'rect' | 'measure' | 'mark' | 'edit';

function seenLabel(iso: string): string {
  const seconds = Math.max(0, Math.round((Date.now() - Date.parse(iso)) / 1000));
  if (seconds < 5) return '방금';
  if (seconds < 60) return `${seconds}초 전`;
  return `${Math.round(seconds / 60)}분 전`;
}

export default function MissionScreen({ code, selfId, onBack }: { code: string; selfId: string; onBack: () => void }) {
  const mission = useMission(code, selfId);
  const data = mission.data;
  const boardRef = useRef<HTMLDivElement>(null);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [memberId, setMemberId] = useState<string | null>(null);
  const [pointId, setPointId] = useState<string | null>(null);
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [tool, setTool] = useState<Tool>('zone');
  const [mark, setMark] = useState<PointKind>('person');
  const [vertex, setVertex] = useState<number | null>(null);
  const [base, setBase] = useState<'map' | 'sat'>('map');
  const [feeds, setFeeds] = useState(false);
  const [camError, setCamError] = useState('');
  const [camTick, setCamTick] = useState(0);
  const hubRef = useRef<CameraHub | null>(null);
  const point = useRef<Fix | null>(null);
  const self = mission.self;

  useEffect(() => {
    const room = openRoom(code);
    const hub = new CameraHub(selfId, (signal) => room.sendSignal(JSON.stringify(signal)), () => setCamTick((value) => value + 1));
    hubRef.current = hub;
    const stop = room.onSignal((text) => {
      try { void hub.handle(JSON.parse(text) as Signal); } catch { /* 다른 기기의 신호가 아니면 넘긴다. */ }
    });
    return () => {
      stop();
      hub.stop();
    };
  }, [code, selfId]);

  useEffect(() => {
    if (!feeds || !data) return;
    data.members.filter((member) => member.camera && member.userId !== selfId).forEach((member) => {
      void hubRef.current?.watch(member.userId);
    });
  }, [feeds, data, selfId]);

  useEffect(() => {
    if (!navigator.geolocation) return undefined;
    const watch = navigator.geolocation.watchPosition((position) => {
      const next: Fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: typeof position.coords.heading === 'number' && position.coords.heading >= 0 ? position.coords.heading : null,
        speed: typeof position.coords.speed === 'number' && position.coords.speed >= 0 ? position.coords.speed : null,
      };
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

  useEffect(() => {
    const battery = navigator as Navigator & { getBattery?: () => Promise<{ level: number }> };
    void battery.getBattery?.().then((status) => {
      const level = Math.round(status.level * 100);
      if (level > 15) mission.setBattery(level);
    }).catch(() => undefined);
  }, [mission.setBattery]);

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

  const zone = data.zones.find((item) => item.id === selectedId) ?? (tool === 'zone' && data.zones.length === 1 ? data.zones[0] : null);
  const photos = data.photos.filter((photo) => photo.zoneId === zone?.id && photo.url);
  const owner = data.members.find((member) => member.userId === zone?.assigneeId);
  const drone = data.members.find((member) => member.userId === memberId) ?? null;
  const poi = data.points.find((item) => item.id === pointId) ?? null;
  const notice = [...data.notices].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  const auto = data.handovers.find((item) => item.zoneId === zone?.id && item.status === 'approved' && item.approvalReason === '자동');
  const hub = camTick >= 0 ? hubRef.current : null;
  const sharing = data.members.filter((member) => member.camera);

  const pick = (next: LatLng) => {
    if (tool === 'draw' || tool === 'measure' || tool === 'rect') {
      setDraft((value) => value.length >= 24 ? value : [...value, next]);
      return;
    }
    if (tool === 'edit' && zone && vertex !== null) {
      mission.moveVertex(zone.id, vertex, next);
      setVertex(null);
      return;
    }
    if (tool === 'mark') {
      mission.addMark(mark, next, '');
      setTool('zone');
    }
  };

  const saveZone = () => {
    const path = tool === 'rect' && draft.length >= 2 ? rectPath(draft[0], draft[1]) : draft;
    if (!isValidPath(path)) return;
    mission.createZone(`구역 ${data.zones.length + 1}`, path);
    setDraft([]);
    setTool('zone');
  };

  const fullscreen = () => {
    const node = boardRef.current;
    if (!node) return;
    if (document.fullscreenElement) void document.exitFullscreen();
    else void node.requestFullscreen?.();
  };

  const shareCamera = async () => {
    const current = hubRef.current;
    if (!current) return;
    if (current.local) {
      current.stop();
      mission.setSharing(false);
      return;
    }
    await current.start();
    if (current.local) {
      mission.setSharing(true);
      setFeeds(true);
      setCamError('');
    } else setCamError(current.error);
  };

  const snap = async (video: HTMLVideoElement) => {
    const target = zone?.id ?? data.zones.find((item) => item.assigneeId === selfId)?.id ?? data.zones[0]?.id;
    if (!target) return;
    const blob = await frameBlob(video);
    await mission.uploadPhoto(target, new File([blob], 'live.jpg', { type: 'image/jpeg' }));
  };

  return (
    <div
      className="board"
      ref={boardRef}
      data-live={mission.live ? '1' : '0'}
      data-zones={data.zones.length}
      data-members={data.members.length}
      data-self={selfId}
      data-assignee={zone?.assigneeId ?? ''}
      data-status={zone?.taskStatus ?? ''}
      data-photos={photos.length}
      data-notice={notice?.message ?? ''}
      data-drone={drone?.callsign ?? ''}
      data-feeds={feeds ? '1' : '0'}
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
        base={base}
        heading={self?.heading}
        showLocate
        showTools
        closeUp
        active
        onPick={tool === 'zone' ? undefined : pick}
        onSelectZone={(id) => { setSelectedId(id); setMemberId(null); setPointId(null); setTool('zone'); }}
        onSelectMember={(id) => { setMemberId(id); setPointId(null); setTool('zone'); }}
        onSelectPoint={(id) => { setPointId(id); setMemberId(null); }}
        onVertex={(index) => { setVertex(index); setTool('edit'); }}
        onBase={setBase}
        onFullscreen={fullscreen}
      />
      {feeds ? (
        <div className="cam-grid">
          {hub?.local ? <CameraTile stream={hub.local} label="나" local onSnap={(video) => void snap(video)} /> : null}
          {sharing.filter((member) => member.userId !== selfId).map((member) => (
            <CameraTile key={member.userId} stream={hub?.remotes.get(member.userId) ?? null} label={member.callsign} onSnap={(video) => void snap(video)} />
          ))}
          {!hub?.local && sharing.every((member) => member.userId === selfId) ? <p className="toast">켜진 카메라가 없어요.</p> : null}
        </div>
      ) : null}
      <motion.section className="sheet" initial={{ y: 36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 30 }}>
        <span className="grab" aria-hidden="true" />
        {notice && tool === 'zone' && !drone ? <p className="toast" role="status">{notice.message}</p> : null}
        {camError ? <p className="error" role="alert">{camError}</p> : null}
        {mission.error ? <p className="error" role="alert">{mission.error}</p> : null}
        {tool === 'draw' || tool === 'rect' || tool === 'edit' ? (
          <>
            <h2>{tool === 'rect' ? '두 모서리를 누르세요.' : tool === 'edit' ? '점을 옮기세요.' : '지도를 누르세요.'}</h2>
            <p className="sub">{tool === 'edit' && vertex !== null ? `${vertex + 1}번 점` : `${draft.length}점`}</p>
            <div className="pair">
              <button className="press press-quiet" type="button" onClick={() => { setDraft([]); setTool('zone'); }}>취소</button>
              <Press disabled={tool === 'edit' || !isValidPath(tool === 'rect' && draft.length >= 2 ? rectPath(draft[0], draft[1]) : draft)} onClick={saveZone}>저장</Press>
            </div>
          </>
        ) : tool === 'measure' ? (
          <>
            <h2>거리를 재세요.</h2>
            <p className="sub">{Math.round(ringMeters(draft))}m · {Math.round(ringArea(draft)).toLocaleString('ko-KR')}㎡</p>
            <Press tone="quiet" onClick={() => { setDraft([]); setTool('zone'); }}>닫기</Press>
          </>
        ) : tool === 'mark' ? (
          <>
            <h2>어디에 표시할까요?</h2>
            <div className="links">
              <button className={mark === 'person' ? 'text-link on' : 'text-link'} type="button" onClick={() => setMark('person')}>발견</button>
              <button className={mark === 'hazard' ? 'text-link on' : 'text-link'} type="button" onClick={() => setMark('hazard')}>위험</button>
              <button className={mark === 'entry' ? 'text-link on' : 'text-link'} type="button" onClick={() => setMark('entry')}>입구</button>
            </div>
            <Press tone="quiet" onClick={() => setTool('zone')}>닫기</Press>
          </>
        ) : drone ? (
          <>
            <h2>{drone.callsign}</h2>
            <p className="sub">{drone.droneStatus === 'lost' ? '끊김' : seenLabel(drone.updatedAt)} · {drone.battery === null ? '배터리 —' : `배터리 ${drone.battery}%`}</p>
            <p className="sub">{drone.speed === null ? '속도 —' : `${drone.speed}m/s`} · {drone.heading === null ? '방향 —' : `${Math.round(drone.heading)}°`}</p>
            <p className="sub">{data.zones.find((item) => item.assigneeId === drone.userId)?.label ?? '맡은 구역 없음'}</p>
            <Press onClick={() => { setFeeds(true); if (drone.userId !== selfId) void hubRef.current?.watch(drone.userId); }}>카메라</Press>
            <button className="text-link" type="button" onClick={() => setMemberId(null)}>닫기</button>
          </>
        ) : poi ? (
          <>
            <h2>{poi.label}</h2>
            <p className="sub">{poi.memo || '메모 없음'}</p>
            <button className="text-link" type="button" onClick={() => setPointId(null)}>닫기</button>
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
            <Press onClick={() => { setTool('draw'); setSelectedId(null); setDraft([]); }}>구역 그리기</Press>
          </>
        )}
        {tool === 'zone' && !drone ? (
          <div className="links">
            <button className="text-link" type="button" onClick={() => { setTool('rect'); setDraft([]); }}>사각형</button>
            <button className="text-link" type="button" onClick={() => { setTool('measure'); setDraft([]); }}>거리</button>
            <button className="text-link" type="button" onClick={() => setTool('mark')}>표시</button>
            <button className="text-link" type="button" onClick={() => setFeeds((value) => !value)}>영상</button>
            <button className="text-link" type="button" onClick={() => void shareCamera()}>{hub?.local ? '카메라 끄기' : '내 카메라'}</button>
            {self?.droneStatus === 'lost' ? null : <button className="text-link" type="button" onClick={() => mission.dropLink()}>연결 끊기</button>}
          </div>
        ) : null}
      </motion.section>
    </div>
  );
}

function CameraTile({ stream, label, local = false, onSnap }: { stream: MediaStream | null; label: string; local?: boolean; onSnap: (video: HTMLVideoElement) => void }) {
  const ref = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (ref.current) ref.current.srcObject = stream;
  }, [stream]);
  return (
    <figure className="cam-tile">
      <video ref={ref} className={local ? 'local' : 'remote'} autoPlay muted playsInline />
      <figcaption>
        {label}
        <button type="button" onClick={() => { if (ref.current) onSnap(ref.current); }}>저장</button>
      </figcaption>
    </figure>
  );
}
