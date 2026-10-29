import { ArrowRight, ArrowRightLeft, Check, Info, ShieldAlert, X } from 'lucide-react';
import { observationMeta, taskMeta } from './data';
import type { Zone } from './types';

function StatusLine({
  label,
  symbol,
  tone,
  prefix,
}: {
  label: string;
  symbol: string;
  tone: string;
  prefix: string;
}) {
  return (
    <span className={`status-line ${tone}`}>
      <b aria-hidden="true">{symbol}</b>
      <span>{prefix}: {label}</span>
    </span>
  );
}

function SMark() {
  return <span className="s-mark" aria-label="팀 S?">S<span>?</span></span>;
}

function scrollToSection(id: string) {
  document.getElementById(id)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function ZonePreview({ zones }: { zones: Zone[] }) {
  return (
    <div className="preview-map" aria-label="가상 수색 구역도 미리보기">
      <div className="preview-map-caption">
        <span>가상 구역도</span>
        <small>시연 데이터 미리보기</small>
      </div>
      <div className="preview-grid">
        {zones.map((zone) => (
          <div className={`preview-zone ${zone.needsHandover ? 'handover' : ''}`} key={zone.id}>
            <div><b>{zone.id}</b><span>{zone.droneId ?? '—'}</span></div>
            <small>{taskMeta[zone.taskStatus].symbol} {taskMeta[zone.taskStatus].label}</small>
            <small>{observationMeta[zone.observationStatus].symbol} {observationMeta[zone.observationStatus].label}</small>
          </div>
        ))}
      </div>
      <p><Info size={14} /> 실제 지도·비행 데이터가 아닌 가상 시연 구역입니다.</p>
    </div>
  );
}

export default function IntroPage({ zones, onOpenDemo, onOpenGcs }: { zones: Zone[]; onOpenDemo: () => void; onOpenGcs: () => void }) {
  return (
    <div className="intro-shell" id="top">
      <header className="intro-header">
          <button className="brand-button" onClick={() => scrollToSection('top')} aria-label="소개 첫 화면으로 이동">
          <SMark />
          <span>TEAM S?</span>
        </button>
          <nav className="intro-nav" aria-label="제품 탐색">
            <button onClick={() => scrollToSection('problem')}>해결하는 문제</button>
            <button onClick={() => scrollToSection('how')}>작동 방식</button>
            <button onClick={onOpenGcs}>GCS 콘솔</button>
            <button className="nav-demo" onClick={onOpenDemo}>시연하기 <ArrowRight size={15} /></button>
        </nav>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="kicker">TEAM S? · MULTI-DRONE SEARCH OPERATIONS</p>
            <span className="scope-badge"><ShieldAlert size={15} /> 가상 시제품 · 실제 비행 제어 없음</span>
            <h1>수색은 이어지고,<br />기록은 남습니다.</h1>
            <p className="hero-description">여러 드론의 수색 기록과 중단 작업의 인계를 한곳에서.</p>
            <div className="hero-actions">
              <button className="button primary large" onClick={onOpenDemo}>가상 시연 시작 <ArrowRight size={17} /></button>
              <button className="button subtle large" onClick={() => scrollToSection('how')}>작동 방식 보기</button>
            </div>
            <p className="hero-footnote">작업 진행, 관측 확인, 인계 이력을 수색 구역별로 분리해 연결합니다.</p>
          </div>
          <ZonePreview zones={zones} />
        </section>

        <section className="section-block problem-section" id="problem">
          <div className="section-heading">
            <p className="kicker">THE PROBLEM</p>
            <h2>비행한 구역과 확인한 구역은 다릅니다.</h2>
            <p>드론이 구역을 지나갔다는 기록만으로 관측 자료까지 검토됐다고 판단할 수는 없습니다.</p>
          </div>
          <div className="problem-contrast">
            <article>
              <span className="section-number">01</span>
              <h3>수색 작업 기록</h3>
              <p>어느 기체가 어느 구역의 작업을 수행했는지 남깁니다.</p>
              <span className="example-line">예: B · Z-07 · 진행 중</span>
            </article>
            <div className="contrast-divider" aria-hidden="true"><ArrowRightLeft size={18} /></div>
            <article>
              <span className="section-number">02</span>
              <h3>관측 확인</h3>
              <p>사진·메모 같은 자료를 운영자가 확인했는지 따로 남깁니다.</p>
              <span className="example-line">예: Z-07 · 미확인</span>
            </article>
            <article className="problem-callout">
              <span className="section-number">03</span>
              <h3>중단 후 인계</h3>
              <p>완료 구역은 보존하고, 확인이 남은 구역만 새 작업으로 이어야 합니다.</p>
              <span className="example-line">예: B → A · 증거 보존</span>
            </article>
          </div>
        </section>

        <section className="section-block relationship-section" id="how">
          <div className="section-heading compact">
            <p className="kicker">HOW IT WORKS</p>
            <h2>한 구역에 세 가지 기록을 연결합니다.</h2>
          </div>
          <div className="relationship-flow" aria-label="작업 진행, 관측 확인, 인계 이력의 관계">
            <article>
              <span className="relationship-icon">①</span>
              <h3>작업 진행</h3>
              <p>배정됨, 진행 중, 완료, 중단을 기록합니다.</p>
            </article>
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <article>
              <span className="relationship-icon">②</span>
              <h3>관측 확인</h3>
              <p>미확인, 확인 완료, 재확인 필요를 별도로 판단합니다.</p>
            </article>
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <article>
              <span className="relationship-icon">③</span>
              <h3>인계 이력</h3>
              <p>담당이 바뀌어도 이전 자료와 중단 사유를 남깁니다.</p>
            </article>
          </div>
        </section>

        <section className="section-block handover-section">
          <div className="section-heading compact">
            <p className="kicker">DEMO SCENARIO</p>
            <h2>B 중단 뒤, 필요한 구역만 이어갑니다.</h2>
            <p>완료된 Z-05·Z-06은 그대로 두고 Z-07·Z-08만 운영자 검토와 승인 뒤 새 작업으로 배정합니다.</p>
          </div>
          <ol className="scenario-steps">
            <li><span>1</span><div><b>B 중단</b><p>Z-07·Z-08만 인계 필요로 표시합니다.</p></div></li>
            <li><span>2</span><div><b>운영자 승인</b><p>기존 자료와 사유를 보고 새 담당을 정합니다.</p></div></li>
            <li><span>3</span><div><b>A·C에 새 작업 배정</b><p>작업 상태는 배정됨으로 시작하고 이전 기록은 유지합니다.</p></div></li>
          </ol>
          <button className="button primary" onClick={onOpenDemo}>B 중단 시연으로 이동 <ArrowRight size={16} /></button>
        </section>

        <section className="section-block scope-section">
          <div>
            <p className="kicker">CURRENT SCOPE</p>
            <h2>지금 제공하는 것과 아닌 것을 구분합니다.</h2>
          </div>
          <div className="scope-columns">
            <article>
              <h3><Check size={18} /> 현재 제공</h3>
              <ul>
                <li>가상 구역별 작업·관측 상태</li>
                <li>가상 관측 자료 참조와 메모</li>
                <li>B 중단, 승인 인계, 변경 이력</li>
                <li>브라우저 안의 시연 상태 저장과 CSV 내보내기</li>
              </ul>
            </article>
            <article>
              <h3><X size={18} /> 현재 제외</h3>
              <ul>
                <li>실제 드론 제어와 자동 비행</li>
                <li>실제 위치·통신·배터리 데이터</li>
                <li>자동 인명 판별과 구조 성과 보장</li>
                <li>서버 저장, 계정, 실제 파일 보관·다중 사용자 동기화</li>
              </ul>
            </article>
          </div>
        </section>
      </main>

      <footer className="intro-footer">
        <SMark />
        <p>팀 S? · 다중 드론 협력 수색 관제 시스템</p>
        <button onClick={onOpenDemo}>가상 시연 열기 <ArrowRight size={14} /></button>
      </footer>
    </div>
  );
}
