import { useState } from 'react';
import { motion } from 'framer-motion';
import LookDialog from '../components/LookDialog';
import MapCanvas from '../mission/MapCanvas';
import Press from '../components/Press';

const rise = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

export default function LandingPage({ onStart, onJoin }: { onStart: () => void; onJoin: () => void }) {
  const [lookOpen, setLookOpen] = useState(false);
  return (
    <div className="site">
      <header className="nav">
        <span className="word">수색 연결</span>
        <button className="text-link" type="button" onClick={() => setLookOpen(true)}>화면</button>
      </header>
      <main>
        <section className="hero">
          <motion.div initial="hidden" animate="show" variants={rise} transition={{ type: 'spring', stiffness: 80, damping: 18 }}>
            <p className="eyebrow">팀 S?</p>
            <h1>한 번 누르면<br />수색이 시작됩니다.</h1>
            <p className="sub">끊기면 가장 가까운 드론이 이어받습니다.</p>
            <div className="desktop-cta">
              <Press onClick={onStart}>새 수색 시작</Press>
              <button className="text-link" type="button" onClick={onJoin}>코드가 있어요</button>
            </div>
          </motion.div>
          <motion.div
            className="hero-map"
            initial={{ opacity: 0, scale: 0.97, y: 12 }}
            animate={{ opacity: 1, scale: 1, y: 0 }}
            transition={{ type: 'spring', stiffness: 70, damping: 18, delay: 0.06 }}
          >
            <MapCanvas zones={[]} points={[]} members={[]} showLocate />
          </motion.div>
        </section>
        <motion.section
          className="quiet-block"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.6 }}
          variants={{ hidden: {}, show: { transition: { staggerChildren: 0.08 } } }}
        >
          <div className="trio">
            {[
              ['구역', '지도에 긋고, 지나간 자취로 수색 비율을 봅니다.'],
              ['기체', 'USB나 열린 주소로 붙입니다. 시동은 조종사에게 있습니다.'],
              ['인계', '끊기면 가장 가까운 드론이 남은 구역을 이어받습니다.'],
            ].map(([title, body]) => (
              <motion.article key={title} variants={rise} transition={{ type: 'spring', stiffness: 90, damping: 18 }}>
                <b>{title}</b>
                <span>{body}</span>
              </motion.article>
            ))}
          </div>
        </motion.section>
      </main>
      {lookOpen ? <LookDialog onClose={() => setLookOpen(false)} /> : null}
      <div className="dock">
        <Press onClick={onStart}>새 수색 시작</Press>
        <button className="text-link" type="button" onClick={onJoin}>코드가 있어요</button>
      </div>
    </div>
  );
}
