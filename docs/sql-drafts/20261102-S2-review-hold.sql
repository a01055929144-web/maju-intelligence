-- REVIEW ONLY. New operating DB approval required. Do not execute in production.
-- Replaces only record_pricing_document_acceptance; existing grants and signature are preserved.
begin;
do $$ begin
  if to_regprocedure('public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb)') is null then
    raise exception 'S2 base acceptance function is required';
  end if;
end $$;
create or replace function public.record_pricing_document_acceptance(p_company_id uuid,p_document_id uuid,p_document_version_id uuid,p_idempotency_key uuid,p_request_fingerprint text,p_accepted_via text,p_customer_id uuid,p_lead_id uuid default null,p_send_id uuid default null,p_needs_review boolean default false,p_review_reason text default null,p_storefront_link_id uuid default null,p_customer_profile jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.pricing_document_acceptance_requests%rowtype; d public.pricing_documents%rowtype; v_version public.pricing_document_versions%rowtype; v_price_link uuid; l jsonb; v_customer uuid:=p_customer_id; v_import uuid; v_lead uuid:=p_lead_id; v_match_count integer:=0; v_customer_match_count integer:=0; v_name text:=nullif(btrim(p_customer_profile->>'businessName'),''); v_phone text:=regexp_replace(coalesce(p_customer_profile->>'phone',''),'\D','','g'); v_business_number text:=regexp_replace(coalesce(p_customer_profile->>'businessRegistrationNumber',''),'\D','','g'); v_address text:=nullif(btrim(p_customer_profile->>'address'),''); v_needs_review boolean:=p_needs_review; v_review_reason text:=p_review_reason;
begin
  if p_idempotency_key is null or length(coalesce(p_request_fingerprint,'')) not between 16 and 200 or p_accepted_via not in ('store','staff','kakao_start','kakao_login') then raise exception 'invalid_acceptance_request'; end if;
  select * into r from public.pricing_document_acceptance_requests where company_id=p_company_id and idempotency_key=p_idempotency_key for update;
  if found then if r.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency_conflict'; end if; return r.result; end if;
  select * into d from public.pricing_documents where company_id=p_company_id and id=p_document_id for share;
  if not found or d.kind not in ('sheet','quote') then raise exception 'document_not_acceptable'; end if;
  select * into v_version from public.pricing_document_versions where company_id=p_company_id and document_id=p_document_id and id=p_document_version_id for share;
  if not found then raise exception 'document_version_not_found'; end if;
  if v_version.content->>'kind' is distinct from d.kind
    or coalesce(v_version.content->>'validUntil','') !~ '^\d{4}-\d{2}-\d{2}$'
    or (v_version.content->>'validUntil')::date < (clock_timestamp() at time zone 'Asia/Seoul')::date then
    raise exception 'document_version_not_acceptable';
  end if;
  if v_lead is null and p_send_id is not null then select lead_id into v_lead from public.pricing_document_sends where company_id=p_company_id and id=p_send_id for share; end if;
  if v_lead is null and (v_phone<>'' or (v_name is not null and v_address is not null)) then
    select count(*),(array_agg(id order by id))[1] into v_match_count,v_lead from public.business_permit_leads
      where company_id=p_company_id and is_active and (
        (v_phone<>'' and regexp_replace(coalesce(phone,''),'\D','','g')=v_phone)
        or (v_name is not null and v_address is not null and lower(btrim(business_name))=lower(v_name) and lower(btrim(coalesce(address,'')))=lower(v_address))
      );
    if v_match_count>1 then v_lead:=null; v_needs_review:=true; v_review_reason:='ambiguous_lead_match'; end if;
  end if;
  if v_lead is null and not v_needs_review then
    if v_name is null or v_phone='' or v_address is null then raise exception 'public_acceptance_profile_required'; end if;
    insert into public.business_permit_leads(company_id,business_name,address,phone,source)
      values(p_company_id,v_name,v_address,v_phone,'pricing_sheet_acceptance') returning id into v_lead;
  end if;
  if v_customer is null then
    if v_name is null or v_phone='' or v_address is null then raise exception 'customer_profile_required'; end if;
    select count(*),(array_agg(id order by id))[1] into v_customer_match_count,v_customer
      from public.normalized_customers where company_id=p_company_id and (
        (v_business_number<>'' and regexp_replace(coalesce(business_registration_number,''),'\D','','g')=v_business_number)
        or (lower(btrim(customer_name))=lower(v_name) and lower(btrim(coalesce(address,'')))=lower(v_address))
      );
    if v_customer_match_count>1 then v_customer:=null; v_needs_review:=true; v_review_reason:='ambiguous_customer_match'; end if;
  end if;
  if v_customer is null and v_customer_match_count>1 then
    insert into public.pricing_document_acceptance_requests(company_id,idempotency_key,request_fingerprint,document_id,document_version_id,send_id,lead_id,customer_id,document_kind,accepted_via,needs_review,review_reason,result)
    values(p_company_id,p_idempotency_key,p_request_fingerprint,p_document_id,p_document_version_id,p_send_id,v_lead,null,d.kind,p_accepted_via,true,v_review_reason,
      jsonb_build_object('customerId',null,'leadId',v_lead,'documentVersionId',p_document_version_id,'kind',d.kind,'needsReview',true,'orderEnabled',false)) returning * into r;
    return r.result;
  end if;
  if v_customer is null then
    insert into public.customer_imports(company_id,source,row_count,status,quality_score,completed_at)
      values(p_company_id,'pricing_acceptance',1,'completed',100,clock_timestamp()) returning id into v_import;
    insert into public.normalized_customers(company_id,import_id,customer_name,address,phone,business_registration_number,normalized_key)
      values(p_company_id,v_import,v_name,v_address,v_phone,nullif(v_business_number,''),coalesce(nullif(v_business_number,''),'pricing_acceptance:'||encode(extensions.digest(lower(v_name)||'|'||lower(v_address)||'|'||v_phone,'sha256'),'hex')))
      on conflict(company_id,normalized_key) do nothing
      returning id into v_customer;
    if v_customer is null then
      select id into v_customer from public.normalized_customers
        where company_id=p_company_id and normalized_key=coalesce(nullif(v_business_number,''),'pricing_acceptance:'||encode(extensions.digest(lower(v_name)||'|'||lower(v_address)||'|'||v_phone,'sha256'),'hex'));
    end if;
  end if;
  if v_lead is not null then
    update public.business_permit_leads set matched_customer_id=v_customer,is_duplicate=true,status='거래처 전환',updated_at=clock_timestamp()
      where company_id=p_company_id and id=v_lead and (matched_customer_id is null or matched_customer_id=v_customer);
    if not found then v_needs_review:=true; v_review_reason:='lead_customer_mismatch'; end if;
  end if;
  -- Hold every review result before customer profile, price-link, agreement or ordering-link writes.
  if v_needs_review then
    insert into public.pricing_document_acceptance_requests(company_id,idempotency_key,request_fingerprint,document_id,document_version_id,send_id,lead_id,customer_id,document_kind,accepted_via,needs_review,review_reason,result)
    values(p_company_id,p_idempotency_key,p_request_fingerprint,p_document_id,p_document_version_id,p_send_id,v_lead,v_customer,d.kind,p_accepted_via,true,v_review_reason,
      jsonb_build_object('customerId',v_customer,'leadId',v_lead,'documentVersionId',p_document_version_id,'kind',d.kind,'needsReview',true,'pricingDocumentLinkId',null,'storefrontLinkId',null,'orderEnabled',false)) returning * into r;
    return r.result;
  end if;
  update public.normalized_customers set
    address=coalesce(nullif(address,''),v_address), phone=coalesce(nullif(phone,''),nullif(v_phone,'')),
    delivery_recipient_name=coalesce(nullif(delivery_recipient_name,''),nullif(btrim(p_customer_profile->>'deliveryRecipientName'),'')),
    delivery_contact_phone=coalesce(nullif(delivery_contact_phone,''),nullif(regexp_replace(coalesce(p_customer_profile->>'deliveryContactPhone',''),'\D','','g'),'')),
    preferred_delivery_time=coalesce(nullif(preferred_delivery_time,''),nullif(btrim(p_customer_profile->>'preferredDeliveryTime'),'')),
    delivery_drop_location=coalesce(nullif(delivery_drop_location,''),nullif(btrim(p_customer_profile->>'deliveryDropLocation'),''))
    where company_id=p_company_id and id=v_customer;
  if not found then raise exception 'customer_not_found'; end if;
  insert into public.pricing_document_acceptance_requests(company_id,idempotency_key,request_fingerprint,document_id,document_version_id,send_id,lead_id,customer_id,document_kind,accepted_via,needs_review,review_reason,result)
  values(p_company_id,p_idempotency_key,p_request_fingerprint,p_document_id,p_document_version_id,p_send_id,v_lead,v_customer,d.kind,p_accepted_via,v_needs_review,v_review_reason,
    '{}') returning * into r;
  update public.customer_pricing_document_links set active=false,ended_at=clock_timestamp()
    where company_id=p_company_id and customer_id=v_customer and document_kind=d.kind and active;
  insert into public.customer_pricing_document_links(company_id,customer_id,document_id,document_version_id,document_kind,price_priority)
    values(p_company_id,v_customer,p_document_id,p_document_version_id,d.kind,case when d.kind='quote' then 1 else 2 end) returning id into v_price_link;
  if d.kind='quote' then
    for l in select value from public.pricing_document_versions v cross join lateral jsonb_array_elements(v.content->'lines')
      where v.company_id=p_company_id and v.id=p_document_version_id and coalesce((value->>'visible')::boolean,false)
    loop
      update public.customer_price_agreements set
        status=case when effective_from>=current_date then 'cancelled' else 'ended' end,
        effective_until=case when effective_from>=current_date then null else current_date-1 end,
        ended_at=clock_timestamp(),updated_at=clock_timestamp()
        where company_id=p_company_id and customer_id=v_customer and product_catalog_id=(l->>'productId')::uuid and status='active';
      insert into public.customer_price_agreements(company_id,customer_id,product_catalog_id,sales_unit,unit_price,tax_type,price_includes_tax,effective_from,status,source_pricing_document_version_id,created_by_name)
      values(p_company_id,v_customer,(l->>'productId')::uuid,l->>'unit',(l->>'price')::bigint,l->>'taxType',false,current_date,'active',p_document_version_id,'pricing_document_acceptance');
    end loop;
  end if;
  if p_storefront_link_id is not null then
    update public.storefront_links set acceptance_request_id=r.id,can_order=true
      where company_id=p_company_id and id=p_storefront_link_id and customer_id=v_customer and document_version_id=p_document_version_id and revoked_at is null;
    if not found then raise exception 'storefront_link_not_found'; end if;
  end if;
  r.result:=jsonb_build_object('customerId',v_customer,'leadId',v_lead,'documentVersionId',p_document_version_id,'kind',d.kind,'needsReview',v_needs_review,'pricingDocumentLinkId',v_price_link,'storefrontLinkId',p_storefront_link_id);
  update public.pricing_document_acceptance_requests set result=r.result where company_id=p_company_id and id=r.id;
  if p_send_id is not null then update public.pricing_document_sends set acceptance_status='accepted',accepted_at=clock_timestamp() where company_id=p_company_id and id=p_send_id; end if;
  -- Only requests without a review hold reach price/link side effects.
  return r.result;
exception when unique_violation then
  select * into r from public.pricing_document_acceptance_requests where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if found then
    if r.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency_conflict'; end if;
    return r.result;
  end if;
  raise;
end $$;

commit;
