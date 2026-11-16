export default function SetupPage({ onBack }: { onBack: () => void }) {
  return (
    <main className="setup-wrap">
      <button className="btn ghost small" type="button" onClick={onBack}>소개로</button>
      <h1 style={{ margin: '18px 0' }}>백엔드 연결이 필요합니다</h1>
      <p className="quiet">이 화면은 가짜 임무로 채워 두지 않았습니다. 여러 기기가 같은 기록을 보려면 Supabase 프로젝트의 주소와 anon 키가 있어야 합니다.</p>
      <ol className="steps">
        <li>supabase.com에서 프로젝트를 만듭니다.</li>
        <li>SQL Editor에 저장소의 <b>supabase/schema.sql</b> 전체를 실행합니다.</li>
        <li>Authentication에서 Email 로그인을 켜고, 현장용으로는 Confirm email을 끌 수 있습니다.</li>
        <li>Site URL을 <b>https://lewis1106king.github.io</b> 로 둡니다.</li>
        <li>Project Settings → API의 Project URL과 anon public 키를 GitHub Actions secret <b>VITE_SUPABASE_URL</b>, <b>VITE_SUPABASE_ANON_KEY</b>에 넣습니다.</li>
        <li>GitHub Actions에서 Pages 배포 워크플로를 다시 실행합니다. service_role 키는 넣지 않습니다.</li>
      </ol>
      <p className="quiet">자세한 순서는 저장소 <b>supabase/SETUP.md</b>에 있습니다.</p>
    </main>
  );
}
