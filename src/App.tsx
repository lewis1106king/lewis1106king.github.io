import { useEffect, useState } from 'react';
import { readConfig } from './lib/config';
import { getSupabase } from './lib/supabase';
import AuthPage from './pages/AuthPage';
import LandingPage from './pages/LandingPage';
import MissionScreen from './pages/MissionScreen';
import MissionsPage from './pages/MissionsPage';
import SetupPage from './pages/SetupPage';

type Route =
  | { name: 'home' }
  | { name: 'auth' }
  | { name: 'setup' }
  | { name: 'missions' }
  | { name: 'mission'; id: string };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const mission = hash.match(/^\/m\/([0-9a-f-]{36})$/i);
  if (mission) return { name: 'mission', id: mission[1] };
  if (hash.startsWith('/auth')) return { name: 'auth' };
  if (hash.startsWith('/setup')) return { name: 'setup' };
  if (hash.startsWith('/missions')) return { name: 'missions' };
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
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    const stored = localStorage.getItem('suseak-theme');
    if (stored === 'light' || stored === 'dark') return stored;
    return window.matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  });

  useEffect(() => {
    document.documentElement.dataset.theme = theme;
    localStorage.setItem('suseak-theme', theme);
  }, [theme]);

  useEffect(() => {
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
    const { data } = supabase.auth.onAuthStateChange((event, session) => {
      setUserId(session?.user.id ?? null);
      if (event === 'SIGNED_IN' && parseRoute().name === 'auth') go('/missions');
      if (event === 'SIGNED_OUT') go('/');
    });
    return () => {
      active = false;
      data.subscription.unsubscribe();
    };
  }, []);

  const start = () => {
    if (!configured) go('/setup');
    else if (userId) go('/missions');
    else go('/auth');
  };

  if (!ready) return <main className="app-loading">준비하고 있습니다.</main>;

  const themeLabel = theme === 'dark' ? '밝은 화면' : '어두운 화면';
  const toggleTheme = () => setTheme((value) => value === 'dark' ? 'light' : 'dark');

  if (route.name === 'setup' || (!configured && (route.name === 'auth' || route.name === 'missions' || route.name === 'mission'))) {
    return <SetupPage onBack={() => go('/')} />;
  }
  if (route.name === 'auth') return <AuthPage onBack={() => go('/')} />;
  if (route.name === 'missions') {
    if (!userId) return <AuthPage onBack={() => go('/')} />;
    return <MissionsPage userId={userId} onOpen={(id) => go(`/m/${id}`)} onSignOut={() => { void getSupabase()?.auth.signOut(); }} />;
  }
  if (route.name === 'mission') {
    if (!userId) return <AuthPage onBack={() => go('/')} />;
    return <MissionScreen missionId={route.id} selfId={userId} onBack={() => go('/missions')} />;
  }
  return <LandingPage onStart={start} onTheme={toggleTheme} themeLabel={themeLabel} />;
}
