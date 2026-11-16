import { useState } from 'react';
import type { FormEvent } from 'react';
import { getSupabase } from '../lib/supabase';

export default function AuthPage({ onBack }: { onBack: () => void }) {
  const [mode, setMode] = useState<'in' | 'up'>('in');
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const supabase = getSupabase();
    if (!supabase) return;
    setBusy(true);
    setError('');
    setMessage('');
    if (mode === 'up') {
      const { data, error: signError } = await supabase.auth.signUp({
        email: email.trim(),
        password,
        options: { data: { display_name: name.trim() || email.split('@')[0] } },
      });
      setBusy(false);
      if (signError) {
        setError(signError.message);
        return;
      }
      if (!data.session) setMessage('가입 메일을 보냈습니다. 메일의 확인 링크를 누른 뒤 로그인하세요.');
      return;
    }
    const { error: signError } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
    setBusy(false);
    if (signError) setError(signError.message === 'Invalid login credentials' ? '이메일 또는 비밀번호가 올바르지 않습니다.' : signError.message);
  };

  return (
    <main className="auth-wrap">
      <button className="btn ghost small" type="button" onClick={onBack}>소개로</button>
      <form className="auth-card" onSubmit={submit} style={{ marginTop: 18 }}>
        <h1>{mode === 'in' ? '로그인' : '가입'}</h1>
        <p className="quiet">같은 임무는 참여 코드로 들어갑니다. 계정은 이메일과 비밀번호입니다.</p>
        <div className="segmented">
          <button type="button" className="btn" aria-pressed={mode === 'in'} onClick={() => setMode('in')}>로그인</button>
          <button type="button" className="btn" aria-pressed={mode === 'up'} onClick={() => setMode('up')}>가입</button>
        </div>
        {mode === 'up' ? <label>이름<input value={name} onChange={(event) => setName(event.target.value)} required maxLength={40} placeholder="김정우" /></label> : null}
        <label>이메일<input type="email" autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} required /></label>
        <label>비밀번호<input type="password" autoComplete={mode === 'up' ? 'new-password' : 'current-password'} minLength={6} value={password} onChange={(event) => setPassword(event.target.value)} required /></label>
        {error ? <p className="error" role="alert">{error}</p> : null}
        {message ? <p className="ok-note">{message}</p> : null}
        <button className="btn primary" type="submit" disabled={busy}>{busy ? '처리 중' : mode === 'in' ? '들어가기' : '계정 만들기'}</button>
      </form>
    </main>
  );
}
