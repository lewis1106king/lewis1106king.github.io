import { MavlinkStream } from './mavlink-frame';
import { MavSession, type Telemetry } from './link-session';
import { idleLink, type CraftFix, type CraftLink } from './mavlink';

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
  onTelemetry: (telemetry: Telemetry) => void = () => undefined,
  onReached: (seq: number) => void = () => undefined,
): Promise<CraftLink> {
  const serial = (navigator as Navigator & { serial?: { requestPort: () => Promise<Port> } }).serial;
  if (!serial) {
    onStatus('이 브라우저는 USB 연결을 지원하지 않습니다. Chrome이나 Edge에서 여세요. 아이폰 Safari와 Firefox는 안 됩니다. 폰 카메라를 쓰세요.');
    return idleLink;
  }
  const port = await serial.requestPort();
  const link = new RadioLink(onFix, onStatus, onTelemetry, onReached);
  await link.open(port);
  return link;
}

class RadioLink implements CraftLink {
  private port: Port | null = null;
  private writer: WritableStreamDefaultWriter<Uint8Array> | null = null;
  private stream = new MavlinkStream();
  private closed = false;
  private timer = 0;
  private session: MavSession;

  constructor(
    onFix: (fix: CraftFix) => void,
    private readonly onStatus: (message: string) => void,
    onTelemetry: (telemetry: Telemetry) => void,
    onReached: (seq: number) => void,
  ) {
    this.session = new MavSession((bytes) => {
      void this.writer?.write(bytes).catch(() => undefined);
    }, (telemetry) => {
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
  }

  async open(port: Port): Promise<void> {
    this.port = port;
    const bauds = [57600, 115200];
    for (const baud of bauds) {
      this.session.telemetry = { ...this.session.telemetry, linked: false };
      if (port.readable) await port.close().catch(() => undefined);
      await port.open({ baudRate: baud });
      this.writer = port.writable?.getWriter() ?? null;
      void this.read();
      this.startHeartbeat();
      await new Promise((resolve) => window.setTimeout(resolve, 1600));
      if (this.session.telemetry.linked || this.closed) break;
      this.stopHeartbeat();
      this.writer?.releaseLock();
      this.writer = null;
    }
    if (!this.session.telemetry.linked) this.onStatus('신호 없음. 57600과 115200을 확인했습니다.');
  }

  goto(lat: number, lng: number, alt: number): void {
    this.session.goto(lat, lng, alt);
  }

  rtl(): void {
    this.session.rtl();
  }

  land(): void {
    this.session.land();
  }

  pause(): void {
    this.session.pause();
  }

  resume(): void {
    this.session.resume();
  }

  startAuto(): void {
    this.session.startAuto();
  }

  upload(items: Parameters<CraftLink['upload']>[0]): void {
    this.session.upload(items);
  }

  armTakeoff(alt: number): void {
    this.session.armTakeoff(alt);
  }

  close(): void {
    this.closed = true;
    this.stopHeartbeat();
    this.writer?.releaseLock();
    void this.port?.close();
  }

  private startHeartbeat(): void {
    this.stopHeartbeat();
    this.session.beat();
    this.timer = window.setInterval(() => this.session.beat(), 1000);
  }

  private stopHeartbeat(): void {
    if (this.timer) window.clearInterval(this.timer);
    this.timer = 0;
  }

  private async read(): Promise<void> {
    const reader = this.port?.readable?.getReader();
    if (!reader) return;
    try {
      while (!this.closed) {
        const { value, done } = await reader.read();
        if (done || !value) break;
        this.session.ingest(this.stream.push(value));
      }
    } catch {
      this.session.telemetry = { ...this.session.telemetry, linked: false };
    } finally {
      reader.releaseLock();
    }
  }
}
