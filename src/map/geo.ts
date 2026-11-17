import { movedMeters, type LatLng } from '../domain/rules';

export function ringMeters(path: LatLng[]): number {
  let total = 0;
  for (let index = 1; index < path.length; index += 1) total += movedMeters(path[index - 1], path[index]);
  return total;
}

export function ringArea(path: LatLng[]): number {
  if (path.length < 3) return 0;
  const origin = path[0];
  const xy = path.map((point) => ({
    x: (point.lng - origin.lng) * 111_320 * Math.cos((origin.lat * Math.PI) / 180),
    y: (point.lat - origin.lat) * 111_320,
  }));
  let sum = 0;
  for (let index = 0; index < xy.length; index += 1) {
    const next = xy[(index + 1) % xy.length];
    sum += xy[index].x * next.y - next.x * xy[index].y;
  }
  return Math.abs(sum) / 2;
}

export function bearing(from: LatLng, to: LatLng): number {
  const y = Math.sin(((to.lng - from.lng) * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180);
  const x = Math.cos((from.lat * Math.PI) / 180) * Math.sin((to.lat * Math.PI) / 180)
    - Math.sin((from.lat * Math.PI) / 180) * Math.cos((to.lat * Math.PI) / 180) * Math.cos(((to.lng - from.lng) * Math.PI) / 180);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

function inside(path: LatLng[], point: LatLng): boolean {
  let hit = false;
  for (let index = 0, previous = path.length - 1; index < path.length; previous = index, index += 1) {
    const a = path[index];
    const b = path[previous];
    const crosses = (a.lng > point.lng) !== (b.lng > point.lng)
      && point.lat < ((b.lat - a.lat) * (point.lng - a.lng)) / (b.lng - a.lng + 0.0000001) + a.lat;
    if (crosses) hit = !hit;
  }
  return hit;
}

export type Cell = { id: string; south: number; north: number; west: number; east: number };

export function searchGrid(path: LatLng[], stepMeters = 40): Cell[] {
  if (path.length < 3) return [];
  const lats = path.map((point) => point.lat);
  const lngs = path.map((point) => point.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const west = Math.min(...lngs);
  const east = Math.max(...lngs);
  const mid = (south + north) / 2;
  const dLat = stepMeters / 111_320;
  const dLng = stepMeters / (111_320 * Math.cos((mid * Math.PI) / 180) || 1);
  const rows = Math.min(8, Math.max(1, Math.ceil((north - south) / dLat)));
  const cols = Math.min(8, Math.max(1, Math.ceil((east - west) / dLng)));
  const cells: Cell[] = [];
  for (let row = 0; row < rows; row += 1) {
    for (let col = 0; col < cols; col += 1) {
      const cell = {
        id: `${row}-${col}`,
        south: south + ((north - south) * row) / rows,
        north: south + ((north - south) * (row + 1)) / rows,
        west: west + ((east - west) * col) / cols,
        east: west + ((east - west) * (col + 1)) / cols,
      };
      const center = { lat: (cell.south + cell.north) / 2, lng: (cell.west + cell.east) / 2 };
      if (inside(path, center)) cells.push(cell);
    }
  }
  return cells;
}

export function cellCovers(cell: Cell, point: LatLng): boolean {
  return point.lat >= cell.south && point.lat <= cell.north && point.lng >= cell.west && point.lng <= cell.east;
}

export function rectPath(a: LatLng, b: LatLng): LatLng[] {
  return [
    { lat: a.lat, lng: a.lng },
    { lat: a.lat, lng: b.lng },
    { lat: b.lat, lng: b.lng },
    { lat: b.lat, lng: a.lng },
  ];
}
