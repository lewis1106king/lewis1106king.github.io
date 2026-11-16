# 연결 3단계

사이트는 https://lewis1106king.github.io 입니다. 키가 없으면 가짜 수색을 만들지 않고, 이 세 단계만 안내합니다.

## 1. 프로젝트

https://supabase.com 에서 프로젝트를 만듭니다. 서울 리전이 있으면 그곳을 고릅니다.

## 2. SQL과 익명 로그인

1. **SQL Editor**에 `supabase/schema.sql` 전체를 붙여 넣고 Run 합니다.
2. **Authentication → Sign In / Providers**에서 **Anonymous sign-ins**를 켭니다.
3. Email 가입은 쓰지 않습니다. 끌 필요 없습니다.
4. **Authentication → URL Configuration**의 Site URL을 `https://lewis1106king.github.io` 로 둡니다.

## 3. 키 두 개

**Project Settings → API**

- Project URL → GitHub Actions secret `VITE_SUPABASE_URL`
- anon public 키 → GitHub Actions secret `VITE_SUPABASE_ANON_KEY`

`service_role` 키는 넣지 않습니다.

GitHub 저장소 **Settings → Secrets and variables → Actions**에 위 두 개를 저장한 뒤, **Actions**에서 Pages 배포 워크플로를 **Run workflow**로 다시 실행합니다.

끝나면 사이트의 **새 수색 시작**이 코드와 링크를 바로 보여 줍니다.
