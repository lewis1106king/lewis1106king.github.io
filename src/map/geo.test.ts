import { cellCovers, rectPath, ringArea, ringMeters, searchGrid } from './geo';

const square = rectPath({ lat: 37.5, lng: 127 }, { lat: 37.501, lng: 127.001 });
if (ringMeters(square) < 100) throw new Error('사각형 둘레가 너무 짧습니다.');
if (ringArea(square) < 1000) throw new Error('사각형 넓이가 너무 작습니다.');
const cells = searchGrid(square, 40);
if (!cells.length) throw new Error('수색 칸이 있어야 합니다.');
if (!cellCovers(cells[0], { lat: (cells[0].south + cells[0].north) / 2, lng: (cells[0].west + cells[0].east) / 2 })) {
  throw new Error('칸 중심은 칸 안입니다.');
}
console.log('geo tests passed');
