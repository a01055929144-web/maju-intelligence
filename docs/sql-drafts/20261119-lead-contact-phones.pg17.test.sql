-- Disposable PostgreSQL 17 fixture only. Never run against production.
\set ON_ERROR_STOP on

do $$ begin
  if current_setting('server_version_num')::int not between 170000 and 179999 then
    raise exception 'PostgreSQL 17 required';
  end if;
end $$;

create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin bypassrls; exception when duplicate_object then null; end $$;

create table public.companies(id uuid primary key);
create table public.company_members(
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  status text not null,
  membership_expires_at timestamptz,
  unique(company_id, id)
);
create table public.business_permit_leads(
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  phone text,
  merged_into_lead_id uuid,
  updated_at timestamptz not null default now(),
  unique(company_id, id)
);
alter table public.business_permit_leads enable row level security;
revoke all on table public.business_permit_leads from public, anon, authenticated, service_role;
grant select, update on table public.business_permit_leads to service_role;

insert into public.companies values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.company_members values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', 'active', null),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', 'active', null),
  ('20000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000001', 'inactive', null),
  ('20000000-0000-4000-8000-000000000004', '10000000-0000-4000-8000-000000000001', 'active', clock_timestamp() - interval '1 minute');
insert into public.business_permit_leads values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '010-1111-2222', null, now()),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000001', '070-3333-4444', null, now()),
  ('30000000-0000-4000-8000-000000000003', '10000000-0000-4000-8000-000000000002', '02-555-6666', null, now());

\ir 20261119-lead-contact-phones.sql

do $$ begin
  if exists (
    select 1 from public.business_permit_leads
    where owner_mobile_phone is not null or store_phone is not null
  ) or (select phone from public.business_permit_leads where id = '30000000-0000-4000-8000-000000000001') <> '010-1111-2222'
    or has_function_privilege('anon', 'public.update_lead_contact_phones_v1(uuid,uuid,uuid,jsonb)', 'execute')
    or has_function_privilege('authenticated', 'public.update_lead_contact_phones_v1(uuid,uuid,uuid,jsonb)', 'execute')
    or not has_function_privilege('service_role', 'public.update_lead_contact_phones_v1(uuid,uuid,uuid,jsonb)', 'execute') then
    raise exception 'lead_contact_phone_initial_contract_failed';
  end if;
end $$;

set role service_role;
select * from public.update_lead_contact_phones_v1(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '{"ownerMobilePhone":"010-9876-5432","storePhone":"02-1234-5678"}'::jsonb
);
select * from public.update_lead_contact_phones_v1(
  '10000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '{"storePhone":"070-1111-2222"}'::jsonb
);
reset role;

do $$ begin
  if (select row(owner_mobile_phone, store_phone, phone)
      from public.business_permit_leads where id = '30000000-0000-4000-8000-000000000001')
     is distinct from row('01098765432'::text, '07011112222'::text, '010-1111-2222'::text) then
    raise exception 'lead_contact_phone_patch_or_legacy_preservation_failed';
  end if;
end $$;

do $$ begin
  begin
    perform * from public.update_lead_contact_phones_v1(
      '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002', '{"storePhone":"031-222-3333"}'::jsonb
    );
    raise exception 'cross_company_actor_accepted';
  exception when others then
    if sqlerrm <> 'lead_contact_phone_forbidden' then raise; end if;
  end;
  begin
    perform * from public.update_lead_contact_phones_v1(
      '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000003', '{"storePhone":"031-222-3333"}'::jsonb
    );
    raise exception 'inactive_actor_accepted';
  exception when others then
    if sqlerrm <> 'lead_contact_phone_forbidden' then raise; end if;
  end;
  begin
    perform * from public.update_lead_contact_phones_v1(
      '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000004', '{"storePhone":"031-222-3333"}'::jsonb
    );
    raise exception 'expired_actor_accepted';
  exception when others then
    if sqlerrm <> 'lead_contact_phone_forbidden' then raise; end if;
  end;
  begin
    perform * from public.update_lead_contact_phones_v1(
      '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '{"ownerMobilePhone":"070-1111-2222"}'::jsonb
    );
    raise exception 'non_010_owner_mobile_accepted';
  exception when others then
    if sqlerrm <> 'lead_owner_mobile_phone_invalid' then raise; end if;
  end;
  begin
    perform * from public.update_lead_contact_phones_v1(
      '10000000-0000-4000-8000-000000000001', '30000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001', '{"storePhone":"010-1111-2222"}'::jsonb
    );
    raise exception 'mobile_as_store_phone_accepted';
  exception when others then
    if sqlerrm <> 'lead_store_phone_invalid' then raise; end if;
  end;
end $$;

\ir 20261119-lead-contact-phones.down.sql

do $$ begin
  if to_regprocedure('public.update_lead_contact_phones_v1(uuid,uuid,uuid,jsonb)') is not null
    or exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'business_permit_leads'
        and column_name in ('owner_mobile_phone', 'store_phone')
    )
    or (select phone from public.business_permit_leads where id = '30000000-0000-4000-8000-000000000001') <> '010-1111-2222' then
    raise exception 'lead_contact_phone_down_failed';
  end if;
end $$;

\ir 20261119-lead-contact-phones.sql
select 'lead contact phones PG17 checks passed' as result;
