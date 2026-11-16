import { useEffect, useState } from 'react';
import QRCode from 'qrcode';
import Press from '../components/Press';
import { ensureMember } from '../sync/edit';
import { selfId, shareUrl } from '../sync/identity';
import { openRoom } from '../sync/room';

export default function SharePage({ code, onMap, onHome }: { code: string; onMap: () => void; onHome: () => void }) {
  const [qr, setQr] = useState('');
  const [copied, setCopied] = useState(false);
  const [name, setName] = useState(localStorage.getItem('suseak-name') ?? '');
  const link = shareUrl(code);

  useEffect(() => {
    void QRCode.toDataURL(link, { margin: 1, width: 420, color: { dark: '#191F28', light: '#FFFFFF' } }).then(setQr);
  }, [link]);

  const copy = async () => {
    await navigator.clipboard.writeText(link);
    navigator.vibrate?.(10);
    setCopied(true);
  };

  const saveName = () => {
    const next = name.trim();
    if (!next) return;
    localStorage.setItem('suseak-name', next);
    openRoom(code).update((data) => ensureMember(data, selfId(), next, 'operator'));
  };

  return (
    <main className="flow share">
      <button className="text-link back" type="button" onClick={onHome}>홈</button>
      <h1>이 코드를<br />보내세요.</h1>
      <p className="code-huge" data-code={code}>{code}</p>
      {qr ? <img className="qr" src={qr} alt="참여 링크" /> : <div className="qr skeleton" />}
      <button className="text-link" type="button" onClick={() => void copy()}>{copied ? '복사했어요' : '링크 복사'}</button>
      <label className="name-line">
        이름
        <input value={name} placeholder="나" maxLength={24} aria-label="이름" onChange={(event) => setName(event.target.value)} onBlur={saveName} />
      </label>
      <div className="dock single">
        <Press onClick={onMap}>지도로</Press>
      </div>
    </main>
  );
}
