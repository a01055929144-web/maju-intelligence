-- DRAFT ONLY: unapproved, unapplied. Do not execute against the operating database.
-- Keep the existing six-argument identity, return shape, owner and EXECUTE grants.
begin;

do $$
begin
  if to_regprocedure('public.issue_storefront_links(uuid,uuid,jsonb,timestamptz,uuid,text)') is null then
    raise exception 'existing_issue_storefront_links_required';
  end if;
end $$;

create or replace function public.issue_storefront_links(
  p_company uuid, p_document_version uuid, p_links jsonb,
  p_expires_at timestamptz, p_actor_user_id uuid default null, p_actor_key text default null
) returns table(issued_customer_id uuid, issued_link_id uuid,
  issued_token_nonce text, issued_token_hash text, was_created boolean)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_item jsonb;
  v_customer uuid;
  v_id uuid;
  v_nonce text;
  v_hash text;
  v_existing_id uuid;
  v_existing_nonce text;
  v_existing_hash text;
  v_existing_can_order boolean;
  v_can_order boolean;
  v_seen uuid[] := '{}';
begin
  if p_company is null or p_document_version is null or p_expires_at is null
    or p_expires_at <= now() or p_expires_at > now() + interval '370 days'
    or jsonb_typeof(p_links) is distinct from 'array'
    or jsonb_array_length(p_links) not between 1 and 100 then
    raise exception 'Invalid link issue request';
  end if;
  perform 1 from public.companies c where c.id = p_company for update;
  if not found or not exists(select 1 from public.pricing_document_versions v
    join public.pricing_documents d on d.company_id=v.company_id and d.id=v.document_id
    where v.company_id = p_company and v.id = p_document_version
      and (d.kind='sheet' or d.owner_key=p_actor_key)) then
    raise exception 'Company or published version unavailable';
  end if;
  for v_item in select value from jsonb_array_elements(p_links) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item->>'customerId','') !~* '^[0-9a-f-]{36}$'
      or coalesce(v_item->>'id','') !~* '^[0-9a-f-]{36}$'
      or coalesce(v_item->>'nonce','') !~ '^[0-9a-f]{32}$'
      or coalesce(v_item->>'hash','') !~ '^[0-9a-f]{64}$'
      or (v_item ? 'canOrder' and jsonb_typeof(v_item->'canOrder') is distinct from 'boolean') then
      raise exception 'Invalid link issue row';
    end if;
    v_customer := (v_item->>'customerId')::uuid;
    v_id := (v_item->>'id')::uuid;
    v_nonce := v_item->>'nonce';
    v_hash := v_item->>'hash';
    v_can_order := case when v_item ? 'canOrder' then (v_item->>'canOrder')::boolean else true end;
    if v_customer = any(v_seen) or not exists(select 1 from public.normalized_customers c
      where c.company_id = p_company and c.id = v_customer) then
      raise exception 'Duplicate or cross-company customer';
    end if;
    v_seen := array_append(v_seen,v_customer);
    select l.id,l.token_nonce,l.token_hash,l.can_order
      into v_existing_id,v_existing_nonce,v_existing_hash,v_existing_can_order
      from public.storefront_links l
      where l.company_id = p_company and l.customer_id = v_customer
        and l.document_version_id = p_document_version
        and l.revoked_at is null and l.expires_at > now();
    if found then
      if not v_can_order and v_existing_can_order then
        raise exception 'readonly_link_existing_orderable_conflict';
      end if;
      return query select v_customer,v_existing_id,v_existing_nonce,v_existing_hash,false;
    else
      update public.storefront_links l set revoked_at = now(),can_order = false
        where l.company_id = p_company and l.customer_id = v_customer
          and l.document_version_id = p_document_version
          and l.revoked_at is null and l.expires_at <= now();
      insert into public.storefront_links(id,company_id,customer_id,document_version_id,
        token_nonce,token_hash,expires_at,issued_by_user_id,can_order)
        values(v_id,p_company,v_customer,p_document_version,v_nonce,v_hash,
          p_expires_at,p_actor_user_id,v_can_order);
      return query select v_customer,v_id,v_nonce,v_hash,true;
    end if;
  end loop;
end $$;

commit;
