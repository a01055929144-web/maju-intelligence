\set ON_ERROR_STOP on
do $$ begin
  if current_database() !~ '^store_kakao_membership_test' or current_setting('server_version_num')::int not between 170000 and 179999 then
    raise exception 'disposable PostgreSQL 17 database required';
  end if;
end $$;

create extension if not exists pgcrypto;
create extension if not exists dblink;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin; end if;
end $$;
alter role service_role bypassrls;

create table public.companies(id uuid primary key);
create table public.normalized_customers(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade, unique(company_id,id)
);
create table public.app_users(id uuid primary key);
create table public.company_members(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  role text not null, permission_role text, status text not null, unique(company_id,id)
);
create table public.store_accounts(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade, customer_id uuid not null,
  status text not null check(status in ('pending','active','suspended','closed')),
  unique(company_id,id), foreign key(company_id,customer_id) references public.normalized_customers(company_id,id)
);
create table public.store_account_members(
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null, auth_user_id uuid, login_id_normalized text,
  role text not null check(role in ('owner','manager','staff')),
  status text not null check(status in ('invited','active','removed')),
  invited_by_member_id uuid, invite_token_hash text, invited_at timestamptz, joined_at timestamptz,
  removed_by_member_id uuid, removed_at timestamptz, last_ordered_at timestamptz,
  unique(company_id,id), unique(company_id,store_account_id,id), unique(login_id_normalized),
  foreign key(company_id,store_account_id) references public.store_accounts(company_id,id),
  foreign key(company_id,store_account_id,invited_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  foreign key(company_id,store_account_id,removed_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  check((status='removed')=(removed_at is not null)), check(invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$')
);
create unique index store_account_one_active_owner on public.store_account_members(company_id,store_account_id) where role='owner' and status='active';
create table public.store_account_member_events(
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null, member_id uuid not null,
  event_type text not null check(event_type in ('invite','join','remove','owner_transfer','assisted_owner_transfer')),
  actor_member_id uuid, actor_user_key text, reason text, occurred_at timestamptz not null default clock_timestamp(),
  check(num_nonnulls(actor_member_id,actor_user_key)=1),
  foreign key(company_id,store_account_id,member_id) references public.store_account_members(company_id,store_account_id,id),
  foreign key(company_id,store_account_id,actor_member_id) references public.store_account_members(company_id,store_account_id,id)
);
alter table public.store_account_members enable row level security;
alter table public.store_account_member_events enable row level security;
revoke all on public.store_account_members,public.store_account_member_events from public,anon,authenticated;
grant all on public.store_account_members,public.store_account_member_events,public.store_accounts,public.app_users to service_role;
grant select on public.company_members to service_role;

insert into public.companies values
  ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into public.normalized_customers values
  ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into public.store_accounts(id,company_id,customer_id,status) values
  ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','active'),
  ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','active');
insert into public.app_users values
  ('40000000-0000-4000-8000-000000000001'),('40000000-0000-4000-8000-000000000002'),
  ('40000000-0000-4000-8000-000000000003'),('40000000-0000-4000-8000-000000000004');
insert into public.company_members(id,company_id,role,permission_role,status) values
  ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','owner','active'),
  ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','manager','manager','active'),
  ('50000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','member','staff','active'),
  ('50000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','owner','owner','inactive');

\ir 20261105-store-kakao-membership.sql

do $$ begin
  if has_function_privilege('anon','public.provision_store_owner_v1(uuid,uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.accept_store_member_invitation_v1(uuid,uuid,uuid,text)','execute')
    or not has_function_privilege('service_role','public.create_store_member_invitation_v1(uuid,uuid,uuid,text,text)','execute') then
    raise exception 'store_membership_function_grants_invalid';
  end if;
  if not (select relrowsecurity from pg_class where oid='public.store_account_members'::regclass) then
    raise exception 'store_membership_rls_disabled';
  end if;
end $$;

set role service_role;
select public.provision_store_owner_v1(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001'
);

do $$ begin
  begin
    perform public.provision_store_owner_v1(
      '10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000003'
    );
    raise exception 'cross_company_approver_allowed';
  exception when others then
    if sqlerrm='cross_company_approver_allowed' then raise; end if;
  end;
  begin
    perform public.provision_store_owner_v1(
      '10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000004'
    );
    raise exception 'inactive_approver_allowed';
  exception when others then
    if sqlerrm='inactive_approver_allowed' then raise; end if;
  end;
  begin
    perform public.provision_store_owner_v1(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000001'
    );
    raise exception 'duplicate_owner_allowed';
  exception when others then
    if sqlerrm='duplicate_owner_allowed' then raise; end if;
  end;
end $$;

select public.provision_store_owner_v1(
  '10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',
  '40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000002'
);

do $$ declare owner_id uuid; begin
  select id into owner_id from public.store_account_members where company_id='10000000-0000-4000-8000-000000000001' and role='owner';
  perform public.create_store_member_invitation_v1(
    '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',owner_id,'staff',
    encode(digest('invite-one','sha256'),'hex')
  );
  begin
    perform public.create_store_member_invitation_v1(
      '10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',owner_id,'staff',
      encode(digest('cross-company','sha256'),'hex')
    );
    raise exception 'cross_company_actor_allowed';
  exception when others then
    if sqlerrm='cross_company_actor_allowed' then raise; end if;
  end;
end $$;

do $$ begin
  begin
    perform public.accept_store_member_invitation_v1(
      '10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002',
      '40000000-0000-4000-8000-000000000002',encode(digest('invite-one','sha256'),'hex')
    );
    raise exception 'cross_company_invite_allowed';
  exception when others then
    if sqlerrm='cross_company_invite_allowed' then raise; end if;
  end;
end $$;

select public.accept_store_member_invitation_v1(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
  '40000000-0000-4000-8000-000000000002',encode(digest('invite-one','sha256'),'hex')
);

do $$ begin
  begin
    perform public.accept_store_member_invitation_v1(
      '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',
      '40000000-0000-4000-8000-000000000003',encode(digest('invite-one','sha256'),'hex')
    );
    raise exception 'invite_reuse_allowed';
  exception when others then
    if sqlerrm='invite_reuse_allowed' then raise; end if;
  end;
end $$;

delete from public.app_users where id='40000000-0000-4000-8000-000000000002';
do $$ begin
  if not exists(select 1 from public.store_account_members where status='active' and role='staff' and auth_user_id is null) then
    raise exception 'auth_user_delete_did_not_preserve_membership_audit';
  end if;
end $$;

-- 같은 사용자가 같은 매장의 서로 다른 초대를 동시에 수락해도 활성 행은 하나만 남는다.
do $$ declare owner_id uuid; begin
  select id into owner_id from public.store_account_members where company_id='10000000-0000-4000-8000-000000000001' and role='owner';
  perform public.create_store_member_invitation_v1('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',owner_id,'staff',encode(digest('race-one','sha256'),'hex'));
  perform public.create_store_member_invitation_v1('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',owner_id,'staff',encode(digest('race-two','sha256'),'hex'));
end $$;
reset role;
select dblink_connect('race1','host=127.0.0.1 dbname='||current_database()||' user=postgres password=postgres');
select dblink_connect('race2','host=127.0.0.1 dbname='||current_database()||' user=postgres password=postgres');
select dblink_send_query('race1',$q$select public.accept_store_member_invitation_v1('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',encode(digest('race-one','sha256'),'hex'))$q$);
select dblink_send_query('race2',$q$select public.accept_store_member_invitation_v1('10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',encode(digest('race-two','sha256'),'hex'))$q$);
select * from dblink_get_result('race1',false) as t(result jsonb);
select * from dblink_get_result('race2',false) as t(result jsonb);
select dblink_disconnect('race1');
select dblink_disconnect('race2');

do $$ begin
  if (select count(*) from public.store_account_members where company_id='10000000-0000-4000-8000-000000000001' and store_account_id='30000000-0000-4000-8000-000000000001' and auth_user_id='40000000-0000-4000-8000-000000000003' and status='active')<>1 then
    raise exception 'concurrent_acceptance_not_serialized';
  end if;
  if (select count(*) from public.store_account_member_events where event_type='join')<>4 then
    raise exception 'membership_events_incomplete';
  end if;
end $$;

delete from public.companies where id='10000000-0000-4000-8000-000000000002';
do $$ begin
  if exists(select 1 from public.store_account_members where company_id='10000000-0000-4000-8000-000000000002')
    or exists(select 1 from public.store_account_member_events where company_id='10000000-0000-4000-8000-000000000002') then
    raise exception 'company_delete_did_not_cascade_store_membership';
  end if;
end $$;

\ir 20261105-store-kakao-membership.down.sql
do $$ begin
  if to_regprocedure('public.accept_store_member_invitation_v1(uuid,uuid,uuid,text)') is not null
    or exists(select 1 from pg_constraint where conrelid='public.store_account_members'::regclass and conname='store_account_members_auth_user_fk') then
    raise exception 'store_membership_down_incomplete';
  end if;
  if (select count(*) from public.store_account_members where status='active')<>3 then
    raise exception 'store_membership_down_changed_data';
  end if;
end $$;

select 'store Kakao membership PG17 checks passed' as result;
