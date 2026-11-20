import { WebSocketServer } from 'ws';
import { MavlinkStream, encodeV2 } from '../src/drone/mavlink-frame.ts';

function bytesFrom(view) {
  const payload = [];
  for (let index = 0; index < view.byteLength; index += 1) payload.push(view.getUint8(index));
  return payload;
}

function heartbeatPacket() {
  const view = new DataView(new ArrayBuffer(9));
  view.setUint32(0, 4, true);
  view.setUint8(4, 2);
  view.setUint8(5, 3);
  view.setUint8(6, 0);
  view.setUint8(7, 4);
  view.setUint8(8, 3);
  return encodeV2(0, bytesFrom(view), 1, 1);
}

function positionPacket(lat, lng) {
  const view = new DataView(new ArrayBuffer(28));
  view.setUint32(0, Date.now() & 0xffffffff, true);
  view.setInt32(4, Math.round(lat * 1e7), true);
  view.setInt32(8, Math.round(lng * 1e7), true);
  view.setInt32(12, 30000, true);
  view.setInt32(16, 30000, true);
  view.setUint16(26, 9000, true);
  return encodeV2(33, bytesFrom(view), 1, 1);
}

export function startShim(port = 8788) {
  const wss = new WebSocketServer({ port });
  const state = { lat: 37.5, lng: 127, moved: false, command: null, binary: null, reposition: null, clients: 0 };
  wss.on('connection', (socket) => {
    state.clients += 1;
    const parser = new MavlinkStream();
    socket.on('message', (raw) => {
      const text = String(raw);
      if (text.startsWith('{')) {
        const body = JSON.parse(text);
        if (body.type === 'goto' && Number.isFinite(body.lat) && Number.isFinite(body.lng)) {
          state.lat = body.lat;
          state.lng = body.lng;
          state.moved = true;
          state.command = { id: 'json', lat: body.lat, lng: body.lng };
        }
        return;
      }
      const bytes = new Uint8Array(raw);
      for (const message of parser.push(bytes)) {
        if (message.id === 75 && message.command === 192) state.reposition = message;
        if ((message.id === 75 && message.command === 192) || message.id === 86) {
          state.lat = message.lat;
          state.lng = message.lng;
          state.moved = true;
          state.binary = message;
          state.command = message;
        }
      }
    });
    const timer = setInterval(() => {
      if (socket.readyState !== 1) return;
      socket.send(heartbeatPacket());
      socket.send(positionPacket(state.lat, state.lng));
    }, 200);
    socket.on('close', () => clearInterval(timer));
  });
  return { wss, state };
}

if (process.argv[1] && process.argv[1].endsWith('mavlink-shim.mjs')) {
  const port = Number(process.env.SHIM_PORT || 8788);
  const { state } = startShim(port);
  console.log(`mavlink shim ws://127.0.0.1:${port}`);
  setInterval(() => {
    console.log(JSON.stringify({ clients: state.clients, moved: state.moved, lat: state.lat, lng: state.lng, command: state.command?.id ?? null }));
  }, 1000);
}
