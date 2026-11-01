\set ON_ERROR_STOP 1

-- Isolated PostgreSQL 16 fixture only. Never run against an operational database.
create role anon nologin;
create role authenticated nologin;
-- Supabase의 service_role은 BYPASSRLS 속성을 가지므로 로컬 역할도 같은 경계를 재현한다.
create role service_role nologin bypassrls;
create extension if not exists pgcrypto;

create table public.companies (
  id uuid primary key,
  status text not null
);
create table public.app_users (
  id uuid primary key,
  status text not null
);
create table public.company_members (
  company_id uuid not null,
  user_id uuid not null,
  status text not null,
  role text,
  permission_role text
);
create table public.business_permit_leads (
  id uuid not null,
  company_id uuid not null,
  status text,
  exclude_reason text,
  next_action text,
  updated_at timestamptz,
  merged_into_lead_id uuid,
  phone text,
  fax text,
  email text,
  instagram_url text,
  naver_talktalk_url text,
  primary key (id),
  unique (company_id, id)
);
create table public.lead_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  action_type text,
  result text,
  memo text,
  actor_name text,
  metadata jsonb,
  created_at timestamptz default clock_timestamp()
);
create table public.company_do_not_contact (
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  channel text not null,
  normalized_value text not null,
  reason text not null default '연락 거부',
  source_lead_id uuid,
  blocked_at timestamptz not null default now(),
  blocked_by uuid,
  released_at timestamptz,
  released_by uuid,
  release_reason text,
  created_at timestamptz not null default now(),
  foreign key (company_id, source_lead_id)
    references public.business_permit_leads(company_id, id)
);
create unique index company_do_not_contact_active_key
  on public.company_do_not_contact(company_id, channel, normalized_value)
  where released_at is null;

alter table public.company_do_not_contact enable row level security;
revoke all on public.business_permit_leads, public.company_do_not_contact from public, anon, authenticated;
grant select, insert, update, delete on public.business_permit_leads, public.company_do_not_contact to service_role;
grant select, insert, update, delete on public.companies, public.app_users, public.company_members, public.lead_actions to service_role;

insert into public.companies(id, status) values
  ('00000000-0000-0000-0000-0000000000c1', 'active'),
  ('00000000-0000-0000-0000-0000000000c2', 'active');

insert into public.business_permit_leads(
  id, company_id, status, phone, email, instagram_url, naver_talktalk_url, merged_into_lead_id
) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', '신규',
   '010-1234-5678', 'Alice@Example.com', '@cafe.one', 'https://talk.naver.com/abc', null),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', '신규',
   '010-9999-0000', 'other@example.com', '@cafe.two', null, null),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', '신규',
   '010-1234-5678', 'merged@example.com', null, null, '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000101', '00000000-0000-0000-0000-0000000000c2', '신규',
   '010-1234-5678', 'Alice@Example.com', '@cafe.one', 'https://talk.naver.com/abc', null);

insert into public.company_do_not_contact(id, company_id, channel, normalized_value, source_lead_id, blocked_at) values
  ('10000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'sms', '01012345678', '00000000-0000-0000-0000-000000000001', '2026-10-30T00:00:01Z'),
  ('10000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'email', 'alice@example.com', '00000000-0000-0000-0000-000000000001', '2026-10-30T00:00:02Z'),
  ('10000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'visit', 'visit:lead-1', '00000000-0000-0000-0000-000000000001', '2026-10-30T00:00:03Z'),
  ('10000000-0000-0000-0000-000000000004', '00000000-0000-0000-0000-0000000000c1', 'sms', '01099990000', '00000000-0000-0000-0000-000000000002', '2026-10-30T00:00:04Z'),
  ('20000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c2', 'sms', '01012345678', '00000000-0000-0000-0000-000000000101', '2026-10-30T00:00:05Z'),
  ('20000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c2', 'email', 'alice@example.com', '00000000-0000-0000-0000-000000000101', '2026-10-30T00:00:06Z');

\ir ../../docs/sql-drafts/lead-do-not-contact-rpc.sql

do $$
declare
  result_count integer;
  raw_leak_count integer;
  wrong_company_count integer;
  wrong_lead_count integer;
begin
  select count(*) into result_count
  from public.list_active_lead_do_not_contacts(
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-000000000001'
  );
  if result_count <> 3 then
    raise exception 'expected 3 active DNC rows, got %', result_count;
  end if;

  select count(*) into raw_leak_count
  from public.list_active_lead_do_not_contacts(
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-000000000001'
  ) result
  where result.masked_value in ('01012345678', 'alice@example.com', 'visit:lead-1')
     or result.masked_value like '%12345678%';
  if raw_leak_count <> 0 then
    raise exception 'raw contact value leaked from lookup';
  end if;

  if not exists (
    select 1 from public.list_active_lead_do_not_contacts(
      '00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-000000000001'
    ) where channel = 'sms' and masked_value = '010-****-5678'
  ) or not exists (
    select 1 from public.list_active_lead_do_not_contacts(
      '00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-000000000001'
    ) where channel = 'email' and masked_value = 'a***@example.com'
  ) then
    raise exception 'expected masked phone and email values';
  end if;

  select count(*) into wrong_company_count
  from public.list_active_lead_do_not_contacts(
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-000000000101'
  );
  if wrong_company_count <> 0 then
    raise exception 'cross-company lead lookup returned rows';
  end if;

  select count(*) into wrong_lead_count
  from public.list_active_lead_do_not_contacts(
    '00000000-0000-0000-0000-0000000000c1',
    '00000000-0000-0000-0000-000000000002'
  );
  if wrong_lead_count <> 1 then
    raise exception 'same-company lookup crossed lead contact values';
  end if;

  if exists (
    select 1 from public.list_active_lead_do_not_contacts(
      '00000000-0000-0000-0000-0000000000c1',
      '00000000-0000-0000-0000-000000000003'
    )
  ) then
    raise exception 'merged lead returned DNC rows';
  end if;

  if has_function_privilege('anon', 'public.list_active_lead_do_not_contacts(uuid,uuid)', 'execute')
     or has_function_privilege('authenticated', 'public.list_active_lead_do_not_contacts(uuid,uuid)', 'execute')
     or has_function_privilege('public', 'public.list_active_lead_do_not_contacts(uuid,uuid)', 'execute') then
    raise exception 'untrusted role retains DNC lookup execute privilege';
  end if;
  if not has_function_privilege('service_role', 'public.list_active_lead_do_not_contacts(uuid,uuid)', 'execute') then
    raise exception 'service_role lacks DNC lookup execute privilege';
  end if;
end $$;

\set ON_ERROR_STOP 0
set role anon;
select * from public.list_active_lead_do_not_contacts(
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-000000000001'
);
\if :ERROR
\else
  \echo 'anon unexpectedly executed DNC lookup'
  \quit 1
\endif
reset role;

set role authenticated;
select * from public.list_active_lead_do_not_contacts(
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-000000000001'
);
\if :ERROR
\else
  \echo 'authenticated unexpectedly executed DNC lookup'
  \quit 1
\endif
reset role;
\set ON_ERROR_STOP 1

set role service_role;
select count(*) = 3 as service_role_lookup_ok
from public.list_active_lead_do_not_contacts(
  '00000000-0000-0000-0000-0000000000c1',
  '00000000-0000-0000-0000-000000000001'
);
reset role;

select 'lead DNC private lookup PG16 assertions passed' as result;
