-- REVIEW ONLY / OFF. Separate operating DB approval required; do not execute from this chat.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
do $$ begin
  if to_regprocedure('public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text)') is null
    or to_regclass('public.store_order_territory_rules') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='delivery_territories' and column_name='is_active')
    then raise exception 'public_owner_delivery_prerequisites_required'; end if;
end $$;
do $$ begin
  if not (has_table_privilege('service_role','public.delivery_territories','SELECT')
    and has_table_privilege('service_role','public.delivery_territories','UPDATE')
    and has_table_privilege('service_role','public.store_order_territory_rules','SELECT')
    and has_table_privilege('service_role','public.store_order_territory_rules','UPDATE')
    and has_table_privilege('service_role','public.normalized_customers','UPDATE'))
    then raise exception 'public_owner_delivery_invoker_privileges_required'; end if;
end $$;

-- Address matching stays in the existing server assignCustomerByTerritory helper.
-- SQL rechecks the company/rule under locks and commits only a NEW public owner's territory.
create function public.activate_public_store_owner_with_delivery_v1(
  p_invite_token_hash text,p_auth_user_id uuid,p_terms_version text,p_terms_accepted_at timestamptz,
  p_business_registration_number text,p_business_status text,p_verified_at timestamptz,
  p_verification_request_id text,p_delivery_territory_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare r public.store_owner_activation_requests%rowtype; activated jsonb;
begin
  select * into r from public.store_owner_activation_requests where invite_token_hash=p_invite_token_hash
    and consumed_at is null and cancelled_at is null and expires_at>clock_timestamp() for update;
  if not found or r.public_idempotency_key is null or r.customer_id is not null
    or p_verification_request_id is null or p_verification_request_id not like 'public-delivery-v1:%'
    then raise exception 'public_delivery_activation_unavailable'; end if;
  perform 1 from public.delivery_territories where company_id=r.company_id and id=p_delivery_territory_id
    and is_active for share;
  if not found then raise exception 'public_delivery_territory_unavailable'; end if;
  perform 1 from public.store_order_territory_rules where company_id=r.company_id and territory_id=p_delivery_territory_id
    and cardinality(delivery_weekdays) between 1 and 7 for share;
  if not found then raise exception 'public_delivery_rules_unavailable'; end if;
  activated:=public.activate_store_owner_v1(p_invite_token_hash,p_auth_user_id,p_terms_version,p_terms_accepted_at,
    p_business_registration_number,p_business_status,p_verified_at,p_verification_request_id);
  update public.normalized_customers c set delivery_territory_id=p_delivery_territory_id
    from public.store_accounts a where a.company_id=r.company_id and a.id=(activated->>'storeAccountId')::uuid
      and c.company_id=a.company_id and c.id=a.customer_id
      and (c.delivery_territory_id is null or c.delivery_territory_id=p_delivery_territory_id);
  if not found then raise exception 'public_delivery_territory_unavailable'; end if;
  return activated;
end $$;
revoke all on function public.activate_public_store_owner_with_delivery_v1(text,uuid,text,timestamptz,text,text,timestamptz,text,uuid)
  from public,anon,authenticated,service_role;
grant execute on function public.activate_public_store_owner_with_delivery_v1(text,uuid,text,timestamptz,text,text,timestamptz,text,uuid)
  to service_role;
notify pgrst,'reload schema';
commit;
