import { useEffect, useRef, useState } from 'react';
import { motion } from 'framer-motion';
import { isValidPath, movedMeters, taskLabel, type LatLng } from '../domain/rules';
import { reportHtml } from '../domain/report';
import { briefingText, zoneCover } from '../domain/brief';
import { searchPlaces, type PlaceHit } from '../lib/geocode';
import { rectPath, ringArea, ringMeters } from '../map/geo';
import Press from '../components/Press';
import MapCanvas from '../mission/MapCanvas';
import { useMission } from '../mission/useMission';
import type { Member, PointKind, Waypoint } from '../mission/types';
import { connectMavlink, type CraftLink, type Telemetry } from '../drone/mavlink';
import { connectSerial, serialAvailable } from '../drone/serial-mavlink';
import { homeMeters, legIndex, preflight, surveyMission } from '../drone/mission-plan';
import { activePoint, flyToward, stepLabel } from '../drone/survey';
import { CameraHub, frameBlob, type Signal } from '../sync/camera';
import type { Fix } from '../sync/edit';
import { openRoom } from '../sync/room';

type Tool = 'zone' | 'draw' | 'rect' | 'measure' | 'mark' | 'edit' | 'seen';

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
  const [focus, setFocus] = useState<{ lat: number; lng: number; zoom: number; key: number } | null>(null);
  const [locateKey, setLocateKey] = useState(0);
  const [copied, setCopied] = useState(false);
  const [feeds, setFeeds] = useState(false);
  const [camError, setCamError] = useState('');
  const [link, setLink] = useState<'sim' | 'phone' | 'mavlink'>('sim');
  const linkRef = useRef(link);
  linkRef.current = link;
  const [craftUrl, setCraftUrl] = useState('ws://127.0.0.1:8777');
  const [linkNote, setLinkNote] = useState('');
  const [telemetry, setTelemetry] = useState<Telemetry | null>(null);
  const [cruise, setCruise] = useState(30);
  const [spacing, setSpacing] = useState(40);
  const [armOpen, setArmOpen] = useState(false);
  const missionRef = useRef(mission);
  missionRef.current = mission;
  const dataRef = useRef(data);
  dataRef.current = data;
  const craftRef = useRef<CraftLink | null>(null);
  const shotRef = useRef('');
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
      if (linkRef.current === 'mavlink') return;
      const next: Fix = {
        lat: position.coords.latitude,
        lng: position.coords.longitude,
        accuracy: position.coords.accuracy,
        heading: typeof position.coords.heading === 'number' && position.coords.heading >= 0 ? position.coords.heading : null,
        speed: typeof position.coords.speed === 'number' && position.coords.speed >= 0 ? position.coords.speed : null,
      };
      const last = point.current;
      point.current = next;
      if (linkRef.current === 'sim' || (last && movedMeters(last, next) < 8)) return;
      mission.beat(next);
    }, () => undefined, { enableHighAccuracy: true, maximumAge: 4000 });
    return () => navigator.geolocation.clearWatch(watch);
  }, [mission.beat]);

  useEffect(() => {
    const timer = window.setInterval(() => {
      if (linkRef.current === 'phone') mission.beat(point.current);
    }, 5000);
    return () => window.clearInterval(timer);
  }, [mission.beat]);

  useEffect(() => {
    if (link !== 'sim') return undefined;
    const timer = window.setInterval(() => {
      const current = dataRef.current;
      const api = missionRef.current;
      if (!current) return;
      const mine = current.members.find((member) => member.userId === selfId);
      if (!mine || mine.droneStatus === 'lost') return;
      const target = activePoint(current, selfId);
      if (!target) return;
      if (mine.lat === null || mine.lng === null) {
        api.applyCraft({ lat: target.lat - 90 / 111_320, lng: target.lng, alt: 30, heading: 0, speed: 0, battery: 76 });
        return;
      }
      if (target.step !== 'enroute') return;
      const step = flyToward({ lat: mine.lat, lng: mine.lng }, target);
      api.applyCraft({ lat: step.lat, lng: step.lng, alt: step.done ? 18 : 32, heading: step.heading, speed: step.speed, battery: mine.battery ?? 76 });
    }, 250);
    return () => window.clearInterval(timer);
  }, [link, selfId]);

  useEffect(() => {
    const timer = window.setInterval(() => missionRef.current.tickSurvey(), 300);
    return () => window.clearInterval(timer);
  }, []);

  useEffect(() => {
    if (!data) return;
    const target = activePoint(data, selfId);
    if (!target || target.step !== 'arrived' || shotRef.current === target.id) return;
    shotRef.current = target.id;
    const video = document.querySelector('video.local') as HTMLVideoElement | null;
    void (video && video.videoWidth > 0 ? frameBlob(video) : paintShot(target.label, self?.alt ?? 20))
      .then((blob) => missionRef.current.uploadPhoto(target.zoneId || target.id, new File([blob], 'scan.jpg', { type: 'image/jpeg' })))
      .then(() => missionRef.current.markShot(target.id))
      .catch(() => { shotRef.current = ''; });
  }, [data, selfId, self?.alt]);

  useEffect(() => () => craftRef.current?.close(), []);

  function watchCraft(fix: Parameters<typeof mission.applyCraft>[0]) {
    missionRef.current.applyCraft(fix);
  }

  function watchTelemetry(next: Telemetry) {
    setTelemetry(next);
  }

  function watchReached(seq: number) {
    const index = legIndex(seq);
    const total = dataRef.current?.waypoints.length ?? 0;
    if (index === null || index >= total) return;
    missionRef.current.markPassed(index);
  }

  function connectUsb() {
    craftRef.current?.close();
    setTelemetry(null);
    setLinkNote('포트를 고르세요.');
    void connectSerial(watchCraft, setLinkNote, watchTelemetry, watchReached)
      .then((craft) => { craftRef.current = craft; })
      .catch(() => setLinkNote('USB 연결을 취소했습니다.'));
  }

  function connectAddress() {
    craftRef.current?.close();
    setTelemetry(null);
    craftRef.current = connectMavlink(craftUrl, watchCraft, setLinkNote, watchTelemetry, watchReached);
  }

  function uploadRoute() {
    const current = dataRef.current;
    const zone = current?.zones.find((item) => item.id === selectedId) ?? current?.zones[0];
    if (!zone || zone.path.length < 3) {
      setLinkNote('구역을 먼저 그리세요.');
      return;
    }
    const home = telemetry?.lat != null && telemetry.lng != null
      ? { lat: telemetry.lat, lng: telemetry.lng }
      : zone.path[0];
    const plan = surveyMission(zone.path, spacing, cruise, home);
    if (plan.legs.length < 2) {
      setLinkNote('구역이 좁아 경로가 없습니다. 간격을 줄여 보세요.');
      return;
    }
    mission.installRoute(zone.id, plan.legs);
    craftRef.current?.upload(plan.items);
  }

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
      return;
    }
    if (tool === 'seen') {
      mission.setLastSeen(next, '');
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
      data-step={activePoint(data, selfId)?.step ?? ((data.waypoints ?? []).length && (data.waypoints ?? []).every((point) => point.step === 'confirmed') ? 'confirmed' : '')}
      data-route={activePoint(data, selfId)?.assigneeId ?? ''}
      data-progress={`${(data.waypoints ?? []).filter((point) => point.step === 'confirmed').length}/${(data.waypoints ?? []).length}`}
    >
      <header className="float-bar">
        <button className="text-link" type="button" onClick={onBack}>코드</button>
        <b>{data.mission.joinCode}</b>
        <span className="net">{mission.live ? '연결' : '이 기기'}</span>
        <span className={mission.live ? 'dot on' : 'dot'} aria-label={mission.live ? '연결됨' : '연결 중'} />
      </header>
      <PlaceBar onJump={(hit) => setFocus({ ...hit, zoom: 16, key: Date.now() })} onLocate={() => setLocateKey((value) => value + 1)} />
      <MapCanvas
        zones={data.zones}
        points={data.points}
        members={data.members}
        waypoints={data.waypoints ?? []}
        lastSeen={data.lastSeen}
        focus={focus}
        locateKey={locateKey}
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
      <motion.section className="sheet" initial={{ y: 36, opacity: 0 }} animate={{ y: 0, opacity: 1 }} transition={{ type: 'spring', stiffness: 280, damping: 30 }}>
        <span className="grab" aria-hidden="true" />
        {link === 'mavlink' ? (
          <TelemetryBar
            telemetry={telemetry}
            note={linkNote}
            cruise={cruise}
            spacing={spacing}
            onCruise={setCruise}
            onSpacing={setSpacing}
            onUpload={uploadRoute}
            onStart={() => craftRef.current?.startAuto()}
            onPause={() => craftRef.current?.pause()}
            onResume={() => craftRef.current?.resume()}
            onRtl={() => craftRef.current?.rtl()}
            onLand={() => craftRef.current?.land()}
            onArm={() => setArmOpen(true)}
          />
        ) : null}
        <PovCard
          drone={drone ?? self}
          point={activePoint(data, selfId)}
          progress={(data.waypoints ?? []).filter((item) => item.step === 'confirmed').length}
          total={(data.waypoints ?? []).length}
          auto={Boolean(data.mission.autoRun)}
          link={link}
          note={linkNote}
          craftUrl={craftUrl}
          stream={hub?.local ?? null}
          onLink={(next) => {
            if (next !== 'mavlink') craftRef.current?.close();
            setLink(next);
          }}
          onUrl={setCraftUrl}
          onUsb={connectUsb}
          onAddress={connectAddress}
          serialOk={serialAvailable()}
          onAuto={() => mission.setAuto(!data.mission.autoRun)}
          onStart={() => mission.startFlight()}
          onConfirm={() => {
            const current = activePoint(data, selfId);
            if (current) mission.confirmPoint(current.id);
          }}
          onRtl={() => craftRef.current?.rtl()}
        />
        {feeds ? (
          <div className="cam-grid">
            {sharing.filter((member) => member.userId !== selfId).map((member) => (
              <CameraTile key={member.userId} stream={hub?.remotes.get(member.userId) ?? null} label={member.callsign} onSnap={(video) => void snap(video)} />
            ))}
            {sharing.every((member) => member.userId === selfId) ? <p className="sub">다른 카메라가 없어요.</p> : null}
          </div>
        ) : null}
        <div className="sheet-main">
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
        ) : tool === 'seen' ? (
          <>
            <h2>마지막 장소를 누르세요.</h2>
            <Press tone="quiet" onClick={() => setTool('zone')}>닫기</Press>
          </>
        ) : tool === 'mark' ? (
          <>
            <h2>어디에 표시할까요?</h2>
            <div className="links">
              <button className={mark === 'person' ? 'text-link on' : 'text-link'} type="button" onClick={() => setMark('person')}>발견</button>
              <button className={mark === 'hazard' ? 'text-link on' : 'text-link'} type="button" onClick={() => setMark('hazard')}>위험</button>
              <button className={mark === 'entry' ? 'text-link on' : 'text-link'} type="button" onClick={() => setMark('entry')}>입구</button>
              <button className={mark === 'clue' ? 'text-link on' : 'text-link'} type="button" onClick={() => setMark('clue')}>의심</button>
            </div>
            <Press tone="quiet" onClick={() => setTool('zone')}>닫기</Press>
          </>
        ) : drone ? (
          <>
            <h2>{drone.callsign}</h2>
            <p className="sub">{drone.droneStatus === 'lost' ? '끊김' : seenLabel(drone.updatedAt)} · {drone.battery === null ? '배터리 —' : `배터리 ${drone.battery}%`}</p>
            <p className="sub">속도 {drone.speed === null ? '—' : `${Math.round(drone.speed)}m/s`} · 방향 {drone.heading === null ? '—' : `${Math.round(drone.heading)}°`}</p>
            <p className="sub">{data.zones.find((item) => item.assigneeId === drone.userId)?.label ?? '맡은 구역 없음'}</p>
            <Press onClick={() => { setFeeds(true); if (drone.userId !== selfId) void hubRef.current?.watch(drone.userId); }}>카메라</Press>
            <button className="text-link" type="button" onClick={() => setMemberId(null)}>닫기</button>
          </>
        ) : poi ? (
          <>
            <h2>{poi.label}</h2>
            <p className="sub">{poi.lat.toFixed(5)}, {poi.lng.toFixed(5)}</p>
            <p className="sub">{poi.createdAt ? new Date(poi.createdAt).toLocaleString('ko-KR') : ''} {poi.memo}</p>
            <button className="text-link" type="button" onClick={() => setPointId(null)}>닫기</button>
          </>
        ) : zone ? (
          <>
            <h2>{zone.label}</h2>
            <p className="sub">{owner?.callsign ?? '대기'} · {taskLabel[zone.taskStatus]} · {(() => {
              const cover = zoneCover(zone.path, data.members.flatMap((member) => member.trail));
              if (!cover.total || cover.seen === 0) return '미수색';
              return `수색 ${Math.round((cover.seen / cover.total) * 100)}%`;
            })()}</p>
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
            <button className="text-link" type="button" onClick={() => { setTool('draw'); setSelectedId(null); setDraft([]); }}>구역 추가</button>
            <button className="text-link" type="button" onClick={() => { setTool('rect'); setDraft([]); }}>사각형</button>
            <button className="text-link" type="button" onClick={() => { setTool('measure'); setDraft([]); }}>거리</button>
            <button className="text-link" type="button" onClick={() => setTool('mark')}>표시</button>
            <button className="text-link" type="button" onClick={() => setTool('seen')}>최종 목격</button>
            <button className="text-link" type="button" onClick={() => {
              void navigator.clipboard.writeText(briefingText(data)).then(() => setCopied(true));
            }}>{copied ? '복사했어요' : '상황 복사'}</button>
            <button className="text-link" type="button" onClick={() => {
              const html = reportHtml({
                title: data.mission.title,
                generatedAt: new Date().toISOString(),
                pendingZoneIds: [],
                extra: briefingText(data),
                zones: data.zones.map((item) => ({
                  id: item.id, label: item.label, taskStatus: item.taskStatus, observationStatus: item.observationStatus,
                  assigneeId: item.assigneeId, photoCount: data.photos.filter((photo) => photo.zoneId === item.id).length,
                  memo: item.memo, reviewReason: item.reviewReason,
                })),
              });
              const url = URL.createObjectURL(new Blob([html], { type: 'text/html;charset=utf-8' }));
              const link = document.createElement('a');
              link.href = url;
              link.download = '수색-기록.html';
              link.click();
            }}>기록</button>
            <button className="text-link" type="button" onClick={() => setFeeds((value) => !value)}>영상</button>
            <button className="text-link" type="button" onClick={() => void shareCamera()}>{hub?.local ? '카메라 끄기' : '내 카메라'}</button>
            {self?.droneStatus === 'lost' ? null : <button className="text-link" type="button" onClick={() => mission.dropLink()}>연결 끊기</button>}
          </div>
        ) : null}
        </div>
      </motion.section>
      {armOpen ? (
        <ArmDialog
          telemetry={telemetry}
          alt={cruise}
          onCancel={() => setArmOpen(false)}
          onConfirm={() => {
            craftRef.current?.armTakeoff(cruise);
            setArmOpen(false);
          }}
        />
      ) : null}
    </div>
  );
}

function TelemetryBar({
  telemetry, note, cruise, spacing, onCruise, onSpacing, onUpload, onStart, onPause, onResume, onRtl, onLand, onArm,
}: {
  telemetry: Telemetry | null;
  note: string;
  cruise: number;
  spacing: number;
  onCruise: (value: number) => void;
  onSpacing: (value: number) => void;
  onUpload: () => void;
  onStart: () => void;
  onPause: () => void;
  onResume: () => void;
  onRtl: () => void;
  onLand: () => void;
  onArm: () => void;
}) {
  const distance = homeMeters(
    telemetry?.lat != null && telemetry.lng != null ? { lat: telemetry.lat, lng: telemetry.lng } : null,
    telemetry?.homeLat != null && telemetry.homeLng != null ? { lat: telemetry.homeLat, lng: telemetry.homeLng } : null,
  );
  const low = telemetry?.battery != null && telemetry.battery <= 20;
  const dropped = telemetry != null && !telemetry.linked;
  const place = telemetry?.lat != null && telemetry.lng != null ? `${telemetry.lat.toFixed(5)}, ${telemetry.lng.toFixed(5)}` : '위치 없음';
  return (
    <section className="telem" data-telem="1" data-mission={`${telemetry?.missionSeq ?? 0}/${telemetry?.missionCount ?? 0}`}>
      <p>{telemetry?.linked ? telemetry.mode : '신호 없음'} · {telemetry?.armed ? '시동됨' : '시동 전'} · 위성 {telemetry?.satellites ?? 0}</p>
      <p>{place} · 고도 {telemetry?.alt == null ? '—' : `${Math.round(telemetry.alt)}m`} · 속도 {telemetry?.speed == null ? '—' : `${telemetry.speed.toFixed(1)}m/s`} · 기수 {telemetry?.heading == null ? '—' : `${Math.round(telemetry.heading)}°`}</p>
      <p>배터리 {telemetry?.battery == null ? '—' : `${telemetry.battery}%`} {telemetry?.voltage == null ? '' : `${telemetry.voltage.toFixed(1)}V`} · 전파 {telemetry?.rssi ?? '—'} · 홈 {distance == null ? '—' : distance >= 1000 ? `${(distance / 1000).toFixed(1)}km` : `${distance}m`} · 임무 {telemetry?.missionSeq ?? 0}/{telemetry?.missionCount ?? 0}</p>
      {low ? <p className="telem-warn">배터리가 낮습니다. 복귀를 누르세요.</p> : null}
      {dropped ? <p className="telem-warn">신호가 없습니다. 복귀를 준비하세요.</p> : null}
      {telemetry?.text ? <p>{telemetry.text}</p> : null}
      {note ? <p data-link-note="1">{note}</p> : null}
      <div className="telem-settings">
        <label>고도<input aria-label="수색 고도" inputMode="numeric" value={cruise} onChange={(event) => onCruise(Number(event.target.value) || 0)} /></label>
        <label>간격<input aria-label="수색 간격" inputMode="numeric" value={spacing} onChange={(event) => onSpacing(Number(event.target.value) || 0)} /></label>
      </div>
      <div className="telem-actions">
        <button className="press press-quiet" type="button" onClick={onUpload}>경로 올리기</button>
        <button className="press press-primary" type="button" onClick={onStart}>자동 수색</button>
        <button className="press press-quiet" type="button" onClick={onPause}>일시정지</button>
        <button className="press press-quiet" type="button" onClick={onResume}>이어하기</button>
        <button className="press press-quiet" type="button" onClick={onRtl}>복귀</button>
        <button className="press press-quiet" type="button" onClick={onLand}>착륙</button>
      </div>
      <button className="text-link" type="button" onClick={onArm}>시동 후 이륙</button>
    </section>
  );
}

function ArmDialog({ telemetry, alt, onCancel, onConfirm }: { telemetry: Telemetry | null; alt: number; onCancel: () => void; onConfirm: () => void }) {
  const reasons = preflight({ linked: Boolean(telemetry?.linked), gpsFix: telemetry?.gpsFix ?? 0, battery: telemetry?.battery ?? null });
  return (
    <div className="confirm-back" role="presentation">
      <div className="confirm" role="dialog" aria-labelledby="arm-title">
        <h2 id="arm-title">시동을 걸고 {alt}m까지 이륙합니다.</h2>
        <p>주변이 안전한지 확인하세요. 이 버튼만 시동과 이륙을 보냅니다.</p>
        {reasons.length ? <ul>{reasons.map((reason) => <li key={reason}>{reason}</li>)}</ul> : <p>GPS, 배터리, 연결이 준비됐습니다.</p>}
        <div className="pair">
          <button className="press press-quiet" type="button" onClick={onCancel}>취소</button>
          <button className="press press-primary" type="button" disabled={reasons.length > 0} onClick={onConfirm}>시동 후 이륙</button>
        </div>
      </div>
    </div>
  );
}

function PlaceBar({ onJump, onLocate }: { onJump: (hit: PlaceHit) => void; onLocate: () => void }) {
  const [query, setQuery] = useState('');
  const [hits, setHits] = useState<PlaceHit[]>([]);
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const run = async () => {
    setBusy(true);
    setNote('');
    try {
      const found = await searchPlaces(query);
      setHits(found);
      if (!found.length) setNote('그 장소를 찾지 못했어요.');
      else onJump(found[0]);
    } catch (reason) {
      setHits([]);
      setNote(reason instanceof Error ? reason.message : '장소 검색이 잠시 안 됩니다.');
    } finally {
      setBusy(false);
    }
  };
  return (
    <form className="place-bar" onSubmit={(event) => { event.preventDefault(); void run(); }}>
      <input aria-label="장소" value={query} placeholder="주소, 장소, 위도,경도" onChange={(event) => setQuery(event.target.value)} />
      <button type="submit" disabled={busy || query.trim().length < 2}>{busy ? '찾는 중' : '찾기'}</button>
      <button type="button" onClick={onLocate}>내 위치</button>
      {note ? <p className="place-note">{note}</p> : null}
      {hits.length ? <p className="place-note">장소 이름 © OpenStreetMap</p> : null}
      {hits.length > 1 ? (
        <ul className="place-list">
          {hits.map((hit) => (
            <li key={`${hit.lat}-${hit.lng}-${hit.label}`}><button type="button" onClick={() => onJump(hit)}>{hit.label}</button></li>
          ))}
        </ul>
      ) : null}
    </form>
  );
}

function paintShot(label: string, alt: number): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = 640;
  canvas.height = 360;
  const context = canvas.getContext('2d');
  if (!context) return Promise.reject(new Error('촬영을 저장하지 못했습니다.'));
  context.fillStyle = '#8eb8ea';
  context.fillRect(0, 0, 640, 190);
  context.fillStyle = '#d5e2b8';
  context.fillRect(0, 190, 640, 170);
  context.fillStyle = '#ffffff';
  context.font = '700 32px Pretendard, sans-serif';
  context.fillText(label, 28, 64);
  context.fillText(`고도 ${Math.round(alt)}m`, 28, 112);
  return new Promise((resolve, reject) => canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error('촬영을 저장하지 못했습니다.')), 'image/jpeg', 0.8));
}

function PovCard({
  drone, point, progress, total, auto, link, note, craftUrl, stream, serialOk, onLink, onUrl, onUsb, onAddress, onAuto, onStart, onConfirm, onRtl,
}: {
  drone: Member | null;
  point: Waypoint | null;
  progress: number;
  total: number;
  auto: boolean;
  link: 'sim' | 'phone' | 'mavlink';
  note: string;
  craftUrl: string;
  stream: MediaStream | null;
  serialOk: boolean;
  onLink: (link: 'sim' | 'phone' | 'mavlink') => void;
  onUrl: (url: string) => void;
  onUsb: () => void;
  onAddress: () => void;
  onAuto: () => void;
  onStart: () => void;
  onConfirm: () => void;
  onRtl: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (videoRef.current) videoRef.current.srcObject = stream;
  }, [stream]);
  return (
    <aside className="pov" data-pov="1">
      <div className="pov-view">
        {stream ? <video ref={videoRef} className="local" autoPlay muted playsInline /> : <div className="horizon" />}
        <p className="pov-read">
          <span>고도 {drone?.alt == null ? '—' : `${Math.round(drone.alt)}m`}</span>
          <span>속도 {drone?.speed == null ? '—' : `${Math.round(drone.speed)}m/s`}</span>
          <span>배터리 {drone?.battery == null ? '—' : `${drone.battery}%`}</span>
          <span>목표 {point ? point.label : '없음'}</span>
        </p>
      </div>
      <div className="pov-body">
        <p className="sub">{point ? stepLabel(point.step) : total > 0 && progress === total ? '확인' : '비행 전'} · {progress}/{total}</p>
        <div className="progress" aria-hidden="true"><i style={{ width: total ? `${(progress / total) * 100}%` : '0%' }} /></div>
        <div className="links">
          <button className={link === 'sim' ? 'text-link on' : 'text-link'} type="button" onClick={() => onLink('sim')}>시뮬레이터</button>
          <button className={link === 'phone' ? 'text-link on' : 'text-link'} type="button" onClick={() => onLink('phone')}>폰 카메라</button>
          <button className={link === 'mavlink' ? 'text-link on' : 'text-link'} type="button" onClick={() => onLink('mavlink')}>기체</button>
        </div>
        {link === 'mavlink' ? (
          <div className="craft-actions">
            {serialOk ? <button className="press press-primary" type="button" onClick={onUsb}>드론 연결 (USB)</button> : (
              <p className="sub">이 브라우저는 USB 연결을 지원하지 않습니다. 컴퓨터는 Chrome이나 Edge, 안드로이드는 Chrome에서 USB로 연결하세요. 아이폰 Safari와 Firefox는 안 됩니다. 폰 카메라를 쓰세요.</p>
            )}
            <input aria-label="기체 주소" placeholder="ws:// 주소" value={craftUrl} onChange={(event) => onUrl(event.target.value)} />
            <button className="press press-quiet" type="button" onClick={onAddress}>주소 연결</button>
            <p className="sub">DJI 일반 드론은 브라우저에 바로 연결되지 않습니다. DJI 앱이나 DJI Cloud API가 필요합니다.</p>
          </div>
        ) : null}
        {note ? <p className="sub" data-link-note="1">{note}</p> : null}
        <div className="pair">
          <Press onClick={onStart}>비행 시작</Press>
          <button className={auto ? 'press press-primary' : 'press press-quiet'} type="button" onClick={onAuto}>자동 진행</button>
        </div>
        {point && (point.step === 'shot' || point.step === 'arrived') && !auto ? <Press onClick={onConfirm}>확인 후 다음</Press> : null}
        {link === 'mavlink' ? <button className="text-link" type="button" onClick={onRtl}>복귀</button> : null}
      </div>
    </aside>
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
