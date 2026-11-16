import { motion } from 'framer-motion';
import MapCanvas from '../mission/MapCanvas';
import Press from '../components/Press';

const fade = {
  hidden: { opacity: 0, y: 28 },
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
          <motion.div initial="hidden" animate="show" variants={fade} transition={{ type: 'spring', stiffness: 70, damping: 16 }}>
            <p className="eyebrow">팀 S?</p>
            <h1>한 번 누르면<br />수색이 시작됩니다.</h1>
            <p className="sub">코드만 보내면 같은 지도에 모입니다.</p>
            <div className="desktop-cta">
              <Press onClick={onStart}>새 수색 시작</Press>
              <button className="text-link" type="button" onClick={onJoin}>코드가 있어요</button>
            </div>
          </motion.div>
          <motion.div
            className="hero-map"
            initial={{ opacity: 0, scale: 0.96 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ type: 'spring', stiffness: 60, damping: 18, delay: 0.08 }}
          >
            <MapCanvas zones={[]} points={[]} members={[]} showLocate />
          </motion.div>
        </section>
        <motion.section
          className="quiet-block"
          initial="hidden"
          whileInView="show"
          viewport={{ once: true, amount: 0.5 }}
          variants={fade}
          transition={{ type: 'spring', stiffness: 70, damping: 18 }}
        >
          <h2>그리고 이어서 적습니다.</h2>
          <div className="trio">
            <article><b>완료</b><span>구역을 누르면 한 번.</span></article>
            <article><b>중단</b><span>이유만 적습니다.</span></article>
            <article><b>사진</b><span>그 구역에 남습니다.</span></article>
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
