import { useEffect, useState } from 'react';
import type { FormEvent } from 'react';
import { isJoinCode, normalizeJoinCode, type Role } from '../domain/rules';
import { roleLabel } from '../domain/rules';
import { rpc } from '../lib/api';
import { getSupabase } from '../lib/supabase';
import { mapMission } from '../mission/mapRows';
import type { Mission } from '../mission/types';

export default function MissionsPage({
  userId,
  onOpen,
  onSignOut,
}: {
  userId: string;
  onOpen: (id: string) => void;
  onSignOut: () => void;
}) {
  const [missions, setMissions] = useState<Mission[]>([]);
  const [title, setTitle] = useState('');
  const [code, setCode] = useState('');
  const [role, setRole] = useState<Role>('pilot');
  const [callsign, setCallsign] = useState('');
  const [drone, setDrone] = useState('');
  const [error, setError] = useState('');

  const load = async () => {
    const supabase = getSupabase();
    if (!supabase) return;
    const { data, error: loadError } = await supabase.from('members').select('missions(*)').eq('user_id', userId);
    if (loadError) {
      setError(loadError.message);
      return;
    }
    const rows = (data ?? []).flatMap((row) => {
      const mission = (row as { missions: Record<string, unknown> | Record<string, unknown>[] | null }).missions;
      if (!mission || Array.isArray(mission)) return [];
      return [mapMission(mission)];
    });
    setMissions(rows);
  };

  useEffect(() => { void load(); }, [userId]);

  const createMission = async (event: FormEvent) => {
    event.preventDefault();
    setError('');
    try {
      const created = await rpc<Record<string, unknown>>('create_mission', { p_title: title.trim() });
      onOpen(String(created.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '임무를 만들지 못했습니다.');
    }
  };

  const join = async (event: FormEvent) => {
    event.preventDefault();
    const next = normalizeJoinCode(code);
    if (!isJoinCode(next)) {
      setError('참여 코드는 여섯 자리입니다.');
      return;
    }
    setError('');
    try {
      const joined = await rpc<Record<string, unknown>>('join_mission', {
        p_code: next,
        p_role: role,
        p_callsign: callsign.trim(),
        p_drone: drone.trim(),
      });
      onOpen(String(joined.id));
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : '참여하지 못했습니다.');
    }
  };

  return (
    <main className="missions">
      <header className="topbar" style={{ paddingLeft: 0, paddingRight: 0 }}>
        <h1>내 임무</h1>
        <button className="btn ghost small" type="button" onClick={onSignOut}>로그아웃</button>
      </header>
      {error ? <p className="error" role="alert">{error}</p> : null}
      <div className="cards" style={{ marginTop: 12 }}>
        <form className="sheet" onSubmit={createMission}>
          <h2>새 임무</h2>
          <label>이름<input value={title} onChange={(event) => setTitle(event.target.value)} required minLength={2} placeholder="하천 동쪽 수색" /></label>
          <button className="btn primary" type="submit">만들고 운영자로 들어가기</button>
        </form>
        <form className="sheet" onSubmit={join}>
          <h2>코드로 참여</h2>
          <label>참여 코드<input value={code} onChange={(event) => setCode(normalizeJoinCode(event.target.value))} required placeholder="AB12CD" /></label>
          <div className="segmented" role="group" aria-label="역할">
            {(['pilot', 'operator'] as Role[]).map((item) => (
              <button key={item} type="button" className="btn" aria-pressed={role === item} onClick={() => setRole(item)}>{roleLabel[item]}</button>
            ))}
          </div>
          <label>호출 부호<input value={callsign} onChange={(event) => setCallsign(event.target.value)} required placeholder="조종 1" /></label>
          <label>기체 이름<input value={drone} onChange={(event) => setDrone(event.target.value)} placeholder="쿼드 A" /></label>
          <button className="btn" type="submit">참여</button>
        </form>
      </div>
      <div className="mission-list">
        {missions.length ? missions.map((mission) => (
          <button key={mission.id} type="button" onClick={() => onOpen(mission.id)}>
            <b>{mission.title}</b>
            <div className="quiet">코드 {mission.joinCode}</div>
          </button>
        )) : <p className="quiet">아직 참여 중인 임무가 없습니다.</p>}
      </div>
    </main>
  );
}
