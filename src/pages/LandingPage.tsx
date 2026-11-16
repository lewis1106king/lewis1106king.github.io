import { useState } from 'react';
import MapCanvas from '../mission/MapCanvas';

export default function LandingPage({
  onStart,
  onTheme,
  themeLabel,
}: {
  onStart: () => void;
  onTheme: () => void;
  themeLabel: string;
}) {
  const [showMap, setShowMap] = useState(true);
  return (
    <div className="landing">
      <header className="topbar">
        <button className="brand" type="button" onClick={() => window.scrollTo({ top: 0, behavior: 'smooth' })}>
          <span className="mark" aria-hidden="true">S<span>?</span></span>
          수색 연결
        </button>
        <div className="top-actions">
          <button className="btn ghost small" type="button" onClick={onTheme}>{themeLabel}</button>
          <button className="btn primary small" type="button" onClick={onStart}>시작하기</button>
        </div>
      </header>
      <section className="hero">
        <div className="rise">
          <p className="kicker">팀 S? · 김정우 · 김상현</p>
          <h1>수색은 이어지고,<br />기록은 남습니다.</h1>
          <p className="lede">여러 조종자와 운영자가 같은 지도에서 구역, 사진, 인계를 실시간으로 잇습니다. 기체 조종이나 배터리 수치는 만들지 않습니다.</p>
          <div className="hero-actions">
            <button className="btn primary" type="button" onClick={onStart}>임무 시작하기</button>
            <a className="btn" href="#how">어떻게 쓰나</a>
          </div>
          <p className="quiet">위치는 각 사람이 허용한 휴대폰 GPS입니다. 드론 비행 로그를 읽지 않습니다.</p>
        </div>
        <div className="rise delay-1" style={{ height: 460 }}>
          {showMap ? <MapCanvas zones={[]} points={[]} members={[]} showLocate onPick={() => undefined} /> : null}
          <button className="btn ghost small" type="button" onClick={() => setShowMap((value) => !value)} style={{ marginTop: 8 }}>
            {showMap ? '지도 숨기기' : '실제 지도 보기'}
          </button>
        </div>
      </section>
      <section className="section" id="how">
        <p className="kicker">필요한 일</p>
        <h2>비행이 끝나도 확인과 인계는 남습니다.</h2>
        <div className="cards">
          <article className="card rise"><h3>작업</h3><p>배정, 진행, 완료, 중단을 구역마다 나눕니다.</p></article>
          <article className="card rise delay-1"><h3>관측</h3><p>사진이 있어도 확인 완료는 따로 기록합니다.</p></article>
          <article className="card rise delay-2"><h3>승인 인계</h3><p>운영자가 사유를 보고 새 담당에게 배정합니다. 사진은 그대로 둡니다.</p></article>
        </div>
      </section>
      <section className="section">
        <p className="kicker">실제로 되는 것</p>
        <h2>계정, 지도, 실시간, 사진.</h2>
        <div className="cards">
          <article className="card"><h3>참여 코드</h3><p>임무를 만들고 여섯 자리 코드로 운영자나 조종을 들입니다.</p></article>
          <article className="card"><h3>실시간 위치</h3><p>다른 휴대폰의 위치가 같은 지도에 바로 표시됩니다.</p></article>
          <article className="card"><h3>오프라인</h3><p>통신이 끊기면 변경을 모아 두었다가 다시 연결되면 올립니다.</p></article>
        </div>
      </section>
      <p className="footer-note">마송고등학교 메이커데이. QGroundControl, DJI FlightHub 2, DroneSense의 운영 화면을 참고했지만 그 제품의 기체 제어를 제공하지 않습니다. 가격 제안은 검증 전이며 이 사이트에 결제 기능은 없습니다.</p>
    </div>
  );
}
