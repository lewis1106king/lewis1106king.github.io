import { MavlinkStream, missionAckPacket, missionRequestPacket, vehicleGps, vehicleRadio, vehicleStatus, vehicleText } from './mavlink-frame';
import { lawnmower } from './lawn';
import { armTakeoffFrames, autoFrames, continueUpload, openUpload, preflight, surveyMission } from './mission-plan';

function fail(message: string): never {
  throw new Error(message);
}

const rect = [
  { lat: 37.5, lng: 127.0 },
  { lat: 37.5, lng: 127.004 },
  { lat: 37.503, lng: 127.004 },
  { lat: 37.503, lng: 127.0 },
];
const legs = lawnmower(rect, 40);
if (legs.length < 4 || legs.length % 2 !== 0) fail('사각형에는 왕복 지점이 있어야 합니다.');
if (legs[0].lng > legs[1].lng) fail('첫 줄은 서쪽에서 동쪽으로 갑니다.');
if (lawnmower(rect.slice(0, 2), 40).length !== 0) fail('선은 경로가 아닙니다.');

const plan = surveyMission(rect, 40, 30, rect[0]);
if (plan.items[0].command !== 16 || plan.items[1].command !== 206) fail('집과 촬영 간격이 먼저입니다.');
if (plan.items.at(-1)?.command !== 20) fail('마지막은 복귀입니다.');
if (!plan.items.some((item) => item.command === 16 && item.frame === 6 && item.alt === 30)) fail('상대 고도 항로점이 있어야 합니다.');
const banned = new Set(plan.items.map((item) => item.command));
if (banned.has(22) || banned.has(400)) fail('올린 임무에 시동과 이륙은 없습니다.');

const opened = openUpload(plan.items);
const count = new MavlinkStream().push(opened.frames[0])[0];
if (!count || count.id !== 44 || count.count !== plan.items.length) fail('임무 개수를 읽어야 합니다.');
let upload = opened.upload;
const asking = new MavlinkStream().push(missionRequestPacket(1))[0];
if (!asking || asking.id !== 51 || asking.seq !== 1) fail('항목 요청을 읽어야 합니다.');
const step = continueUpload(upload, asking);
upload = step.upload;
const item = new MavlinkStream().push(step.frames[0])[0];
if (!item || item.id !== 73 || item.seq !== 1 || item.command !== 206) fail('요청한 촬영 명령을 돌려줘야 합니다.');
const ack = new MavlinkStream().push(missionAckPacket(0))[0];
if (!ack || ack.id !== 47) fail('임무 응답을 읽어야 합니다.');
const done = continueUpload(upload, ack);
if (!done.upload.done || done.upload.result !== 0) fail('임무가 받아들여져야 합니다.');

const start = autoFrames().flatMap((frame) => new MavlinkStream().push(frame));
const commands = start.flatMap((message) => message.id === 76 ? [message.command] : message.id === 11 ? [message.customMode] : []);
if (!commands.includes(3) || !commands.includes(300)) fail('자동 수색은 자동 모드와 임무 시작입니다.');
if (commands.includes(400) || commands.includes(22)) fail('자동 수색은 시동을 걸지 않습니다.');
const armed = armTakeoffFrames(25).flatMap((frame) => new MavlinkStream().push(frame));
const armCommand = armed.find((message) => message.id === 76 && message.command === 400);
const takeoff = armed.find((message) => message.id === 76 && message.command === 22);
if (!armCommand || !takeoff || takeoff.id !== 76 || takeoff.p7 !== 25) fail('시동 후 이륙은 확인 뒤에만 따로 있습니다.');
const gps = new MavlinkStream().push(vehicleGps(3, 12))[0];
const radio = new MavlinkStream().push(vehicleRadio(180))[0];
const power = new MavlinkStream().push(vehicleStatus(76, 12600))[0];
const status = new MavlinkStream().push(vehicleText('ready'))[0];
if (!gps || gps.id !== 24 || gps.fix !== 3 || gps.satellites !== 12) fail('GPS를 읽어야 합니다.');
if (!radio || radio.id !== 109 || radio.rssi !== 180) fail('전파를 읽어야 합니다.');
if (!power || power.id !== 1 || power.battery !== 76 || Math.abs(power.voltageMv - 12600) > 1) fail('배터리를 읽어야 합니다.');
if (!status || status.id !== 253 || status.text !== 'ready') fail('상태 문장을 읽어야 합니다.');
const korean = new MavlinkStream().push(vehicleText('지상'))[0];
if (!korean || korean.id !== 253 || korean.text !== '지상') fail('한글 상태 문장을 읽어야 합니다.');
if (preflight({ linked: true, gpsFix: 3, battery: 80 }).length !== 0) fail('준비가 됐으면 막을 이유가 없습니다.');
if (preflight({ linked: false, gpsFix: 1, battery: 10 }).length < 3) fail('연결, GPS, 배터리를 확인해야 합니다.');

console.log('mission plan tests passed');
