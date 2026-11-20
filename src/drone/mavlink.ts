import {
  MavlinkStream,
  copterMode,
  gpsLabel,
  guidedModePacket,
  heartbeatPacket,
  positionTargetPacket,
  repositionPacket,
  rtlPacket,
  type MavMessage,
} from './mavlink-frame';

export type CraftFix = {
  lat: number;
  lng: number;
  alt: number | null;
  heading: number | null;
  speed: number | null;
  battery: number | null;
  mode: string;
};

export type CraftLink = {
  goto: (lat: number, lng: number, alt: number) => void;
  rtl: () => void;
  close: () => void;
};

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function degrees(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) > 180 ? value / 1e7 : value;
}

export function connectMavlink(
  url: string,
  onFix: (fix: CraftFix) => void,
  onStatus: (message: string) => void,
): CraftLink {
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    onStatus('주소에 연결하지 못했습니다.');
    return { goto() {}, rtl() {}, close() {} };
  }
  socket.binaryType = 'arraybuffer';
  const parser = new MavlinkStream();
  let mode = 0;
  let gps = 0;
  let battery: number | null = null;
  let fix: CraftFix | null = null;
  let quiet = 0;
  let timer = 0;

  const publish = () => {
    if (!fix) return;
    fix = { ...fix, battery, mode: `${copterMode(mode)} · ${gpsLabel(gps)}` };
    onFix(fix);
    onStatus(`연결됨 · ${fix.mode}`);
  };

  const apply = (message: MavMessage) => {
    quiet = 0;
    if (message.id === 0 && message.type !== 6) {
      mode = message.customMode;
      publish();
    } else if (message.id === 1) {
      battery = message.battery;
      publish();
    } else if (message.id === 24) {
      gps = message.fix;
      publish();
    } else if (message.id === 33) {
      fix = {
        lat: message.lat,
        lng: message.lng,
        alt: message.relativeM,
        heading: message.heading,
        speed: Math.hypot(message.vx, message.vy),
        battery,
        mode: '',
      };
      publish();
    }
  };

  const sendBytes = (bytes: Uint8Array) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    socket.send(copy);
  };

  socket.onopen = () => {
    onStatus('연결됨');
    const beat = () => {
      sendBytes(heartbeatPacket());
      quiet += 1;
      if (quiet > 3) onStatus('신호 없음');
    };
    beat();
    timer = window.setInterval(beat, 1000);
  };
  socket.onerror = () => onStatus('신호 없음');
  socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      for (const message of parser.push(new Uint8Array(event.data))) apply(message);
      return;
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((buffer) => {
        for (const message of parser.push(new Uint8Array(buffer))) apply(message);
      });
      return;
    }
    try {
      const body = JSON.parse(String(event.data)) as Record<string, unknown>;
      const packet = (body.message ?? body) as Record<string, unknown>;
      const kind = String(body.type ?? body.mavpackettype ?? packet.mavpackettype ?? '');
      if (kind === 'telemetry' && numberOf(body.lat) !== null && numberOf(body.lng) !== null) {
        onFix({
          lat: numberOf(body.lat)!,
          lng: numberOf(body.lng)!,
          alt: numberOf(body.alt),
          heading: numberOf(body.heading),
          speed: numberOf(body.speed),
          battery: numberOf(body.battery),
          mode: typeof body.mode === 'string' ? body.mode : '',
        });
        onStatus('연결됨');
        quiet = 0;
        return;
      }
      if (kind === 'GLOBAL_POSITION_INT') {
        const lat = degrees(numberOf(packet.lat));
        const lng = degrees(numberOf(packet.lon ?? packet.lng));
        if (lat === null || lng === null) return;
        const relative = numberOf(packet.relative_alt);
        const hdg = numberOf(packet.hdg);
        const vx = numberOf(packet.vx);
        const vy = numberOf(packet.vy);
        onFix({
          lat,
          lng,
          alt: relative === null ? null : Math.abs(relative) > 1000 ? relative / 1000 : relative,
          heading: hdg === null || hdg === 65535 ? null : hdg > 360 ? hdg / 100 : hdg,
          speed: vx === null || vy === null ? null : Math.hypot(Math.abs(vx) > 50 ? vx / 100 : vx, Math.abs(vy) > 50 ? vy / 100 : vy),
          battery,
          mode: '',
        });
        onStatus('연결됨');
        quiet = 0;
      }
    } catch {
      onStatus('신호 없음');
    }
  };

  return {
    goto: (lat, lng, alt) => {
      sendBytes(guidedModePacket());
      sendBytes(repositionPacket(lat, lng, alt));
      sendBytes(positionTargetPacket(lat, lng, alt));
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'goto', lat, lng, alt }));
    },
    rtl: () => {
      sendBytes(rtlPacket());
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'rtl' }));
    },
    close: () => {
      window.clearInterval(timer);
      socket.close();
    },
  };
}
