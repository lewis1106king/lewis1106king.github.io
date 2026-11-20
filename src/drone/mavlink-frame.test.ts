import {
  CMD,
  MavlinkStream,
  encodeV2,
  gpsLabel,
  heartbeatPacket,
  mavlinkCrc,
  repositionPacket,
  rtlPacket,
} from './mavlink-frame';

function fail(message: string): never {
  throw new Error(message);
}

const heartbeat = heartbeatPacket();
const hex = [...heartbeat].map((byte) => byte.toString(16).padStart(2, '0')).join('');
if (hex !== 'fd09000000ffbe0000000000000006080004033d48') fail('지상국 심박 바이트가 알려진 패킷과 다릅니다.');
const stream = new MavlinkStream();
const parsed = stream.push(heartbeat);
if (parsed.length !== 1 || parsed[0].id !== 0) fail('심박 패킷을 읽어야 합니다.');
if (parsed[0].id === 0 && (parsed[0].type !== 6 || parsed[0].autopilot !== 8)) fail('지상국 심박이어야 합니다.');

const broken = heartbeat.slice();
broken[broken.length - 1] ^= 0xff;
if (new MavlinkStream().push(broken).length !== 0) fail('CRC가 틀리면 버려야 합니다.');

const payload: number[] = [];
const view = new DataView(new ArrayBuffer(28));
view.setUint32(0, 1000, true);
view.setInt32(4, 376871818, true);
view.setInt32(8, 1265935287, true);
view.setInt32(12, 50000, true);
view.setInt32(16, 32000, true);
view.setInt16(20, 1000, true);
view.setInt16(22, 0, true);
view.setInt16(24, 0, true);
view.setUint16(26, 9000, true);
for (let index = 0; index < 28; index += 1) payload.push(view.getUint8(index));
const position = encodeV2(33, payload, 1, 1);
const got = new MavlinkStream().push(position)[0];
if (!got || got.id !== 33) fail('위치를 읽어야 합니다.');
if (got.id === 33 && (Math.abs(got.lat - 37.6871818) > 1e-6 || Math.abs(got.relativeM - 32) > 0.01 || got.heading !== 90)) {
  fail('위도, 고도, 기수가 맞아야 합니다.');
}

const crc = mavlinkCrc(position.slice(1, position.length - 2), 104);
const wire = position[position.length - 2] | (position[position.length - 1] << 8);
if (crc !== wire) fail('위치 패킷 CRC가 정의와 다릅니다.');

const move = repositionPacket(37.5, 127.1, 30);
const commandAt = move.length - 9;
const command = move[commandAt] | (move[commandAt + 1] << 8);
if (command !== CMD.reposition) fail('이동 명령은 위치 변경이어야 합니다.');
const decodedMove = new MavlinkStream().push(move)[0];
if (!decodedMove || decodedMove.id !== 75 || decodedMove.command !== CMD.reposition || Math.abs(decodedMove.lat - 37.5) > 1e-6) {
  fail('이동 명령을 다시 읽어야 합니다.');
}
const rtl = rtlPacket();
const rtlAt = rtl.length - 7;
const rtlCommand = rtl[rtlAt] | (rtl[rtlAt + 1] << 8);
if (rtlCommand !== CMD.rtl) fail('복귀 명령이어야 합니다.');
const banned = new Set([22, 400]);
if (banned.has(command) || banned.has(rtlCommand)) fail('시동과 이륙 명령은 보내지 않습니다.');
if (gpsLabel(3) !== 'GPS 3D' || gpsLabel(0) !== 'GPS 없음') fail('GPS 상태 문구');

console.log('mavlink frame tests passed');
