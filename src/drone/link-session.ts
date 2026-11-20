import {
  copterMode,
  gpsLabel,
  heartbeatPacket,
  messageIntervalPacket,
  positionTargetPacket,
  repositionPacket,
  requestStreamPacket,
  rtlPacket,
  type MavMessage,
} from './mavlink-frame';
import {
  armTakeoffFrames,
  autoFrames,
  continueUpload,
  landFrames,
  openUpload,
  pauseFrames,
  resumeFrames,
  type Upload,
} from './mission-plan';
import type { PlanItem } from './mavlink-frame';

export type Telemetry = {
  lat: number | null;
  lng: number | null;
  alt: number | null;
  heading: number | null;
  speed: number | null;
  battery: number | null;
  voltage: number | null;
  mode: string;
  customMode: number;
  armed: boolean;
  gpsFix: number;
  satellites: number;
  rssi: number | null;
  homeLat: number | null;
  homeLng: number | null;
  missionSeq: number;
  missionCount: number;
  text: string;
  linked: boolean;
};

export function emptyTelemetry(): Telemetry {
  return {
    lat: null,
    lng: null,
    alt: null,
    heading: null,
    speed: null,
    battery: null,
    voltage: null,
    mode: '신호 없음',
    customMode: 0,
    armed: false,
    gpsFix: 0,
    satellites: 0,
    rssi: null,
    homeLat: null,
    homeLng: null,
    missionSeq: 0,
    missionCount: 0,
    text: '',
    linked: false,
  };
}

export class MavSession {
  telemetry = emptyTelemetry();
  private pending: Upload | null = null;
  private quiet = 0;
  private warnedBattery = false;
  private streams = false;

  constructor(
    private readonly send: (bytes: Uint8Array) => void,
    private readonly onTelemetry: (telemetry: Telemetry) => void,
    private readonly onNote: (message: string) => void,
    private readonly onReached: (seq: number) => void,
  ) {}

  beat(): void {
    this.send(heartbeatPacket());
    if (!this.streams) {
      this.send(requestStreamPacket());
      this.send(messageIntervalPacket(33, 250000));
      this.send(messageIntervalPacket(42, 500000));
      this.streams = true;
    }
    this.quiet += 1;
    if (this.quiet > 3 && this.telemetry.linked) {
      this.telemetry = { ...this.telemetry, linked: false };
      this.onNote('신호 없음');
      this.onTelemetry(this.telemetry);
    }
  }

  ingest(messages: MavMessage[]): void {
    for (const message of messages) this.one(message);
  }

  upload(items: PlanItem[]): void {
    const opened = openUpload(items);
    this.pending = opened.upload;
    this.telemetry = { ...this.telemetry, missionCount: items.length, missionSeq: 0 };
    opened.frames.forEach((frame) => this.send(frame));
    this.onNote('임무를 올리고 있습니다.');
    this.onTelemetry(this.telemetry);
  }

  startAuto(): void {
    autoFrames().forEach((frame) => this.send(frame));
    this.onNote('자동 수색을 시작했습니다. 시동과 이륙은 조종사에게 있습니다.');
  }

  pause(): void {
    pauseFrames().forEach((frame) => this.send(frame));
    this.onNote('로이터로 멈췄습니다.');
  }

  resume(): void {
    resumeFrames().forEach((frame) => this.send(frame));
    this.onNote('자동 수색을 다시 시작했습니다.');
  }

  rtl(): void {
    this.send(rtlPacket());
    this.onNote('복귀를 보냈습니다.');
  }

  land(): void {
    landFrames().forEach((frame) => this.send(frame));
    this.onNote('착륙을 보냈습니다.');
  }

  armTakeoff(alt: number): void {
    armTakeoffFrames(alt).forEach((frame) => this.send(frame));
    this.onNote('시동과 이륙을 보냈습니다.');
  }

  goto(lat: number, lng: number, alt: number): void {
    this.send(repositionPacket(lat, lng, alt));
    this.send(positionTargetPacket(lat, lng, alt));
  }

  private one(message: MavMessage): void {
    this.quiet = 0;
    if (!this.telemetry.linked) this.telemetry = { ...this.telemetry, linked: true };
    if (this.pending && (message.id === 40 || message.id === 51 || message.id === 47)) {
      const next = continueUpload(this.pending, message);
      this.pending = next.upload;
      next.frames.forEach((frame) => this.send(frame));
      if (message.id === 47) this.onNote(message.result === 0 ? '임무를 올렸습니다.' : '임무를 거절했습니다.');
    }
    if (message.id === 0 && message.type !== 6) {
      this.telemetry = {
        ...this.telemetry,
        customMode: message.customMode,
        armed: (message.baseMode & 128) !== 0,
        mode: copterMode(message.customMode),
        linked: true,
      };
    } else if (message.id === 1) {
      this.telemetry = { ...this.telemetry, battery: message.battery, voltage: message.voltageMv / 1000 };
      if (message.battery !== null && message.battery <= 20 && !this.warnedBattery) {
        this.warnedBattery = true;
        this.onNote('배터리가 낮습니다. 복귀를 누르세요.');
      }
    } else if (message.id === 24) {
      this.telemetry = { ...this.telemetry, gpsFix: message.fix, satellites: message.satellites };
    } else if (message.id === 33) {
      const homeLat = this.telemetry.homeLat ?? message.lat;
      const homeLng = this.telemetry.homeLng ?? message.lng;
      this.telemetry = {
        ...this.telemetry,
        lat: message.lat,
        lng: message.lng,
        alt: message.relativeM,
        heading: message.heading,
        speed: Math.hypot(message.vx, message.vy),
        homeLat,
        homeLng,
        linked: true,
      };
    } else if (message.id === 74) {
      this.telemetry = { ...this.telemetry, speed: message.groundspeed, alt: message.alt, heading: message.heading };
    } else if (message.id === 30 && this.telemetry.heading === null) {
      const degrees = ((message.yaw * 180) / Math.PI + 360) % 360;
      this.telemetry = { ...this.telemetry, heading: degrees };
    } else if (message.id === 109) {
      this.telemetry = { ...this.telemetry, rssi: message.rssi };
    } else if (message.id === 253 && message.text) {
      this.telemetry = { ...this.telemetry, text: message.text };
    } else if (message.id === 42) {
      this.telemetry = { ...this.telemetry, missionSeq: message.seq };
    } else if (message.id === 46) {
      this.telemetry = { ...this.telemetry, missionSeq: message.seq };
      this.onReached(message.seq);
    }
    this.telemetry = { ...this.telemetry, mode: `${copterMode(this.telemetry.customMode)} · ${gpsLabel(this.telemetry.gpsFix)}` };
    this.onTelemetry(this.telemetry);
  }
}
