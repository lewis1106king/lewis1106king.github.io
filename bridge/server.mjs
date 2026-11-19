// 브라우저와 MAVLink 사이를 잇는 작은 WebSocket 다리입니다.
// mavlink2rest가 127.0.0.1:8088 에서 떠 있으면 위치와 배터리, 기수, 모드를 읽고
// goto / rtl 명령을 COMMAND_LONG 으로 넘깁니다. 기체가 없으면 연결만 유지합니다.
import http from 'node:http';
import { WebSocketServer } from 'ws';

const port = Number(process.env.BRIDGE_PORT || 8777);
const rest = (process.env.MAVLINK_REST || 'http://127.0.0.1:8088').replace(/\/$/, '');
const vehicle = process.env.MAVLINK_VEHICLE || '1';

const server = http.createServer((_req, res) => {
  res.writeHead(200, { 'content-type': 'text/plain; charset=utf-8' });
  res.end('suseak mavlink bridge\n');
});
const sockets = new WebSocketServer({ server });
const clients = new Set();

sockets.on('connection', (socket) => {
  clients.add(socket);
  socket.on('close', () => clients.delete(socket));
  socket.on('message', (raw) => {
    try {
      const body = JSON.parse(String(raw));
      if (body.type === 'goto') void command(16, body);
      if (body.type === 'rtl') void command(20, body);
    } catch {
      // 잘못된 명령은 무시합니다.
    }
  });
});

function broadcast(payload) {
  const text = JSON.stringify(payload);
  for (const socket of clients) {
    if (socket.readyState === 1) socket.send(text);
  }
}

async function readMessage(name) {
  const response = await fetch(`${rest}/mavlink/vehicles/${vehicle}/components/1/messages/${name}`, {
    signal: AbortSignal.timeout(800),
  });
  if (!response.ok) return null;
  return response.json();
}

async function command(commandId, body) {
  const lat = Math.round(Number(body.lat || 0) * 1e7);
  const lng = Math.round(Number(body.lng || 0) * 1e7);
  const alt = Number(body.alt || 30);
  await fetch(`${rest}/mavlink/vehicles/${vehicle}/components/1/messages/COMMAND_INT`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      target_system: Number(vehicle),
      target_component: 1,
      frame: { type: 'MAV_FRAME_GLOBAL_RELATIVE_ALT_INT' },
      command: { type: commandId === 20 ? 'MAV_CMD_NAV_RETURN_TO_LAUNCH' : 'MAV_CMD_DO_REPOSITION' },
      current: 0,
      autocontinue: 0,
      param1: commandId === 20 ? 0 : -1,
      param2: 0,
      param3: 0,
      param4: 0,
      x: lat,
      y: lng,
      z: alt,
    }),
  }).catch(() => undefined);
}

async function poll() {
  try {
    const [position, status, heartbeat, attitude] = await Promise.all([
      readMessage('GLOBAL_POSITION_INT'),
      readMessage('SYS_STATUS'),
      readMessage('HEARTBEAT'),
      readMessage('ATTITUDE'),
    ]);
    if (!position) return;
    const battery = status?.battery_remaining;
    const heading = typeof position.hdg === 'number' ? position.hdg / 100 : null;
    const yaw = typeof attitude?.yaw === 'number' ? (attitude.yaw * 180) / Math.PI : heading;
    broadcast({
      type: 'telemetry',
      lat: position.lat / 1e7,
      lng: position.lon / 1e7,
      alt: typeof position.relative_alt === 'number' ? position.relative_alt / 1000 : null,
      heading: yaw,
      speed: typeof position.vx === 'number' ? Math.hypot(position.vx, position.vy) / 100 : null,
      battery: typeof battery === 'number' && battery >= 0 ? battery : null,
      mode: heartbeat?.custom_mode ?? '',
    });
  } catch {
    // mavlink2rest가 없으면 다음 주기에 다시 봅니다.
  }
}

setInterval(() => { void poll(); }, 500);
server.listen(port, () => {
  console.log(`수색 연결 기체 다리 ws://127.0.0.1:${port}  →  ${rest}`);
});
