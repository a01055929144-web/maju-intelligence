-- REVIEW ONLY. 운영 적용 금지. WO-10 네이티브 앱 위치 기기 토큰.
begin;
create table if not exists public.staff_location_device_tokens (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  user_id uuid not null references public.app_users(id) on delete cascade,
  token_hash text not null,
  token_prefix text not null,
  device_label text not null default 'Android',
  actor_name text,
  consent_version text not null,
  consented_at timestamptz not null default now(),
  last_used_at timestamptz,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  constraint staff_location_device_tokens_hash_uq unique(token_hash),
  constraint staff_location_device_tokens_prefix_length check(char_length(token_prefix) between 6 and 16),
  constraint staff_location_device_tokens_consent_length check(char_length(consent_version) between 1 and 80)
);
create index if not exists staff_location_device_tokens_company_user_idx
  on public.staff_location_device_tokens(company_id,user_id,created_at desc);
create index if not exists staff_location_device_tokens_active_hash_idx
  on public.staff_location_device_tokens(token_hash)
  where revoked_at is null;
alter table public.staff_location_device_tokens enable row level security;
revoke all on table public.staff_location_device_tokens from public,anon,authenticated;
grant all on table public.staff_location_device_tokens to service_role;
commit;
-- 롤백(별도 승인 후): drop table if exists public.staff_location_device_tokens;
