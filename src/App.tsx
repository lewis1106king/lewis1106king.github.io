import { useEffect, useMemo, useState } from 'react';
import GcsPage from './gcs/GcsPage';
import IntroPage from './IntroPage';
import OfflineBoardPage from './offline/OfflineBoardPage';
import WorkflowPage from './WorkflowPage';
import { createWorkflow, projectZones } from './workflow';
import type { BoardMode } from './offline/storage';

export default function App() {
  const [route, setRoute] = useState(window.location.hash);
  const previewZones = useMemo(() => projectZones(createWorkflow()), []);

  useEffect(() => {
    const handleRoute = () => {
      setRoute(window.location.hash);
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', handleRoute);
    return () => window.removeEventListener('hashchange', handleRoute);
  }, []);

  const open = (hash: string) => { window.location.hash = hash; };

  if (route === '#gcs') return <GcsPage onBack={() => open('')} />;
  if (route === '#demo') return <WorkflowPage onBack={() => open('')} />;
  if (route === '#field' || route === '#practice') {
    const mode: BoardMode = route === '#field' ? 'field' : 'practice';
    return <OfflineBoardPage mode={mode} onBack={() => open('')} onMode={(next) => open(next)} />;
  }
  return (
    <IntroPage
      zones={previewZones}
      onOpenPractice={() => open('practice')}
      onOpenField={() => open('field')}
      onOpenDemo={() => open('demo')}
      onOpenGcs={() => open('gcs')}
    />
  );
}
