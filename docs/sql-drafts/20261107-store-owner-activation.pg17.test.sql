\set ON_ERROR_STOP on
do $$ begin if current_database() !~ '^store_owner_activation_test' or current_setting('server_version_num')::int not between 170000 and 179999
  then raise exception 'disposable PostgreSQL 17 database required'; end if; end $$;
create extension if not exists pgcrypto;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if;
end $$;
create table public.companies(id uuid primary key);
create table public.customer_imports(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),source text,row_count int,status text,quality_score int,completed_at timestamptz);
create table public.normalized_customers(id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id) on delete cascade,
  import_id uuid,customer_name text,address text,phone text,business_registration_number text,representative_name text,normalized_key text,unique(company_id,id),unique(company_id,normalized_key));
create table public.pricing_documents(id uuid primary key,company_id uuid not null references public.companies(id),archived_at timestamptz,unique(company_id,id));
create table public.pricing_document_versions(id uuid primary key,company_id uuid not null,document_id uuid not null,content jsonb not null,
  unique(company_id,document_id,id),foreign key(company_id,document_id) references public.pricing_documents(company_id,id));
create table public.pricing_document_share_links(id uuid primary key,company_id uuid not null,document_id uuid not null,document_version_id uuid not null,
  expires_at timestamptz not null,revoked_at timestamptz,unique(company_id,id),foreign key(company_id,document_id,document_version_id)
  references public.pricing_document_versions(company_id,document_id,id));
create table public.app_users(id uuid primary key,status text not null);
create table public.company_members(id uuid primary key,company_id uuid not null references public.companies(id) on delete cascade,role text not null,permission_role text,status text not null,unique(company_id,id));
create table public.store_accounts(
  id uuid primary key,company_id uuid not null references public.companies(id),customer_id uuid not null,business_registration_number text not null,
  business_status text not null,business_status_verified_at timestamptz not null,verification_request_id text not null,
  terms_version text not null,terms_accepted_at timestamptz not null,terms_accepted_by_member_id uuid,status text not null,
  unique(company_id,id),unique(company_id,customer_id),foreign key(company_id,customer_id) references public.normalized_customers(company_id,id)
);
create table public.store_account_members(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),store_account_id uuid not null,
  auth_user_id uuid,login_id_normalized text,role text not null check(role in ('owner','manager','staff')),status text not null,
  invited_by_member_id uuid,invite_token_hash text,invited_at timestamptz,joined_at timestamptz,removed_by_member_id uuid,removed_at timestamptz,last_ordered_at timestamptz,
  unique(company_id,id),unique(company_id,store_account_id,id),unique(login_id_normalized),foreign key(company_id,store_account_id) references public.store_accounts(company_id,id),
  foreign key(company_id,store_account_id,invited_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  foreign key(company_id,store_account_id,removed_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  check((status='removed')=(removed_at is not null))
);
create unique index store_account_one_active_owner on public.store_account_members(company_id,store_account_id) where role='owner' and status='active';
create table public.store_account_member_events(
  id uuid primary key default gen_random_uuid(),company_id uuid not null references public.companies(id),store_account_id uuid not null,member_id uuid not null,
  event_type text not null,actor_member_id uuid,actor_user_key text,reason text,occurred_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(actor_member_id,actor_user_key)=1),foreign key(company_id,store_account_id,member_id) references public.store_account_members(company_id,store_account_id,id),
  foreign key(company_id,store_account_id,actor_member_id) references public.store_account_members(company_id,store_account_id,id)
);
alter table public.store_accounts add constraint store_accounts_terms_member_fk foreign key(company_id,id,terms_accepted_by_member_id)
  references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred;
grant all on public.store_accounts,public.store_account_members,public.store_account_member_events,public.app_users to service_role;
grant all on public.company_members,public.normalized_customers,public.customer_imports,public.pricing_documents,public.pricing_document_versions,public.pricing_document_share_links to service_role;

insert into public.companies values('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002'),
 ('10000000-0000-4000-8000-000000000003');
insert into public.pricing_documents values('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null);
insert into public.pricing_document_versions values('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','{"validUntil":"2099-12-31"}');
insert into public.pricing_document_share_links values('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '50000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',clock_timestamp()+interval '1 day',null);
insert into public.normalized_customers(id,company_id,business_registration_number) values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','1234567890'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','2234567890'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','3234567890'),
 ('20000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','4234567890'),
 ('20000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','5234567890');
insert into public.app_users values('30000000-0000-4000-8000-000000000001','active'),
 ('30000000-0000-4000-8000-000000000002','active'),('30000000-0000-4000-8000-000000000003','active');
insert into public.company_members values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','owner','active'),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','member','staff','active'),
 ('40000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002','owner','owner','active'),
 ('40000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000003','owner','owner','active'),
 ('40000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000001','member','manager','active');
\ir 20261105-store-kakao-membership.sql
\ir 20261107-store-owner-activation.sql
\ir 20261107-store-owner-activation.down.sql
do $$ begin
  if to_regclass('public.store_owner_activation_requests') is not null
    or to_regprocedure('public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text)') is not null
    or to_regprocedure('public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text)') is not null
  then raise exception 'empty_activation_rollback_failed'; end if;
end $$;
\ir 20261107-store-owner-activation.sql

set role service_role;
do $$ begin
  begin perform public.prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',repeat('a',64)); raise exception 'staff_prepared_owner';
  exception when others then if sqlerrm<>'store_owner_approval_forbidden' then raise; end if; end;
  begin perform public.prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
    '40000000-0000-4000-8000-000000000001',repeat('c',64)); raise exception 'cross_company_customer_prepared';
  exception when others then if sqlerrm<>'store_customer_business_number_required' then raise; end if; end;
end $$;

select public.prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000004',
  '40000000-0000-4000-8000-000000000004',repeat('e',64));
reset role;
delete from public.companies where id='10000000-0000-4000-8000-000000000003';
do $$ begin
  if exists(select 1 from public.store_owner_activation_requests where company_id='10000000-0000-4000-8000-000000000003') then
    raise exception 'company_delete_did_not_cascade_owner_activation';
  end if;
end $$;
set role service_role;
select public.prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001',repeat('b',64));
do $$ begin
  begin perform public.activate_store_owner_v1(repeat('b',64),'30000000-0000-4000-8000-000000000001','2026-11-07',clock_timestamp(),
    '1234567890','closed',clock_timestamp(),gen_random_uuid()::text); raise exception 'closed_business_activated';
  exception when others then if sqlerrm<>'store_business_verification_required' then raise; end if; end;
end $$;
select public.activate_store_owner_v1(repeat('b',64),'30000000-0000-4000-8000-000000000001','2026-11-07',clock_timestamp(),
  '1234567890','active',clock_timestamp(),gen_random_uuid()::text);
do $$ begin
  begin perform public.activate_store_owner_v1(repeat('b',64),'30000000-0000-4000-8000-000000000001','2026-11-07',clock_timestamp(),
    '1234567890','active',clock_timestamp(),gen_random_uuid()::text); raise exception 'activation_token_reused';
  exception when others then if sqlerrm<>'store_owner_activation_not_available' then raise; end if; end;
end $$;
select public.prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000005',
  '40000000-0000-4000-8000-000000000005',repeat('f',64));
select public.activate_store_owner_v1(repeat('f',64),'30000000-0000-4000-8000-000000000002','2026-11-07',clock_timestamp(),
  '5234567890','active',clock_timestamp(),gen_random_uuid()::text);
do $$ begin
  if not exists(
    select 1 from public.store_accounts a join public.store_account_members m
      on m.company_id=a.company_id and m.store_account_id=a.id
    where a.company_id='10000000-0000-4000-8000-000000000001'
      and a.customer_id='20000000-0000-4000-8000-000000000005'
      and a.status='active' and m.auth_user_id='30000000-0000-4000-8000-000000000002'
      and m.role='owner' and m.status='active'
  ) then raise exception 'manager_prepared_owner_scope_failed'; end if;
end $$;
select public.prepare_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',
  '40000000-0000-4000-8000-000000000001',repeat('d',64));
update public.store_owner_activation_requests
  set prepared_at=clock_timestamp()-interval '2 minutes',expires_at=clock_timestamp()-interval '1 minute'
  where invite_token_hash=repeat('d',64);
do $$ begin
  begin perform public.activate_store_owner_v1(repeat('d',64),'30000000-0000-4000-8000-000000000001','2026-11-07',clock_timestamp(),
    '3234567890','active',clock_timestamp(),gen_random_uuid()::text); raise exception 'expired_activation_used';
  exception when others then if sqlerrm<>'store_owner_activation_not_available' then raise; end if; end;
end $$;
select public.prepare_public_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
  repeat('1',64));
-- Same signed nonce is an idempotent retry and rotates only the short-lived activation proof hash.
select public.prepare_public_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
  '60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',
  repeat('2',64));
do $$ begin
  begin perform public.activate_store_owner_v1(repeat('2',64),'30000000-0000-4000-8000-000000000003','2026-11-07',clock_timestamp(),
    '6234567890','active',clock_timestamp(),gen_random_uuid()::text); raise exception 'owner_activated_before_profile';
  exception when others then if sqlerrm<>'public_store_profile_required' then raise; end if; end;
end $$;
select public.complete_public_store_owner_profile_v1(repeat('2',64),'새 매장','새 대표','서울시','01012345678','6234567890');
select public.complete_public_store_owner_profile_v1(repeat('2',64),'새 매장','새 대표','서울시','01012345678','6234567890');
do $$ begin
  begin perform public.complete_public_store_owner_profile_v1(repeat('2',64),'변조 매장','새 대표','서울시','01012345678','6234567890');
    raise exception 'retry_profile_changed';
  exception when others then if sqlerrm<>'public_store_retry_mismatch' then raise; end if; end;
end $$;
do $$ begin
  begin perform public.activate_store_owner_v1(repeat('2',64),'30000000-0000-4000-8000-000000000003','2026-11-07',clock_timestamp(),
    '6234567890','closed',clock_timestamp(),gen_random_uuid()::text); raise exception 'failed_verification_consumed_public_request';
  exception when others then if sqlerrm<>'store_business_verification_required' then raise; end if; end;
end $$;
select public.activate_store_owner_v1(repeat('2',64),'30000000-0000-4000-8000-000000000003','2026-11-07',clock_timestamp(),
  '6234567890','active',clock_timestamp(),gen_random_uuid()::text);
do $$ begin
  begin perform public.prepare_public_store_owner_activation_v1('10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
    '60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000002',
    repeat('3',64));
    perform public.complete_public_store_owner_profile_v1(repeat('3',64),'중복 매장','대표','서울시','01099998888','6234567890');
    raise exception 'duplicate_business_number_prepared';
  exception when others then if sqlerrm<>'public_store_business_number_exists' then raise; end if; end;
end $$;
reset role;
do $$ begin
  if (select count(*) from public.store_accounts where status='active' and business_status='active')<>3
    or (select count(*) from public.store_account_members where role='owner' and status='active')<>3
    or not exists(select 1 from public.normalized_customers where company_id='10000000-0000-4000-8000-000000000001' and normalized_key='6234567890')
    or not (select relrowsecurity from pg_class where oid='public.store_owner_activation_requests'::regclass)
    or has_function_privilege('anon','public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text)','execute')
    or not has_function_privilege('service_role','public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text)','execute')
  then raise exception 'store_owner_activation_contract_failed'; end if;
end $$;
select 'store owner activation PG17 checks passed' as result;
