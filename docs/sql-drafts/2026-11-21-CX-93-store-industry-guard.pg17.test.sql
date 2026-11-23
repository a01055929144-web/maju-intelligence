\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'cx93_industry_guard_test' or current_setting('server_version_num')::integer / 10000 <> 17
    then raise exception 'Disposable CX93 PG17 database required'; end if;
end $$;
create extension if not exists pgcrypto;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.companies(id uuid primary key, name text not null, business_type text, status text not null default 'active');
create table public.store_profiles(id uuid primary key, store_name text not null, base_address text not null, status text not null, origin text not null);
create table public.app_users(id uuid primary key, status text not null);
create table public.store_profile_members(id uuid primary key default gen_random_uuid(), store_profile_id uuid references public.store_profiles(id),
  auth_user_id uuid references public.app_users(id), status text not null);
create table public.store_accounts(id uuid primary key, company_id uuid not null references public.companies(id), store_profile_id uuid references public.store_profiles(id), status text not null);
create table public.admin_audit_logs(id uuid primary key default gen_random_uuid(), actor_user_id uuid,
  company_id uuid references public.companies(id), action text not null, target_type text, target_id uuid,
  metadata jsonb not null default '{}'::jsonb, created_at timestamptz not null default now());
\ir 2026-11-21-CX-93-distributor-industry-contract.sql
\ir 2026-11-21-CX-93-store-industry-guard.sql

insert into public.companies select ('10000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'SYNTHETIC-'||n, 'same legacy display', 'active' from generate_series(1,4) n;
insert into public.store_profiles select ('20000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'SYNTHETIC-'||n, 'synthetic address', 'active', 'direct' from generate_series(1,3) n;
insert into public.app_users select ('50000000-0000-4000-8000-' || lpad(n::text,12,'0'))::uuid, 'active' from generate_series(1,3) n;
insert into public.store_profile_members(store_profile_id,auth_user_id,status)
  select ('20000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, ('50000000-0000-4000-8000-'||lpad(n::text,12,'0'))::uuid, 'active' from generate_series(1,3) n;
select public.admin_save_distributor_industry_category('40000000-0000-4000-8000-000000000001','Synthetic X','active','synthetic admin','x-create');
select public.admin_save_distributor_industry_category('40000000-0000-4000-8000-000000000002','Synthetic Y','active','synthetic admin','y-create');
select public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000001',array['40000000-0000-4000-8000-000000000001'::uuid],'synthetic admin','a-assign');
select public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000002',array['40000000-0000-4000-8000-000000000002'::uuid],'synthetic admin','b-assign');
select public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000003',array['40000000-0000-4000-8000-000000000001'::uuid,'40000000-0000-4000-8000-000000000002'::uuid],'synthetic admin','c-assign');
insert into public.store_accounts values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','active');

do $$ declare c uuid; p uuid := '20000000-0000-4000-8000-000000000001'; u uuid := '50000000-0000-4000-8000-000000000001'; result text;
begin
  if has_function_privilege('anon','public.check_store_distributor_industry_v1(uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.assert_store_distributor_industry_v1(uuid,uuid,uuid)','execute')
    or has_table_privilege('service_role','public.company_distributor_industries','select') then raise exception 'permission_boundary_failed'; end if;
  for c,result in values
    ('10000000-0000-4000-8000-000000000001'::uuid,'eligible'),
    ('10000000-0000-4000-8000-000000000002'::uuid,'eligible'),
    ('10000000-0000-4000-8000-000000000003'::uuid,'same_industry_connection'),
    ('10000000-0000-4000-8000-000000000004'::uuid,'business_type_review_required') loop
    if public.check_store_distributor_industry_v1(c,p,u) <> result then raise exception 'intersection_verdict_failed'; end if;
  end loop;
  if public.check_store_distributor_industry_v1(c,'20000000-0000-4000-8000-000000000002',u) <> 'store_member_unavailable'
    then raise exception 'foreign_profile_allowed'; end if;
  update public.store_profile_members set status='removed' where store_profile_id=p;
  if public.check_store_distributor_industry_v1(c,p,u) <> 'store_member_unavailable' then raise exception 'removed_member_allowed'; end if;
  update public.store_profile_members set status='active' where store_profile_id=p;
  update public.app_users set status='inactive' where id=u;
  if public.check_store_distributor_industry_v1(c,p,u) <> 'store_member_unavailable' then raise exception 'inactive_user_allowed'; end if;
  update public.app_users set status='active' where id=u;
  update public.companies set status='inactive' where id='10000000-0000-4000-8000-000000000001';
  if public.check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000003',p,u) <> 'eligible' then raise exception 'inactive_distributor_counted'; end if;
  update public.companies set status='active' where id='10000000-0000-4000-8000-000000000001';
  update public.store_accounts set status='closed' where company_id='10000000-0000-4000-8000-000000000001';
  if public.check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000003',p,u) <> 'eligible' then raise exception 'closed_connection_counted'; end if;
  update public.store_accounts set status='active' where company_id='10000000-0000-4000-8000-000000000001';
  perform public.admin_save_distributor_industry_category('40000000-0000-4000-8000-000000000001','Renamed X','active','synthetic admin','x-rename');
  if public.check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000003',p,u) <> 'same_industry_connection' then raise exception 'display_name_changed_identity'; end if;
  perform public.admin_save_distributor_industry_category('40000000-0000-4000-8000-000000000002','Synthetic Y','retired','synthetic admin','y-retire');
  if public.check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000002',p,u) <> 'business_type_review_required' then raise exception 'retired_category_allowed'; end if;
  perform public.admin_save_distributor_industry_category('40000000-0000-4000-8000-000000000002','Synthetic Y','active','synthetic admin','y-restore');
  perform public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000001','{}'::uuid[],'synthetic admin','a-clear');
  if public.check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000002',p,u) <> 'business_type_review_required' then raise exception 'unclassified_peer_allowed'; end if;
  perform public.admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000001',array['40000000-0000-4000-8000-000000000001'::uuid],'synthetic admin','a-restore');
  if (select count(*) from public.store_accounts) <> 2 then raise exception 'guard_changed_connections'; end if;
end $$;
set role service_role;
select public.check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
reset role;

-- Synthetic mutation harness ONLY: models the required same-RPC transaction boundary.
create function public.cx93_fixture_connect(c uuid,p uuid,u uuid,a uuid) returns void language plpgsql as $$ begin
  perform public.assert_store_distributor_industry_v1(c,p,u);
  insert into public.store_accounts values(a,c,p,'active');
end $$;
