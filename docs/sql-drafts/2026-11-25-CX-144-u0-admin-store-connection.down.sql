-- DOWN: CX-144 U0. 관리자 초대 기록(prepared_by_admin_key)이 하나라도 남아 있으면 원래 CHECK로 되돌릴 수 없으므로 중단한다(먼저 기록을 보관·정리). 다시 열린 매장 행·기록은 그대로 둔다(데이터 변경 없음).
begin;
do $$ begin
  if exists(select 1 from public.store_owner_activation_requests where prepared_by_admin_key is not null)
    then raise exception 'cx144_u0_down_blocked_admin_invites_exist'; end if;
end $$;
drop function public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid);
drop function public.admin_prepare_store_owner_activation_v1(uuid,uuid,text,text);
create or replace function public.prepare_store_owner_activation_v1(
  p_company_id uuid,p_customer_id uuid,p_actor_company_member_id uuid,p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_request public.store_owner_activation_requests%rowtype; v_business_number text;
begin
  if p_invite_token_hash is null or p_invite_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_store_owner_activation'; end if;
  perform 1 from public.company_members where company_id=p_company_id and id=p_actor_company_member_id
    and status='active' and coalesce(permission_role,role) in ('owner','manager') for share;
  if not found then raise exception 'store_owner_approval_forbidden'; end if;
  select regexp_replace(coalesce(business_registration_number,''),'\D','','g') into v_business_number
    from public.normalized_customers where company_id=p_company_id and id=p_customer_id for share;
  if not found or length(v_business_number)<>10 then raise exception 'store_customer_business_number_required'; end if;
  if exists(select 1 from public.store_accounts where company_id=p_company_id and customer_id=p_customer_id) then raise exception 'store_account_exists'; end if;
  update public.store_owner_activation_requests set cancelled_at=clock_timestamp()
    where company_id=p_company_id and customer_id=p_customer_id and consumed_at is null and cancelled_at is null and expires_at<=clock_timestamp();
  if exists(select 1 from public.store_owner_activation_requests where company_id=p_company_id and customer_id=p_customer_id
    and consumed_at is null and cancelled_at is null) then raise exception 'store_owner_activation_pending'; end if;
  insert into public.store_owner_activation_requests(company_id,customer_id,invite_token_hash,prepared_by_company_member_id)
    values(p_company_id,p_customer_id,p_invite_token_hash,p_actor_company_member_id) returning * into v_request;
  return jsonb_build_object('customerId',v_request.customer_id,'storeAccountId',v_request.store_account_id,'expiresAt',v_request.expires_at);
end $$;
create or replace function public.activate_store_owner_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,
  p_business_registration_number text,p_business_status text,p_verified_at timestamptz,p_verification_request_id text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_request public.store_owner_activation_requests%rowtype; v_customer_number text; v_owner jsonb; v_import uuid; v_member public.store_account_members%rowtype;
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
  insert into public.store_accounts(id,company_id,customer_id,business_registration_number,business_status,
    business_status_verified_at,verification_request_id,terms_version,terms_accepted_at,status)
  values(v_request.store_account_id,v_request.company_id,v_request.customer_id,v_customer_number,'active',
    p_verified_at,p_verification_request_id,p_terms_version,p_terms_accepted_at,'active');
  if v_request.prepared_by_company_member_id is not null then
    v_owner:=public.provision_store_owner_v1(v_request.company_id,v_request.store_account_id,p_auth_user_id,v_request.prepared_by_company_member_id);
  else
    insert into public.store_account_members(company_id,store_account_id,auth_user_id,role,status,joined_at)
      values(v_request.company_id,v_request.store_account_id,p_auth_user_id,'owner','active',clock_timestamp()) returning * into v_member;
    insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key)
      values(v_request.company_id,v_request.store_account_id,v_member.id,'join','public-owner-onboarding:'||v_request.share_link_id::text);
    v_owner:=jsonb_build_object('id',v_member.id,'role','owner','status','active');
  end if;
  update public.store_accounts set terms_accepted_by_member_id=(v_owner->>'id')::uuid
    where company_id=v_request.company_id and id=v_request.store_account_id;
  update public.store_owner_activation_requests set consumed_at=clock_timestamp() where id=v_request.id;
  return jsonb_build_object('companyId',v_request.company_id,'storeAccountId',v_request.store_account_id,'ownerMemberId',v_owner->>'id');
end $$;
drop function public.prepare_store_owner_activation_core_v1(uuid,uuid,uuid,text,text);
alter table public.store_owner_activation_requests drop constraint store_owner_activation_requests_prepared_ck;
alter table public.store_owner_activation_requests drop column prepared_by_admin_key;
alter table public.store_owner_activation_requests add constraint store_owner_activation_requests_check2 check(
  (customer_id is not null and prepared_by_company_member_id is not null and public_idempotency_key is null)
  or (prepared_by_company_member_id is null and public_idempotency_key is not null
    and num_nonnulls(document_id,document_version_id,share_link_id)=3
    and num_nonnulls(store_name,representative_name,address,phone,business_registration_number) in (0,5)));
revoke all on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) to service_role;
notify pgrst,'reload schema';
commit;
