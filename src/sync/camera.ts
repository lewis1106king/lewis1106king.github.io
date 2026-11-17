export type Signal = {
  from: string;
  to: string;
  kind: 'offer' | 'answer' | 'ice' | 'bye';
  sdp?: string;
  candidate?: RTCIceCandidateInit | null;
};

const ICE: RTCConfiguration = {
  iceServers: [{ urls: ['stun:stun.l.google.com:19302', 'stun:stun1.l.google.com:19302'] }],
};

export class CameraHub {
  local: MediaStream | null = null;
  remotes = new Map<string, MediaStream>();
  error = '';
  private readonly pcs = new Map<string, RTCPeerConnection>();
  private readonly ice = new Map<string, RTCIceCandidateInit[]>();
  private readonly retried = new Set<string>();

  constructor(
    private readonly selfId: string,
    private readonly send: (signal: Signal) => void,
    private readonly onChange: () => void,
  ) {}

  async start(): Promise<void> {
    this.error = '';
    if (!navigator.mediaDevices?.getUserMedia) {
      this.error = '이 브라우저에서는 카메라를 쓸 수 없어요.';
      this.onChange();
      return;
    }
    try {
      this.local = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: { facingMode: { ideal: 'environment' }, width: { ideal: 960 } },
      });
      this.onChange();
    } catch {
      this.error = '카메라 권한이 필요해요.';
      this.onChange();
    }
  }

  stop(): void {
    this.local?.getTracks().forEach((track) => track.stop());
    this.local = null;
    this.send({ from: this.selfId, to: '*', kind: 'bye' });
    this.pcs.forEach((pc) => pc.close());
    this.pcs.clear();
    this.remotes.clear();
    this.onChange();
  }

  async watch(id: string): Promise<void> {
    if (!id || id === this.selfId || this.pcs.has(id)) return;
    const pc = this.open(id, false);
    pc.addTransceiver('video', { direction: 'recvonly' });
    const offer = await pc.createOffer();
    await pc.setLocalDescription(offer);
    this.send({ from: this.selfId, to: id, kind: 'offer', sdp: offer.sdp });
    window.setTimeout(() => {
      if (this.remotes.has(id) || this.retried.has(id)) return;
      this.retried.add(id);
      pc.close();
      this.pcs.delete(id);
      void this.watch(id);
    }, 3500);
  }

  async handle(signal: Signal): Promise<void> {
    if (!signal || signal.from === this.selfId) return;
    if (signal.to !== this.selfId && signal.to !== '*') return;
    if (signal.kind === 'bye') {
      this.pcs.get(signal.from)?.close();
      this.pcs.delete(signal.from);
      this.remotes.delete(signal.from);
      this.onChange();
      return;
    }
    if (signal.kind === 'offer' && signal.sdp) {
      if (!this.local) return;
      const pc = this.pcs.get(signal.from) ?? this.open(signal.from, true);
      this.local.getTracks().forEach((track) => {
        if (![...pc.getSenders()].some((sender) => sender.track === track)) pc.addTrack(track, this.local!);
      });
      await pc.setRemoteDescription({ type: 'offer', sdp: signal.sdp });
      await this.flushIce(signal.from, pc);
      const answer = await pc.createAnswer();
      await pc.setLocalDescription(answer);
      this.send({ from: this.selfId, to: signal.from, kind: 'answer', sdp: answer.sdp });
      return;
    }
    const pc = this.pcs.get(signal.from);
    if (!pc) return;
    if (signal.kind === 'answer' && signal.sdp && pc.signalingState !== 'stable') {
      await pc.setRemoteDescription({ type: 'answer', sdp: signal.sdp });
      await this.flushIce(signal.from, pc);
    }
    if (signal.kind === 'ice' && signal.candidate) {
      if (pc.remoteDescription) await pc.addIceCandidate(signal.candidate);
      else this.ice.set(signal.from, [...(this.ice.get(signal.from) ?? []), signal.candidate]);
    }
  }

  private open(id: string, _answering: boolean): RTCPeerConnection {
    const pc = new RTCPeerConnection(ICE);
    this.pcs.set(id, pc);
    pc.ontrack = (event) => {
      const stream = event.streams[0] ?? new MediaStream([event.track]);
      this.remotes.set(id, stream);
      this.onChange();
    };
    pc.onicecandidate = (event) => {
      if (event.candidate) this.send({ from: this.selfId, to: id, kind: 'ice', candidate: event.candidate.toJSON() });
    };
    return pc;
  }

  private async flushIce(id: string, pc: RTCPeerConnection): Promise<void> {
    const queued = this.ice.get(id) ?? [];
    this.ice.set(id, []);
    for (const candidate of queued) await pc.addIceCandidate(candidate);
  }
}

export async function frameBlob(video: HTMLVideoElement): Promise<Blob> {
  const canvas = document.createElement('canvas');
  canvas.width = Math.max(2, video.videoWidth || 640);
  canvas.height = Math.max(2, video.videoHeight || 360);
  const context = canvas.getContext('2d');
  if (!context) throw new Error('화면을 저장하지 못했어요.');
  context.drawImage(video, 0, 0, canvas.width, canvas.height);
  const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/jpeg', 0.72));
  if (!blob) throw new Error('화면을 저장하지 못했어요.');
  return blob;
}
