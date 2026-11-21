import { defaultLook, sanitizeLook } from './look';

function fail(message: string): never {
  throw new Error(message);
}

const messy = sanitizeLook({ night: 1, accent: 'red', radius: 80, type: 9, battery: 90, grid: 15, search: false });
if (!messy.night || messy.accent !== defaultLook.accent) fail('색은 여섯 자리여야 합니다.');
if (messy.radius !== 22 || messy.type !== 14 || messy.battery !== 50 || messy.grid !== 40) fail('범위를 넘기면 안쪽으로 모아야 합니다.');
if (messy.search) fail('검색은 끌 수 있어야 합니다.');
const empty = sanitizeLook(null);
if (empty.accent !== '#1d4ed8' || empty.tools !== true || empty.grid !== 40) fail('비어 있으면 기본값입니다.');

console.log('look tests passed');
