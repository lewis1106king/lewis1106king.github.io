import { parseLatLng } from './place';

const hit = parseLatLng('37.687, 126.594');
if (!hit || Math.abs(hit.lat - 37.687) > 0.0001 || Math.abs(hit.lng - 126.594) > 0.0001) {
  throw new Error('좌표를 읽어야 합니다.');
}
if (parseLatLng('김포시 마송고등학교')) throw new Error('지명은 좌표가 아닙니다.');
if (parseLatLng('95, 10')) throw new Error('위도 범위를 넘기면 안 됩니다.');
console.log('place tests passed');
