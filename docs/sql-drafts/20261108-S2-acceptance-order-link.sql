-- Draft only. Do not apply to production without explicit approval.
begin;

create or replace function public.accept_pricing_document_and_issue_storefront_link(
  p_company_id uuid, p_document_id uuid, p_document_version_id uuid,
  p_idempotency_key uuid, p_request_fingerprint text, p_accepted_via text,
  p_customer_id uuid, p_lead_id uuid default null, p_send_id uuid default null,
  p_needs_review boolean default false, p_review_reason text default null,
  p_customer_profile jsonb default '{}', p_link_id uuid default null,
  p_link_nonce text default null, p_link_hash text default null,
  p_link_expires_at timestamptz default null, p_actor_user_id uuid default null,
  p_actor_key text default null
) returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare
  v_result jsonb;
  v_customer uuid;
  v_request_id uuid;
  v_link record;
begin
  v_result := public.record_pricing_document_acceptance(
    p_company_id,p_document_id,p_document_version_id,p_idempotency_key,
    p_request_fingerprint,p_accepted_via,p_customer_id,p_lead_id,p_send_id,
    p_needs_review,p_review_reason,null,p_customer_profile
  );
  select id into v_request_id from public.pricing_document_acceptance_requests
    where company_id=p_company_id and idempotency_key=p_idempotency_key for update;
  if v_result ? 'orderEnabled' then
    return v_result;
  end if;
  v_customer := nullif(v_result->>'customerId','')::uuid;
  if v_customer is null then
    v_result := v_result || jsonb_build_object('orderEnabled',false);
    update public.pricing_document_acceptance_requests set result=v_result
      where company_id=p_company_id and id=v_request_id;
    return v_result;
  end if;
  if not exists(select 1 from public.store_order_settings where company_id=p_company_id) then
    v_result := v_result || jsonb_build_object('orderEnabled',false,'orderSetupRequired',true);
    update public.pricing_document_acceptance_requests set result=v_result
      where company_id=p_company_id and id=v_request_id;
    return v_result;
  end if;
  select * into v_link from public.issue_storefront_links(
    p_company_id,p_document_version_id,
    jsonb_build_array(jsonb_build_object('customerId',v_customer,'id',p_link_id,'nonce',p_link_nonce,'hash',p_link_hash)),
    p_link_expires_at,p_actor_user_id,p_actor_key
  );
  update public.storefront_links
    set acceptance_request_id=coalesce(acceptance_request_id,v_request_id),can_order=true
    where company_id=p_company_id and id=v_link.issued_link_id
      and customer_id=v_customer and document_version_id=p_document_version_id;
  if not found then raise exception 'storefront_link_not_found'; end if;
  v_result := v_result || jsonb_build_object(
    'orderEnabled',true,
    'storefrontLinkId',v_link.issued_link_id,
    'storefrontTokenNonce',v_link.issued_token_nonce,
    'storefrontTokenHash',v_link.issued_token_hash
  );
  update public.pricing_document_acceptance_requests set result=v_result
    where company_id=p_company_id and id=v_request_id;
  return v_result;
end $$;

revoke all on function public.accept_pricing_document_and_issue_storefront_link(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,jsonb,uuid,text,text,timestamptz,uuid,text) from public,anon,authenticated;
grant execute on function public.accept_pricing_document_and_issue_storefront_link(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,jsonb,uuid,text,text,timestamptz,uuid,text) to service_role;

commit;
