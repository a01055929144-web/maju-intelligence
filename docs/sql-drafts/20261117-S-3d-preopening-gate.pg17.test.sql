\set ON_ERROR_STOP on
do $$ begin
  if current_database() !~ '^s3d_preopening_gate_test' or current_setting('server_version_num')::int not between 170000 and 179999
    then raise exception 'disposable PostgreSQL 17 database required'; end if;
end $$;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;

create table public.companies(id uuid primary key);
create table public.app_users(id uuid primary key,status text not null);
create table public.company_members(id uuid primary key,company_id uuid not null,role text,permission_role text,status text not null,unique(company_id,id));
create table public.customer_imports(id uuid primary key default extensions.gen_random_uuid(),company_id uuid,source text,row_count int,status text,quality_score int,completed_at timestamptz);
create table public.normalized_customers(id uuid primary key default extensions.gen_random_uuid(),company_id uuid not null,import_id uuid,
  customer_name text,address text,phone text,business_registration_number text,representative_name text,normalized_key text,delivery_territory_id uuid,unique(company_id,id));
create table public.delivery_territories(id uuid primary key,company_id uuid not null,is_active boolean not null,unique(company_id,id));
create table public.store_order_territory_rules(company_id uuid not null,territory_id uuid not null,delivery_weekdays int[] not null,primary key(company_id,territory_id));
create table public.store_accounts(id uuid primary key,company_id uuid not null,customer_id uuid not null,business_registration_number text,
  business_status text,business_status_verified_at timestamptz,verification_request_id text,terms_version text,terms_accepted_at timestamptz,
  terms_accepted_by_member_id uuid,status text,unique(company_id,id),unique(company_id,customer_id));
create table public.store_account_members(id uuid primary key default extensions.gen_random_uuid(),company_id uuid not null,store_account_id uuid not null,
  auth_user_id uuid,role text,status text,joined_at timestamptz,unique(company_id,store_account_id,id));
create table public.store_account_member_events(id uuid primary key default extensions.gen_random_uuid(),company_id uuid,store_account_id uuid,member_id uuid,
  event_type text,actor_user_key text);
create table public.store_owner_activation_requests(
  id uuid primary key default extensions.gen_random_uuid(),company_id uuid not null,customer_id uuid,store_account_id uuid not null default extensions.gen_random_uuid(),
  invite_token_hash text not null unique,prepared_by_company_member_id uuid,public_idempotency_key uuid,document_id uuid,document_version_id uuid,share_link_id uuid,
  store_name text,representative_name text,address text,phone text,business_registration_number text,prepared_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default(clock_timestamp()+interval '30 minutes'),consumed_at timestamptz,cancelled_at timestamptz);

create function public.provision_store_owner_v1(p_company uuid,p_account uuid,p_user uuid,p_actor uuid)
returns jsonb language plpgsql set search_path=public,pg_temp as $$
declare m uuid;
begin
  if not exists(select 1 from public.company_members where company_id=p_company and id=p_actor and status='active'
    and coalesce(permission_role,role) in ('owner','manager')) then raise exception 'store_owner_approval_forbidden'; end if;
  insert into public.store_account_members(company_id,store_account_id,auth_user_id,role,status,joined_at)
    values(p_company,p_account,p_user,'owner','active',clock_timestamp()) returning id into m;
  return jsonb_build_object('id',m);
end $$;
create function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text)
returns jsonb language sql as $$ select '{"normalSignup":"preserved"}'::jsonb $$;
create function public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)
returns jsonb language sql as $$ select '{}'::jsonb $$;
grant all on all tables in schema public to service_role;
grant execute on all functions in schema public to service_role;

insert into public.companies values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.app_users values('20000000-0000-4000-8000-000000000001','active');
insert into public.company_members values('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','owner','active');
insert into public.normalized_customers(id,company_id) values
  ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
insert into public.delivery_territories values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',true),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',true);
insert into public.store_order_territory_rules values
  ('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','{1,2,3,4,5}'),
  ('10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','{1,2,3,4,5}');
insert into public.store_owner_activation_requests(company_id,customer_id,store_account_id,invite_token_hash,prepared_by_company_member_id) values
  ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',repeat('a',64),'30000000-0000-4000-8000-000000000001'),
  ('10000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002','60000000-0000-4000-8000-000000000002',repeat('c',64),'30000000-0000-4000-8000-000000000001');
insert into public.store_owner_activation_requests(company_id,store_account_id,invite_token_hash,public_idempotency_key,store_name,representative_name,address,phone)
  values
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003',repeat('b',64),
    '70000000-0000-4000-8000-000000000001','Existing Public Store','Owner','Seoul','01012345678'),
  ('10000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004',repeat('d',64),
    '70000000-0000-4000-8000-000000000002','Rollback Public Store','Owner','Seoul','01087654321');

-- The deployed 11/10 body is the rollback body. Prove its public path before replacing it.
\ir 20261117-S-3d-preopening-gate.down.sql
set role service_role;
select public.activate_preopening_store_owner_v1(repeat('b',64),'20000000-0000-4000-8000-000000000001','2026-11-17',clock_timestamp(),null);
reset role;
do $$ begin
  if (select count(*) from public.store_accounts where id='60000000-0000-4000-8000-000000000003')<>1
    or (select count(*) from public.normalized_customers where normalized_key='preopening:60000000-0000-4000-8000-000000000003')<>1
  then raise exception 'deployed_preopening_path_fixture_failed'; end if;
end $$;

\ir 20261117-S-3d-preopening-gate.sql
set role service_role;
do $$ begin
  begin perform public.activate_preopening_store_owner_v1(repeat('d',64),'20000000-0000-4000-8000-000000000001','2026-11-17',clock_timestamp(),null);
    raise exception 'public_self_signup_was_allowed';
  exception when others then if sqlerrm<>'preopening_activation_unavailable' then raise; end if; end;
  begin perform public.activate_preopening_store_owner_v1(repeat('c',64),'20000000-0000-4000-8000-000000000001','2026-11-17',clock_timestamp(),
    '50000000-0000-4000-8000-000000000002'); raise exception 'cross_company_territory_was_allowed';
  exception when others then if sqlerrm<>'public_delivery_territory_unavailable' then raise; end if; end;
end $$;
select public.activate_preopening_store_owner_v1(repeat('a',64),'20000000-0000-4000-8000-000000000001','2026-11-17',clock_timestamp(),
  '50000000-0000-4000-8000-000000000001');
do $$ begin
  begin perform public.activate_preopening_store_owner_v1(repeat('a',64),'20000000-0000-4000-8000-000000000001','2026-11-17',clock_timestamp(),null);
    raise exception 'activation_token_was_reused';
  exception when others then if sqlerrm<>'preopening_activation_unavailable' then raise; end if; end;
  if (select count(*) from public.store_accounts where company_id='10000000-0000-4000-8000-000000000001'
      and customer_id='40000000-0000-4000-8000-000000000001')<>1
    or (select public.activate_store_owner_v1('',null,'',clock_timestamp(),'','',clock_timestamp(),'')->>'normalSignup')<>'preserved'
  then raise exception 's3d_scope_or_normal_signup_failed'; end if;
end $$;
reset role;
do $$ begin
  if has_function_privilege('anon','public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)','execute')
    or has_function_privilege('authenticated','public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)','execute')
    or not has_function_privilege('service_role','public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)','execute')
  then raise exception 's3d_rpc_grants_failed'; end if;
end $$;

-- Rollback restores the deployed public path and removes the prepared-customer path.
\ir 20261117-S-3d-preopening-gate.down.sql
set role service_role;
select public.activate_preopening_store_owner_v1(repeat('d',64),'20000000-0000-4000-8000-000000000001','2026-11-17',clock_timestamp(),null);
do $$ begin
  begin perform public.activate_preopening_store_owner_v1(repeat('c',64),'20000000-0000-4000-8000-000000000001','2026-11-17',clock_timestamp(),null);
    raise exception 'prepared_customer_path_survived_rollback';
  exception when others then if sqlerrm<>'preopening_activation_unavailable' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.store_accounts where id='60000000-0000-4000-8000-000000000004')<>1
    or has_function_privilege('anon','public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)','execute')
    or has_function_privilege('authenticated','public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)','execute')
    or not has_function_privilege('service_role','public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)','execute')
  then raise exception 's3d_rollback_or_grants_failed'; end if;
end $$;
select 'S-3d preopening gate PG17 checks passed' as result;
