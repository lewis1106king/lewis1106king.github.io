import {
  MavlinkStream,
  copterMode,
  gpsLabel,
  type MavMessage,
  guidedModePacket,
  heartbeatPacket,
  messageIntervalPacket,
  positionTargetPacket,
  repositionPacket,
  requestStreamPacket,
  rtlPacket,
} from './mavlink-frame';
import type { CraftFix, CraftLink } from './mavlink';

type Port = {
  open: (options: { baudRate: number }) => Promise<void>;
  close: () => Promise<void>;
  readable: ReadableStream<Uint8Array> | null;
  writable: WritableStream<Uint8Array> | null;
};

export function serialAvailable(): boolean {
  const serial = (navigator as Navigator & { serial?: { requestPort?: unknown } }).serial;
  return typeof serial?.requestPort === 'function';
}

export async function connectSerial(
  onFix: (fix: CraftFix) => void,
  onStatus: (message: string) => void,
): Promise<CraftLink> {
  const serial = (navigator as Navigator & { serial?: { requestPort: () => Promise<Port> } }).serial;
  if (!serial) {
    onStatus('이 브라우저는 USB 연결을 지원하지 않습니다. Chrome이나 Edge에서 여세요. 아이폰 Safari와 Firefox는 안 됩니다. 폰 카메라를 쓰세요.');
    return { goto() {}, rtl() {}, close() {} };
  }
  const port = await serial.requestPort();
  const link = new RadioLink(onFix, onStatus);
  await link.open(port);
  return link;
}

class RadioLink implements CraftLink {
  private port: Port | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private stream = new MavlinkStream();
  private target = 1;
  private mode = 0;
  private gps = 0;
  private battery: number | null = null;
  private fix: CraftFix | null = null;
  private seen = false;
  private closed = false;
  private timer = 0;
  private quiet = 0;

  constructor(private readonly onFix: (fix: CraftFix) => void, private readonly onStatus: (message: string) => void) {}

  async open(port: Port): Promise<void> {
    this.port = port;
    const bauds = [57600, 115200];
    for (const baud of bauds) {
      this.seen = false;
      if (port.readable) await port.close().catch(() => undefined);
      await port.open({ baudRate: baud });
      this.writer = port.writable?.getWriter() ?? null;
      void this.read();
      this.startHeartbeat();
      await new Promise((resolve) => window.setTimeout(resolve, 1600));
      if (this.seen || this.closed) break;
      this.stopHeartbeat();
      this.writer?.releaseLock();
      this.writer = null;
    }
    if (!this.seen) this.onStatus('신호 없음. 57600과 115200을 확인했습니다.');
  }

  goto(lat: number, lng: number, alt: number): void {
    if (this.mode !== 4) this.send(guidedModePacket(this.target));
    this.send(repositionPacket(lat, lng, alt, this.target));
    this.send(positionTargetPacket(lat, lng, alt, this.target));
  }

  rtl(): void {
    this.send(rtlPacket(this.target));
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.writer?.releaseLock();
    void this.port?.close();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    const beat = () => {
      this.send(heartbeatPacket());
      this.quiet += 1;
      if (this.quiet > 3) this.onStatus('신호 없음');
    };
    beat();
    this.send(requestStreamPacket(this.target));
    this.send(messageIntervalPacket(33, 250000, this.target));
    this.timer = window.setInterval(beat, 1000);
  }

  private stopHeartbeat(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private send(bytes: Uint8Array): void {
    void this.writer?.write(bytes).catch(() => undefined);
  }

  private async read(): Promise<void> {
    const reader = this.port?.readable?.getReader();
    if (!reader) return;
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        this.consume(value);
      }
    } catch {
      this.onStatus('신호 없음');
    } finally {
      reader.releaseLock();
    }
  }

  private consume(chunk: Uint8Array): void {
    for (const message of this.stream.push(chunk)) this.apply(message);
  }

  private apply(message: MavMessage): void {
    if (message.id === 0 && message.type !== 6) {
      this.seen = true;
      this.quiet = 0;
      this.target = 1;
      this.mode = message.customMode;
      this.publish();
    } else if (message.id === 1) {
      this.battery = message.battery;
      this.publish();
    } else if (message.id === 24) {
      this.gps = message.fix;
      this.publish();
    } else if (message.id === 33) {
      this.seen = true;
      this.quiet = 0;
      const speed = Math.hypot(message.vx, message.vy);
      this.fix = {
        lat: message.lat,
        lng: message.lng,
        alt: message.relativeM,
        heading: message.heading,
        speed,
        battery: this.battery,
        mode: `${copterMode(this.mode)} · ${gpsLabel(this.gps)}`,
      };
      this.publish();
    } else if (message.id === 74 && this.fix) {
      this.fix = { ...this.fix, speed: message.groundspeed, alt: message.alt };
      this.publish();
    } else if (message.id === 30 && this.fix && this.fix.heading === null) {
      const degrees = ((message.yaw * 180) / Math.PI + 360) % 360;
      this.fix = { ...this.fix, heading: degrees };
      this.publish();
    }
  }

  private publish(): void {
    if (!this.fix) {
      this.onStatus(this.seen ? `연결됨 · ${copterMode(this.mode)} · ${gpsLabel(this.gps)}` : '신호 없음');
      return;
    }
    this.fix = { ...this.fix, battery: this.battery, mode: `${copterMode(this.mode)} · ${gpsLabel(this.gps)}` };
    this.onFix(this.fix);
    this.onStatus(`연결됨 · ${this.fix.mode}`);
  }
}
