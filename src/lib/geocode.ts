import { parseLatLng, type PlaceHit } from './place';

export type { PlaceHit };

let nextSlot = 0;

async function waitTurn(): Promise<void> {
  const now = Date.now();
  const delay = Math.max(0, nextSlot - now);
  nextSlot = Math.max(nextSlot, now) + 1100;
  if (delay) await new Promise((resolve) => window.setTimeout(resolve, delay));
}

export async function searchPlaces(query: string): Promise<PlaceHit[]> {
  const typed = query.trim();
  if (typed.length < 2) return [];
  const direct = parseLatLng(typed);
  if (direct) return [direct];
  await waitTurn();
  const url = new URL('https://nominatim.openstreetmap.org/search');
  url.searchParams.set('format', 'jsonv2');
  url.searchParams.set('q', typed);
  url.searchParams.set('limit', '5');
  url.searchParams.set('countrycodes', 'kr');
  url.searchParams.set('accept-language', 'ko');
  let response: Response;
  try {
    response = await fetch(url, { headers: { 'Accept-Language': 'ko' } });
  } catch {
    throw new Error('장소 검색이 잠시 안 됩니다. 위도,경도를 적어 주세요.');
  }
  if (!response.ok) throw new Error('장소 검색이 잠시 안 됩니다. 위도,경도를 적어 주세요.');
  const rows = await response.json() as Array<{ display_name?: string; lat?: string; lon?: string }>;
  return rows.flatMap((row) => {
    const lat = Number(row.lat);
    const lng = Number(row.lon);
    if (!Number.isFinite(lat) || !Number.isFinite(lng)) return [];
    const label = (row.display_name ?? '').split(',').slice(0, 3).join(',').trim();
    return [{ label: label || '장소', lat, lng }];
  });
}
