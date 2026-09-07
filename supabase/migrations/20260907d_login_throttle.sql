-- 2026-09-07: 로그인/가입/비번찾기 실패 횟수 제한(lib/rate-limit.ts)을 서버 인스턴스 메모리가
-- 아니라 이 테이블에 저장하도록 바꿉니다. Vercel은 서버리스라 인스턴스가 여러 개 동시에 뜨고
-- 쉽게 콜드스타트되므로, 메모리 기반 Map은 실제로는 무차별 대입 공격을 거의 못 막고 있었습니다.
create table if not exists public.login_throttle_attempts (
  identifier text primary key,
  failures int not null default 0,
  first_failure_at timestamptz not null default now(),
  locked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists idx_login_throttle_attempts_updated_at
  on public.login_throttle_attempts(updated_at);
