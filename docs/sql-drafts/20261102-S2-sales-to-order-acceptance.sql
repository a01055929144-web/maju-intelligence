-- REVIEW-ONLY DRAFT. DB-APPROVED 전 운영 실행 금지.
-- QUOTE_ACCEPTANCE=false 동안 호출 경로를 연결하지 않는다.
begin;

alter table public.pricing_document_versions
  add constraint pricing_document_versions_company_document_id_key unique(company_id,document_id,id);

alter table public.normalized_customers
  add column if not exists delivery_recipient_name text,
  add column if not exists delivery_contact_phone text,
  add column if not exists preferred_delivery_time text,
  add column if not exists delivery_drop_location text;

alter table public.customer_price_agreements
  add column if not exists source_pricing_document_version_id uuid;
alter table public.customer_price_agreements
  add constraint customer_price_agreements_pricing_version_fk
  foreign key (company_id, source_pricing_document_version_id)
  references public.pricing_document_versions(company_id, id) on delete restrict;

create table public.pricing_document_sends (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null,
  document_version_id uuid not null,
  lead_id uuid,
  customer_id uuid,
  template_id text not null check (length(btrim(template_id)) between 1 and 100),
  layout text not null check (layout in ('auto','table','cards')),
  channel text not null check (channel in ('link','kakao','qr','print','staff')),
  acceptance_status text not null default 'sent' check (acceptance_status in ('sent','viewed','accepted','expired','cancelled')),
  idempotency_key uuid not null,
  sent_by_key text not null check (length(sent_by_key) between 1 and 200),
  sent_at timestamptz not null default clock_timestamp(),
  viewed_at timestamptz,
  accepted_at timestamptz,
  unique(company_id,id), unique(company_id,idempotency_key),
  check (num_nonnulls(lead_id, customer_id) = 1),
  foreign key(company_id,document_id) references public.pricing_documents(company_id,id) on delete restrict,
  foreign key(company_id,document_id,document_version_id) references public.pricing_document_versions(company_id,document_id,id) on delete restrict,
  foreign key(company_id,lead_id) references public.business_permit_leads(company_id,id) on delete restrict,
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete restrict
);

create table public.pricing_document_acceptance_requests (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  idempotency_key uuid not null,
  request_fingerprint text not null check (length(request_fingerprint) between 16 and 200),
  document_id uuid not null,
  document_version_id uuid not null,
  send_id uuid,
  lead_id uuid,
  customer_id uuid,
  document_kind text not null check(document_kind in ('sheet','quote')),
  accepted_via text not null check(accepted_via in ('store','staff','kakao_start','kakao_login')),
  needs_review boolean not null default false,
  review_reason text,
  result jsonb not null default '{}',
  created_at timestamptz not null default clock_timestamp(),
  unique(company_id,id), unique(company_id,idempotency_key),
  check ((not needs_review and review_reason is null) or (needs_review and length(btrim(review_reason)) between 1 and 200)),
  foreign key(company_id,document_id,document_version_id) references public.pricing_document_versions(company_id,document_id,id) on delete restrict,
  foreign key(company_id,send_id) references public.pricing_document_sends(company_id,id) on delete restrict,
  foreign key(company_id,lead_id) references public.business_permit_leads(company_id,id) on delete restrict,
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete restrict
);

alter table public.storefront_links add column acceptance_request_id uuid;
alter table public.storefront_links add constraint storefront_links_acceptance_request_fk
  foreign key(company_id,acceptance_request_id) references public.pricing_document_acceptance_requests(company_id,id) on delete restrict;
create unique index storefront_links_acceptance_request_uq on public.storefront_links(company_id,acceptance_request_id) where acceptance_request_id is not null;

create table public.pricing_public_request_audit (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  route_key text not null check(length(route_key) between 1 and 80),
  requester_hash text not null check(requester_hash ~ '^[0-9a-f]{64}$'),
  outcome text not null check(outcome in ('allowed','rate_limited','invalid')),
  occurred_at timestamptz not null default clock_timestamp()
);
create index pricing_public_request_rate_idx on public.pricing_public_request_audit(company_id,route_key,requester_hash,occurred_at desc);

create table public.customer_pricing_document_links (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, document_id uuid not null, document_version_id uuid not null,
  document_kind text not null check(document_kind in ('sheet','quote')),
  price_priority smallint not null check((document_kind='sheet' and price_priority=2) or (document_kind='quote' and price_priority=1)),
  active boolean not null default true, linked_at timestamptz not null default clock_timestamp(), ended_at timestamptz,
  unique(company_id,id),
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete restrict,
  foreign key(company_id,document_id,document_version_id) references public.pricing_document_versions(company_id,document_id,id) on delete restrict
);
create unique index customer_pricing_document_links_one_active on public.customer_pricing_document_links(company_id,customer_id,document_kind) where active;

create table public.store_accounts (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, business_registration_number text not null check(business_registration_number ~ '^\d{10}$'),
  business_status text not null check(business_status in ('active','closed','suspended')),
  business_status_verified_at timestamptz not null, verification_request_id text not null,
  terms_version text not null, terms_accepted_at timestamptz not null,
  status text not null default 'pending' check(status in ('pending','active','suspended','closed')),
  created_at timestamptz not null default clock_timestamp(), updated_at timestamptz not null default clock_timestamp(),
  unique(company_id,id), unique(company_id,customer_id),
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete restrict
);

create table public.store_account_members (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null, auth_user_id uuid, login_id_normalized text,
  role text not null check(role in ('owner','staff')), status text not null check(status in ('invited','active','removed')),
  invited_by_member_id uuid, invite_token_hash text, invited_at timestamptz, joined_at timestamptz,
  removed_by_member_id uuid, removed_at timestamptz, last_ordered_at timestamptz,
  unique(company_id,id), unique(login_id_normalized),
  foreign key(company_id,store_account_id) references public.store_accounts(company_id,id) on delete restrict,
  foreign key(company_id,store_account_id,invited_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  foreign key(company_id,store_account_id,removed_by_member_id) references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred,
  unique(company_id,store_account_id,id),
  check ((status='removed') = (removed_at is not null)),
  check (invite_token_hash is null or invite_token_hash ~ '^[0-9a-f]{64}$')
);
create unique index store_account_one_active_owner on public.store_account_members(company_id,store_account_id) where role='owner' and status='active';

alter table public.store_accounts add column terms_accepted_by_member_id uuid;
alter table public.store_accounts add constraint store_accounts_terms_member_fk foreign key(company_id,id,terms_accepted_by_member_id)
  references public.store_account_members(company_id,store_account_id,id) deferrable initially deferred;

create table public.store_account_member_events (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null, member_id uuid not null, event_type text not null check(event_type in ('invite','join','remove','owner_transfer','assisted_owner_transfer')),
  actor_member_id uuid, actor_user_key text, reason text, occurred_at timestamptz not null default clock_timestamp(),
  unique(company_id,id), check(num_nonnulls(actor_member_id,actor_user_key)=1),
  foreign key(company_id,store_account_id,member_id) references public.store_account_members(company_id,store_account_id,id) on delete restrict,
  foreign key(company_id,store_account_id,actor_member_id) references public.store_account_members(company_id,store_account_id,id) on delete restrict
);

alter table public.store_orders add column store_account_id uuid, add column ordered_by_member_id uuid;
alter table public.store_orders add constraint store_orders_account_fk foreign key(company_id,store_account_id) references public.store_accounts(company_id,id) on delete restrict;
alter table public.store_orders add constraint store_orders_actor_fk foreign key(company_id,store_account_id,ordered_by_member_id) references public.store_account_members(company_id,store_account_id,id) on delete restrict;
alter table public.store_orders add constraint store_orders_actor_pair_check check(num_nonnulls(store_account_id,ordered_by_member_id) in (0,2));

create function public.pricing_s2_validate_published_version() returns trigger language plpgsql set search_path=public,pg_temp as $$
declare l jsonb; p public.product_catalog%rowtype; seen uuid[] := '{}'; product_id uuid;
begin
  if jsonb_typeof(new.content->'lines') is distinct from 'array' then raise exception 'published_lines_required'; end if;
  for l in select * from jsonb_array_elements(new.content->'lines') loop
    if coalesce((l->>'visible')::boolean,false) then
      product_id := (l->>'productId')::uuid;
      if product_id=any(seen) then raise exception 'published_duplicate_product'; end if;
      seen:=array_append(seen,product_id);
      select * into p from public.product_catalog where company_id=new.company_id and id=product_id and is_active;
      if not found then raise exception 'published_product_unconfirmed'; end if;
      if nullif(btrim(l->>'unit'),'') is null or l->>'unit' is distinct from p.sales_unit then raise exception 'published_unit_unconfirmed'; end if;
      if coalesce(l->>'taxType','') not in ('taxable','exempt') or l->>'taxType' is distinct from p.tax_type then raise exception 'published_tax_unconfirmed'; end if;
    end if;
  end loop;
  return new;
end $$;
create trigger pricing_s2_validate_published_version before insert on public.pricing_document_versions
  for each row when (new.published_at is not null) execute function public.pricing_s2_validate_published_version();

create function public.pricing_s2_public_request_guard(p_company_id uuid,p_route_key text,p_requester_hash text,p_payload jsonb,p_limit integer default 20)
returns text language plpgsql security definer set search_path=public,pg_temp as $$
declare invalid boolean := p_company_id is null or length(coalesce(p_route_key,'')) not between 1 and 80 or coalesce(p_requester_hash,'') !~ '^[0-9a-f]{64}$' or jsonb_typeof(p_payload) is distinct from 'object' or pg_column_size(p_payload)>16384;
begin
  if invalid then
    if p_company_id is not null and coalesce(p_requester_hash,'') ~ '^[0-9a-f]{64}$' then insert into public.pricing_public_request_audit(company_id,route_key,requester_hash,outcome) values(p_company_id,left(coalesce(nullif(p_route_key,''),'invalid'),80),p_requester_hash,'invalid'); end if;
    return 'invalid';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||p_route_key||':'||p_requester_hash,0));
  if (select count(*) from public.pricing_public_request_audit where company_id=p_company_id and route_key=p_route_key and requester_hash=p_requester_hash and outcome='allowed' and occurred_at>clock_timestamp()-interval '1 minute') >= greatest(1,least(p_limit,100)) then
    insert into public.pricing_public_request_audit(company_id,route_key,requester_hash,outcome) values(p_company_id,p_route_key,p_requester_hash,'rate_limited'); return 'rate_limited';
  end if;
  insert into public.pricing_public_request_audit(company_id,route_key,requester_hash,outcome) values(p_company_id,p_route_key,p_requester_hash,'allowed');
  return 'allowed';
end $$;

create function public.record_pricing_document_acceptance(p_company_id uuid,p_document_id uuid,p_document_version_id uuid,p_idempotency_key uuid,p_request_fingerprint text,p_accepted_via text,p_customer_id uuid,p_lead_id uuid default null,p_send_id uuid default null,p_needs_review boolean default false,p_review_reason text default null,p_storefront_link_id uuid default null,p_customer_profile jsonb default '{}')
returns jsonb language plpgsql security definer set search_path=public,pg_temp as $$
declare r public.pricing_document_acceptance_requests%rowtype; d public.pricing_documents%rowtype; v_price_link uuid; l jsonb; v_customer uuid:=p_customer_id; v_import uuid; v_lead uuid:=p_lead_id; v_match_count integer:=0; v_customer_match_count integer:=0; v_name text:=nullif(btrim(p_customer_profile->>'businessName'),''); v_phone text:=regexp_replace(coalesce(p_customer_profile->>'phone',''),'\D','','g'); v_business_number text:=regexp_replace(coalesce(p_customer_profile->>'businessRegistrationNumber',''),'\D','','g'); v_address text:=nullif(btrim(p_customer_profile->>'address'),''); v_needs_review boolean:=p_needs_review; v_review_reason text:=p_review_reason;
begin
  if p_idempotency_key is null or length(coalesce(p_request_fingerprint,'')) not between 16 and 200 or p_accepted_via not in ('store','staff','kakao_start','kakao_login') then raise exception 'invalid_acceptance_request'; end if;
  select * into r from public.pricing_document_acceptance_requests where company_id=p_company_id and idempotency_key=p_idempotency_key for update;
  if found then if r.request_fingerprint<>p_request_fingerprint then raise exception 'idempotency_conflict'; end if; return r.result; end if;
  select * into d from public.pricing_documents where company_id=p_company_id and id=p_document_id for share;
  if not found or not exists(select from public.pricing_document_versions where company_id=p_company_id and document_id=p_document_id and id=p_document_version_id) then raise exception 'document_version_not_found'; end if;
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
    if v_customer_match_count>1 then v_customer:=null; v_needs_review:=true; v_review_reason:=coalesce(v_review_reason,'ambiguous_customer_match'); end if;
  end if;
  if v_customer is null then
    insert into public.customer_imports(company_id,source,row_count,status,quality_score,completed_at)
      values(p_company_id,'pricing_acceptance',1,'completed',100,clock_timestamp()) returning id into v_import;
    insert into public.normalized_customers(company_id,import_id,customer_name,address,phone,business_registration_number,normalized_key)
      values(p_company_id,v_import,v_name,v_address,v_phone,nullif(v_business_number,''),coalesce(nullif(v_business_number,''),'pricing_acceptance:'||encode(extensions.digest(lower(v_name)||'|'||lower(v_address)||'|'||v_phone,'sha256'),'hex')))
      on conflict(company_id,normalized_key) do update set customer_name=excluded.customer_name
      returning id into v_customer;
  end if;
  if v_lead is not null then
    update public.business_permit_leads set matched_customer_id=v_customer,is_duplicate=true,status='거래처 전환',updated_at=clock_timestamp()
      where company_id=p_company_id and id=v_lead and (matched_customer_id is null or matched_customer_id=v_customer);
    if not found then raise exception 'lead_customer_mismatch'; end if;
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
  -- 모호한 리드 후보는 고객 수락을 막지 않는다. 서버가 선택한 고객으로 진행하고 사후 검토만 남긴다.
  return r.result;
end $$;

alter table public.pricing_document_sends enable row level security;
alter table public.pricing_document_acceptance_requests enable row level security;
alter table public.pricing_public_request_audit enable row level security;
alter table public.customer_pricing_document_links enable row level security;
alter table public.store_accounts enable row level security;
alter table public.store_account_members enable row level security;
alter table public.store_account_member_events enable row level security;
revoke all on public.pricing_document_sends, public.pricing_document_acceptance_requests, public.pricing_public_request_audit, public.customer_pricing_document_links, public.store_accounts, public.store_account_members, public.store_account_member_events from public,anon,authenticated;
grant all on public.pricing_document_sends, public.pricing_document_acceptance_requests, public.pricing_public_request_audit, public.customer_pricing_document_links, public.store_accounts, public.store_account_members, public.store_account_member_events to service_role;
revoke all on function public.pricing_s2_public_request_guard(uuid,text,text,jsonb,integer), public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb) from public,anon,authenticated;
grant execute on function public.pricing_s2_public_request_guard(uuid,text,text,jsonb,integer), public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb) to service_role;
commit;
