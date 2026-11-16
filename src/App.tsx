import { AnimatePresence, MotionConfig, motion } from 'framer-motion';
import { useEffect, useState } from 'react';
import { selfId } from './sync/identity';
import CodePage from './pages/CodePage';
import LandingPage from './pages/LandingPage';
import MissionScreen from './pages/MissionScreen';
import NamePage from './pages/NamePage';
import SharePage from './pages/SharePage';
import StartPage from './pages/StartPage';

type Route =
  | { name: 'home' }
  | { name: 'start' }
  | { name: 'join' }
  | { name: 'name'; code: string }
  | { name: 'share'; code: string }
  | { name: 'mission'; code: string };

function parseRoute(): Route {
  const hash = window.location.hash.replace(/^#/, '') || '/';
  const mission = hash.match(/^\/m\/([A-F0-9]{6})$/i);
  const share = hash.match(/^\/s\/([A-F0-9]{6})$/i);
  const named = hash.match(/^\/j\/([A-F0-9]{6})$/i);
  if (mission) return { name: 'mission', code: mission[1].toUpperCase() };
  if (share) return { name: 'share', code: share[1].toUpperCase() };
  if (named) return { name: 'name', code: named[1].toUpperCase() };
  if (hash.startsWith('/start')) return { name: 'start' };
  if (hash.startsWith('/join')) return { name: 'join' };
  return { name: 'home' };
}

function go(path: string) {
  window.location.hash = path;
}

function routeKey(route: Route): string {
  if (route.name === 'name' || route.name === 'share' || route.name === 'mission') return `${route.name}-${route.code}`;
  return route.name;
}

export default function App() {
  const [route, setRoute] = useState<Route>(parseRoute);
  const me = selfId();

  useEffect(() => {
    document.documentElement.dataset.theme = 'light';
    const onHash = () => setRoute(parseRoute());
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  let screen = <LandingPage onStart={() => go('/start')} onJoin={() => go('/join')} />;
  if (route.name === 'start') screen = <StartPage onCreated={(code) => go(`/s/${code}`)} onHome={() => go('/')} />;
  else if (route.name === 'join') screen = <CodePage onBack={() => go('/')} onCode={(code) => go(`/j/${code}`)} />;
  else if (route.name === 'name') screen = <NamePage code={route.code} onBack={() => go('/join')} onJoined={() => go(`/m/${route.code}`)} />;
  else if (route.name === 'share') screen = <SharePage code={route.code} onHome={() => go('/')} onMap={() => go(`/m/${route.code}`)} />;
  else if (route.name === 'mission') screen = <MissionScreen code={route.code} selfId={me} onBack={() => go(`/s/${route.code}`)} />;

  return (
    <MotionConfig reducedMotion="user">
      <AnimatePresence mode="wait">
        <motion.div
          key={routeKey(route)}
          initial={{ opacity: 0, y: 18 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -10 }}
          transition={{ type: 'spring', stiffness: 320, damping: 32 }}
        >
          {screen}
        </motion.div>
      </AnimatePresence>
    </MotionConfig>
  );
}
