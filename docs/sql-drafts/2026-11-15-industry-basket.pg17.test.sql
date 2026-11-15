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
  unique(company_id, id)
);
create table public.product_catalog(
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  is_active boolean not null default true,
  unique(company_id, id)
);
create table public.pricing_document_share_links(
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  unique(company_id, id)
);
create table public.admin_audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  company_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

alter table public.pricing_document_share_links enable row level security;
revoke all on table public.pricing_document_share_links from public, anon, authenticated, service_role;
grant select, insert, update on table public.pricing_document_share_links to service_role;

insert into public.companies values
  ('10000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000002');
insert into public.company_members values
  ('20000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002');
insert into public.product_catalog values
  ('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', true),
  ('30000000-0000-4000-8000-000000000002', '10000000-0000-4000-8000-000000000002', false);
insert into public.pricing_document_share_links values
  ('40000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001');

create temporary table share_acl_before as
select relrowsecurity, relforcerowsecurity, relacl::text
from pg_class where oid = 'public.pricing_document_share_links'::regclass;

\ir 2026-11-15-industry-basket.sql

do $$ begin
  if not (select relrowsecurity from pg_class where oid = 'public.company_industry_baskets'::regclass)
    or has_table_privilege('anon', 'public.company_industry_baskets', 'select')
    or has_table_privilege('authenticated', 'public.company_industry_baskets', 'select')
    or not has_table_privilege('service_role', 'public.company_industry_baskets', 'select,insert,update,delete')
    or exists (
      select 1 from public.pricing_document_share_links
      where num_nonnulls(preview_id, preview_title, preview_description) <> 0
    )
    or (select row(relrowsecurity, relforcerowsecurity, relacl::text)
        from pg_class where oid = 'public.pricing_document_share_links'::regclass)
       is distinct from
       (select row(relrowsecurity, relforcerowsecurity, relacl) from share_acl_before)
    or not exists (
      select 1 from public.admin_audit_logs
      where action = 'industry_basket_schema_added'
        and metadata @> '{"backfilled_rows": 0}'::jsonb
    ) then
    raise exception 'industry_basket_schema_contract_failed';
  end if;
end $$;

set role service_role;
insert into public.company_industry_baskets(
  company_id, industry_key, product_catalog_id, default_qty, is_core, sort_order, updated_by
) values (
  '10000000-0000-4000-8000-000000000001', '중식',
  '30000000-0000-4000-8000-000000000001', 2.5, true, 10,
  '20000000-0000-4000-8000-000000000001'
);

do $$ begin
  begin
    insert into public.company_industry_baskets values (
      '10000000-0000-4000-8000-000000000001', '한식',
      '30000000-0000-4000-8000-000000000002', 1, false, 0,
      '20000000-0000-4000-8000-000000000001', clock_timestamp()
    );
    raise exception 'cross_company_product_accepted';
  exception when foreign_key_violation then null; end;
  begin
    insert into public.company_industry_baskets values (
      '10000000-0000-4000-8000-000000000001', '한식',
      '30000000-0000-4000-8000-000000000001', 1, false, 0,
      '20000000-0000-4000-8000-000000000002', clock_timestamp()
    );
    raise exception 'cross_company_actor_accepted';
  exception when foreign_key_violation then null; end;
  begin
    update public.company_industry_baskets set default_qty = 0;
    raise exception 'invalid_quantity_accepted';
  exception when check_violation then null; end;
end $$;

update public.pricing_document_share_links
set preview_id = '50000000-0000-4000-8000-000000000001',
    preview_title = '가짜 매장 맞춤 견적',
    preview_description = '가짜 품목 20개 · 2099-12-31까지';
do $$ begin
  begin
    update public.pricing_document_share_links set preview_title = null;
    raise exception 'partial_preview_accepted';
  exception when check_violation then null; end;
end $$;
reset role;

delete from public.company_industry_baskets;
update public.pricing_document_share_links
set preview_id = null, preview_title = null, preview_description = null;

\ir 2026-11-15-industry-basket.down.sql

do $$ begin
  if to_regclass('public.company_industry_baskets') is not null
    or exists (
      select 1 from information_schema.columns
      where table_schema = 'public' and table_name = 'pricing_document_share_links'
        and column_name in ('preview_id', 'preview_title', 'preview_description')
    )
    or (select count(*) from public.pricing_document_share_links) <> 1
    or not exists (
      select 1 from public.admin_audit_logs where action = 'industry_basket_schema_removed'
    ) then
    raise exception 'industry_basket_down_contract_failed';
  end if;
end $$;

select 'industry basket PG17 checks passed' as result;
