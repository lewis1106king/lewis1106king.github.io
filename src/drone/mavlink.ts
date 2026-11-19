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

export function connectMavlink(
  url: string,
  onFix: (fix: CraftFix) => void,
  onStatus: (message: string) => void,
): CraftLink {
  let socket: WebSocket;
  try {
    socket = new WebSocket(url);
  } catch {
    onStatus('기체 주소에 연결하지 못했습니다.');
    return { goto() {}, rtl() {}, close() {} };
  }
  socket.onopen = () => onStatus('기체에 연결됐습니다.');
  socket.onerror = () => onStatus('기체 연결이 끊겼습니다.');
  socket.onmessage = (event) => {
    try {
      const body = JSON.parse(String(event.data)) as Partial<CraftFix> & { type?: string };
      if (body.type !== 'telemetry' || typeof body.lat !== 'number' || typeof body.lng !== 'number') return;
      onFix({
        lat: body.lat,
        lng: body.lng,
        alt: typeof body.alt === 'number' ? body.alt : null,
        heading: typeof body.heading === 'number' ? body.heading : null,
        speed: typeof body.speed === 'number' ? body.speed : null,
        battery: typeof body.battery === 'number' ? body.battery : null,
        mode: body.mode ?? '',
      });
    } catch {
      onStatus('기체 신호를 읽지 못했습니다.');
    }
  };
  const send = (payload: unknown) => {
    if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(payload));
  };
  return {
    goto: (lat, lng, alt) => send({ type: 'goto', lat, lng, alt }),
    rtl: () => send({ type: 'rtl' }),
    close: () => socket.close(),
  };
}
