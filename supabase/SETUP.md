# 수색 연결 백엔드 연결

프론트엔드는 https://lewis1106king.github.io 에 올라갑니다. 계정, 실시간 동기화, 사진 보관은 Supabase 프로젝트가 있어야 동작합니다. 키가 없으면 사이트는 설정 안내만 보여주고, 가짜 임무 데이터는 만들지 않습니다.

## 1. Supabase 프로젝트

1. https://supabase.com 에서 로그인하고 **New project**를 만듭니다.
2. 지역은 서울에 가까운 **Northeast Asia (Seoul)** 이 있으면 그곳을 고릅니다.
3. 데이터베이스 비밀번호를 저장해 둡니다. 앱 코드에는 넣지 않습니다.

## 2. 데이터베이스

1. Supabase 대시보드에서 **SQL Editor** → **New query**를 엽니다.
2. 이 저장소의 `supabase/schema.sql` 내용 전체를 붙여 넣고 **Run** 합니다.
3. 성공하면 테이블 `profiles`, `missions`, `members`, `zones`, `points`, `handovers`, `photos`, `events`, `notifications`가 생깁니다.
4. **Storage**에 `mission-photos` 비공개 버킷이 보여야 합니다. 없으면 Storage → New bucket → 이름 `mission-photos`, Public 끄기 후 SQL의 storage 정책 부분만 다시 실행합니다.

## 3. 로그인 설정

1. **Authentication → Sign In / Providers**에서 Email이 켜져 있는지 확인합니다.
2. 현장에서는 메일 확인을 기다리기 어려우면 **Authentication → Sign In / Providers → Email**에서 **Confirm email**을 끕니다. 켜 두면 가입자는 메일의 확인 링크를 눌러야 로그인됩니다.
3. **Authentication → URL Configuration**
   - Site URL: `https://lewis1106king.github.io`
   - Redirect URLs에 `https://lewis1106king.github.io` 를 추가합니다.

## 4. 키

**Project Settings → API**에서 다음 두 값만 복사합니다.

- Project URL → `VITE_SUPABASE_URL`
- `anon` `public` 키 → `VITE_SUPABASE_ANON_KEY`

`service_role` 키는 브라우저에 넣지 않습니다. 이 앱은 anon 키와 RLS만 사용합니다.

## 5. GitHub Pages에 키 넣기

1. GitHub 저장소 **Settings → Secrets and variables → Actions**
2. **New repository secret**
   - 이름 `VITE_SUPABASE_URL`, 값에 Project URL
   - 이름 `VITE_SUPABASE_ANON_KEY`, 값에 anon public 키
3. **Actions** 탭에서 **Deploy Team S? SAR Drone Dashboard to GitHub Pages** → **Run workflow**를 실행합니다.
4. 배포가 끝나면 https://lewis1106king.github.io 를 새로고침합니다. 시작하기가 가입 화면으로 열리면 연결된 것입니다.

로컬에서 보려면 저장소 루트에 `.env.local`을 만들고 같은 두 줄을 넣은 뒤 `pnpm dev`를 실행합니다. `.env.local`은 커밋하지 않습니다.

## 6. 두 기기로 확인

1. 휴대폰과 컴퓨터에서 각각 다른 이메일로 가입합니다.
2. 한쪽에서 임무를 만들고 참여 코드를 알려 줍니다.
3. 다른 쪽에서 코드를 입력해 조종 또는 운영자로 들어갑니다.
4. 구역을 그리거나 위치를 공유하면 다른 화면에 실시간으로 나타나야 합니다.
5. 네트워크를 끊고 구역 메모를 고친 뒤 다시 연결하면 대기 중이던 변경이 올라갑니다. 지도 타일은 오프라인에서 새로 받아지지 않습니다.
