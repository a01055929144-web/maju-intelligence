-- 2026-08-26: 비밀번호 찾기(P1) 지원.
-- 재설정 토큰은 원문이 아니라 해시로만 저장합니다(비밀번호 해시와 같은 이유).
alter table public.auth_credentials
  add column if not exists reset_token_hash text,
  add column if not exists reset_token_expires_at timestamptz;

create index if not exists auth_credentials_reset_token_hash_idx
  on public.auth_credentials (reset_token_hash)
  where reset_token_hash is not null;
