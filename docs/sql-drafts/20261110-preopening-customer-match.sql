-- DRAFT ONLY. Replaces the already-applied preopening activation function after separate DB approval.
-- Keep STORE_PREOPENING_ENABLED=OFF until the replacement and operating verification are complete.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

create or replace function public.activate_preopening_store_owner_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,p_delivery_territory_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.store_owner_activation_requests%rowtype; v_import uuid; v_customer uuid; v_member uuid; v_candidates uuid[];
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
  -- Serialize identical company/name/address onboarding attempts without adding a speculative schema object.
  perform pg_advisory_xact_lock(hashtextextended(r.company_id::text||'|'||lower(btrim(r.store_name))||'|'||lower(btrim(r.address)),0));
  select coalesce(array_agg(id order by id),'{}'::uuid[]) into v_candidates
    from public.normalized_customers where company_id=r.company_id
      and lower(btrim(customer_name))=lower(btrim(r.store_name)) and lower(btrim(coalesce(address,'')))=lower(btrim(r.address));
  if cardinality(v_candidates)>1 then raise exception 'public_store_customer_match_needs_review'; end if;
  if cardinality(v_candidates)=1 then
    v_customer:=v_candidates[1];
    if exists(select 1 from public.store_accounts where company_id=r.company_id and customer_id=v_customer)
      then raise exception 'public_store_customer_already_linked'; end if;
    if p_delivery_territory_id is not null then
      update public.normalized_customers set delivery_territory_id=p_delivery_territory_id
        where company_id=r.company_id and id=v_customer and delivery_territory_id is null;
    end if;
  else
    insert into public.customer_imports(company_id,source,row_count,status,quality_score,completed_at)
      values(r.company_id,'store_owner_onboarding',1,'completed',100,clock_timestamp()) returning id into v_import;
    insert into public.normalized_customers(company_id,import_id,customer_name,address,phone,business_registration_number,
      representative_name,normalized_key,delivery_territory_id)
      values(r.company_id,v_import,r.store_name,r.address,r.phone,null,r.representative_name,
        'preopening:'||r.store_account_id::text,p_delivery_territory_id) returning id into v_customer;
  end if;
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
notify pgrst,'reload schema';
commit;
