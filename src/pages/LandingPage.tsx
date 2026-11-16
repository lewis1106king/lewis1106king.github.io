import { motion } from 'framer-motion';
import MapCanvas from '../mission/MapCanvas';
import Press from '../components/Press';

const rise = {
  hidden: { opacity: 0, y: 24 },
  show: { opacity: 1, y: 0 },
};

export default function LandingPage({ onStart, onJoin }: { onStart: () => void; onJoin: () => void }) {
  return (
    <div className="site">
      <header className="nav">
        <span className="word">수색 연결</span>
      </header>
      <main>
        <section className="hero">
          <motion.div initial="hidden" animate="show" variants={rise} transition={{ type: 'spring', stiffness: 80, damping: 18 }}>
            <p className="eyebrow">팀 S?</p>
            <h1>한 번 누르면<br />수색이 시작됩니다.</h1>
            <p className="sub">같은 지도에 모입니다.</p>
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
            {['완료', '중단', '사진'].map((word) => (
              <motion.article key={word} variants={rise} transition={{ type: 'spring', stiffness: 90, damping: 18 }}>
                <b>{word}</b>
              </motion.article>
            ))}
          </div>
        </motion.section>
      </main>
      <div className="dock">
        <Press onClick={onStart}>새 수색 시작</Press>
        <button className="text-link" type="button" onClick={onJoin}>코드가 있어요</button>
      </div>
    </div>
  );
}
