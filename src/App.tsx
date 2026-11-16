import { MotionConfig } from 'framer-motion';
import { useEffect, useState } from 'react';
import { readConfig } from './lib/config';
import { getSupabase } from './lib/supabase';
import CodePage from './pages/CodePage';
import LandingPage from './pages/LandingPage';
import LookPage from './pages/LookPage';
import MissionScreen from './pages/MissionScreen';
import NamePage from './pages/NamePage';
import SetupPage from './pages/SetupPage';
import SharePage from './pages/SharePage';
import StartPage from './pages/StartPage';

type Route =
  | { name: 'home' }
  | { name: 'setup' }
  | { name: 'start' }
  | { name: 'join' }
  | { name: 'name'; code: string }
  | { name: 'share'; id: string }
  | { name: 'mission'; id: string }
  | { name: 'look' };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const mission = hash.match(/^\/m\/([0-9a-f-]{36})$/i);
  const share = hash.match(/^\/s\/([0-9a-f-]{36})$/i);
  const named = hash.match(/^\/j\/([A-F0-9]{6})$/i);
  if (mission) return { name: 'mission', id: mission[1] };
  if (share) return { name: 'share', id: share[1] };
  if (named) return { name: 'name', code: named[1].toUpperCase() };
  if (hash.startsWith('/start')) return { name: 'start' };
  if (hash.startsWith('/join')) return { name: 'join' };
  if (hash.startsWith('/setup')) return { name: 'setup' };
  if (hash.startsWith('/look')) return { name: 'look' };
  return { name: 'home' };
}

function go(path: string) {
  window.location.hash = path;
}

export default function App() {
  const configured = Boolean(readConfig());
  const [route, setRoute] = useState<Route>(parseRoute);
  const [userId, setUserId] = useState<string | null>(null);
  const [ready, setReady] = useState(!configured);

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    const supabase = getSupabase();
    if (!supabase) return undefined;
    let active = true;
    supabase.auth.getSession().then(({ data }) => {
      if (!active) return;
      setUserId(data.session?.user.id ?? null);
      setReady(true);
    });
    const { data } = supabase.auth.onAuthStateChange((_event, session) => {
      setUserId(session?.user.id ?? null);
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const start = () => go(configured ? '/start' : '/setup');

  if (!ready) {
    return (
      <main className="flow">
        <div className="skeleton title" />
        <div className="skeleton card" />
      </main>
    );
  }

  let screen = <LandingPage onStart={start} onJoin={() => go('/join')} />;
  if (route.name === 'setup') screen = <SetupPage onBack={() => go('/')} />;
  else if (route.name === 'start') {
    screen = configured
      ? <StartPage onCreated={(id) => go(`/s/${id}`)} onBack={() => go('/setup')} />
      : <SetupPage onBack={() => go('/')} />;
  } else if (route.name === 'join') screen = <CodePage onBack={() => go('/')} onCode={(code) => go(`/j/${code}`)} />;
  else if (route.name === 'name') {
    screen = (
      <NamePage
        code={route.code}
        onBack={() => go('/join')}
        onJoined={(id) => go(`/m/${id}`)}
        onNeedSetup={() => go('/setup')}
      />
    );
  } else if (route.name === 'share') {
    screen = <SharePage missionId={route.id} onHome={() => go('/')} onMap={() => go(`/m/${route.id}`)} />;
  } else if (route.name === 'look') screen = <LookPage onHome={() => go('/')} onStart={start} />;
  else if (route.name === 'mission') {
    if (!configured) screen = <SetupPage onBack={() => go('/')} />;
    else if (!userId) screen = <CodePage onBack={() => go('/')} onCode={(code) => go(`/j/${code}`)} />;
    else screen = <MissionScreen missionId={route.id} selfId={userId} onBack={() => go(`/s/${route.id}`)} />;
  }

  return <MotionConfig reducedMotion="user">{screen}</MotionConfig>;
}
