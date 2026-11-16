import Press from '../components/Press';

export default function SetupPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="flow">
      <button className="text-link back" type="button" onClick={onBack}>돌아가기</button>
      <p className="eyebrow">3단계</p>
      <h1>연결만 하면<br />바로 쓸 수 있어요.</h1>
      <ol className="steps">
        <li><b>프로젝트</b><span>supabase.com에서 하나를 만듭니다.</span></li>
        <li><b>SQL</b><span>supabase/schema.sql 전체를 SQL Editor에 넣고 실행합니다. Anonymous sign-ins를 켭니다.</span></li>
        <li><b>키 두 개</b><span>GitHub Actions secret에 VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY 를 넣고 배포를 다시 실행합니다.</span></li>
      </ol>
      <p className="sub">service_role 키는 넣지 않습니다. 가짜 수색 데이터는 보여 주지 않습니다.</p>
      <Press onClick={onBack}>알겠어요</Press>
    </main>
  );
}
