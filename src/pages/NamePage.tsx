import { useState } from 'react';
import Press from '../components/Press';
import { rpc } from '../lib/api';
import { ensureUser } from '../lib/session';

export default function NamePage({
  code,
  onBack,
  onJoined,
  onNeedSetup,
}: {
  code: string;
  onBack: () => void;
  onJoined: (id: string) => void;
  onNeedSetup: (message: string) => void;
}) {
  const [name, setName] = useState(localStorage.getItem('suseak-name') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await ensureUser();
      const joined = await rpc<Record<string, unknown>>('join_mission', {
        p_code: code,
        p_role: 'pilot',
        p_callsign: name.trim(),
        p_drone: '',
      });
      localStorage.setItem('suseak-name', name.trim());
      localStorage.setItem('suseak-last', String(joined.id));
      onJoined(String(joined.id));
    } catch (reason) {
      const message = reason instanceof Error ? reason.message : '들어가지 못했습니다.';
      if (message.includes('연결 정보') || message.includes('Anonymous')) onNeedSetup(message);
      else setError(message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className="flow">
      <button className="text-link back" type="button" onClick={onBack}>돌아가기</button>
      <p className="eyebrow">{code}</p>
      <h1>이름이<br />뭐예요?</h1>
      <div>
        <input
          autoFocus
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="김정우"
          maxLength={24}
          aria-label="이름"
          required
        />
        {error ? <p className="error" role="alert">{error}</p> : null}
        <div className="dock single">
          <Press disabled={busy || name.trim().length < 1} onClick={() => void submit()}>{busy ? '들어가는 중' : '들어가기'}</Press>
        </div>
      </div>
    </main>
  );
}
