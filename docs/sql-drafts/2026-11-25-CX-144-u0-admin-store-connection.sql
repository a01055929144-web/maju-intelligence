-- DRAFT ONLY. CX-144 U0: MAJU 관리자의 매장 연결 관리(탈퇴 처리·구성원 연결 해제·점주 추가 초대)와 탈퇴/점주 없는 매장의 재초대. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 선행: 20261105-store-kakao-membership.sql, 20261107-store-owner-activation.sql(prepare/activate 본문이 초안과 같은지 적용 전에 md5로 대조).
-- 설계 비교(U1 포함): 재초대 때 ① 같은 store_accounts 행을 다시 연다(채택) ② 새 행을 만든다. store_accounts는 (company_id, customer_id)가 unique이고
--   주문·활동 기록이 store_account_id/customer_id로 붙어 있어 ②는 제약 변경과 기록 분리가 필요하다. ①은 기록이 같은 행에 이어지고 구성원 행은 removed로 남는다.
--   단 같은 거래처의 새 점주도 이전 주문·활동 기록을 같은 거래처 이력으로 보게 된다(거래처 단위 기록이므로 의도된 동작).
-- 기존 행은 건드리지 않는다. 새 함수 3개 + 기존 함수 2개(prepare 래퍼, activate) 교체.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$ begin
  if to_regprocedure('public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text)') is null
    or to_regprocedure('public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text)') is null
    or to_regprocedure('public.provision_store_owner_v1(uuid,uuid,uuid,uuid)') is null
    or to_regclass('public.storefront_links') is null
  then raise exception 'cx144_u0_prerequisites_required'; end if;
  if to_regprocedure('public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)') is not null then raise exception 'cx144_u0_already_applied'; end if;
end $$;

-- 관리자 초대는 회사 구성원이 아니므로 요청에 관리자 키를 남긴다. 기존 CHECK(거래처 요청은 반드시 회사 구성원이 준비)를 "회사 구성원 또는 관리자 키 중 정확히 하나"로 넓힌다.
alter table public.store_owner_activation_requests add column prepared_by_admin_key text check(prepared_by_admin_key is null or prepared_by_admin_key ~ '^[0-9a-f]{64}$');
do $$ declare c record; begin
  for c in select conname from pg_constraint where conrelid='public.store_owner_activation_requests'::regclass and contype='c'
    and pg_get_constraintdef(oid) like '%prepared_by_company_member_id IS NOT NULL%' and pg_get_constraintdef(oid) like '%public_idempotency_key IS NULL%'
  loop execute format('alter table public.store_owner_activation_requests drop constraint %I',c.conname); end loop;
end $$;
alter table public.store_owner_activation_requests add constraint store_owner_activation_requests_prepared_ck check(
  (customer_id is not null and public_idempotency_key is null and num_nonnulls(prepared_by_company_member_id,prepared_by_admin_key)=1)
  or (prepared_by_company_member_id is null and prepared_by_admin_key is null and public_idempotency_key is not null
    and num_nonnulls(document_id,document_version_id,share_link_id)=3
    and num_nonnulls(store_name,representative_name,address,phone,business_registration_number) in (0,5)));

create function public.prepare_store_owner_activation_core_v1(
  p_company_id uuid,p_customer_id uuid,p_prepared_by uuid,p_admin_key text,p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_existing public.store_accounts%rowtype; v_request public.store_owner_activation_requests%rowtype; v_business_number text;
begin
  if p_invite_token_hash is null or p_invite_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_store_owner_activation'; end if;
  select regexp_replace(coalesce(business_registration_number,''),'\D','','g') into v_business_number
    from public.normalized_customers where company_id=p_company_id and id=p_customer_id for share;
  if not found or length(v_business_number)<>10 then raise exception 'store_customer_business_number_required'; end if;
  -- CX-144: 탈퇴(closed)했거나 점주가 없는 기존 매장은 같은 행으로 다시 초대할 수 있다. 활성 점주가 있으면 지금처럼 거절.
  select * into v_existing from public.store_accounts where company_id=p_company_id and customer_id=p_customer_id for update;
  if found and not (v_existing.status='closed' or (v_existing.status='active'
    and not exists(select 1 from public.store_account_members where company_id=p_company_id and store_account_id=v_existing.id and role='owner' and status='active')))
    then raise exception 'store_account_exists'; end if;
  update public.store_owner_activation_requests set cancelled_at=clock_timestamp()
    where company_id=p_company_id and customer_id=p_customer_id and consumed_at is null and cancelled_at is null and expires_at<=clock_timestamp();
  if exists(select 1 from public.store_owner_activation_requests where company_id=p_company_id and customer_id=p_customer_id
    and consumed_at is null and cancelled_at is null) then raise exception 'store_owner_activation_pending'; end if;
  insert into public.store_owner_activation_requests(company_id,customer_id,invite_token_hash,prepared_by_company_member_id,prepared_by_admin_key,store_account_id)
    values(p_company_id,p_customer_id,p_invite_token_hash,p_prepared_by,p_admin_key,coalesce(v_existing.id,gen_random_uuid())) returning * into v_request;
  return jsonb_build_object('customerId',v_request.customer_id,'storeAccountId',v_request.store_account_id,'expiresAt',v_request.expires_at);
end $$;

create or replace function public.prepare_store_owner_activation_v1(
  p_company_id uuid,p_customer_id uuid,p_actor_company_member_id uuid,p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  perform 1 from public.company_members where company_id=p_company_id and id=p_actor_company_member_id
    and status='active' and coalesce(permission_role,role) in ('owner','manager') for share;
  if not found then raise exception 'store_owner_approval_forbidden'; end if;
  return public.prepare_store_owner_activation_core_v1(p_company_id,p_customer_id,p_actor_company_member_id,null,p_invite_token_hash);
end $$;

create function public.admin_prepare_store_owner_activation_v1(
  p_company_id uuid,p_customer_id uuid,p_admin_key text,p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
begin
  if p_admin_key is null or p_admin_key !~ '^[0-9a-f]{64}$' then raise exception 'admin_key_invalid'; end if;
  -- 회사 구성원이 아닌 MAJU 관리자가 만든 초대: prepared_by_company_member_id는 비우고 관리자 키를 요청에 남기며, 활성화 이벤트는 'maju-admin-invite:<관리자 키>'로 기록된다.
  return public.prepare_store_owner_activation_core_v1(p_company_id,p_customer_id,null,p_admin_key,p_invite_token_hash);
end $$;

create function public.admin_change_store_connection_v1(
  p_company_id uuid,p_store_account_id uuid,p_admin_key text,p_action text,p_member_id uuid default null
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.store_accounts%rowtype; m public.store_account_members%rowtype; target record; v_removed integer:=0;
begin
  if p_admin_key is null or p_admin_key !~ '^[0-9a-f]{64}$' then raise exception 'admin_key_invalid'; end if;
  if p_action is null or p_action not in ('close','remove_member') then raise exception 'store_connection_invalid'; end if;
  if p_action='close' then
    -- 매장 구성원 탈퇴(change_store_connection_v1)와 같은 잠금 순서: 링크 → 매장 → 구성원
    perform 1 from public.storefront_links l join public.store_accounts s
      on s.company_id=l.company_id and s.customer_id=l.customer_id
      where s.company_id=p_company_id and s.id=p_store_account_id order by l.id for update of l;
  end if;
  select * into a from public.store_accounts where company_id=p_company_id and id=p_store_account_id for update;
  if a.id is null or a.status<>'active' then raise exception 'store_connection_unavailable'; end if;
  if p_action='remove_member' then
    select * into m from public.store_account_members where company_id=p_company_id and store_account_id=a.id
      and id=p_member_id and status in ('active','invited') for update;
    if m.id is null then raise exception 'store_connection_member_unavailable'; end if;
  else
    update public.store_accounts set status='closed',updated_at=clock_timestamp() where company_id=p_company_id and id=a.id;
    update public.storefront_links set revoked_at=coalesce(revoked_at,clock_timestamp()),can_order=false
      where company_id=p_company_id and customer_id=a.customer_id;
  end if;
  for target in select id from public.store_account_members where company_id=p_company_id and store_account_id=a.id
    and status in ('active','invited') and (p_action='close' or id=m.id) order by id for update loop
    update public.store_account_members set status='removed',removed_at=clock_timestamp(),invite_token_hash=null
      where company_id=p_company_id and store_account_id=a.id and id=target.id;
    insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key,reason)
      values(p_company_id,a.id,target.id,'remove','maju-admin:'||p_admin_key,case when p_action='close' then 'admin_store_closed' else 'admin_member_removed' end);
    v_removed:=v_removed+1;
  end loop;
  return jsonb_build_object('completed',true,'action',p_action,'removedMembers',v_removed);
end $$;

create or replace function public.activate_store_owner_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,
  p_business_registration_number text,p_business_status text,p_verified_at timestamptz,p_verification_request_id text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_existing public.store_accounts%rowtype; v_request public.store_owner_activation_requests%rowtype; v_customer_number text; v_owner jsonb; v_import uuid; v_member public.store_account_members%rowtype;
begin
  select * into v_request from public.store_owner_activation_requests
    where invite_token_hash=p_invite_token_hash and consumed_at is null and cancelled_at is null for update;
  if not found or v_request.expires_at<=clock_timestamp() then raise exception 'store_owner_activation_not_available'; end if;
  if v_request.public_idempotency_key is not null and v_request.store_name is null then raise exception 'public_store_profile_required'; end if;
  if p_terms_version is null or length(p_terms_version)>50 or p_terms_accepted_at<v_request.prepared_at
    or p_terms_accepted_at>clock_timestamp()+interval '1 minute' then raise exception 'store_terms_acceptance_required'; end if;
  if p_business_status<>'active' or p_verified_at<clock_timestamp()-interval '5 minutes'
    or p_verified_at>clock_timestamp()+interval '1 minute' or length(coalesce(p_verification_request_id,'')) not between 16 and 100 then
    raise exception 'store_business_verification_required';
  end if;
  if v_request.customer_id is null then v_customer_number:=v_request.business_registration_number;
  else select regexp_replace(coalesce(business_registration_number,''),'\D','','g') into v_customer_number
    from public.normalized_customers where company_id=v_request.company_id and id=v_request.customer_id for share; end if;
  if v_customer_number is distinct from p_business_registration_number then raise exception 'store_business_number_mismatch'; end if;
  perform 1 from public.app_users where id=p_auth_user_id and status='active' for share;
  if not found then raise exception 'auth_user_not_found'; end if;
  if v_request.customer_id is null then
    if exists(select 1 from public.normalized_customers where company_id=v_request.company_id and regexp_replace(coalesce(business_registration_number,''),'\D','','g')=v_customer_number)
      or exists(select 1 from public.store_accounts where company_id=v_request.company_id and business_registration_number=v_customer_number) then
      raise exception 'public_store_business_number_exists'; end if;
    insert into public.customer_imports(company_id,source,row_count,status,quality_score,completed_at)
      values(v_request.company_id,'store_owner_onboarding',1,'completed',100,clock_timestamp()) returning id into v_import;
    insert into public.normalized_customers(company_id,import_id,customer_name,address,phone,business_registration_number,representative_name,normalized_key)
      values(v_request.company_id,v_import,v_request.store_name,v_request.address,v_request.phone,v_customer_number,v_request.representative_name,v_customer_number)
      returning id into v_request.customer_id;
    update public.store_owner_activation_requests set customer_id=v_request.customer_id where id=v_request.id;
  end if;
  -- CX-144: 이 거래처의 기존 매장이 탈퇴(closed)했거나 점주가 없으면 새 행을 만들지 않고 같은 행을 다시 연다(주문·활동 기록이 같은 매장 행에 이어짐).
  select * into v_existing from public.store_accounts where company_id=v_request.company_id and id=v_request.store_account_id for update;
  if found then
    if v_existing.customer_id is distinct from v_request.customer_id
      or v_existing.status not in ('closed','active')
      or exists(select 1 from public.store_account_members where company_id=v_request.company_id and store_account_id=v_existing.id and role='owner' and status='active')
      then raise exception 'store_account_exists'; end if;
    update public.store_accounts set status='active',business_registration_number=v_customer_number,business_status='active',
      business_status_verified_at=p_verified_at,verification_request_id=p_verification_request_id,terms_version=p_terms_version,
      terms_accepted_at=p_terms_accepted_at,terms_accepted_by_member_id=null,updated_at=clock_timestamp()
      where company_id=v_request.company_id and id=v_existing.id;
  else
    insert into public.store_accounts(id,company_id,customer_id,business_registration_number,business_status,
      business_status_verified_at,verification_request_id,terms_version,terms_accepted_at,status)
    values(v_request.store_account_id,v_request.company_id,v_request.customer_id,v_customer_number,'active',
      p_verified_at,p_verification_request_id,p_terms_version,p_terms_accepted_at,'active');
  end if;
  if v_request.prepared_by_company_member_id is not null then
    v_owner:=public.provision_store_owner_v1(v_request.company_id,v_request.store_account_id,p_auth_user_id,v_request.prepared_by_company_member_id);
  else
    insert into public.store_account_members(company_id,store_account_id,auth_user_id,role,status,joined_at)
      values(v_request.company_id,v_request.store_account_id,p_auth_user_id,'owner','active',clock_timestamp()) returning * into v_member;
    insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key)
      values(v_request.company_id,v_request.store_account_id,v_member.id,'join',coalesce('public-owner-onboarding:'||v_request.share_link_id::text,'maju-admin-invite:'||v_request.prepared_by_admin_key));
    v_owner:=jsonb_build_object('id',v_member.id,'role','owner','status','active');
  end if;
  update public.store_accounts set terms_accepted_by_member_id=(v_owner->>'id')::uuid
    where company_id=v_request.company_id and id=v_request.store_account_id;
  update public.store_owner_activation_requests set consumed_at=clock_timestamp() where id=v_request.id;
  return jsonb_build_object('companyId',v_request.company_id,'storeAccountId',v_request.store_account_id,'ownerMemberId',v_owner->>'id');
end $$;

revoke all on function public.prepare_store_owner_activation_core_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.admin_prepare_store_owner_activation_v1(uuid,uuid,text,text) from public,anon,authenticated,service_role;
revoke all on function public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.admin_prepare_store_owner_activation_v1(uuid,uuid,text,text) to service_role;
grant execute on function public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid) to service_role;
grant execute on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) to service_role;
notify pgrst,'reload schema';
commit;
