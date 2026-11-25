-- CX-144 U0b PG17: 11/07 활성화 초안 → U0 초안 → U0b 초안 순서로 적용해 증명
\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'PostgreSQL 17 required'; end if; end $$;
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

create table public.storefront_links(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,revoked_at timestamptz,can_order boolean not null default true);
create table public.store_orders(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,store_account_id uuid);
grant all on public.storefront_links,public.store_orders to service_role;
-- 운영 store_accounts에는 updated_at이 있다(11/07 합성 표에는 없어서 추가)
alter table public.store_accounts add column updated_at timestamptz not null default clock_timestamp();


alter table public.app_users add column kakao_user_id text;

\ir 20261105-store-kakao-membership.sql
\ir 20261107-store-owner-activation.sql
\ir 2026-11-25-CX-144-u0-admin-store-connection.sql
\ir 2026-11-25-CX-144-u0b-force-link.sql

-- 카카오 로그인 이력이 있는 사용자(u1,u2)와 없는 사용자(u3: 카카오 아님)
update public.app_users set kakao_user_id = 'kakao-1' where id = '30000000-0000-4000-8000-000000000001';
update public.app_users set kakao_user_id = 'kakao-2' where id = '30000000-0000-4000-8000-000000000002';
insert into public.app_users(id, status, kakao_user_id) values ('30000000-0000-4000-8000-000000000004', 'suspended', 'kakao-4');

do $t$
declare c1 uuid := '10000000-0000-4000-8000-000000000001'; c2 uuid := '10000000-0000-4000-8000-000000000002';
  k1 uuid := '20000000-0000-4000-8000-000000000001';
  u1 uuid := '30000000-0000-4000-8000-000000000001'; u2 uuid := '30000000-0000-4000-8000-000000000002';
  u3 uuid := '30000000-0000-4000-8000-000000000003'; u4 uuid := '30000000-0000-4000-8000-000000000004';
  owner_member uuid := '40000000-0000-4000-8000-000000000001';
  admin_key text := repeat('d', 64);
  s1 uuid; r jsonb; ok boolean; old_owner uuid;
begin
  -- 준비: u1이 점주인 활성 매장
  s1 := (public.prepare_store_owner_activation_v1(c1, k1, owner_member, repeat('a', 64))->>'storeAccountId')::uuid;
  r := public.activate_store_owner_v1(repeat('a', 64), u1, '2026-11', clock_timestamp(), '1234567890', 'active', clock_timestamp(), 'verification-request-0001');
  old_owner := (r->>'ownerMemberId')::uuid;

  -- 사유 필수(없음·공백·1글자 거부)
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'staff', null); exception when others then ok := sqlerrm = 'store_link_reason_required'; end;
  if not ok then raise exception 'reason_null_accepted'; end if;
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'staff', '   '); exception when others then ok := sqlerrm = 'store_link_reason_required'; end;
  if not ok then raise exception 'reason_blank_accepted'; end if;
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'staff', 'x'); exception when others then ok := sqlerrm = 'store_link_reason_required'; end;
  if not ok then raise exception 'reason_short_accepted'; end if;

  -- 새 계정 금지: 카카오 로그인 이력이 없거나 비활성이거나 없는 사용자는 연결 불가
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u3, 'staff', '확인 요청 접수'); exception when others then ok := sqlerrm = 'store_link_user_unavailable'; end;
  if not ok then raise exception 'non_kakao_user_linked'; end if;
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u4, 'staff', '확인 요청 접수'); exception when others then ok := sqlerrm = 'store_link_user_unavailable'; end;
  if not ok then raise exception 'inactive_user_linked'; end if;
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, gen_random_uuid(), 'staff', '확인 요청 접수'); exception when others then ok := sqlerrm = 'store_link_user_unavailable'; end;
  if not ok then raise exception 'unknown_user_linked'; end if;
  if (select count(*) from public.app_users) <> 4 then raise exception 'account_created'; end if;

  -- 구성원 연결: 역할·이벤트(관리자 키 + 사유)
  r := public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'staff', '점주 요청 전화 확인');
  if r->>'role' <> 'staff' or r->>'status' <> 'active' then raise exception 'staff_link_failed'; end if;
  if (select array[actor_user_key, reason] from public.store_account_member_events where member_id = (r->>'id')::uuid and event_type = 'join')
     <> array['maju-admin:' || admin_key, 'admin_force_link: 점주 요청 전화 확인'] then raise exception 'link_event'; end if;
  -- 같은 사용자를 같은 매장에 두 번 연결할 수 없다
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'manager', '다시 시도'); exception when others then ok := sqlerrm = 'active_store_member_exists'; end;
  if not ok then raise exception 'duplicate_member_linked'; end if;

  -- 점주가 이미 있으면 교체를 명시해야 한다(명시 없으면 거절, 데이터 불변)
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'owner', '점주 교체 시도'); exception when others then ok := sqlerrm in ('active_store_owner_exists','active_store_member_exists'); end;
  if not ok then raise exception 'owner_replaced_without_flag'; end if;
  if (select status from public.store_account_members where id = old_owner) <> 'active' then raise exception 'owner_removed_without_flag'; end if;
  -- 구성원이 점주가 되려면 먼저 구성원 연결을 풀고(교체 확인과 함께) 연결한다
  perform public.admin_change_store_connection_v1(c1, s1, admin_key, 'remove_member', (select id from public.store_account_members where store_account_id = s1 and auth_user_id = u2 and status = 'active'));
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'owner', '점주 교체 시도'); exception when others then ok := sqlerrm = 'active_store_owner_exists'; end;
  if not ok then raise exception 'owner_exists_not_reported'; end if;
  r := public.admin_link_store_member_v1(c1, s1, admin_key, u2, 'owner', '점주 변경(대표 요청 11/25)', true);
  if (r->>'replacedOwnerMemberId')::uuid <> old_owner or (select status from public.store_account_members where id = old_owner) <> 'removed' then raise exception 'owner_not_replaced'; end if;
  if (select count(*) from public.store_account_members where store_account_id = s1 and role = 'owner' and status = 'active') <> 1
    or (select auth_user_id from public.store_account_members where store_account_id = s1 and role = 'owner' and status = 'active') <> u2 then raise exception 'owner_state'; end if;
  if (select reason from public.store_account_member_events where member_id = old_owner and event_type = 'remove') <> 'admin_owner_replaced: 점주 변경(대표 요청 11/25)' then raise exception 'replace_event'; end if;
  -- 점주 교체 후에도 거래처당 매장은 1개, 매장 상태 불변
  if (select count(*) from public.store_accounts where customer_id = k1) <> 1 or (select status from public.store_accounts where id = s1) <> 'active' then raise exception 'account_changed'; end if;

  -- 잘못된 역할·관리자 키·다른 회사·탈퇴한 매장
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u1, 'admin', '권한 상승 시도'); exception when others then ok := sqlerrm = 'store_connection_invalid'; end;
  if not ok then raise exception 'bad_role_accepted'; end if;
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, 'bad', u1, 'staff', '키 오류 시험'); exception when others then ok := sqlerrm = 'admin_key_invalid'; end;
  if not ok then raise exception 'bad_key_accepted'; end if;
  ok := false; begin perform public.admin_link_store_member_v1(c2, s1, admin_key, u1, 'staff', '다른 회사 시험'); exception when others then ok := sqlerrm = 'store_connection_unavailable'; end;
  if not ok then raise exception 'cross_company_linked'; end if;
  perform public.admin_change_store_connection_v1(c1, s1, admin_key, 'close');
  ok := false; begin perform public.admin_link_store_member_v1(c1, s1, admin_key, u1, 'staff', '탈퇴 매장 시험'); exception when others then ok := sqlerrm = 'store_connection_unavailable'; end;
  if not ok then raise exception 'closed_store_linked'; end if;

  -- 권한: service_role만
  if has_function_privilege('anon', 'public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean)', 'execute')
    or has_function_privilege('authenticated', 'public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean)', 'execute')
    or not has_function_privilege('service_role', 'public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean)', 'execute') then raise exception 'privileges'; end if;
end $t$;

-- down: 함수만 사라지고 연결·이벤트는 그대로
select count(*) as members_before from public.store_account_members \gset
select count(*) as events_before from public.store_account_member_events \gset
\ir 2026-11-25-CX-144-u0b-force-link.down.sql
do $d$ begin
  if to_regprocedure('public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean)') is not null then raise exception 'down_function_remains'; end if;
  if to_regprocedure('public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)') is null then raise exception 'down_removed_u0'; end if;
end $d$;
select (select count(*) from public.store_account_members) = :members_before and (select count(*) from public.store_account_member_events) = :events_before as ok \gset
\if :ok
\else
  do $x$ begin raise exception 'down_changed_data'; end $x$;
\endif
