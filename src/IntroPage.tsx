import { ArrowRight, ArrowRightLeft, Check, Info, ShieldAlert, X } from 'lucide-react';
import { observationMeta, taskMeta } from './data';
import type { Zone } from './types';

function StatusLine({ label, symbol, tone, prefix }: { label: string; symbol: string; tone: string; prefix: string }) {
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
        <small>연습 데이터 미리보기</small>
      </div>
      <div className="preview-grid">
        {zones.map((zone) => (
          <div className={`preview-zone ${zone.needsHandover ? 'handover' : ''}`} key={zone.id}>
            <div><b>{zone.id}</b><span>{zone.droneId ?? '—'}</span></div>
            <StatusLine prefix="작업" label={taskMeta[zone.taskStatus].label} symbol={taskMeta[zone.taskStatus].symbol} tone={taskMeta[zone.taskStatus].tone} />
            <StatusLine prefix="관측" label={observationMeta[zone.observationStatus].label} symbol={observationMeta[zone.observationStatus].symbol} tone={observationMeta[zone.observationStatus].tone} />
          </div>
        ))}
      </div>
      <p><Info size={14} /> 실제 지도·GPS·비행 기록이 아닌 화면 위 구역입니다.</p>
    </div>
  );
}

export default function IntroPage({
  zones,
  onOpenPractice,
  onOpenField,
  onOpenDemo,
  onOpenGcs,
}: {
  zones: Zone[];
  onOpenPractice: () => void;
  onOpenField: () => void;
  onOpenDemo: () => void;
  onOpenGcs: () => void;
}) {
  return (
    <div className="intro-shell" id="top">
      <header className="intro-header">
        <button className="brand-button" onClick={() => scrollToSection('top')} aria-label="소개 첫 화면으로 이동">
          <SMark />
          <span>수색 연결</span>
        </button>
        <nav className="intro-nav" aria-label="소개 탐색">
          <button onClick={() => scrollToSection('problem')}>문제</button>
          <button onClick={() => scrollToSection('how')}>작동 방식</button>
          <button onClick={() => scrollToSection('compare')}>차별점</button>
          <button onClick={() => scrollToSection('business')}>사업 모델</button>
          <button onClick={() => scrollToSection('team')}>팀</button>
          <button className="nav-demo" onClick={onOpenPractice}>연습 모드 열기 <ArrowRight size={15} /></button>
        </nav>
      </header>

      <main>
        <section className="hero-section">
          <div className="hero-copy">
            <p className="kicker">마송고등학교 메이커데이 · 팀 S?</p>
            <span className="scope-badge"><ShieldAlert size={15} /> 가상 시제품 · 실제 비행 제어 없음</span>
            <h1>수색은 이어지고,<br />기록은 남습니다.</h1>
            <p className="hero-description">여러 드론의 수색 기록과, 통신이 끊긴 뒤 남은 작업을 다음 담당자에게 잇는 상황판입니다.</p>
            <div className="hero-actions">
              <button className="button primary large" onClick={onOpenPractice}>연습 모드로 대시보드 열기 <ArrowRight size={17} /></button>
              <button className="button subtle large" onClick={() => scrollToSection('how')}>작동 방식 보기</button>
            </div>
            <p className="hero-footnote">김정우 · 김상현. 연습 모드에는 가상 구역 자료가 들어 있고, 이 기기에 저장한 기록이 있으면 그 기록을 엽니다.</p>
          </div>
          <ZonePreview zones={zones} />
        </section>

        <section className="section-block problem-section" id="problem">
          <div className="section-heading">
            <p className="kicker">해결하려는 문제</p>
            <h2>비행을 마쳐도 확인과 인계는 남아 있습니다.</h2>
            <p>드론을 날리며 배운 질문은 이것이었습니다. 통신이 끊기거나 자료 수집이 멈추면, 남은 수색과 기록은 어떻게 이어갈까요?</p>
          </div>
          <div className="problem-contrast">
            <article>
              <span className="section-number">01</span>
              <h3>사진은 어디에 있나</h3>
              <p>구역을 지나갔다는 사실과, 그 사진을 누가 봤는지는 다릅니다.</p>
              <span className="example-line">작업 완료 ≠ 자료 확인</span>
            </article>
            <div className="contrast-divider" aria-hidden="true"><ArrowRightLeft size={18} /></div>
            <article>
              <span className="section-number">02</span>
              <h3>어느 구역이 남았나</h3>
              <p>완료된 구역은 보존하고, 확인이 남은 구역만 다음 담당에게 넘겨야 합니다.</p>
              <span className="example-line">예: Z-05·06 유지, Z-07·08 인계</span>
            </article>
            <article className="problem-callout">
              <span className="section-number">03</span>
              <h3>다음 담당은 누구인가</h3>
              <p>이전 작업, 중단 사유, 승인 사유, 새 작업이 한 구역 기록에 같이 남아야 합니다.</p>
              <span className="example-line">예: B 중단 → 승인 → A 배정</span>
            </article>
          </div>
        </section>

        <section className="section-block relationship-section" id="how">
          <div className="section-heading compact">
            <p className="kicker">작동 방식</p>
            <h2>한 구역에 세 가지 기록을 나눕니다.</h2>
          </div>
          <div className="relationship-flow" aria-label="작업 진행, 관측 확인, 승인 인계">
            <article>
              <span className="relationship-icon">①</span>
              <h3>작업 진행</h3>
              <p>배정, 진행, 완료, 중단. 어느 기체가 어디까지 작업했는지 남깁니다.</p>
            </article>
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <article>
              <span className="relationship-icon">②</span>
              <h3>관측 확인</h3>
              <p>미확인, 확인 완료, 재확인. 자료가 있어도 운영자 검토는 따로 기록합니다.</p>
            </article>
            <ArrowRight className="flow-arrow" aria-hidden="true" />
            <article>
              <span className="relationship-icon">③</span>
              <h3>승인 인계</h3>
              <p>이전 작업, 승인 사유, 새 작업. 원본 사진과 메모는 담당이 바뀌어도 유지됩니다.</p>
            </article>
          </div>
          <div className="mode-grid">
            <article>
              <h3>연습 모드</h3>
              <p>가상 자료로 시연합니다. 기체 A·B·C와 Z-01부터 Z-12가 들어 있습니다. Z-07을 중단한 뒤 승인 인계를 시험할 수 있습니다.</p>
              <button className="button primary" onClick={onOpenPractice}>연습 모드로 대시보드 열기 <ArrowRight size={16} /></button>
            </article>
            <article>
              <h3>현장 모드</h3>
              <p>빈 구역 12개에서 담당과 메모를 직접 적습니다. 연습 기록과는 따로 이 기기에 저장됩니다.</p>
              <button className="button subtle" onClick={onOpenField}>빈 현장 기록 시작 <ArrowRight size={16} /></button>
            </article>
          </div>
          <ul className="capability-list">
            <li>사진과 메모를 구역에 첨부하고, 도면 이미지 위에 관심 지점을 둡니다.</li>
            <li>미해결 항목을 보고서로 모읍니다. 점검 문구가 저장이나 백업을 막지는 않습니다.</li>
            <li>작업, 이력, 사진, 도면을 한 JSON 파일로 내려받고 다시 불러옵니다.</li>
            <li>네트워크가 끊겨도 이미 연 화면과 이 기기의 기록으로 계속 적을 수 있습니다. 다른 기기와는 동기화되지 않습니다.</li>
          </ul>
        </section>

        <section className="section-block" id="compare">
          <div className="section-heading">
            <p className="kicker">참고한 운영 흐름</p>
            <h2>기존 관제 도구와 겹치지 않는 기록에 집중합니다.</h2>
            <p>아래 제품의 화면 구조와 운영 흐름을 참고했습니다. 팀 S?가 그 제품을 대체하거나, 같은 기체 제어를 제공하지는 않습니다.</p>
          </div>
          <div className="compare-wrap">
            <table className="compare-table">
              <caption>QGroundControl, DJI FlightHub 2, DroneSense와 수색 연결의 초점 비교</caption>
              <thead>
                <tr>
                  <th scope="col">비교 대상</th>
                  <th scope="col">핵심 운영 기능</th>
                  <th scope="col">연속성과 협업의 초점</th>
                </tr>
              </thead>
              <tbody>
                <tr>
                  <th scope="row">QGroundControl</th>
                  <td>기체 제어와 비행 상태 확인</td>
                  <td>중단한 비행 임무의 재개</td>
                </tr>
                <tr>
                  <th scope="row">DJI FlightHub 2</th>
                  <td>클라우드 원격 운영과 임무 계획</td>
                  <td>비행 기록과 운영 정보 관리</td>
                </tr>
                <tr>
                  <th scope="row">DroneSense</th>
                  <td>실시간 영상과 기체 위치 통합</td>
                  <td>기관 간 임무 공유와 상황 파악</td>
                </tr>
                <tr>
                  <th scope="row">팀 S? 수색 연결</th>
                  <td>구역별 수색 기록과 자료 검토</td>
                  <td>원본 자료를 잇는 승인 인계</td>
                </tr>
              </tbody>
            </table>
          </div>
          <p className="section-note">차별점은 구역을 기준으로 원본 자료와 새 담당 작업을 연결하고, 작업 완료와 자료 확인을 분리하며, 인계 사유와 승인 이력을 남기는 데 있습니다.</p>
        </section>

        <section className="section-block scope-section">
          <div>
            <p className="kicker">지금 범위</p>
            <h2>제공하는 것과 아직 아닌 것을 구분합니다.</h2>
          </div>
          <div className="scope-columns">
            <article>
              <h3><Check size={18} /> 이 시제품에 있음</h3>
              <ul>
                <li>구역별 작업 상태와 관측 확인</li>
                <li>중단 후 선택 구역의 승인 인계</li>
                <li>사진, 메모, 현장 도면, 관심 지점</li>
                <li>미해결 항목 보고와 JSON 백업·복원</li>
                <li>연습 모드와 현장 모드, 이 기기 자동 저장</li>
                <li>한 번 연 뒤 네트워크가 끊겨도 이어서 기록</li>
              </ul>
            </article>
            <article>
              <h3><X size={18} /> 아직 없음</h3>
              <ul>
                <li>실제 드론 제어와 자동 비행</li>
                <li>실시간 위치, 통신, 배터리, 영상</li>
                <li>실제 GIS·GPS 좌표와 지도 보정</li>
                <li>자동 인명 판별과 수색 성과 보장</li>
                <li>서버 공유, 계정, 여러 운영자 동시 작업</li>
                <li>고객 계약, 매출, 실기체 연동</li>
              </ul>
            </article>
          </div>
          <div className="quiet-links">
            <button className="button subtle" onClick={onOpenDemo}>승인 인계 시연 보기</button>
            <button className="button subtle" onClick={onOpenGcs}>가상 GCS 화면 보기</button>
            <p>가상 GCS는 화면 구성 연습입니다. 숫자와 경로는 샘플이며 실제 기체로 명령이 나가지 않습니다.</p>
          </div>
        </section>

        <section className="section-block" id="business">
          <div className="section-heading">
            <p className="kicker">제안 사업 모델</p>
            <h2>조직 사용권과 도입 지원으로 수익을 가정합니다.</h2>
            <p>구매자로 가정한 대상은 수색 드론 운영 업체의 현장 운영팀입니다. 아래 금액은 검증 전 제안이며 실제 계약·매출이 아닙니다.</p>
          </div>
          <div className="price-grid">
            <article>
              <h3>조직 사용권</h3>
              <p className="price">연 36만 원</p>
              <p>PC 1대 사용권, 업데이트와 기본 지원.</p>
            </article>
            <article>
              <h3>초기 도입 지원</h3>
              <p className="price">처음 20만 원</p>
              <p>업무 양식 설정과 사용 교육 2시간.</p>
            </article>
            <article>
              <h3>맞춤 개발</h3>
              <p className="price">범위별 견적</p>
              <p>추가 기능과 향후 기체 연동. 현재 제공 범위가 아닙니다.</p>
            </article>
          </div>
          <div className="scenario-note">
            <p><b>1곳의 첫해 제안:</b> 도입 20만 원 + 연 사용료 36만 원 = 56만 원.</p>
            <p><b>10곳 목표 시나리오:</b> 첫해 매출 560만 원. 비용 가정 260만 원(개발 인건비 180, 도입 교육 30, 기본 지원 30, 배포·운영 20). 차액 예시 300만 원.</p>
            <p>인건비는 시간당 1만 5천 원 가정입니다. 세금, 영업비, 실기체 연동, 추가 개발비는 빠져 있습니다. 실제 이익은 계약과 발생한 비용에 따라 달라집니다. 실제 기체 제어와 서버 공동 작업은 현재 제공하지 않습니다.</p>
          </div>
        </section>

        <section className="section-block" id="limits">
          <div className="section-heading compact">
            <p className="kicker">한계와 다음</p>
            <h2>먼저 기록의 안정성을 확인하는 단계입니다.</h2>
          </div>
          <div className="limit-grid">
            <article><h3>지금 한계</h3><p>실기체 미연결, 한 기기에서만 사용, 고객과 지불 의사 미검증.</p></article>
            <article><h3>이후 계획</h3><p>시뮬레이터 검증 뒤 실물 시험, 서버 공유와 운영자 권한, 현장 시험. 아직 구현·검증을 마친 기능이 아닙니다.</p></article>
          </div>
        </section>

        <section className="section-block team-section" id="team">
          <div className="section-heading compact">
            <p className="kicker">팀 S?</p>
            <h2>김정우 · 김상현</h2>
            <p>마송고등학교 메이커데이. 1학기 드론 수업에서 함께 비행을 배웠고, 중단된 작업의 자료를 보존해 다음 담당자에게 넘기는 기록 도구를 만들었습니다.</p>
          </div>
          <div className="team-grid">
            <article>
              <h3>김정우</h3>
              <p>드론과 로켓 등 공학에 관심이 있어 드론 1인 1기 수업에 참여했습니다.</p>
            </article>
            <article>
              <h3>김상현</h3>
              <p>초등 교사를 꿈꾸며 같은 수업에서 드론의 원리와 비행을 함께 배웠습니다.</p>
            </article>
          </div>
          <button className="button primary large" onClick={onOpenPractice}>연습 모드로 대시보드 열기 <ArrowRight size={17} /></button>
        </section>
      </main>

      <footer className="intro-footer">
        <SMark />
        <p>팀 S? · 수색 연결 · 마송고등학교 메이커데이 · 김정우 · 김상현</p>
        <button onClick={onOpenPractice}>연습 모드 열기 <ArrowRight size={14} /></button>
      </footer>
    </div>
  );
}
