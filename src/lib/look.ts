export type Look = {
  night: boolean;
  accent: string;
  radius: number;
  type: number;
  search: boolean;
  tools: boolean;
  legend: boolean;
  telem: boolean;
  battery: number;
  grid: number;
};

export const defaultLook: Look = {
  night: false,
  accent: '#1d4ed8',
  radius: 10,
  type: 16,
  search: true,
  tools: true,
  legend: true,
  telem: true,
  battery: 20,
  grid: 40,
};

const grids = [20, 40, 80];

export function sanitizeLook(value: unknown): Look {
  const raw = value && typeof value === 'object' ? value as Partial<Look> : {};
  const accent = typeof raw.accent === 'string' && /^#[0-9a-fA-F]{6}$/.test(raw.accent) ? raw.accent : defaultLook.accent;
  const radius = typeof raw.radius === 'number' ? Math.min(22, Math.max(0, Math.round(raw.radius))) : defaultLook.radius;
  const type = typeof raw.type === 'number' ? Math.min(20, Math.max(14, Math.round(raw.type))) : defaultLook.type;
  const battery = typeof raw.battery === 'number' ? Math.min(50, Math.max(5, Math.round(raw.battery))) : defaultLook.battery;
  const grid = grids.includes(Number(raw.grid)) ? Number(raw.grid) : defaultLook.grid;
  return {
    night: Boolean(raw.night),
    accent,
    radius,
    type,
    search: raw.search !== false,
    tools: raw.tools !== false,
    legend: raw.legend !== false,
    telem: raw.telem !== false,
    battery,
    grid,
  };
}

