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
  customer_id uuid not null,
  store_account_id uuid not null default gen_random_uuid(),
  invite_token_hash text not null unique check(invite_token_hash ~ '^[0-9a-f]{64}$'),
  prepared_by_company_member_id uuid not null,
  prepared_at timestamptz not null default clock_timestamp(),
  expires_at timestamptz not null default clock_timestamp() + interval '30 minutes',
  consumed_at timestamptz,
  cancelled_at timestamptz,
  unique(company_id,store_account_id),
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  foreign key(company_id,prepared_by_company_member_id) references public.company_members(company_id,id) on delete cascade,
  check(expires_at>prepared_at),
  check(num_nonnulls(consumed_at,cancelled_at)<=1)
);
create unique index store_owner_activation_one_open_customer
  on public.store_owner_activation_requests(company_id,customer_id)
  where consumed_at is null and cancelled_at is null;

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

create function public.activate_store_owner_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,
  p_business_registration_number text,p_business_status text,p_verified_at timestamptz,p_verification_request_id text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_request public.store_owner_activation_requests%rowtype; v_customer_number text; v_owner jsonb;
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
  select regexp_replace(coalesce(business_registration_number,''),'\D','','g') into v_customer_number
    from public.normalized_customers where company_id=v_request.company_id and id=v_request.customer_id for share;
  if v_customer_number is distinct from p_business_registration_number then raise exception 'store_business_number_mismatch'; end if;
  perform 1 from public.app_users where id=p_auth_user_id and status='active' for share;
  if not found then raise exception 'auth_user_not_found'; end if;
  insert into public.store_accounts(id,company_id,customer_id,business_registration_number,business_status,
    business_status_verified_at,verification_request_id,terms_version,terms_accepted_at,status)
  values(v_request.store_account_id,v_request.company_id,v_request.customer_id,v_customer_number,'active',
    p_verified_at,p_verification_request_id,p_terms_version,p_terms_accepted_at,'active');
  v_owner:=public.provision_store_owner_v1(v_request.company_id,v_request.store_account_id,p_auth_user_id,v_request.prepared_by_company_member_id);
  update public.store_accounts set terms_accepted_by_member_id=(v_owner->>'id')::uuid
    where company_id=v_request.company_id and id=v_request.store_account_id;
  update public.store_owner_activation_requests set consumed_at=clock_timestamp() where id=v_request.id;
  return jsonb_build_object('companyId',v_request.company_id,'storeAccountId',v_request.store_account_id,'ownerMemberId',v_owner->>'id');
end $$;

alter table public.store_owner_activation_requests enable row level security;
revoke all on public.store_owner_activation_requests from public,anon,authenticated,service_role;
grant select,insert,update on public.store_owner_activation_requests to service_role;
revoke all on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) from public,anon,authenticated,service_role;
revoke all on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) from public,anon,authenticated,service_role;
grant execute on function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text) to service_role;
grant execute on function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text) to service_role;

commit;
