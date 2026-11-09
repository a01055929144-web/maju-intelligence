-- DRAFT ONLY. Requires 20261105-store-kakao-membership.sql. Do not apply without DB approval.
begin;

do $$ begin
  if to_regprocedure('public.provision_store_owner_v1(uuid,uuid,uuid,uuid)') is null then
    raise exception 'store_kakao_membership_sql_required';
  end if;
end $$;

create table public.store_owner_activation_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid,
  store_account_id uuid not null default gen_random_uuid(),
  invite_token_hash text not null unique check(invite_token_hash ~ '^[0-9a-f]{64}$'),
  prepared_by_company_member_id uuid,
  public_idempotency_key uuid,
  document_id uuid,
  document_version_id uuid,
  share_link_id uuid,
  store_name text,
  representative_name text,
  address text,
  phone text,
  business_registration_number text check(business_registration_number is null or business_registration_number ~ '^\d{10}$'),
  prepared_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '30 minutes',
  consumed_at timestamptz,
  cancelled_at timestamptz,
  unique(company_id,store_account_id),
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  foreign key(company_id,prepared_by_company_member_id) references public.company_members(company_id,id) on delete cascade,
  check(expires_at>prepared_at),
  check(num_nonnulls(consumed_at,cancelled_at)<=1),
  check((customer_id is not null and prepared_by_company_member_id is not null and public_idempotency_key is null)
    or (prepared_by_company_member_id is null and public_idempotency_key is not null
      and num_nonnulls(document_id,document_version_id,share_link_id,store_name,representative_name,address,phone,business_registration_number)=8))
);
create unique index store_owner_activation_one_open_customer
  on public.store_owner_activation_requests(company_id,customer_id)
  where consumed_at is null and cancelled_at is null;
create unique index store_owner_activation_public_retry
  on public.store_owner_activation_requests(company_id,public_idempotency_key) where public_idempotency_key is not null;

create function public.prepare_store_owner_activation_v1(
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

create function public.prepare_public_store_owner_activation_v1(
  p_company_id uuid,p_document_id uuid,p_document_version_id uuid,p_share_link_id uuid,p_idempotency_key uuid,
  p_store_name text,p_representative_name text,p_address text,p_phone text,p_business_registration_number text,p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_request public.store_owner_activation_requests%rowtype; v_number text:=regexp_replace(coalesce(p_business_registration_number,''),'\D','','g');
begin
  if p_invite_token_hash is null or p_invite_token_hash !~ '^[0-9a-f]{64}$' or length(v_number)<>10
    or nullif(btrim(p_store_name),'') is null or length(p_store_name)>100 or nullif(btrim(p_representative_name),'') is null
    or length(p_representative_name)>50 or nullif(btrim(p_address),'') is null or length(p_address)>300
    or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{9,11}$' then raise exception 'public_store_profile_required'; end if;
  perform 1 from public.pricing_document_share_links l
    join public.pricing_documents d on d.company_id=l.company_id and d.id=l.document_id and d.archived_at is null
    join public.pricing_document_versions v on v.company_id=l.company_id and v.document_id=l.document_id and v.id=l.document_version_id
    where l.company_id=p_company_id and l.id=p_share_link_id and l.document_id=p_document_id and l.document_version_id=p_document_version_id
      and l.revoked_at is null and l.expires_at>clock_timestamp()
      and coalesce(v.content->>'validUntil','')~'^\d{4}-\d{2}-\d{2}$'
      and (v.content->>'validUntil')::date >= (clock_timestamp() at time zone 'Asia/Seoul')::date for share of l;
  if not found then raise exception 'public_document_onboarding_not_available'; end if;
  if exists(select 1 from public.normalized_customers where company_id=p_company_id and regexp_replace(coalesce(business_registration_number,''),'\D','','g')=v_number)
    or exists(select 1 from public.store_accounts where company_id=p_company_id and business_registration_number=v_number) then
    raise exception 'public_store_business_number_exists';
  end if;
  select * into v_request from public.store_owner_activation_requests where company_id=p_company_id and public_idempotency_key=p_idempotency_key for update;
  if found then
    if v_request.document_id<>p_document_id or v_request.document_version_id<>p_document_version_id or v_request.share_link_id<>p_share_link_id
      or v_request.business_registration_number<>v_number or v_request.store_name<>btrim(p_store_name)
      or v_request.representative_name<>btrim(p_representative_name) or v_request.address<>btrim(p_address)
      or v_request.phone<>regexp_replace(p_phone,'\D','','g') then raise exception 'public_store_retry_mismatch'; end if;
    if v_request.consumed_at is not null or v_request.cancelled_at is not null or v_request.expires_at<=clock_timestamp() then raise exception 'store_owner_activation_not_available'; end if;
    update public.store_owner_activation_requests set invite_token_hash=p_invite_token_hash where id=v_request.id returning * into v_request;
  else
    insert into public.store_owner_activation_requests(company_id,invite_token_hash,public_idempotency_key,document_id,document_version_id,share_link_id,
      store_name,representative_name,address,phone,business_registration_number)
    values(p_company_id,p_invite_token_hash,p_idempotency_key,p_document_id,p_document_version_id,p_share_link_id,btrim(p_store_name),
      btrim(p_representative_name),btrim(p_address),regexp_replace(p_phone,'\D','','g'),v_number) returning * into v_request;
  end if;
  return jsonb_build_object('customerId',null,'storeAccountId',v_request.store_account_id,'expiresAt',v_request.expires_at);
end $$;

create function public.activate_store_owner_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,
  p_business_registration_number text,p_business_status text,p_verified_at timestamptz,p_verification_request_id text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_request public.store_owner_activation_requests%rowtype; v_customer_number text; v_owner jsonb; v_import uuid; v_member public.store_account_members%rowtype;
begin
  select * into v_request from public.store_owner_activation_requests
    where invite_token_hash=p_invite_token_hash and consumed_at is null and cancelled_at is null for update;
  if not found or v_request.expires_at<=clock_timestamp() then raise exception 'store_owner_activation_not_available'; end if;
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

alter table public.store_owner_activation_requests enable row level security;
revoke all on public.store_owner_activation_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.store_owner_activation_requests to service_role;
revoke all on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.prepare_public_store_owner_activation_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.prepare_public_store_owner_activation_v1(uuid,uuid,uuid,uuid,uuid,text,text,text,text,text,text) to service_role;
grant execute on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) to service_role;

commit;
