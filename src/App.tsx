import { useEffect, useMemo, useState } from 'react';
import IntroPage from './IntroPage';
import WorkflowPage from './WorkflowPage';
import { createWorkflow, projectZones } from './workflow';

export default function App() {
  const [demoOpen, setDemoOpen] = useState(window.location.hash === '#demo');
  const previewZones = useMemo(() => projectZones(createWorkflow()), []);

  useEffect(() => {
    const handleRoute = () => {
      setDemoOpen(window.location.hash === '#demo');
      window.scrollTo({ top: 0, behavior: 'instant' });
    };
    window.addEventListener('hashchange', handleRoute);
    return () => window.removeEventListener('hashchange', handleRoute);
  }, []);

  if (demoOpen) return <WorkflowPage onBack={() => { window.location.hash = ''; }} />;
  return <IntroPage zones={previewZones} onOpenDemo={() => { window.location.hash = 'demo'; }} />;
}
