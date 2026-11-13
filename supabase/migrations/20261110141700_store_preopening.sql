-- DRAFT ONLY. Requires separate operating DB approval. Keep STORE_PREOPENING_ENABLED=OFF.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$ begin
  if to_regprocedure('public.complete_public_store_owner_profile_v1(text,text,text,text,text,text)') is null
    or to_regclass('public.store_owner_activation_requests') is null
    or to_regclass('public.store_accounts') is null
    then raise exception 'store_owner_activation_prerequisites_required'; end if;
end $$;

alter table public.store_accounts
  alter column business_registration_number drop not null,
  alter column business_status_verified_at drop not null,
  alter column verification_request_id drop not null;
alter table public.store_accounts drop constraint store_accounts_business_status_check;
alter table public.store_accounts add constraint store_accounts_business_status_check
  check (business_status in ('active','closed','suspended','registration_pending'));
alter table public.store_accounts add constraint store_accounts_registration_pending_check
  check ((business_status <> 'registration_pending' or
    (business_registration_number is null and business_status_verified_at is null and verification_request_id is null))
    and (business_status <> 'active' or
    (business_registration_number is not null and business_status_verified_at is not null and verification_request_id is not null)));
alter table public.store_owner_activation_requests drop constraint store_owner_activation_requests_check2;
alter table public.store_owner_activation_requests add constraint store_owner_activation_requests_check2
  check ((customer_id is not null and prepared_by_company_member_id is not null and public_idempotency_key is null)
    or (prepared_by_company_member_id is null and public_idempotency_key is not null
      and num_nonnulls(document_id,document_version_id,share_link_id)=3
      and (num_nonnulls(store_name,representative_name,address,phone,business_registration_number)=0
        or (num_nonnulls(store_name,representative_name,address,phone)=4
          and business_registration_number is null)
        or num_nonnulls(store_name,representative_name,address,phone,business_registration_number)=5)));

create or replace function public.complete_public_store_owner_profile_v1(
  p_invite_token_hash text,p_store_name text,p_representative_name text,p_address text,p_phone text,p_business_registration_number text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_request public.store_owner_activation_requests%rowtype;
  v_number text:=nullif(regexp_replace(coalesce(p_business_registration_number,''),'\D','','g'),'');
begin
  if (v_number is not null and length(v_number)<>10)
    or nullif(btrim(p_store_name),'') is null or length(p_store_name)>100
    or nullif(btrim(p_representative_name),'') is null or length(p_representative_name)>50
    or nullif(btrim(p_address),'') is null or length(p_address)>300
    or regexp_replace(coalesce(p_phone,''),'\D','','g') !~ '^\d{9,11}$'
    then raise exception 'public_store_profile_required'; end if;
  select * into v_request from public.store_owner_activation_requests where invite_token_hash=p_invite_token_hash
    and public_idempotency_key is not null and consumed_at is null and cancelled_at is null for update;
  if not found or v_request.expires_at<=clock_timestamp() then raise exception 'store_owner_activation_not_available'; end if;
  if v_number is not null and (exists(select 1 from public.normalized_customers where company_id=v_request.company_id
      and regexp_replace(coalesce(business_registration_number,''),'\D','','g')=v_number)
    or exists(select 1 from public.store_accounts where company_id=v_request.company_id and business_registration_number=v_number))
    then raise exception 'public_store_business_number_exists'; end if;
  if v_request.store_name is not null and row(v_request.store_name,v_request.representative_name,v_request.address,v_request.phone,v_request.business_registration_number)
    is distinct from row(btrim(p_store_name),btrim(p_representative_name),btrim(p_address),regexp_replace(p_phone,'\D','','g'),v_number)
    then raise exception 'public_store_retry_mismatch'; end if;
  update public.store_owner_activation_requests set store_name=btrim(p_store_name),representative_name=btrim(p_representative_name),
    address=btrim(p_address),phone=regexp_replace(p_phone,'\D','','g'),business_registration_number=v_number
    where id=v_request.id returning * into v_request;
  return jsonb_build_object('companyId',v_request.company_id,'storeAccountId',v_request.store_account_id);
end $$;

create function public.activate_preopening_store_owner_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,p_delivery_territory_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.store_owner_activation_requests%rowtype; v_import uuid; v_customer uuid; v_member uuid;
begin
  select * into r from public.store_owner_activation_requests where invite_token_hash=p_invite_token_hash
    and public_idempotency_key is not null and consumed_at is null and cancelled_at is null for update;
  if not found or r.expires_at<=clock_timestamp() or r.customer_id is not null or r.business_registration_number is not null
    or num_nonnulls(r.store_name,r.representative_name,r.address,r.phone)<>4
    then raise exception 'preopening_activation_unavailable'; end if;
  if nullif(btrim(p_terms_version),'') is null or length(p_terms_version)>50
    or p_terms_accepted_at<r.prepared_at or p_terms_accepted_at>clock_timestamp()+interval '1 minute'
    then raise exception 'store_terms_acceptance_required'; end if;
  perform 1 from public.app_users where id=p_auth_user_id and status='active' for share;
  if not found then raise exception 'auth_user_not_found'; end if;
  if p_delivery_territory_id is not null then
    perform 1 from public.delivery_territories where company_id=r.company_id and id=p_delivery_territory_id and is_active for share;
    if not found then raise exception 'public_delivery_territory_unavailable'; end if;
    perform 1 from public.store_order_territory_rules where company_id=r.company_id and territory_id=p_delivery_territory_id
      and cardinality(delivery_weekdays) between 1 and 7 for share;
    if not found then raise exception 'public_delivery_rules_unavailable'; end if;
  end if;
  insert into public.customer_imports(company_id,source,row_count,status,quality_score,completed_at)
    values(r.company_id,'store_owner_onboarding',1,'completed',100,clock_timestamp()) returning id into v_import;
  insert into public.normalized_customers(company_id,import_id,customer_name,address,phone,business_registration_number,
    representative_name,normalized_key,delivery_territory_id)
    values(r.company_id,v_import,r.store_name,r.address,r.phone,null,r.representative_name,
      'preopening:'||r.store_account_id::text,p_delivery_territory_id) returning id into v_customer;
  update public.store_owner_activation_requests set customer_id=v_customer where id=r.id;
  insert into public.store_accounts(id,company_id,customer_id,business_registration_number,business_status,
    business_status_verified_at,verification_request_id,terms_version,terms_accepted_at,status)
    values(r.store_account_id,r.company_id,v_customer,null,'registration_pending',null,null,p_terms_version,p_terms_accepted_at,'active');
  insert into public.store_account_members(company_id,store_account_id,auth_user_id,role,status,joined_at)
    values(r.company_id,r.store_account_id,p_auth_user_id,'owner','active',clock_timestamp()) returning id into v_member;
  insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key)
    values(r.company_id,r.store_account_id,v_member,'join','public-owner-onboarding:'||r.share_link_id::text);
  update public.store_accounts set terms_accepted_by_member_id=v_member where company_id=r.company_id and id=r.store_account_id;
  update public.store_owner_activation_requests set consumed_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('companyId',r.company_id,'storeAccountId',r.store_account_id,'ownerMemberId',v_member);
end $$;
revoke all on function public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid) from public,anon,authenticated,service_role;
grant execute on function public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid) to service_role;

-- Member ordering keeps all company/member checks. Only widen the NTS status guard.
-- Abort the transaction if any installed definition differs from the reviewed version.
do $$ declare r record; definition text; needle constant text := 'business_status=''active'''; begin
  if (select count(*) from pg_proc where pronamespace='public'::regnamespace and proname='place_store_member_order') <> 1
    then raise exception 'store_preopening_rpc_prerequisites_required'; end if;
  for r in select oid, proname from pg_proc where pronamespace='public'::regnamespace and proname='place_store_member_order' loop
    definition := pg_get_functiondef(r.oid);
    if (length(definition)-length(replace(definition,needle,'')))/length(needle) <> 1
      then raise exception 'store_preopening_rpc_guard_changed: %',r.proname; end if;
    execute replace(definition,needle,'business_status in (''active'',''registration_pending'')');
  end loop;
end $$;
notify pgrst,'reload schema';
commit;
