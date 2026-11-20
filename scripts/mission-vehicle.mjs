import { WebSocketServer } from 'ws';
import {
  MavlinkStream,
  missionAckPacket,
  missionCurrentPacket,
  missionReachedPacket,
  missionRequestPacket,
  vehicleGps,
  vehicleHeartbeat,
  vehiclePosition,
  vehicleRadio,
  vehicleStatus,
  vehicleText,
} from '../src/drone/mavlink-frame.ts';

export function startVehicle(port = 8790) {
  const wss = new WebSocketServer({ port });
  const state = {
    items: [],
    expected: 0,
    flying: false,
    paused: false,
    mode: 0,
    armed: false,
    seq: 0,
    lat: 36.5,
    lng: 127.8,
    text: '지상',
    clients: 0,
    reached: [],
  };

  function toward(target) {
    const north = (target.lat - state.lat) * 111_320;
    const east = (target.lng - state.lng) * 111_320 * Math.cos((state.lat * Math.PI) / 180);
    const distance = Math.hypot(north, east);
    if (distance < 18) return true;
    const step = Math.min(1, 8 / distance);
    state.lat += (target.lat - state.lat) * step;
    state.lng += (target.lng - state.lng) * step;
    return false;
  }

  wss.on('connection', (socket) => {
    state.clients += 1;
    const parser = new MavlinkStream();
    socket.on('message', (raw) => {
      const bytes = new Uint8Array(raw);
      for (const message of parser.push(bytes)) {
        if (message.id === 44) {
          state.expected = message.count;
          state.items = [];
          socket.send(missionRequestPacket(0));
        } else if (message.id === 73) {
          state.items[message.seq] = message;
          if (message.seq + 1 < state.expected) socket.send(missionRequestPacket(message.seq + 1));
          else {
            socket.send(missionAckPacket(0));
            const first = state.items.find((item) => item && item.command === 16 && item.frame === 6);
            if (first) {
              state.lat = first.lat - 0.0012;
              state.lng = first.lng;
            }
          }
        } else if (message.id === 11 && message.customMode === 3) {
          state.mode = 3;
          state.flying = true;
          state.paused = false;
          state.seq = 2;
        } else if (message.id === 11 && message.customMode === 5) {
          state.mode = 5;
          state.paused = true;
        } else if (message.id === 76 && message.command === 300) {
          state.mode = 3;
          state.flying = true;
          state.paused = false;
          state.seq = 2;
        } else if (message.id === 76 && message.command === 193) {
          state.paused = message.p1 < 0.5;
          if (!state.paused) state.mode = 3;
        } else if (message.id === 76 && message.command === 20) {
          state.mode = 6;
          state.flying = false;
          state.text = '복귀';
        } else if (message.id === 76 && message.command === 21) {
          state.mode = 9;
          state.flying = false;
          state.text = '착륙';
        } else if (message.id === 76 && message.command === 400) {
          state.armed = true;
        }
      }
    });
    const timer = setInterval(() => {
      if (socket.readyState !== 1) return;
      const item = state.items[state.seq];
      if (state.flying && state.seq >= state.expected) state.flying = false;
      if (state.flying && !state.paused && item) {
        if (item.command === 16 && item.frame !== 0) {
          if (toward(item)) {
            socket.send(missionReachedPacket(state.seq));
            state.reached.push(state.seq);
            state.seq += 1;
          }
        } else {
          state.seq += 1;
        }
      }
      socket.send(vehicleHeartbeat(state.mode, state.armed));
      socket.send(vehiclePosition(state.lat, state.lng, 30, 90, state.flying ? 8 : 0));
      socket.send(vehicleGps(3, 14));
      socket.send(vehicleStatus(76, 12400));
      socket.send(vehicleRadio(190));
      socket.send(missionCurrentPacket(state.seq));
      if (state.text) socket.send(vehicleText(state.text));
    }, 200);
    socket.on('close', () => clearInterval(timer));
  });
  return { wss, state };
}
