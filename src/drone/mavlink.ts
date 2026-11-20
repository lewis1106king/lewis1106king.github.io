import { MavlinkStream } from './mavlink-frame';
import type { PlanItem } from './mavlink-frame';
import { MavSession, type Telemetry } from './link-session';

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
  land: () => void;
  pause: () => void;
  resume: () => void;
  startAuto: () => void;
  upload: (items: PlanItem[]) => void;
  armTakeoff: (alt: number) => void;
  close: () => void;
};

export type { Telemetry };

function numberOf(value: unknown): number | null {
  if (typeof value === 'number' && Number.isFinite(value)) return value;
  if (typeof value === 'string' && value.trim() && Number.isFinite(Number(value))) return Number(value);
  return null;
}

function degrees(value: number | null): number | null {
  if (value === null) return null;
  return Math.abs(value) > 180 ? value / 1e7 : value;
}

export const idleLink: CraftLink = {
  goto() {},
  rtl() {},
  land() {},
  pause() {},
  resume() {},
  startAuto() {},
  upload() {},
  armTakeoff() {},
  close() {},
};

export function connectMavlink(
  url: string,
  onFix: (fix: CraftFix) => void,
  onStatus: (message: string) => void,
  onTelemetry: (telemetry: Telemetry) => void = () => undefined,
  onReached: (seq: number) => void = () => undefined,
): CraftLink {
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    onStatus('주소에 연결하지 못했습니다.');
    return idleLink;
  }
  socket.binaryType = 'arraybuffer';
  const parser = new MavlinkStream();
  let battery: number | null = null;
  let timer = 0;

  const sendBytes = (bytes: Uint8Array) => {
    if (socket.readyState !== WebSocket.OPEN) return;
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    socket.send(copy);
  };

  const session = new MavSession(sendBytes, (telemetry) => {
    battery = telemetry.battery;
    onTelemetry(telemetry);
    if (telemetry.lat !== null && telemetry.lng !== null) {
      onFix({
        lat: telemetry.lat,
        lng: telemetry.lng,
        alt: telemetry.alt,
        heading: telemetry.heading,
        speed: telemetry.speed,
        battery: telemetry.battery,
        mode: telemetry.mode,
      });
    }
  }, onStatus, onReached);

  socket.onopen = () => {
    onStatus('연결됨');
    session.beat();
    timer = window.setInterval(() => session.beat(), 1000);
  };
  socket.onerror = () => onStatus('신호 없음');
  socket.onmessage = (event) => {
    if (event.data instanceof ArrayBuffer) {
      session.ingest(parser.push(new Uint8Array(event.data)));
      return;
    }
    if (event.data instanceof Blob) {
      void event.data.arrayBuffer().then((buffer) => session.ingest(parser.push(new Uint8Array(buffer))));
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
      }
    } catch {
      onStatus('신호 없음');
    }
  };

  return {
    goto: (lat, lng, alt) => {
      session.goto(lat, lng, alt);
      if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify({ type: 'goto', lat, lng, alt }));
    },
    rtl: () => session.rtl(),
    land: () => session.land(),
    pause: () => session.pause(),
    resume: () => session.resume(),
    startAuto: () => session.startAuto(),
    upload: (items) => session.upload(items),
    armTakeoff: (alt) => session.armTakeoff(alt),
    close: () => {
      window.clearInterval(timer);
      socket.close();
    },
  };
}
