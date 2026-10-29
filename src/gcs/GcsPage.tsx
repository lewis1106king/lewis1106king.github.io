import { useEffect, useMemo, useRef, useState, type CSSProperties } from 'react';
import {
  ArrowLeft,
  Battery,
  CircleAlert,
  Compass,
  Crosshair,
  Eye,
  Gauge,
  Layers,
  LocateFixed,
  MapPinned,
  Pause,
  Radio,
  Satellite,
  Settings2,
  Signal,
  SlidersHorizontal,
  TriangleAlert,
} from 'lucide-react';
import { flightRoutes, fleetDrones, stateTone, type FleetDrone } from './fleet';
import './gcs.css';

type GcsPageProps = {
  onBack: () => void;
};

const dataWindow = [12, 17, 15, 22, 20, 27, 24, 31, 29, 35, 32, 38];
type CompactPanel = 'fleet' | 'airspace' | 'focus';

function MiniBars({ value, tone = 'bg-slate-400' }: { value: number; tone?: string }) {
  const active = Math.max(0, Math.ceil(value / 25));
  return (
    <span className="inline-flex h-3 items-end gap-px" aria-label={`연결 강도 ${value}%`}>
      {[1, 2, 3, 4].map((bar) => (
        <i
          className={`block w-1 rounded-[1px] ${bar <= active ? tone : 'bg-slate-800'}`}
          style={{ height: `${bar * 23 + 8}%` }}
          key={bar}
        />
      ))}
    </span>
  );
}

function BatteryLine({ value, compact = false }: { value: number; compact?: boolean }) {
  const tone = value <= 20 ? 'bg-rose-500' : value <= 45 ? 'bg-amber-500' : 'bg-emerald-500';
  return (
    <span className="inline-flex min-w-0 items-center gap-1.5">
      <Battery size={compact ? 12 : 14} strokeWidth={1.6} aria-hidden="true" />
      <span className="h-1.5 w-10 overflow-hidden rounded-[1px] bg-slate-800" aria-hidden="true">
        <span className={`block h-full ${tone}`} style={{ width: `${value}%` }} />
      </span>
      <b className="gcs-numeric font-medium text-slate-300">{value}%</b>
    </span>
  );
}

function TelemetryMetric({ label, value, unit }: { label: string; value: string | number; unit: string }) {
  return (
    <div className="border-b border-slate-800/80 py-2.5 last:border-b-0">
      <p className="mb-1 text-[10px] font-medium uppercase tracking-[0.12em] text-slate-500">{label}</p>
      <p className="gcs-numeric text-sm font-medium text-slate-200">
        {value} <span className="text-[10px] font-normal text-slate-500">{unit}</span>
      </p>
    </div>
  );
}

function FlightPathChart({ tone }: { tone: string }) {
  const points = useMemo(() => dataWindow.map((value, index) => `${index * 24},${58 - value}`).join(' '), []);
  return (
    <svg viewBox="0 0 264 64" className="h-16 w-full" role="img" aria-label="최근 고도 추세 시각화">
      {[16, 32, 48].map((y) => <line key={y} x1="0" y1={y} x2="264" y2={y} stroke="#1e293b" strokeWidth="1" />)}
      <polyline points={points} fill="none" stroke={tone} strokeWidth="1.5" vectorEffect="non-scaling-stroke" />
      <circle cx="264" cy={58 - dataWindow[dataWindow.length - 1]} r="2" fill={tone} />
    </svg>
  );
}

function FleetCard({ drone, selected, onSelect }: { drone: FleetDrone; selected: boolean; onSelect: () => void }) {
  const tone = stateTone[drone.state];
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={selected}
      className={`w-full border p-3 text-left transition-colors duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-slate-400/60 ${
        selected ? 'border-slate-600 bg-slate-800/60' : 'border-slate-800/50 bg-slate-900/45 hover:border-slate-700 hover:bg-slate-800/50'
      }`}
    >
      <div className="mb-2 flex items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="gcs-numeric text-[10px] tracking-[0.1em] text-slate-500">{drone.id}</p>
          <p className="mt-0.5 truncate text-[13px] font-medium text-slate-200">{drone.callsign}</p>
        </div>
        <span className={`inline-flex items-center gap-1.5 text-[10px] font-medium ${tone.text}`}>
          <i className={`h-1.5 w-1.5 rounded-full ${tone.dot}`} aria-hidden="true" />
          {drone.stateLabel}
        </span>
      </div>
      <p className="mb-3 truncate text-[10px] text-slate-500">{drone.mission}</p>
      <div className="flex items-center justify-between border-t border-slate-800/80 pt-2 text-[10px] text-slate-500">
        <BatteryLine value={drone.battery} compact />
        <span className="inline-flex items-center gap-1.5"><Radio size={12} aria-hidden="true" /><MiniBars value={drone.signal} tone={tone.dot} /></span>
      </div>
    </button>
  );
}

export default function GcsPage({ onBack }: GcsPageProps) {
  const [selectedId, setSelectedId] = useState('UAV-03');
  const [toast, setToast] = useState('');
  const [layerMode, setLayerMode] = useState<'ops' | 'terrain'>('ops');
  const [isPaused, setIsPaused] = useState(false);
  const [compactPanel, setCompactPanel] = useState<CompactPanel>('airspace');
  const toastTimer = useRef<number | undefined>(undefined);
  const selected = fleetDrones.find((drone) => drone.id === selectedId) ?? fleetDrones[0];
  const selectedTone = stateTone[selected.state];

  useEffect(() => () => window.clearTimeout(toastTimer.current), []);

  const notify = (message: string) => {
    window.clearTimeout(toastTimer.current);
    setToast(message);
    toastTimer.current = window.setTimeout(() => setToast(''), 3200);
  };

  return (
    <main className="gcs-shell h-dvh overflow-hidden bg-[#0b0f19] font-sans text-slate-100">
      <header className="flex h-12 shrink-0 items-center justify-between border-b border-slate-800/50 bg-[#0b0f19] px-3 sm:px-4">
        <div className="flex min-w-0 items-center gap-3">
          <button type="button" onClick={onBack} className="gcs-header-button" aria-label="소개 화면으로 돌아가기">
            <ArrowLeft size={15} />
          </button>
          <span className="hidden h-4 w-px bg-slate-800 sm:block" />
          <div className="flex items-center gap-2">
            <span className="grid h-6 w-6 place-items-center border border-slate-700 bg-slate-900 text-[11px] font-semibold tracking-tight text-slate-100">S?</span>
            <div className="min-w-0 leading-tight">
              <p className="truncate text-[11px] font-medium tracking-[0.08em] text-slate-200">FLEET GCS</p>
              <p className="hidden text-[9px] tracking-wide text-slate-500 sm:block">SIMULATION OPERATIONS</p>
            </div>
          </div>
          <span className="hidden items-center gap-1.5 border-l border-slate-800 pl-3 text-[10px] text-slate-400 md:inline-flex">
            <i className="h-1.5 w-1.5 rounded-full bg-emerald-500" /> SYSTEM NOMINAL
          </span>
          <span className="gcs-simulation-label whitespace-nowrap text-[9px] tracking-wide text-slate-500">SIM · NO CMD</span>
        </div>

        <div className="flex items-center gap-1.5 sm:gap-3">
          <span className="hidden items-center gap-1.5 text-[10px] text-slate-400 lg:inline-flex"><Satellite size={13} className="text-slate-500" /> GPS 18 / 18</span>
          <span className="hidden items-center gap-1.5 text-[10px] text-slate-400 md:inline-flex"><Radio size={13} className="text-slate-500" /> LINK STABLE</span>
          <button type="button" className="gcs-header-button" onClick={() => notify('가상 작업 대기열을 새로 고쳤습니다. 실제 기체에는 전송되지 않습니다.')}>
            <Settings2 size={14} /><span className="hidden sm:inline">Fleet actions</span>
          </button>
          <button type="button" onClick={() => notify('비상 동작은 시연 모드에서 차단되었습니다. 실제 기체에는 명령이 전송되지 않습니다.')} className="inline-flex h-7 items-center gap-1.5 border border-rose-500/50 px-2.5 text-[10px] font-medium text-rose-300 transition-colors hover:border-rose-400 hover:bg-rose-500/10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-rose-500/60">
            <TriangleAlert size={13} /> EMERGENCY
          </button>
        </div>
      </header>

      <nav className="gcs-mobile-tabs" aria-label="GCS 보조 패널">
        <button type="button" aria-pressed={compactPanel === 'fleet'} onClick={() => setCompactPanel('fleet')}>Fleet</button>
        <button type="button" aria-pressed={compactPanel === 'airspace'} onClick={() => setCompactPanel('airspace')}>Airspace</button>
        <button type="button" aria-pressed={compactPanel === 'focus'} onClick={() => setCompactPanel('focus')}>Focus</button>
      </nav>

      <section className={`gcs-main-grid gcs-panel-${compactPanel} grid h-[calc(100dvh-48px)] min-h-0 grid-cols-[minmax(190px,1fr)_minmax(0,3fr)_minmax(220px,1fr)]`}>
        <aside className="gcs-fleet-panel flex min-h-0 flex-col border-r border-slate-800/50 bg-slate-950/20">
          <div className="flex items-center justify-between border-b border-slate-800/50 px-3 py-3">
            <div>
              <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Fleet Navigator</p>
              <p className="mt-1 text-[11px] text-slate-400">4 assets · 3 airborne</p>
            </div>
            <Signal size={15} className="text-slate-600" />
          </div>
          <div className="gcs-fleet-list grid gap-2 p-2.5">
            {fleetDrones.map((drone) => <FleetCard key={drone.id} drone={drone} selected={drone.id === selected.id} onSelect={() => { setSelectedId(drone.id); setCompactPanel('airspace'); }} />)}
          </div>
          <div className="gcs-fleet-note mt-auto border-t border-slate-800/50 px-3 py-3 text-[10px] text-slate-500">
            <p className="mb-1.5 uppercase tracking-[0.12em]">Operational note</p>
            <p className="leading-relaxed">가상 플릿 상태입니다. 위치·영상·텔레메트리는 실제 항공기 데이터가 아닙니다.</p>
          </div>
        </aside>

        <section className="gcs-airspace-panel relative min-w-0 overflow-hidden bg-[#0d1421]">
          <div className="gcs-map-grid absolute inset-0" aria-hidden="true" />
          <svg viewBox="0 0 1000 640" className="absolute inset-0 h-full w-full" aria-label="가상 공역 및 드론 비행 경로" role="img">
            {fleetDrones.map((drone) => {
              const isSelected = drone.id === selected.id;
              return <path key={drone.id} d={flightRoutes[drone.id]} fill="none" stroke={isSelected ? stateTone[drone.state].line : '#475569'} strokeWidth={isSelected ? '1.8' : '1.1'} strokeDasharray={isSelected ? 'none' : '4 8'} opacity={isSelected ? '1' : '0.7'} />;
            })}
            <path d="M172 108 L360 108" fill="none" stroke="#1e293b" strokeWidth="1" />
            <path d="M740 116 L906 116" fill="none" stroke="#1e293b" strokeWidth="1" />
            <text x="72" y="598" fill="#475569" fontSize="11" letterSpacing="2">OPS GRID · SIMULATED AIRSPACE</text>
            <text x="848" y="598" fill="#475569" fontSize="11">N 37° 30' 42.6&quot;</text>
          </svg>

          <div className="absolute left-3 top-3 flex items-center gap-1 border border-slate-700/60 bg-[#0b0f19]/75 p-1 backdrop-blur-md">
            <button type="button" className={`gcs-map-control ${layerMode === 'ops' ? 'bg-slate-700/70 text-slate-100' : ''}`} onClick={() => setLayerMode('ops')}><Layers size={14} /> Operations</button>
            <button type="button" className={`gcs-map-control ${layerMode === 'terrain' ? 'bg-slate-700/70 text-slate-100' : ''}`} onClick={() => setLayerMode('terrain')}><MapPinned size={14} /> Terrain</button>
          </div>
          <div className="absolute right-3 top-3 flex flex-col border border-slate-700/60 bg-[#0b0f19]/75 p-1 backdrop-blur-md">
            <button type="button" className="gcs-square-control" onClick={() => notify('선택 기체 기준으로 지도 위치를 다시 맞췄습니다.')} aria-label="선택 기체 중심으로 이동"><LocateFixed size={15} /></button>
            <button type="button" className="gcs-square-control" onClick={() => notify('표시 필터를 열었습니다. 시연 모드에서는 필터값이 변경되지 않습니다.')} aria-label="표시 필터"><SlidersHorizontal size={15} /></button>
          </div>
          <div className="absolute bottom-3 left-3 border border-slate-700/60 bg-[#0b0f19]/75 px-2.5 py-2 backdrop-blur-md">
            <p className="text-[9px] uppercase tracking-[0.14em] text-slate-500">Map layer</p>
            <p className="mt-1 text-[11px] font-medium text-slate-300">{layerMode === 'ops' ? 'Operation sectors' : 'Terrain reference'} · 1:4,800</p>
          </div>

          {fleetDrones.map((drone) => {
            const tone = stateTone[drone.state];
            const isSelected = selected.id === drone.id;
            return (
              <button
                type="button"
                key={drone.id}
                className={`gcs-aircraft-node ${isSelected ? 'is-selected' : ''}`}
                style={{ left: `${drone.mapX}%`, top: `${drone.mapY}%`, '--node-tone': tone.line } as CSSProperties}
                onClick={() => setSelectedId(drone.id)}
                aria-pressed={isSelected}
                aria-label={`${drone.callsign} 선택, ${drone.stateLabel}`}
              >
                <span className="gcs-node-reticle"><Crosshair size={14} /></span>
                <span className="gcs-node-label"><b>{drone.callsign}</b><small>{drone.id} · {drone.altitude}m</small></span>
              </button>
            );
          })}

          <div className="gcs-compact-summary absolute bottom-3 right-3 border border-slate-700/60 bg-[#0b0f19]/85 p-3 backdrop-blur-md">
            <p className="text-[10px] uppercase tracking-[0.12em] text-slate-500">Focused asset</p>
            <div className="mt-1.5 flex items-center justify-between gap-6"><span className="text-sm font-medium">{selected.callsign}</span><span className={`text-[10px] ${selectedTone.text}`}>{selected.stateLabel}</span></div>
            <p className="gcs-numeric mt-1 text-[11px] text-slate-400">{selected.altitude}m · {selected.speed}m/s · {selected.battery}%</p>
          </div>
        </section>

        <aside className="gcs-focus-panel flex min-h-0 flex-col border-l border-slate-800/50 bg-slate-950/20">
          <div className="border-b border-slate-800/50 px-3 py-3">
            <div className="flex items-start justify-between gap-2">
              <div>
                <p className="text-[10px] font-medium uppercase tracking-[0.14em] text-slate-500">Focus Hub</p>
                <p className="mt-1 text-sm font-medium text-slate-200">{selected.callsign} <span className="gcs-numeric text-[10px] text-slate-500">{selected.id}</span></p>
              </div>
              <span className={`inline-flex items-center gap-1.5 text-[10px] ${selectedTone.text}`}><i className={`h-1.5 w-1.5 rounded-full ${selectedTone.dot}`} />{selected.stateLabel}</span>
            </div>
          </div>

          <div className="gcs-focus-video gcs-fpv-grid mx-3 mt-3 aspect-[16/9] border border-slate-800/80 bg-slate-900/60">
            <div className="flex h-full flex-col justify-between p-2.5 text-[9px] text-slate-500">
              <div className="flex justify-between"><span>FPV / {selected.payload}</span><span className="gcs-numeric">1080P · SIM</span></div>
              <div className="flex items-center justify-between"><Eye size={14} /><span className="gcs-numeric">{selected.coordinates}</span></div>
            </div>
            <span className="gcs-reticle" aria-hidden="true" />
            <span className="absolute bottom-2 left-2 text-[9px] text-slate-500">No live video source</span>
          </div>

          <div className="gcs-focus-metrics grid grid-cols-2 gap-x-3 px-3 pt-2.5">
            <TelemetryMetric label="Altitude" value={selected.altitude} unit="m AGL" />
            <TelemetryMetric label="Ground speed" value={selected.speed} unit="m/s" />
            <TelemetryMetric label="Heading" value={selected.heading} unit="°" />
            <TelemetryMetric label="Mission ETA" value={selected.eta} unit="min" />
          </div>

          <div className="gcs-focus-chart mx-3 mt-2 border border-slate-800/70 bg-slate-900/35 p-2.5">
            <div className="mb-2 flex items-center justify-between"><span className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-[0.1em] text-slate-500"><Gauge size={12} /> Altitude trend</span><span className="gcs-numeric text-[10px] text-slate-400">09:24:18 UTC</span></div>
            <FlightPathChart tone={selectedTone.line} />
          </div>

          <div className="gcs-focus-power mx-3 mt-2 grid grid-cols-2 gap-2 border-t border-slate-800/50 pt-3 text-[10px] text-slate-400">
            <div><p className="mb-1 text-slate-500">BATTERY</p><BatteryLine value={selected.battery} /></div>
            <div><p className="mb-1 text-slate-500">LINK</p><span className="inline-flex items-center gap-1.5"><MiniBars value={selected.signal} tone={selectedTone.dot} /><b className="gcs-numeric font-medium text-slate-300">{selected.signal}%</b></span></div>
          </div>

          <div className="gcs-focus-actions mt-auto border-t border-slate-800/50 p-3">
            <p className="mb-2 text-[10px] uppercase tracking-[0.12em] text-slate-500">Master action</p>
            <div className="grid grid-cols-2 gap-2">
              <button type="button" onClick={() => { setIsPaused((value) => !value); notify(isPaused ? `${selected.callsign}의 가상 임무 표시를 재개했습니다.` : `${selected.callsign}의 가상 임무 표시를 일시 정지했습니다.`); }} className="gcs-action-button"><Pause size={13} /> {isPaused ? 'Resume view' : 'Pause view'}</button>
              <button type="button" onClick={() => notify('가상 복귀 검토가 기록되었습니다. 실제 경로는 변경되지 않습니다.')} className="gcs-action-button"><Compass size={13} /> Review RTB</button>
            </div>
            <p className="mt-2 flex items-start gap-1.5 text-[9px] leading-relaxed text-slate-500"><CircleAlert size={11} className="mt-0.5 shrink-0" /> 모든 버튼은 가상 인터페이스만 변경합니다. 실제 비행 제어는 연결되지 않았습니다.</p>
          </div>
        </aside>
      </section>

      {toast && <div role="status" className="gcs-toast fixed bottom-3 left-1/2 z-50 -translate-x-1/2 border border-slate-700 bg-slate-900 px-3 py-2 text-[11px] text-slate-200 shadow-lg shadow-black/20">{toast}</div>}
    </main>
  );
}
