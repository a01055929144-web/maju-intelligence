-- DRAFT ONLY. Requires separate operating DB approval. Keep STORE_PREOPENING_ENABLED=OFF.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regprocedure('public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)') is null
    or to_regprocedure('public.provision_store_owner_v1(uuid,uuid,uuid,uuid)') is null
    or to_regclass('public.store_owner_activation_requests') is null
  then raise exception 's3d_preopening_prerequisites_required'; end if;
end $$;

create or replace function public.activate_preopening_store_owner_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,p_delivery_territory_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.store_owner_activation_requests%rowtype; v_owner jsonb;
begin
  select * into r from public.store_owner_activation_requests
    where invite_token_hash=p_invite_token_hash
      and prepared_by_company_member_id is not null
      and public_idempotency_key is null
      and customer_id is not null
      and consumed_at is null and cancelled_at is null
    for update;
  if not found or r.expires_at<=clock_timestamp()
    then raise exception 'preopening_activation_unavailable'; end if;
  if nullif(btrim(p_terms_version),'') is null or length(p_terms_version)>50
    or p_terms_accepted_at<r.prepared_at or p_terms_accepted_at>clock_timestamp()+interval '1 minute'
    then raise exception 'store_terms_acceptance_required'; end if;
  perform 1 from public.app_users where id=p_auth_user_id and status='active' for share;
  if not found then raise exception 'auth_user_not_found'; end if;
  perform 1 from public.normalized_customers where company_id=r.company_id and id=r.customer_id for share;
  if not found or exists(select 1 from public.store_accounts where company_id=r.company_id and customer_id=r.customer_id)
    then raise exception 'preopening_activation_unavailable'; end if;
  if p_delivery_territory_id is not null then
    perform 1 from public.delivery_territories
      where company_id=r.company_id and id=p_delivery_territory_id and is_active for share;
    if not found then raise exception 'public_delivery_territory_unavailable'; end if;
    perform 1 from public.store_order_territory_rules
      where company_id=r.company_id and territory_id=p_delivery_territory_id
        and cardinality(delivery_weekdays) between 1 and 7 for share;
    if not found then raise exception 'public_delivery_rules_unavailable'; end if;
    update public.normalized_customers set delivery_territory_id=p_delivery_territory_id
      where company_id=r.company_id and id=r.customer_id
        and (delivery_territory_id is null or delivery_territory_id=p_delivery_territory_id);
    if not found then raise exception 'public_delivery_territory_unavailable'; end if;
  end if;
  insert into public.store_accounts(id,company_id,customer_id,business_registration_number,business_status,
    business_status_verified_at,verification_request_id,terms_version,terms_accepted_at,status)
    values(r.store_account_id,r.company_id,r.customer_id,null,'registration_pending',null,null,
      p_terms_version,p_terms_accepted_at,'active');
  v_owner:=public.provision_store_owner_v1(r.company_id,r.store_account_id,p_auth_user_id,r.prepared_by_company_member_id);
  update public.store_accounts set terms_accepted_by_member_id=(v_owner->>'id')::uuid
    where company_id=r.company_id and id=r.store_account_id;
  update public.store_owner_activation_requests set consumed_at=clock_timestamp() where id=r.id;
  return jsonb_build_object('companyId',r.company_id,'storeAccountId',r.store_account_id,'ownerMemberId',v_owner->>'id');
end $$;

revoke all on function public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.activate_preopening_store_owner_v1(text,uuid,text,timestamptz,uuid) to service_role;
notify pgrst,'reload schema';
commit;
