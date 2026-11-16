import { useState } from 'react';
import { motion } from 'framer-motion';
import type { LatLng } from '../domain/rules';
import { isValidPath } from '../domain/rules';
import Press from '../components/Press';
import MapCanvas from '../mission/MapCanvas';
import type { Zone } from '../mission/types';

export default function LookPage({ onStart, onHome }: { onStart: () => void; onHome: () => void }) {
  const [draft, setDraft] = useState<LatLng[]>([]);
  const [zone, setZone] = useState<Zone | null>(null);
  const [picked, setPicked] = useState(false);

  const pick = (point: LatLng) => {
    if (zone) return;
    setDraft((value) => value.length >= 12 ? value : [...value, point]);
  };

  return (
    <div className="board">
      <header className="float-bar">
        <button className="text-link" type="button" onClick={onHome}>홈</button>
        <b>수색</b>
        <span className="dot" />
      </header>
      <MapCanvas
        zones={zone ? [zone] : []}
        points={[]}
        members={[]}
        selectedZoneId={picked && zone ? zone.id : null}
        draft={zone ? [] : draft}
        showLocate
        onPick={zone ? undefined : pick}
        onSelectZone={() => setPicked(true)}
      />
      <motion.section className="sheet" initial={{ y: 24 }} animate={{ y: 0 }} transition={{ type: 'spring', stiffness: 280, damping: 30 }}>
        <span className="grab" aria-hidden="true" />
        {picked && zone ? (
          <>
            <h2>{zone.label}</h2>
            <div className="pair">
              <Press onClick={onStart}>완료</Press>
              <button className="press press-quiet" type="button" onClick={onStart}>사진</button>
            </div>
            <button className="text-link" type="button" onClick={onStart}>중단 보고</button>
          </>
        ) : zone ? (
          <>
            <h2>구역을 누르세요.</h2>
            <p className="sub">저장은 수색을 시작한 뒤에 됩니다.</p>
          </>
        ) : (
          <>
            <h2>지도를 눌러<br />구역을 그리세요.</h2>
            <p className="sub">{draft.length}개 점</p>
            <Press
              disabled={!isValidPath(draft)}
              onClick={() => setZone({
                id: 'local',
                missionId: 'local',
                label: '구역 1',
                path: draft,
                taskStatus: 'unassigned',
                observationStatus: 'unverified',
                reviewReason: '',
                memo: '',
                assigneeId: null,
                updatedAt: new Date().toISOString(),
              })}
            >저장</Press>
          </>
        )}
      </motion.section>
    </div>
  );
}
