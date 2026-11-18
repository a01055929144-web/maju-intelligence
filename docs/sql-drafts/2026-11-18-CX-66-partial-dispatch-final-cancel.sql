-- CX-66 partial dispatch DRAFT ONLY. Apply after the approved full-dispatch SQL.
-- Contract: unshipped quantity is cancelled; any later need must be a new order.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.store_orders
  add column shipped_at timestamptz;
alter table public.store_orders
  add column sale_document_id uuid;
alter table public.store_orders
  add constraint store_orders_sale_document_fk foreign key (company_id, sale_document_id)
    references public.business_documents(company_id, id) on delete restrict;

alter table public.store_order_lines
  add constraint store_order_lines_company_id_id_uq unique (company_id, id);
alter table public.store_order_lines
  add column shipped_quantity numeric(14,3) not null default 0 check (shipped_quantity >= 0);
alter table public.store_order_lines
  add column cancelled_quantity numeric(14,3) not null default 0 check (cancelled_quantity >= 0);
alter table public.store_order_lines
  add constraint store_order_lines_dispatch_quantity_check
    check (shipped_quantity + cancelled_quantity <= quantity);

alter table public.business_document_lines
  add column source_order_line_id uuid;
alter table public.business_document_lines
  add constraint business_document_lines_source_order_line_fk
    foreign key (company_id, source_order_line_id)
    references public.store_order_lines(company_id, id) on delete restrict;

alter table public.order_dispatch_requests add column request_payload jsonb;

create function public.dispatch_store_orders_partial_final_cancel(
  p_company_id uuid, p_orders jsonb, p_idempotency_key uuid,
  p_actor_user_id uuid, p_actor_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_payload jsonb;
  v_order_ids uuid[];
  v_request public.order_dispatch_requests%rowtype;
  v_order_input jsonb;
  v_order public.store_orders%rowtype;
  v_document public.business_documents%rowtype;
  v_result jsonb := '[]'::jsonb;
  v_shipped_count integer;
begin
  if p_company_id is null or p_idempotency_key is null
    or nullif(btrim(p_actor_name), '') is null or p_orders is null
    or jsonb_typeof(p_orders) <> 'array' or jsonb_array_length(p_orders) = 0 then
    raise exception 'partial_dispatch_input_required';
  end if;
  if exists (select 1 from jsonb_array_elements(p_orders) o
    where nullif(o->>'orderId', '') is null or jsonb_typeof(o->'lines') <> 'array') then
    raise exception 'partial_dispatch_input_invalid';
  end if;
  if (select count(*) from jsonb_array_elements(p_orders)) <>
     (select count(distinct (o->>'orderId')::uuid) from jsonb_array_elements(p_orders) o) then
    raise exception 'partial_dispatch_duplicate_order';
  end if;
  if exists (
    select 1 from jsonb_array_elements(p_orders) o
    cross join lateral jsonb_array_elements(o->'lines') l
    where nullif(l->>'orderLineId', '') is null
      or nullif(l->>'shippedQuantity', '') is null
      or jsonb_typeof(l->'shippedQuantity') <> 'number'
      or case when (l->>'shippedQuantity') ~ '^(0|[1-9][0-9]{0,5})(\.[0-9]{1,3})?$'
        then (l->>'shippedQuantity')::numeric not between 0 and 100000 else true end
  ) then raise exception 'partial_dispatch_line_invalid'; end if;
  if exists (
    select 1 from jsonb_array_elements(p_orders) o
    cross join lateral (
      select count(*) total, count(distinct (l->>'orderLineId')::uuid) distinct_total
      from jsonb_array_elements(o->'lines') l
    ) x where x.total <> x.distinct_total
  ) then raise exception 'partial_dispatch_duplicate_line'; end if;

  select jsonb_agg(jsonb_build_object('orderId', order_id, 'lines', lines) order by order_id),
         array_agg(order_id order by order_id)
    into v_payload, v_order_ids
  from (
    select (o->>'orderId')::uuid order_id,
      (select coalesce(jsonb_agg(jsonb_build_object(
        'orderLineId', (l->>'orderLineId')::uuid,
        'shippedQuantity', (l->>'shippedQuantity')::numeric
      ) order by (l->>'orderLineId')::uuid), '[]'::jsonb)
      from jsonb_array_elements(o->'lines') l) lines
    from jsonb_array_elements(p_orders) o
  ) normalized;

  insert into public.order_dispatch_requests(company_id,idempotency_key,order_ids,request_payload)
  values (p_company_id,p_idempotency_key,v_order_ids,v_payload) on conflict do nothing;
  select * into strict v_request from public.order_dispatch_requests
  where company_id=p_company_id and idempotency_key=p_idempotency_key for update;
  if v_request.order_ids is distinct from v_order_ids
    or v_request.request_payload is distinct from v_payload then
    raise exception 'order_dispatch_idempotency_conflict';
  end if;
  if v_request.result is not null then return v_request.result; end if;

  perform 1 from public.store_orders where company_id=p_company_id and id=any(v_order_ids)
  order by id for update;
  if (select count(*) from public.store_orders where company_id=p_company_id and id=any(v_order_ids))
    <> cardinality(v_order_ids) then raise exception 'order_dispatch_order_not_found'; end if;

  for v_order_input in select value from jsonb_array_elements(v_payload) order by value->>'orderId'
  loop
    select * into strict v_order from public.store_orders
    where company_id=p_company_id and id=(v_order_input->>'orderId')::uuid;
    if v_order.status <> 'received' then raise exception 'order_dispatch_state_conflict'; end if;

    select * into v_document from public.business_documents
    where company_id=p_company_id and document_type='sale' and source_type='order'
      and source_id=v_order.id and source_key='order:'||v_order.id
      and customer_id=v_order.customer_id for update;
    if not found or v_document.status <> 'draft' then raise exception 'order_dispatch_document_unlinked'; end if;

    -- A partial dispatch must identify the exact original line. Match the complete
    -- snapshot without relying on UUID or row order, and reject ambiguous duplicates.
    if exists (
      select 1 from public.store_order_lines l
      where l.company_id=p_company_id and l.order_id=v_order.id and
        (select count(*) from public.business_document_lines d
         where d.company_id=l.company_id and d.document_id=v_document.id
           and d.product_catalog_id is not distinct from l.product_id
           and d.product_name_snapshot is not distinct from l.product_name
           and d.unit_snapshot is not distinct from coalesce(nullif(l.sales_unit,''),'EA')
           and d.tax_type_snapshot is not distinct from l.tax_type
           and d.quantity is not distinct from l.quantity
           and ((not l.is_market_price and d.unit_price is not distinct from
             case when l.price_includes_tax and l.tax_type='taxable'
               then round(l.unit_price/1.1)::bigint else l.unit_price end)
             or (l.is_market_price and d.unit_price>0))) <> 1
    ) or exists (
      select 1 from public.business_document_lines d
      where d.company_id=p_company_id and d.document_id=v_document.id
        and d.product_catalog_id is not null and
        (select count(*) from public.store_order_lines l
         where l.company_id=d.company_id and l.order_id=v_order.id
           and d.product_catalog_id is not distinct from l.product_id
           and d.product_name_snapshot is not distinct from l.product_name
           and d.unit_snapshot is not distinct from coalesce(nullif(l.sales_unit,''),'EA')
           and d.tax_type_snapshot is not distinct from l.tax_type
           and d.quantity is not distinct from l.quantity
           and ((not l.is_market_price and d.unit_price is not distinct from
             case when l.price_includes_tax and l.tax_type='taxable'
               then round(l.unit_price/1.1)::bigint else l.unit_price end)
             or (l.is_market_price and d.unit_price>0))) <> 1
    ) then raise exception 'partial_dispatch_snapshot_ambiguous'; end if;

    update public.business_document_lines d set source_order_line_id=l.id
    from public.store_order_lines l
    where d.company_id=p_company_id and d.document_id=v_document.id
      and l.company_id=d.company_id and l.order_id=v_order.id
      and d.product_catalog_id is not distinct from l.product_id
      and d.product_name_snapshot is not distinct from l.product_name
      and d.unit_snapshot is not distinct from coalesce(nullif(l.sales_unit,''),'EA')
      and d.tax_type_snapshot is not distinct from l.tax_type
      and d.quantity is not distinct from l.quantity
      and ((not l.is_market_price and d.unit_price is not distinct from
        case when l.price_includes_tax and l.tax_type='taxable'
          then round(l.unit_price/1.1)::bigint else l.unit_price end)
        or (l.is_market_price and d.unit_price>0));

    if exists (
      select 1 from jsonb_array_elements(v_order_input->'lines') requested
      left join public.store_order_lines l on l.company_id=p_company_id
        and l.order_id=v_order.id and l.id=(requested->>'orderLineId')::uuid
      where l.id is null or (requested->>'shippedQuantity')::numeric > l.quantity
    ) then raise exception 'partial_dispatch_quantity_invalid'; end if;

    update public.store_order_lines l set
      shipped_quantity=coalesce((select (requested->>'shippedQuantity')::numeric
        from jsonb_array_elements(v_order_input->'lines') requested
        where (requested->>'orderLineId')::uuid=l.id),0),
      cancelled_quantity=l.quantity-coalesce((select (requested->>'shippedQuantity')::numeric
        from jsonb_array_elements(v_order_input->'lines') requested
        where (requested->>'orderLineId')::uuid=l.id),0)
    where l.company_id=p_company_id and l.order_id=v_order.id;

    select count(*) into v_shipped_count from public.store_order_lines
    where company_id=p_company_id and order_id=v_order.id and shipped_quantity > 0;
    if v_shipped_count = 0 then
      update public.store_orders set status='cancelled',revision=revision+1,updated_at=clock_timestamp()
      where company_id=p_company_id and id=v_order.id and status='received' returning * into v_order;
      if not found then raise exception 'order_dispatch_state_conflict'; end if;
      v_result:=v_result||jsonb_build_array(jsonb_build_object(
        'orderId',v_order.id,'status',v_order.status,'revision',v_order.revision,
        'documentId',null,'documentNumber',null));
      continue;
    end if;

    update public.business_document_lines d set quantity=l.shipped_quantity,updated_at=clock_timestamp()
    from public.store_order_lines l where d.company_id=p_company_id and d.document_id=v_document.id
      and d.source_order_line_id=l.id and l.shipped_quantity>0;
    delete from public.business_document_lines d using public.store_order_lines l
    where d.company_id=p_company_id and d.document_id=v_document.id
      and d.source_order_line_id=l.id and l.shipped_quantity=0;
    update public.business_documents set
      taxable_supply_amount=coalesce((select sum(supply_amount) from public.business_document_lines
        where company_id=p_company_id and document_id=v_document.id and tax_type_snapshot='taxable'),0),
      exempt_supply_amount=coalesce((select sum(supply_amount) from public.business_document_lines
        where company_id=p_company_id and document_id=v_document.id and tax_type_snapshot='exempt'),0),
      tax_amount=coalesce((select sum(tax_amount) from public.business_document_lines
        where company_id=p_company_id and document_id=v_document.id),0),
      total_amount=coalesce((select sum(total_amount) from public.business_document_lines
        where company_id=p_company_id and document_id=v_document.id),0),
      updated_at=clock_timestamp()
    where company_id=p_company_id and id=v_document.id returning * into v_document;
    if v_document.total_amount <= 0 then raise exception 'partial_dispatch_zero_amount'; end if;
    if exists (select 1 from public.inventory_resolve_document_lines(p_company_id,v_document.id) r
      join public.business_document_lines l on l.company_id=p_company_id and l.id=r.line_id
      where r.resolve_status in ('no_product','no_conversion')
        and not (r.resolve_status='no_product' and l.product_catalog_id is null
          and l.product_name_snapshot='배송비')) then raise exception 'order_dispatch_inventory_unresolved'; end if;

    perform set_config('maju.dispatch_confirm_order',v_order.id::text,true);
    select * into v_document from public.confirm_business_document(
      p_company_id,v_document.id,p_actor_user_id,p_actor_name);
    perform set_config('maju.dispatch_confirm_order','',true);
    update public.store_orders set status='in_delivery',revision=revision+1,
      shipped_at=clock_timestamp(),sale_document_id=v_document.id,updated_at=clock_timestamp()
    where company_id=p_company_id and id=v_order.id and status='received' returning * into v_order;
    if not found then raise exception 'order_dispatch_state_conflict'; end if;
    v_result:=v_result||jsonb_build_array(jsonb_build_object(
      'orderId',v_order.id,'status',v_order.status,'revision',v_order.revision,
      'documentId',v_document.id,'documentNumber',v_document.document_number));
  end loop;

  update public.order_dispatch_requests set result=v_result
  where company_id=p_company_id and idempotency_key=p_idempotency_key;
  return v_result;
end $$;

revoke all on function public.dispatch_store_orders_partial_final_cancel(uuid,jsonb,uuid,uuid,text)
  from public,anon,authenticated;
grant execute on function public.dispatch_store_orders_partial_final_cancel(uuid,jsonb,uuid,uuid,text)
  to service_role;
notify pgrst,'reload schema';
commit;
