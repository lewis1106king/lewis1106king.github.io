const STX_V1 = 0xfe;
const STX_V2 = 0xfd;

export const MSG = {
  heartbeat: 0,
  sysStatus: 1,
  gpsRaw: 24,
  attitude: 30,
  globalPosition: 33,
  requestDataStream: 66,
  vfrHud: 74,
  commandInt: 75,
  commandLong: 76,
  setPositionTarget: 86,
  setMode: 11,
} as const;

const CRC_EXTRA: Record<number, number> = {
  0: 50,
  1: 124,
  11: 89,
  24: 24,
  30: 39,
  33: 104,
  66: 148,
  74: 20,
  75: 158,
  76: 152,
  86: 5,
};

export const CMD = {
  reposition: 192,
  rtl: 20,
  setMessageInterval: 511,
} as const;

export type MavMessage =
  | { id: 0; type: number; autopilot: number; baseMode: number; customMode: number; systemStatus: number }
  | { id: 1; battery: number | null; voltageMv: number }
  | { id: 24; fix: number; satellites: number }
  | { id: 30; yaw: number }
  | { id: 33; lat: number; lng: number; altM: number; relativeM: number; vx: number; vy: number; heading: number | null }
  | { id: 74; groundspeed: number; heading: number; alt: number }
  | { id: 75; command: number; lat: number; lng: number; alt: number }
  | { id: 86; lat: number; lng: number; alt: number };

function crcAccumulate(crc: number, byte: number): number {
  let tmp = (byte ^ (crc & 0xff)) & 0xff;
  tmp = (tmp ^ (tmp << 4)) & 0xff;
  return ((crc >> 8) ^ (tmp << 8) ^ (tmp << 3) ^ (tmp >> 4)) & 0xffff;
}

export function mavlinkCrc(bytes: Uint8Array, extra: number): number {
  let crc = 0xffff;
  for (const byte of bytes) crc = crcAccumulate(crc, byte);
  return crcAccumulate(crc, extra);
}

function pushU8(out: number[], value: number) {
  out.push(value & 0xff);
}

function pushU16(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff);
}

function pushU32(out: number[], value: number) {
  out.push(value & 0xff, (value >> 8) & 0xff, (value >> 16) & 0xff, (value >> 24) & 0xff);
}

function pushI32(out: number[], value: number) {
  pushU32(out, value >>> 0);
}

function pushF32(out: number[], value: number) {
  const view = new DataView(new ArrayBuffer(4));
  view.setFloat32(0, value, true);
  for (let index = 0; index < 4; index += 1) out.push(view.getUint8(index));
}

function readU16(buf: Uint8Array, offset: number): number {
  return buf[offset] | (buf[offset + 1] << 8);
}

function readU32(buf: Uint8Array, offset: number): number {
  return (buf[offset] | (buf[offset + 1] << 8) | (buf[offset + 2] << 16) | (buf[offset + 3] << 24)) >>> 0;
}

function readI16(buf: Uint8Array, offset: number): number {
  const value = readU16(buf, offset);
  return value & 0x8000 ? value - 0x10000 : value;
}

function readI32(buf: Uint8Array, offset: number): number {
  const value = readU32(buf, offset);
  return value > 0x7fffffff ? value - 0x100000000 : value;
}

function readF32(buf: Uint8Array, offset: number): number {
  const view = new DataView(buf.buffer, buf.byteOffset + offset, 4);
  return view.getFloat32(0, true);
}

let sequence = 0;

export function encodeV2(msgid: number, payload: number[], sysid = 255, compid = 190): Uint8Array {
  const extra = CRC_EXTRA[msgid];
  if (extra === undefined) throw new Error('모르는 메시지입니다.');
  const frame = [
    STX_V2,
    payload.length,
    0,
    0,
    sequence & 0xff,
    sysid & 0xff,
    compid & 0xff,
    msgid & 0xff,
    (msgid >> 8) & 0xff,
    (msgid >> 16) & 0xff,
    ...payload,
  ];
  sequence = (sequence + 1) & 0xff;
  const crc = mavlinkCrc(Uint8Array.from(frame.slice(1)), extra);
  frame.push(crc & 0xff, (crc >> 8) & 0xff);
  return Uint8Array.from(frame);
}

export function heartbeatPacket(): Uint8Array {
  const payload: number[] = [];
  pushU32(payload, 0);
  pushU8(payload, 6);
  pushU8(payload, 8);
  pushU8(payload, 0);
  pushU8(payload, 4);
  pushU8(payload, 3);
  return encodeV2(MSG.heartbeat, payload);
}

export function requestStreamPacket(target = 1): Uint8Array {
  const payload: number[] = [];
  pushU16(payload, 4);
  pushU8(payload, target);
  pushU8(payload, 1);
  pushU8(payload, 0);
  pushU8(payload, 1);
  return encodeV2(MSG.requestDataStream, payload);
}

export function messageIntervalPacket(messageId: number, microseconds: number, target = 1): Uint8Array {
  const payload: number[] = [];
  pushF32(payload, messageId);
  pushF32(payload, microseconds);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushU16(payload, CMD.setMessageInterval);
  pushU8(payload, target);
  pushU8(payload, 1);
  pushU8(payload, 0);
  return encodeV2(MSG.commandLong, payload);
}

export function repositionPacket(lat: number, lng: number, alt: number, target = 1): Uint8Array {
  const payload: number[] = [];
  pushF32(payload, -1);
  pushF32(payload, 0);
  pushF32(payload, Number.NaN);
  pushF32(payload, Number.NaN);
  pushI32(payload, Math.round(lat * 1e7));
  pushI32(payload, Math.round(lng * 1e7));
  pushF32(payload, alt);
  pushU16(payload, CMD.reposition);
  pushU8(payload, target);
  pushU8(payload, 1);
  pushU8(payload, 6);
  pushU8(payload, 0);
  pushU8(payload, 0);
  return encodeV2(MSG.commandInt, payload);
}

export function positionTargetPacket(lat: number, lng: number, alt: number, target = 1): Uint8Array {
  const payload: number[] = [];
  pushU32(payload, 0);
  pushI32(payload, Math.round(lat * 1e7));
  pushI32(payload, Math.round(lng * 1e7));
  pushF32(payload, alt);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushF32(payload, 0);
  pushU16(payload, 0x0ff8);
  pushU8(payload, target);
  pushU8(payload, 1);
  pushU8(payload, 6);
  return encodeV2(MSG.setPositionTarget, payload);
}

export function rtlPacket(target = 1): Uint8Array {
  const payload: number[] = [];
  for (let index = 0; index < 7; index += 1) pushF32(payload, 0);
  pushU16(payload, CMD.rtl);
  pushU8(payload, target);
  pushU8(payload, 1);
  pushU8(payload, 0);
  return encodeV2(MSG.commandLong, payload);
}

export function guidedModePacket(target = 1): Uint8Array {
  const payload: number[] = [];
  pushU32(payload, 4);
  pushU8(payload, target);
  pushU8(payload, 1);
  return encodeV2(MSG.setMode, payload);
}

function decodePayload(id: number, payload: Uint8Array): MavMessage | null {
  if (id === MSG.heartbeat && payload.length >= 9) {
    return {
      id: 0,
      customMode: readU32(payload, 0),
      type: payload[4],
      autopilot: payload[5],
      baseMode: payload[6],
      systemStatus: payload[7],
    };
  }
  if (id === MSG.sysStatus && payload.length >= 31) {
    const remaining = payload[30];
    return { id: 1, battery: remaining === 255 ? null : remaining - (remaining > 127 ? 256 : 0), voltageMv: readU16(payload, 14) };
  }
  if (id === MSG.gpsRaw && payload.length >= 30) {
    return { id: 24, fix: payload[28], satellites: payload[29] };
  }
  if (id === MSG.attitude && payload.length >= 16) {
    return { id: 30, yaw: readF32(payload, 12) };
  }
  if (id === MSG.globalPosition && payload.length >= 28) {
    const hdg = readU16(payload, 26);
    return {
      id: 33,
      lat: readI32(payload, 4) / 1e7,
      lng: readI32(payload, 8) / 1e7,
      altM: readI32(payload, 12) / 1000,
      relativeM: readI32(payload, 16) / 1000,
      vx: readI16(payload, 20) / 100,
      vy: readI16(payload, 22) / 100,
      heading: hdg === 65535 ? null : hdg / 100,
    };
  }
  if (id === MSG.commandInt && payload.length >= 30) {
    return { id: 75, command: readU16(payload, 28), lat: readI32(payload, 16) / 1e7, lng: readI32(payload, 20) / 1e7, alt: readF32(payload, 24) };
  }
  if (id === MSG.setPositionTarget && payload.length >= 16) {
    return { id: 86, lat: readI32(payload, 4) / 1e7, lng: readI32(payload, 8) / 1e7, alt: readF32(payload, 12) };
  }
  if (id === MSG.vfrHud && payload.length >= 20) {
    return { id: 74, groundspeed: readF32(payload, 4), heading: readI16(payload, 18), alt: readF32(payload, 8) };
  }
  return null;
}

export class MavlinkStream {
  private buffer = new Uint8Array(0);

  push(chunk: Uint8Array): MavMessage[] {
    const next = new Uint8Array(this.buffer.length + chunk.length);
    next.set(this.buffer);
    next.set(chunk, this.buffer.length);
    this.buffer = next;
    const messages: MavMessage[] = [];
    while (this.buffer.length > 8) {
      const start = this.buffer.findIndex((byte) => byte === STX_V1 || byte === STX_V2);
      if (start < 0) {
        this.buffer = new Uint8Array(0);
        break;
      }
      if (start > 0) this.buffer = this.buffer.slice(start);
      const version2 = this.buffer[0] === STX_V2;
      const header = version2 ? 10 : 6;
      if (this.buffer.length < header + 2) break;
      const length = this.buffer[1];
      const total = header + length + 2;
      if (length > 255) {
        this.buffer = this.buffer.slice(1);
        continue;
      }
      if (this.buffer.length < total) break;
      const frame = this.buffer.slice(0, total);
      const msgid = version2 ? frame[7] | (frame[8] << 8) | (frame[9] << 16) : frame[5];
      const payload = frame.slice(header, header + length);
      const extra = CRC_EXTRA[msgid];
      const given = frame[total - 2] | (frame[total - 1] << 8);
      const expect = extra === undefined ? null : mavlinkCrc(frame.slice(1, total - 2), extra);
      this.buffer = this.buffer.slice(total);
      if (expect === null || given !== expect) continue;
      const message = decodePayload(msgid, payload);
      if (message) messages.push(message);
    }
    return messages;
  }
}

export function copterMode(customMode: number): string {
  const names: Record<number, string> = { 0: '안정화', 2: '고도', 3: '자동', 4: '가이드', 5: '로이터', 6: '복귀', 9: '착륙' };
  return names[customMode] ?? `모드 ${customMode}`;
}

export function gpsLabel(fix: number): string {
  if (fix >= 3) return 'GPS 3D';
  if (fix === 2) return 'GPS 2D';
  return 'GPS 없음';
}
