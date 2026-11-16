import { useState } from 'react';
import Press from '../components/Press';
import { ensureMember } from '../sync/edit';
import { selfId } from '../sync/identity';
import { openRoom } from '../sync/room';

export default function NamePage({ code, onBack, onJoined }: { code: string; onBack: () => void; onJoined: () => void }) {
  const [name, setName] = useState(localStorage.getItem('suseak-name') ?? '');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const submit = async () => {
    setBusy(true);
    setError('');
    const room = openRoom(code);
    await room.whenReady();
    if (!room.data) await room.waitForData(5000);
    if (!room.data) {
      setBusy(false);
      setError('이 코드를 찾지 못했어요.');
      return;
    }
    const next = name.trim();
    localStorage.setItem('suseak-name', next);
    room.update((data) => ensureMember(data, selfId(), next, 'pilot'));
    onJoined();
  };

  return (
    <main className="flow">
      <button className="text-link back" type="button" onClick={onBack}>돌아가기</button>
      <p className="eyebrow">{code}</p>
      <h1>이름이<br />뭐예요?</h1>
      <input
        autoFocus
        value={name}
        onChange={(event) => setName(event.target.value)}
        placeholder="이름"
        maxLength={24}
        aria-label="이름"
      />
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="dock single">
        <Press disabled={busy || name.trim().length < 1} onClick={() => void submit()}>{busy ? '들어가는 중' : '들어가기'}</Press>
      </div>
    </main>
  );
}
