import { useEffect, useRef, useState } from 'react';
import Press from '../components/Press';
import { saveMission } from '../sync/db';
import { freshMission } from '../sync/edit';
import { selfId } from '../sync/identity';
import { openRoom } from '../sync/room';

export default function StartPage({ onCreated, onHome }: { onCreated: (code: string) => void; onHome: () => void }) {
  const [error, setError] = useState('');
  const done = useRef(onCreated);
  done.current = onCreated;
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return undefined;
    started.current = true;
    let stop = false;
    const data = freshMission(selfId(), localStorage.getItem('suseak-name') ?? '');
    void saveMission(data.mission.joinCode, data)
      .then(() => openRoom(data.mission.joinCode).whenReady())
      .then(() => { if (!stop) done.current(data.mission.joinCode); })
      .catch(() => { if (!stop) setError('다시 눌러 주세요.'); });
    return () => { stop = true; };
  }, []);

  if (!error) {
    return (
      <main className="flow">
        <div className="skeleton title" />
        <div className="skeleton line" />
        <div className="skeleton card" />
      </main>
    );
  }

  return (
    <main className="flow">
      <h1>한 번만<br />더 눌러 주세요.</h1>
      <p className="error" role="alert">{error}</p>
      <Press onClick={onHome}>홈으로</Press>
    </main>
  );
}
