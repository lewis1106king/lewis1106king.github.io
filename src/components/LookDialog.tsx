import { useEffect, useState } from 'react';
import { defaultLook, type Look } from '../lib/look';
import { applyLook, loadLook, saveLook } from '../lib/look-store';

const accents = ['#1d4ed8', '#0f766e', '#9a3412', '#7c3aed', '#be123c'];

export function useLook(): Look {
  const [look, setLook] = useState<Look>(defaultLook);
  useEffect(() => {
    const sync = () => {
      const next = loadLook();
      setLook(next);
      applyLook(next);
    };
    sync();
    window.addEventListener('suseak-look', sync);
    return () => window.removeEventListener('suseak-look', sync);
  }, []);
  return look;
}

export default function LookDialog({ onClose }: { onClose: () => void }) {
  const [look, setLook] = useState(loadLook);
  const change = (patch: Partial<Look>) => setLook(saveLook({ ...look, ...patch }));
  return (
    <div className="confirm-back" role="presentation">
      <div className="confirm look-dialog" role="dialog" aria-labelledby="look-title">
        <h2 id="look-title">화면</h2>
        <p className="sub">이 기기에만 저장됩니다.</p>
        <div className="look-row">
          <span>밝기</span>
          <button className={look.night ? 'press press-quiet' : 'press press-primary'} type="button" onClick={() => change({ night: false })}>낮</button>
          <button className={look.night ? 'press press-primary' : 'press press-quiet'} type="button" onClick={() => change({ night: true })}>밤</button>
        </div>
        <div className="look-row">
          <span>색</span>
          {accents.map((color) => (
            <button key={color} className="swatch" type="button" aria-label={color} style={{ background: color }} onClick={() => change({ accent: color })} />
          ))}
          <input aria-label="직접 고른 색" type="color" value={look.accent} onChange={(event) => change({ accent: event.target.value })} />
        </div>
        <div className="look-row">
          <span>모서리</span>
          <button className="press press-quiet" type="button" onClick={() => change({ radius: 2 })}>각짐</button>
          <button className="press press-quiet" type="button" onClick={() => change({ radius: 10 })}>보통</button>
          <button className="press press-quiet" type="button" onClick={() => change({ radius: 18 })}>둥글게</button>
        </div>
        <div className="look-row">
          <span>글자</span>
          <button className="press press-quiet" type="button" onClick={() => change({ type: 14 })}>작게</button>
          <button className="press press-quiet" type="button" onClick={() => change({ type: 16 })}>보통</button>
          <button className="press press-quiet" type="button" onClick={() => change({ type: 18 })}>크게</button>
        </div>
        <div className="look-row">
          <span>칸</span>
          <button className={look.search ? 'press press-primary' : 'press press-quiet'} type="button" onClick={() => change({ search: !look.search })}>검색</button>
          <button className={look.tools ? 'press press-primary' : 'press press-quiet'} type="button" onClick={() => change({ tools: !look.tools })}>도구</button>
          <button className={look.legend ? 'press press-primary' : 'press press-quiet'} type="button" onClick={() => change({ legend: !look.legend })}>범례</button>
          <button className={look.telem ? 'press press-primary' : 'press press-quiet'} type="button" onClick={() => change({ telem: !look.telem })}>계기</button>
        </div>
        <label className="look-slide">배터리 경고 {look.battery}%
          <input aria-label="배터리 경고" type="range" min={5} max={50} value={look.battery} onChange={(event) => change({ battery: Number(event.target.value) })} />
        </label>
        <div className="look-row">
          <span>수색 칸</span>
          {[20, 40, 80].map((size) => (
            <button key={size} className={look.grid === size ? 'press press-primary' : 'press press-quiet'} type="button" onClick={() => change({ grid: size })}>{size}m</button>
          ))}
        </div>
        <div className="pair">
          <button className="press press-quiet" type="button" onClick={() => setLook(saveLook(defaultLook))}>처음처럼</button>
          <button className="press press-primary" type="button" onClick={onClose}>닫기</button>
        </div>
      </div>
    </div>
  );
}
