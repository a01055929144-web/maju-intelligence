do $$ begin
  if current_setting('server_version_num')::integer / 10000 <> 17 then raise exception 'PostgreSQL 17 required'; end if;
end $$;
create extension if not exists pgcrypto;
do $$ begin
  if not exists(select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
end $$;
create table public.companies(id uuid primary key, name text not null, business_type text);
create table public.store_profiles(id uuid primary key, store_name text not null, base_address text not null, status text not null, origin text not null);
create table public.store_accounts(id uuid primary key, company_id uuid not null references public.companies(id), store_profile_id uuid references public.store_profiles(id), status text not null);
create table public.admin_audit_logs(id uuid primary key default gen_random_uuid(), actor_user_id uuid,
  company_id uuid references public.companies(id) on delete set null, action text not null, target_type text,
  target_id uuid, metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
\ir 2026-11-21-CX-93-distributor-industry-contract.sql

insert into public.companies values('10000000-0000-4000-8000-000000000001', '합성 유통 A', '기존 리드 기본값');
insert into public.store_profiles values('20000000-0000-4000-8000-000000000001', '합성 매장', '서울', 'active', 'direct');
insert into public.store_accounts values('30000000-0000-4000-8000-000000000001', '10000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', 'active');

do $$
declare category_a uuid := '40000000-0000-4000-8000-000000000001'; category_b uuid := '40000000-0000-4000-8000-000000000002'; result jsonb;
begin
  if has_table_privilege('anon', 'public.distributor_industry_categories', 'select')
    or has_table_privilege('authenticated', 'public.company_distributor_industries', 'select')
    or has_table_privilege('service_role', 'public.company_distributor_industries', 'insert')
    or has_function_privilege('authenticated', 'public.preview_company_distributor_industries(uuid,uuid[])', 'execute')
    then raise exception 'industry_permission_boundary_failed'; end if;
  perform public.admin_save_distributor_industry_category(category_a, '농산 유통', 'active', '합성 관리자', 'category-a-create');
  perform public.admin_save_distributor_industry_category(category_b, '주류 유통', 'active', '합성 관리자', 'category-b-create');
  result := public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000001',
    array[category_b, category_a, category_a], '합성 관리자', 'company-a-assign-v1');
  if jsonb_array_length(result->'afterCategoryIds') <> 2
    or (select count(*) from public.company_distributor_industries) <> 2
    or (result->>'activeConnectionCount')::integer <> 1 or (result->>'affectedStoreCount')::integer <> 1
    then raise exception 'multi_assignment_or_preview_failed'; end if;
  if (select business_type from public.companies limit 1) <> '기존 리드 기본값' then raise exception 'legacy_business_type_changed'; end if;
  perform public.admin_save_distributor_industry_category(category_a, '신선 농산', 'active', '합성 관리자', 'category-a-rename');
  if not exists(select 1 from public.company_distributor_industries where industry_category_id = category_a)
    or (select display_name from public.distributor_industry_categories where id = category_a) <> '신선 농산'
    then raise exception 'stable_id_display_name_contract_failed'; end if;
  perform public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000001', array[category_b], '합성 관리자', 'company-a-assign-v2');
  perform public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000001', array[category_b], '합성 관리자', 'company-a-assign-v2');
  if (select count(*) from public.admin_audit_logs where metadata->>'requestKey' = 'company-a-assign-v2') <> 1
    then raise exception 'idempotent_audit_failed'; end if;
  if not exists(select 1 from public.admin_audit_logs where action = 'company_distributor_industries_changed'
      and metadata->>'beforeCategoryIds' is not null and metadata->>'afterCategoryIds' is not null
      and metadata->>'affectedStoreCount' = '1') then raise exception 'assignment_audit_or_impact_missing'; end if;
  result := public.preview_distributor_industry_category_impact(category_b);
  if (result->>'assignedCompanyCount')::integer <> 1 or (result->>'activeConnectionCount')::integer <> 1
    or (result->>'affectedStoreCount')::integer <> 1 then raise exception 'category_impact_preview_failed'; end if;
end $$;

delete from public.company_distributor_industries;
delete from public.distributor_industry_categories;
\ir 2026-11-21-CX-93-distributor-industry-contract.down.sql
do $$ begin
  if to_regclass('public.distributor_industry_categories') is not null or to_regclass('public.company_distributor_industries') is not null
    then raise exception 'down_incomplete'; end if;
  if (select business_type from public.companies limit 1) <> '기존 리드 기본값' then raise exception 'down_changed_legacy_business_type'; end if;
end $$;
drop table public.admin_audit_logs, public.store_accounts, public.store_profiles, public.companies;
