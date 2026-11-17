import type { MissionData } from '../mission/types';
import { loadMission, saveMission } from './db';
import { canonical, fromWire, mergeMission, toWire } from './merge';
import { MqttClient } from './mqtt';

const RELAY = 'wss://broker.hivemq.com:8884/mqtt';
const decoder = new TextDecoder();

type Listener = (data: MissionData | null, live: boolean) => void;

const rooms = new Map<string, LiveRoom>();

export function openRoom(code: string): LiveRoom {
  const key = code.toUpperCase();
  for (const [other, room] of rooms) {
    if (other !== key) {
      room.close();
      rooms.delete(other);
    }
  }
  const existing = rooms.get(key);
  if (existing && !existing.closed) return existing;
  const room = new LiveRoom(key);
  rooms.set(key, room);
  return room;
}

export class LiveRoom {
  data: MissionData | null = null;
  live = false;
  closed = false;
  private readonly mqtt: MqttClient;
  private readonly images = new Map<string, string>();
  private readonly sentPhotos = new Set<string>();
  private readonly listeners = new Set<Listener>();
  private holding = true;
  private readonly signalers = new Set<(text: string) => void>();
  private readonly ready: Promise<void>;

  constructor(readonly code: string) {
    this.mqtt = new MqttClient(RELAY, `s${crypto.randomUUID().replaceAll('-', '').slice(0, 12)}`);
    this.ready = this.start();
  }

  whenReady(): Promise<void> {
    return this.ready;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.data, this.live);
    return () => this.listeners.delete(listener);
  }

  waitForData(ms: number): Promise<void> {
    if (this.data) return Promise.resolve();
    return new Promise((resolve) => {
      const stop = this.subscribe((data) => {
        if (!data) return;
        stop();
        resolve();
      });
      window.setTimeout(() => {
        stop();
        resolve();
      }, ms);
    });
  }

  update(change: (data: MissionData) => MissionData): void {
    if (!this.data) return;
    const next = change(this.data);
    if (canonical(next) === canonical(this.data)) return;
    this.data = next;
    void saveMission(this.code, next);
    this.emit();
    if (!this.holding) this.push();
  }

  onSignal(listener: (text: string) => void): () => void {
    this.signalers.add(listener);
    return () => this.signalers.delete(listener);
  }

  sendSignal(text: string): void {
    this.mqtt.publish(this.signalTopic(), text, false);
  }

  close(): void {
    this.closed = true;
    this.mqtt.stop();
  }

  private async start(): Promise<void> {
    this.data = await loadMission(this.code);
    this.rememberPhotos();
    this.mqtt.onPublish = (topic, payload) => this.onMqtt(topic, payload);
    this.mqtt.onReady = () => {
      this.mqtt.subscribe(this.stateTopic());
      this.mqtt.subscribe(this.photoFilter());
      this.mqtt.subscribe(this.signalTopic());
      this.refreshLive();
      if (!this.holding) this.push();
    };
    this.mqtt.onDown = () => this.refreshLive();
    this.mqtt.connect();
    await this.mqtt.waitReady(6000);
    await new Promise((resolve) => window.setTimeout(resolve, 700));
    this.holding = false;
    if (this.data) this.push();
    this.emit();
  }

  private stateTopic(): string {
    return `suseak/v1/${this.code}/state`;
  }

  private photoFilter(): string {
    return `suseak/v1/${this.code}/p/+`;
  }

  private photoTopic(id: string): string {
    return `suseak/v1/${this.code}/p/${id}`;
  }

  private signalTopic(): string {
    return `suseak/v1/${this.code}/sig`;
  }

  private onMqtt(topic: string, payload: Uint8Array): void {
    const text = decoder.decode(payload);
    if (topic.endsWith('/sig')) {
      this.signalers.forEach((listener) => listener(text));
      return;
    }
    if (topic.endsWith('/state')) this.applyText(text);
    else {
      const id = topic.split('/').at(-1) ?? '';
      if (id && text.startsWith('data:image/')) this.rememberPhoto(id, text);
    }
  }

  private applyText(text: string): void {
    let parsed: unknown;
    try { parsed = JSON.parse(text); } catch { return; }
    const remote = fromWire(parsed);
    if (!remote || remote.mission.joinCode !== this.code) return;
    for (const photo of remote.photos) {
      const url = this.images.get(photo.id);
      if (url) photo.url = url;
    }
    const merged = mergeMission(this.data, remote);
    const changed = canonical(merged) !== canonical(remote);
    this.data = merged;
    void saveMission(this.code, merged);
    this.emit();
    if (changed && !this.holding) this.push();
  }

  private rememberPhotos(): void {
    this.data?.photos.forEach((photo) => {
      if (photo.url) this.images.set(photo.id, photo.url);
    });
  }

  private rememberPhoto(id: string, url: string): void {
    this.images.set(id, url);
    this.sentPhotos.add(id);
    if (!this.data) return;
    let changed = false;
    const photos = this.data.photos.map((photo) => {
      if (photo.id !== id || photo.url === url) return photo;
      changed = true;
      return { ...photo, url, ready: true };
    });
    if (!changed) return;
    this.data = { ...this.data, photos };
    void saveMission(this.code, this.data);
    this.emit();
  }

  private push(): void {
    if (!this.data) return;
    this.mqtt.publish(this.stateTopic(), JSON.stringify(toWire(this.data)), true);
    for (const photo of this.data.photos) {
      if (!photo.url || this.sentPhotos.has(photo.id)) continue;
      this.sentPhotos.add(photo.id);
      this.mqtt.publish(this.photoTopic(photo.id), photo.url, true);
    }
  }

  private refreshLive(): void {
    if (this.mqtt.ready === this.live) return;
    this.live = this.mqtt.ready;
    this.emit();
  }

  private emit(): void {
    this.listeners.forEach((listener) => listener(this.data, this.live));
  }
}
