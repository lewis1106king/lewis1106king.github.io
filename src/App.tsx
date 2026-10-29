import { useEffect, useMemo, useState } from 'react';
import GcsPage from './gcs/GcsPage';
import IntroPage from './IntroPage';
import WorkflowPage from './WorkflowPage';
import { createWorkflow, projectZones } from './workflow';

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

  if (route === '#gcs') return <GcsPage onBack={() => { window.location.hash = ''; }} />;
  if (route === '#demo') return <WorkflowPage onBack={() => { window.location.hash = ''; }} />;
  return <IntroPage zones={previewZones} onOpenDemo={() => { window.location.hash = 'demo'; }} onOpenGcs={() => { window.location.hash = 'gcs'; }} />;
}
