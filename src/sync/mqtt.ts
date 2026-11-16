const encoder = new TextEncoder();

function encodeLength(length: number): Uint8Array {
  const bytes: number[] = [];
  let rest = length;
  do {
    let digit = rest % 128;
    rest = Math.floor(rest / 128);
    if (rest > 0) digit |= 0x80;
    bytes.push(digit);
  } while (rest > 0);
  return Uint8Array.from(bytes);
}

function utf8Field(value: string): Uint8Array {
  const bytes = encoder.encode(value);
  const out = new Uint8Array(2 + bytes.length);
  out[0] = bytes.length >> 8;
  out[1] = bytes.length & 255;
  out.set(bytes, 2);
  return out;
}

function concat(...parts: Uint8Array[]): Uint8Array {
  const out = new Uint8Array(parts.reduce((sum, part) => sum + part.length, 0));
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function packet(flags: number, body: Uint8Array): Uint8Array {
  return concat(Uint8Array.from([flags]), encodeLength(body.length), body);
}

function connectPacket(clientId: string): Uint8Array {
  return packet(0x10, concat(utf8Field('MQTT'), Uint8Array.from([4, 0x02, 0, 20]), utf8Field(clientId)));
}

function subscribePacket(topic: string, id: number): Uint8Array {
  return packet(0x82, concat(Uint8Array.from([id >> 8, id & 255]), utf8Field(topic), Uint8Array.from([0])));
}

function publishPacket(topic: string, payload: Uint8Array, retain: boolean): Uint8Array {
  return packet(retain ? 0x31 : 0x30, concat(utf8Field(topic), payload));
}

function readLength(buffer: Uint8Array, offset: number): { value: number; next: number } | null {
  let multiplier = 1;
  let value = 0;
  let index = offset;
  for (let i = 0; i < 4; i += 1) {
    if (index >= buffer.length) return null;
    const digit = buffer[index];
    index += 1;
    value += (digit & 127) * multiplier;
    if ((digit & 128) === 0) return { value, next: index };
    multiplier *= 128;
  }
  return null;
}

export class MqttClient {
  ready = false;
  onPublish: (topic: string, payload: Uint8Array) => void = () => undefined;
  onReady: () => void = () => undefined;
  onDown: () => void = () => undefined;
  private ws: WebSocket | null = null;
  private buffer = new Uint8Array(0);
  private stopped = false;
  private attempt = 0;
  private ping: number | null = null;
  private packetId = 1;
  private waiters: Array<(ok: boolean) => void> = [];

  constructor(private readonly url: string, private readonly clientId: string) {}

  connect(): void {
    if (this.stopped) return;
    const ws = new WebSocket(this.url);
    this.ws = ws;
    ws.binaryType = 'arraybuffer';
    ws.onopen = () => this.send(connectPacket(this.clientId));
    ws.onmessage = (event) => this.feed(new Uint8Array(event.data as ArrayBuffer));
    ws.onerror = () => ws.close();
    ws.onclose = () => {
      this.ready = false;
      if (this.ping !== null) window.clearInterval(this.ping);
      this.ping = null;
      this.onDown();
      if (this.stopped) return;
      const delay = Math.min(8000, 400 * 2 ** this.attempt);
      this.attempt += 1;
      window.setTimeout(() => this.connect(), delay);
    };
  }

  waitReady(ms: number): Promise<boolean> {
    if (this.ready) return Promise.resolve(true);
    return new Promise((resolve) => {
      const timer = window.setTimeout(() => resolve(false), ms);
      this.waiters.push((ok) => {
        window.clearTimeout(timer);
        resolve(ok);
      });
    });
  }

  subscribe(topic: string): void {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    const id = this.packetId;
    this.packetId += 1;
    this.send(subscribePacket(topic, id));
  }

  publish(topic: string, payload: string, retain: boolean): boolean {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return false;
    this.send(publishPacket(topic, encoder.encode(payload), retain));
    return true;
  }

  private send(bytes: Uint8Array): void {
    const copy = new ArrayBuffer(bytes.byteLength);
    new Uint8Array(copy).set(bytes);
    this.ws?.send(copy);
  }

  stop(): void {
    this.stopped = true;
    if (this.ping !== null) window.clearInterval(this.ping);
    this.ws?.close();
  }

  private feed(chunk: Uint8Array): void {
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
    while (this.buffer.length > 2) {
      const length = readLength(this.buffer, 1);
      if (!length) return;
      const end = length.next + length.value;
      if (this.buffer.length < end) return;
      this.handle(this.buffer.slice(0, end), length.next, length.value);
      this.buffer = this.buffer.slice(end);
    }
  }

  private handle(bytes: Uint8Array, bodyAt: number, bodyLength: number): void {
    const type = bytes[0] >> 4;
    if (type === 2) {
      const code = bytes[bodyAt + 1] ?? 1;
      if (code !== 0) {
        this.ws?.close();
        return;
      }
      this.attempt = 0;
      this.ready = true;
      this.ping = window.setInterval(() => {
        if (this.ws?.readyState === WebSocket.OPEN) this.ws.send(new Uint8Array([0xc0, 0x00]));
      }, 15000);
      this.onReady();
      const waiters = this.waiters.splice(0);
      waiters.forEach((waiter) => waiter(true));
      return;
    }
    if (type !== 3 || bodyLength > 180000) return;
    const topicLength = (bytes[bodyAt] << 8) | bytes[bodyAt + 1];
    const topicStart = bodyAt + 2;
    const topic = new TextDecoder().decode(bytes.slice(topicStart, topicStart + topicLength));
    let payloadAt = topicStart + topicLength;
    const qos = (bytes[0] >> 1) & 0x03;
    if (qos > 0) payloadAt += 2;
    this.onPublish(topic, bytes.slice(payloadAt, bodyAt + bodyLength));
  }
}
