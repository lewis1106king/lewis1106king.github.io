import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Press from '../components/Press';
import { rpc } from '../lib/api';
import { shareUrl } from '../lib/session';
import { getSupabase } from '../lib/supabase';

export default function SharePage({
  missionId,
  onMap,
  onHome,
}: {
  missionId: string;
  onMap: () => void;
  onHome: () => void;
}) {
  const cached = sessionStorage.getItem('suseak-share');
  let initial: { id?: string; code?: string } = {};
  try { initial = cached ? JSON.parse(cached) as { id?: string; code?: string } : {}; } catch { initial = {}; }
  const [code, setCode] = useState(initial.id === missionId ? initial.code ?? '' : '');
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(localStorage.getItem('suseak-name') ?? '');
  const link = code ? shareUrl(code) : '';

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return;
    void supabase.from('missions').select('join_code').eq('id', missionId).single().then(({ data }) => {
      const next = String(data?.join_code ?? '');
      if (next) setCode(next);
    });
  }, [missionId]);

  useEffect(() => {
    if (!link) return;
    void QRCode.toDataURL(link, { margin: 1, width: 420, color: { dark: '#191F28', light: '#FFFFFF' } }).then(setQr);
  }, [link]);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    navigator.vibrate?.(10);
    setCopied(true);
  };

  const saveName = () => {
    const next = name.trim();
    if (next.length < 1) return;
    localStorage.setItem('suseak-name', next);
    void rpc('rename_me', { p_mission_id: missionId, p_callsign: next }).catch(() => undefined);
  };

  return (
    <main className="flow share">
      <button className="text-link back" type="button" onClick={onHome}>홈</button>
      <p className="eyebrow">같이 볼 사람</p>
      <h1>이 코드를<br />보내세요.</h1>
      <p className="code-huge">{code || '······'}</p>
      {qr ? <img className="qr" src={qr} alt="참여 링크 QR" /> : <div className="qr skeleton" />}
      <button className="text-link" type="button" onClick={() => void copy()}>{copied ? '복사했어요' : '링크 복사'}</button>
      <label className="name-line">내 이름
        <input value={name} placeholder="나" maxLength={24} onChange={(event) => setName(event.target.value)} onBlur={saveName} />
      </label>
      <div className="dock single">
        <Press onClick={onMap}>지도로 들어가기</Press>
      </div>
    </main>
  );
}
