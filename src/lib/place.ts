export type PlaceHit = { label: string; lat: number; lng: number };

export function parseLatLng(query: string): PlaceHit | null {
  const match = query.trim().match(/^(-?\d+(?:\.\d+)?)\s*[, ]\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (lat < -90 || lat > 90 || lng < -180 || lng > 180) return null;
  return { label: `${lat}, ${lng}`, lat, lng };
}
