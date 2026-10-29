export type FlightState = 'stable' | 'caution' | 'alert' | 'offline';

export type FleetDrone = {
  id: string;
  callsign: string;
  model: string;
  state: FlightState;
  stateLabel: string;
  battery: number;
  signal: number;
  altitude: number;
  speed: number;
  heading: number;
  coordinates: string;
  mission: string;
  eta: string;
  mapX: number;
  mapY: number;
  route: string;
  payload: string;
};

export const fleetDrones: FleetDrone[] = [
  {
    id: 'UAV-01',
    callsign: 'Kestrel',
    model: 'VTOL Survey',
    state: 'stable',
    stateLabel: '안정',
    battery: 88,
    signal: 96,
    altitude: 124,
    speed: 13.8,
    heading: 42,
    coordinates: '37.5128, 127.0284',
    mission: 'Sector A · Sweep 02',
    eta: '08:24',
    mapX: 24,
    mapY: 30,
    route: 'R-02',
    payload: 'EO / IR',
  },
  {
    id: 'UAV-02',
    callsign: 'Orbit',
    model: 'Quad Survey',
    state: 'stable',
    stateLabel: '안정',
    battery: 73,
    signal: 89,
    altitude: 91,
    speed: 10.4,
    heading: 118,
    coordinates: '37.5142, 127.0319',
    mission: 'Sector B · Verify 01',
    eta: '06:12',
    mapX: 53,
    mapY: 48,
    route: 'R-04',
    payload: 'EO / IR',
  },
  {
    id: 'UAV-03',
    callsign: 'Lynx',
    model: 'Quad Survey',
    state: 'caution',
    stateLabel: '주의',
    battery: 42,
    signal: 67,
    altitude: 67,
    speed: 8.9,
    heading: 276,
    coordinates: '37.5104, 127.0358',
    mission: 'Sector C · Handover',
    eta: '03:47',
    mapX: 75,
    mapY: 68,
    route: 'R-07',
    payload: 'EO / IR',
  },
  {
    id: 'UAV-04',
    callsign: 'Hawk',
    model: 'Quad Survey',
    state: 'offline',
    stateLabel: '오프라인',
    battery: 100,
    signal: 0,
    altitude: 0,
    speed: 0,
    heading: 0,
    coordinates: 'Home · Pad 02',
    mission: 'Standby',
    eta: '—',
    mapX: 12,
    mapY: 78,
    route: '—',
    payload: 'EO / IR',
  },
];

export const stateTone: Record<FlightState, { text: string; dot: string; line: string; label: string }> = {
  stable: { text: 'text-emerald-400', dot: 'bg-emerald-500', line: '#10b981', label: '안정' },
  caution: { text: 'text-amber-400', dot: 'bg-amber-500', line: '#f59e0b', label: '주의' },
  alert: { text: 'text-rose-400', dot: 'bg-rose-500', line: '#f43f5e', label: '경보' },
  offline: { text: 'text-slate-500', dot: 'bg-slate-500', line: '#64748b', label: '오프라인' },
};

export const flightRoutes: Record<string, string> = {
  'UAV-01': 'M60 192 L225 168 L348 254 L490 202 L618 260',
  'UAV-02': 'M232 178 L406 244 L524 318 L690 304 L838 392',
  'UAV-03': 'M774 466 L684 398 L556 376 L434 450 L290 502',
  'UAV-04': 'M118 484 L190 430 L248 382',
};
