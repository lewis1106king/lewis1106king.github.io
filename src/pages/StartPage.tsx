import { useEffect, useRef, useState } from 'react';
import Press from '../components/Press';
import { NeedsConfigError, rpc } from '../lib/api';
import { ensureUser } from '../lib/session';

export default function StartPage({
  onCreated,
  onBack,
}: {
  onCreated: (id: string) => void;
  onBack: () => void;
}) {
  const [error, setError] = useState('');
  const done = useRef(onCreated);
  done.current = onCreated;

  useEffect(() => {
    let stop = false;
    void (async () => {
      try {
        await ensureUser();
        const created = await rpc<Record<string, unknown>>('create_mission', { p_title: '새 수색' });
        const id = String(created.id);
        sessionStorage.setItem('suseak-share', JSON.stringify({ id, code: String(created.join_code ?? '') }));
        localStorage.setItem('suseak-last', id);
        if (!stop) done.current(id);
      } catch (reason) {
        if (stop) return;
        if (reason instanceof NeedsConfigError) setError('연결 정보가 없습니다.');
        else setError(reason instanceof Error ? reason.message : '시작하지 못했습니다.');
      }
    })();
    return () => { stop = true; };
  }, []);

  if (!error) {
    return (
      <main className="flow">
        <div className="skeleton title" />
        <div className="skeleton line" />
        <div className="skeleton card" />
        <p className="sub">수색을 만들고 있어요.</p>
      </main>
    );
  }

  return (
    <main className="flow">
      <h1>아직<br />연결 전이에요.</h1>
      <p className="error" role="alert">{error}</p>
      <Press onClick={onBack}>설정 보기</Press>
    </main>
  );
}
