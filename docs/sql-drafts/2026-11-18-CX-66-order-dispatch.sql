-- CX-66 DRAFT ONLY. Apply only after representative approval, after CX-62.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.order_dispatch_requests (
  company_id uuid not null references public.companies(id) on delete cascade,
  idempotency_key uuid not null,
  order_ids uuid[] not null check (cardinality(order_ids) > 0),
  result jsonb,
  created_at timestamptz not null default clock_timestamp(),
  primary key (company_id, idempotency_key)
);
alter table public.order_dispatch_requests enable row level security;
revoke all on public.order_dispatch_requests from public, anon, authenticated;
grant all on public.order_dispatch_requests to service_role;

create function public.block_order_sale_document_early_confirmation()
returns trigger language plpgsql set search_path = '' as $$
begin
  if nullif(current_setting('maju.dispatch_confirm_order', true), '') is distinct from old.source_id::text then
    raise exception 'order_sale_document_requires_dispatch';
  end if;
  return new;
end $$;
revoke all on function public.block_order_sale_document_early_confirmation() from public, anon, authenticated;
create trigger order_sale_document_requires_dispatch
  before update of status on public.business_documents for each row
  when (old.source_type = 'order' and old.document_type = 'sale'
    and old.status = 'draft' and new.status = 'confirmed')
  execute function public.block_order_sale_document_early_confirmation();

create function public.dispatch_store_orders(
  p_company_id uuid, p_order_ids uuid[], p_idempotency_key uuid,
  p_actor_user_id uuid, p_actor_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_ids uuid[];
  v_request public.order_dispatch_requests%rowtype;
  v_order public.store_orders%rowtype;
  v_document public.business_documents%rowtype;
  v_result jsonb := '[]'::jsonb;
begin
  if p_idempotency_key is null or nullif(btrim(p_actor_name), '') is null then
    raise exception 'order_dispatch_input_required';
  end if;
  select array_agg(id order by id) into v_ids
  from (select distinct unnest(p_order_ids) id) ids where id is not null;
  if coalesce(cardinality(v_ids), 0) = 0 then raise exception 'order_dispatch_input_required'; end if;

  insert into public.order_dispatch_requests(company_id, idempotency_key, order_ids)
  values (p_company_id, p_idempotency_key, v_ids)
  on conflict do nothing;
  select * into strict v_request from public.order_dispatch_requests
  where company_id = p_company_id and idempotency_key = p_idempotency_key for update;
  if v_request.order_ids is distinct from v_ids then raise exception 'order_dispatch_idempotency_conflict'; end if;
  if v_request.result is not null then return v_request.result; end if;

  -- Lock every order in a deterministic order before producing any financial effect.
  perform 1 from public.store_orders
  where company_id = p_company_id and id = any(v_ids) order by id for update;
  if (select count(*) from public.store_orders where company_id = p_company_id and id = any(v_ids)) <> cardinality(v_ids) then
    raise exception 'order_dispatch_order_not_found';
  end if;

  for v_order in select * from public.store_orders
    where company_id = p_company_id and id = any(v_ids) order by id
  loop
    select * into v_document from public.business_documents
    where company_id = p_company_id and document_type = 'sale' and source_type = 'order'
      and source_id = v_order.id and source_key = 'order:' || v_order.id
      and customer_id = v_order.customer_id for update;
    if not found then raise exception 'order_dispatch_document_unlinked'; end if;

    if v_order.status = 'in_delivery' and v_document.status = 'confirmed' then
      v_result := v_result || jsonb_build_array(jsonb_build_object(
        'orderId', v_order.id, 'status', v_order.status, 'revision', v_order.revision,
        'documentId', v_document.id, 'documentNumber', v_document.document_number));
      continue;
    end if;
    if v_order.status <> 'received' or v_document.status <> 'draft' then
      raise exception 'order_dispatch_state_conflict';
    end if;
    if not exists (select 1 from public.business_document_lines
      where company_id = p_company_id and document_id = v_document.id) then
      raise exception 'order_dispatch_lines_required';
    end if;
    if exists (select 1 from public.business_document_lines
      where company_id = p_company_id and document_id = v_document.id
        and (quantity <= 0 or total_amount <= 0)) then
      raise exception 'order_dispatch_invalid_amount';
    end if;
    if v_document.total_amount is distinct from v_order.known_total
      or v_document.total_amount is distinct from (select sum(total_amount)
        from public.business_document_lines
        where company_id = p_company_id and document_id = v_document.id) then
      raise exception 'order_dispatch_amount_mismatch';
    end if;
    if exists (
      select 1 from public.inventory_resolve_document_lines(p_company_id, v_document.id) r
      join public.business_document_lines l on l.company_id = p_company_id and l.id = r.line_id
      where r.resolve_status in ('no_product', 'no_conversion')
        and not (r.resolve_status = 'no_product' and l.product_catalog_id is null
          and l.product_name_snapshot = '배송비')
    ) then raise exception 'order_dispatch_inventory_unresolved'; end if;

    perform set_config('maju.dispatch_confirm_order', v_order.id::text, true);
    select * into v_document from public.confirm_business_document(
      p_company_id, v_document.id, p_actor_user_id, p_actor_name);
    perform set_config('maju.dispatch_confirm_order', '', true);

    update public.store_orders set status = 'in_delivery', revision = revision + 1,
      updated_at = clock_timestamp()
    where company_id = p_company_id and id = v_order.id and status = 'received'
    returning * into v_order;
    if not found then raise exception 'order_dispatch_state_conflict'; end if;
    v_result := v_result || jsonb_build_array(jsonb_build_object(
      'orderId', v_order.id, 'status', v_order.status, 'revision', v_order.revision,
      'documentId', v_document.id, 'documentNumber', v_document.document_number));
  end loop;

  update public.order_dispatch_requests set result = v_result
  where company_id = p_company_id and idempotency_key = p_idempotency_key;
  return v_result;
end $$;

revoke all on function public.dispatch_store_orders(uuid,uuid[],uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.dispatch_store_orders(uuid,uuid[],uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
