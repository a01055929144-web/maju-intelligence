-- BIV platform admin phase 2: company consent and sensitive-data access audit.
-- REVIEW ONLY. DO NOT EXECUTE. Depends on phase 1 platform_admin_roles/platform_products.

begin;

create table if not exists public.company_platform_data_consents (
  company_id uuid not null constraint company_platform_data_consents_company_fk references public.companies(id) on delete cascade,
  purpose text not null,
  policy_version text not null,
  consent_status text not null,
  consented_by_member_id uuid,
  consented_by_name text not null,
  consented_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint company_platform_data_consents_pkey primary key (company_id,purpose),
  constraint company_platform_data_consents_member_fk foreign key (company_id,consented_by_member_id)
    references public.company_members(company_id,id) on delete set null (consented_by_member_id),
  constraint company_platform_data_consents_purpose_check check (purpose in ('cost_benchmarking')),
  constraint company_platform_data_consents_status_check check (consent_status in ('granted','revoked')),
  constraint company_platform_data_consents_time_check check (
    (consent_status='granted' and consented_at is not null and revoked_at is null)
    or (consent_status='revoked' and revoked_at is not null)
  )
);

create table if not exists public.company_platform_data_consent_events (
  id uuid default gen_random_uuid() constraint company_platform_data_consent_events_pkey primary key,
  company_id uuid not null constraint company_platform_data_consent_events_company_fk references public.companies(id) on delete cascade,
  purpose text not null,
  policy_version text not null,
  event_type text not null,
  actor_member_id uuid,
  actor_name text not null,
  policy_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint company_platform_data_consent_events_member_fk foreign key (company_id,actor_member_id)
    references public.company_members(company_id,id) on delete set null (actor_member_id),
  constraint company_platform_data_consent_events_purpose_check check (purpose in ('cost_benchmarking')),
  constraint company_platform_data_consent_events_type_check check (event_type in ('granted','revoked'))
);
create index if not exists company_platform_data_consent_events_company_idx
  on public.company_platform_data_consent_events(company_id,purpose,created_at desc);

create table if not exists public.platform_data_access_audit_logs (
  id uuid default gen_random_uuid() constraint platform_data_access_audit_logs_pkey primary key,
  admin_email text not null,
  admin_name text not null,
  admin_role text not null,
  action text not null,
  purpose text not null,
  screen_path text not null,
  target_company_id uuid,
  platform_product_id uuid,
  sensitive_data_types text[] not null default '{}',
  request_id text not null,
  ip_hash text,
  filters jsonb not null default '{}'::jsonb,
  result_row_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint platform_data_access_audit_logs_admin_fk foreign key (admin_email)
    references public.platform_admin_roles(admin_email) on delete restrict,
  constraint platform_data_access_audit_logs_company_fk foreign key (target_company_id)
    references public.companies(id) on delete set null,
  constraint platform_data_access_audit_logs_product_fk foreign key (platform_product_id)
    references public.platform_products(id) on delete set null,
  constraint platform_data_access_audit_logs_role_check check (admin_role='super_admin'),
  constraint platform_data_access_audit_logs_count_check check (result_row_count >= 0),
  constraint platform_data_access_audit_logs_types_check check (
    sensitive_data_types <@ array['supplier_cost','customer_contract_price','supplier_identity']::text[]
  )
);
create index if not exists platform_data_access_audit_logs_admin_idx
  on public.platform_data_access_audit_logs(admin_email,created_at desc);
create index if not exists platform_data_access_audit_logs_company_idx
  on public.platform_data_access_audit_logs(target_company_id,created_at desc)
  where target_company_id is not null;
create index if not exists platform_data_access_audit_logs_product_idx
  on public.platform_data_access_audit_logs(platform_product_id,created_at desc)
  where platform_product_id is not null;

create or replace function public.platform_audit_require_super_admin()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if not exists (
    select 1 from public.platform_admin_roles r
    where r.admin_email=new.admin_email and r.role='super_admin' and r.is_active=true
  ) then
    raise exception '민감 데이터 접근 감사는 활성 super_admin만 기록할 수 있습니다.' using errcode='42501';
  end if;
  new.admin_role := 'super_admin';
  return new;
end;
$$;
drop trigger if exists platform_data_access_audit_require_super_admin on public.platform_data_access_audit_logs;
create trigger platform_data_access_audit_require_super_admin before insert
  on public.platform_data_access_audit_logs for each row execute function public.platform_audit_require_super_admin();

create or replace function public.reject_platform_append_only_mutation()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  raise exception '플랫폼 동의·감사 원장은 수정하거나 삭제할 수 없습니다.' using errcode='55000';
end;
$$;
drop trigger if exists company_platform_data_consent_events_append_only on public.company_platform_data_consent_events;
create trigger company_platform_data_consent_events_append_only before update or delete
  on public.company_platform_data_consent_events for each row execute function public.reject_platform_append_only_mutation();
drop trigger if exists platform_data_access_audit_logs_append_only on public.platform_data_access_audit_logs;
create trigger platform_data_access_audit_logs_append_only before update or delete
  on public.platform_data_access_audit_logs for each row execute function public.reject_platform_append_only_mutation();

alter table public.company_platform_data_consents enable row level security;
alter table public.company_platform_data_consent_events enable row level security;
alter table public.platform_data_access_audit_logs enable row level security;
revoke all on public.company_platform_data_consents, public.company_platform_data_consent_events,
  public.platform_data_access_audit_logs from public,anon,authenticated;
grant all on public.company_platform_data_consents, public.company_platform_data_consent_events,
  public.platform_data_access_audit_logs to service_role;
revoke execute on function public.reject_platform_append_only_mutation() from public,anon,authenticated;
revoke execute on function public.platform_audit_require_super_admin() from public,anon,authenticated;

commit;

-- Rollback draft: retain/export immutable audit and consent events before dropping any table.
