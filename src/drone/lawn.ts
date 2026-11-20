import type { LatLng } from '../domain/rules';

export function lawnmower(path: LatLng[], spacingMeters: number): LatLng[] {
  if (path.length < 3) return [];
  const spacing = Math.min(80, Math.max(15, spacingMeters));
  const lats = path.map((point) => point.lat);
  const lngs = path.map((point) => point.lng);
  const south = Math.min(...lats);
  const north = Math.max(...lats);
  const dLat = spacing / 111_320;
  const points: LatLng[] = [];
  let flip = false;
  for (let lat = south + dLat / 2; lat < north - dLat / 4; lat += dLat) {
    const hits: number[] = [];
    for (let index = 0; index < path.length; index += 1) {
      const start = path[index];
      const end = path[(index + 1) % path.length];
      const low = Math.min(start.lat, end.lat);
      const high = Math.max(start.lat, end.lat);
      if (lat <= low || lat > high || start.lat === end.lat) continue;
      const ratio = (lat - start.lat) / (end.lat - start.lat);
      hits.push(start.lng + ratio * (end.lng - start.lng));
    }
    hits.sort((left, right) => left - right);
    const unique = hits.filter((value, index) => index === 0 || Math.abs(value - hits[index - 1]) > 1e-8);
    const segment: LatLng[] = [];
    for (let index = 0; index + 1 < unique.length; index += 2) {
      const west = Math.min(unique[index], unique[index + 1]);
      const east = Math.max(unique[index], unique[index + 1]);
      if (east - west < 1e-6) continue;
      segment.push({ lat, lng: west }, { lat, lng: east });
    }
    if (!segment.length) continue;
    points.push(...(flip ? segment.reverse() : segment));
    flip = !flip;
    if (points.length >= 36) break;
  }
  return points.slice(0, 36);
}
