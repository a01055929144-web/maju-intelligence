-- 승인 전 초안. 운영 실행 금지.
begin;

create or replace function public.create_sales_document_from_store_order(
  p_company_id uuid,
  p_store_order_id uuid,
  p_actor_user_id uuid,
  p_actor_name text
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.store_orders%rowtype;
  v_document public.business_documents%rowtype;
  v_customer jsonb;
  v_lines jsonb;
  v_taxable bigint;
  v_exempt bigint;
  v_tax bigint;
  v_total bigint;
  v_source_key text := 'store_order:' || p_store_order_id::text;
begin
  if nullif(btrim(p_actor_name), '') is null then
    raise exception 'actor name is required';
  end if;

  perform pg_catalog.pg_advisory_xact_lock(
    pg_catalog.hashtextextended(p_company_id::text || ':' || p_store_order_id::text, 0)
  );

  select * into v_document
  from public.business_documents
  where company_id = p_company_id and source_type = 'order' and source_key = v_source_key;
  if found then
    return jsonb_build_object(
      'storeOrderId', p_store_order_id,
      'salesDocumentId', v_document.id,
      'status', v_document.status,
      'alreadyCreated', true,
      'ledgerPosted', exists(
        select 1 from public.partner_ledger_entries
        where company_id = p_company_id and source_document_id = v_document.id
      )
    );
  end if;

  select * into v_order
  from public.store_orders
  where company_id = p_company_id and id = p_store_order_id
  for update;
  if not found then raise exception 'store order not found'; end if;
  if v_order.status = 'cancelled' then raise exception 'cancelled store order cannot become a sales document'; end if;
  if v_order.has_market_price then raise exception 'market-price store order requires price resolution'; end if;
  if v_order.delivery_fee <> 0 then raise exception 'delivery-fee store order is not supported yet'; end if;
  if not exists (
    select 1 from public.store_order_lines
    where company_id = p_company_id and order_id = p_store_order_id
  ) then raise exception 'store order requires at least one line'; end if;
  if exists (
    select 1 from public.store_order_lines
    where company_id = p_company_id and order_id = p_store_order_id
      and (is_market_price or unit_price is null or price_includes_tax)
  ) then raise exception 'store order contains an unsupported price representation'; end if;

  select coalesce(sum(supply_amount) filter (where tax_type='taxable'),0),
         coalesce(sum(supply_amount) filter (where tax_type='exempt'),0),
         coalesce(sum(tax_amount),0), coalesce(sum(total_amount),0)
  into v_taxable,v_exempt,v_tax,v_total
  from public.store_order_lines
  where company_id = p_company_id and order_id = p_store_order_id;
  if (v_taxable,v_exempt,v_tax,v_total) is distinct from
     (v_order.taxable_supply,v_order.exempt_supply,v_order.tax_amount,v_order.known_total) then
    raise exception 'store order totals do not match line snapshots';
  end if;

  select to_jsonb(c) into v_customer
  from public.normalized_customers c
  where c.company_id = p_company_id and c.id = v_order.customer_id;
  if v_customer is null then raise exception 'store order customer not found'; end if;

  insert into public.business_documents(
    company_id,document_type,document_number,document_date,status,customer_id,
    partner_name_snapshot,partner_business_number_snapshot,partner_representative_snapshot,
    partner_address_snapshot,partner_contact_snapshot,source_type,source_id,source_key,
    created_by_user_id,created_by_name
  ) values (
    p_company_id,'sale',public.next_erp_number(p_company_id,'sale',v_order.delivery_date),
    v_order.delivery_date,'draft',v_order.customer_id,
    coalesce(v_customer->>'customer_name',v_customer->>'name'),
    v_customer->>'business_registration_number',v_customer->>'representative_name',
    v_customer->>'address',coalesce(v_customer->>'phone',v_customer->>'contact_phone'),
    'order',v_order.id,v_source_key,p_actor_user_id,btrim(p_actor_name)
  ) returning * into v_document;

  select jsonb_agg(jsonb_build_object(
    'product_catalog_id', product_id,
    'product_name', product_name,
    'specification', specification,
    'unit', sales_unit,
    'tax_type', tax_type,
    'quantity', quantity,
    'unit_price', unit_price
  ) order by id) into v_lines
  from public.store_order_lines
  where company_id = p_company_id and order_id = p_store_order_id;

  v_document := public.save_business_document(
    p_company_id,v_document.id,v_order.customer_id,v_order.delivery_date,
    v_order.request_memo,v_lines,p_actor_user_id,btrim(p_actor_name),'store order import'
  );
  if (v_document.taxable_supply_amount,v_document.exempt_supply_amount,v_document.tax_amount,v_document.total_amount)
     is distinct from (v_taxable,v_exempt,v_tax,v_total) then
    raise exception 'sales document totals do not preserve store order snapshots';
  end if;

  return jsonb_build_object(
    'storeOrderId',v_order.id,'salesDocumentId',v_document.id,'status',v_document.status,
    'alreadyCreated',false,'ledgerPosted',false
  );
end;
$$;

revoke all on function public.create_sales_document_from_store_order(uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.create_sales_document_from_store_order(uuid,uuid,uuid,text)
  to service_role;

commit;
