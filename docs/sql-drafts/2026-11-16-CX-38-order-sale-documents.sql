-- CX-38 DRAFT ONLY. Never run against production without representative approval.
-- Reuses confirm/save/cancel_business_document and the existing inventory trigger.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

alter table public.customer_attachments
  add constraint customer_attachments_company_id_id_uq unique (company_id, id);

create table public.business_document_receipts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null,
  revision integer not null check (revision >= 0),
  status text not null check (status in ('confirmed', 'disputed')),
  store_account_id uuid not null,
  store_member_id uuid not null,
  confirmed_at timestamptz not null default clock_timestamp(),
  memo text,
  photo_attachment_id uuid,
  created_at timestamptz not null default clock_timestamp(),
  constraint business_document_receipts_document_fk
    foreign key (company_id, document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint business_document_receipts_member_fk
    foreign key (company_id, store_account_id, store_member_id)
    references public.store_account_members(company_id, store_account_id, id) on delete restrict,
  constraint business_document_receipts_photo_fk
    foreign key (company_id, photo_attachment_id)
    references public.customer_attachments(company_id, id) on delete restrict,
  constraint business_document_receipts_revision_uq
    unique (company_id, document_id, revision)
);

create index business_document_receipts_document_idx
  on public.business_document_receipts(company_id, document_id, revision desc);

alter table public.business_document_receipts enable row level security;
revoke all on public.business_document_receipts from public, anon, authenticated, service_role;
grant select, insert on public.business_document_receipts to service_role;

create function public.order_sale_document_lines(
  p_company_id uuid,
  p_order_id uuid
) returns jsonb
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_lines jsonb;
  v_delivery_fee bigint;
begin
  select o.delivery_fee into v_delivery_fee
  from public.store_orders o
  where o.company_id = p_company_id and o.id = p_order_id;
  if not found then raise exception 'order_not_found'; end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_catalog_id', l.product_id,
    'product_code', p.product_code,
    'product_name', l.product_name,
    'specification', nullif(l.specification, ''),
    'unit', coalesce(nullif(l.sales_unit, ''), 'EA'),
    'tax_type', l.tax_type,
    'quantity', l.quantity,
    'unit_price', case
      when l.is_market_price then public.pricing_p0_price(
        e.cost, e.effective_margin_bp, e.effective_rounding)
      when l.price_includes_tax and l.tax_type = 'taxable'
        then round(l.unit_price / 1.1)::bigint
      else l.unit_price
    end,
    'memo', case when l.is_market_price then '시가(제안)' else null end
  ) order by l.id), '[]'::jsonb)
  into v_lines
  from public.store_order_lines l
  join public.product_catalog p
    on p.company_id = l.company_id and p.id = l.product_id
  left join public.pricing_p0_effective e
    on e.company_id = l.company_id and e.product_id = l.product_id
  where l.company_id = p_company_id and l.order_id = p_order_id;

  if jsonb_array_length(v_lines) = 0 then raise exception 'order_lines_required'; end if;
  if exists (
    select 1
    from public.store_order_lines l
    left join public.pricing_p0_effective e
      on e.company_id = l.company_id and e.product_id = l.product_id
    where l.company_id = p_company_id and l.order_id = p_order_id
      and l.is_market_price
      and (e.product_id is null or e.cost is null or e.cost <= 0)
  ) then raise exception 'market_price_basis_unavailable'; end if;

  -- store_orders.delivery_fee is a customer-facing total. Convert it to taxable supply.
  if v_delivery_fee > 0 then
    v_lines := v_lines || jsonb_build_array(jsonb_build_object(
      'product_catalog_id', null,
      'product_code', null,
      'product_name', '배송비',
      'specification', null,
      'unit', '건',
      'tax_type', 'taxable',
      'quantity', 1,
      'unit_price', round(v_delivery_fee / 1.1)::bigint,
      'memo', '주문 배송비(과세)'
    ));
  end if;
  return v_lines;
end;
$$;

create function public.confirm_order_sale_document(
  p_company_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_name text
) returns public.business_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.store_orders%rowtype;
  v_customer jsonb;
  v_document public.business_documents%rowtype;
  v_lines jsonb;
begin
  if nullif(btrim(p_actor_name), '') is null then raise exception 'actor_name_required'; end if;
  select * into v_order from public.store_orders
  where company_id = p_company_id and id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status not in ('submitted', 'received', 'in_delivery', 'delivered') then
    raise exception 'order_not_confirmable';
  end if;

  select * into v_document from public.business_documents
  where company_id = p_company_id and source_type = 'order'
    and source_key = 'order:' || p_order_id for update;
  if found then
    if v_document.status = 'confirmed' then return v_document; end if;
    raise exception 'order_document_not_confirmed';
  end if;

  select to_jsonb(c) into v_customer from public.normalized_customers c
  where c.company_id = p_company_id and c.id = v_order.customer_id;
  if v_customer is null then raise exception 'order_customer_not_found'; end if;
  v_lines := public.order_sale_document_lines(p_company_id, p_order_id);

  insert into public.business_documents(
    company_id, document_type, document_number, document_date, status,
    customer_id, partner_name_snapshot, partner_business_number_snapshot,
    partner_representative_snapshot, partner_address_snapshot, partner_contact_snapshot,
    source_type, source_id, source_key, memo, created_by_user_id, created_by_name
  ) values (
    p_company_id, 'sale', public.next_erp_number(p_company_id, 'sale', v_order.delivery_date),
    v_order.delivery_date, 'draft', v_order.customer_id,
    coalesce(v_customer->>'customer_name', v_customer->>'name'),
    coalesce(v_customer->>'business_registration_number', v_customer->>'business_number'),
    v_customer->>'representative_name', v_customer->>'address',
    coalesce(v_customer->>'phone', v_customer->>'contact_phone'),
    'order', p_order_id, 'order:' || p_order_id, nullif(btrim(v_order.request_memo), ''),
    p_actor_user_id, p_actor_name
  ) returning * into v_document;

  perform public.save_business_document(
    p_company_id, v_document.id, v_order.customer_id, v_order.delivery_date,
    v_order.request_memo, v_lines, p_actor_user_id, p_actor_name, '주문 확정');
  select * into v_document from public.confirm_business_document(
    p_company_id, v_document.id, p_actor_user_id, p_actor_name);

  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  values (p_actor_user_id, p_company_id, 'order_sale_document_confirmed',
    'business_document', v_document.id,
    jsonb_build_object('order_id', p_order_id, 'document_revision', v_document.revision));
  return v_document;
end;
$$;

create function public.revise_order_sale_document(
  p_company_id uuid,
  p_order_id uuid,
  p_expected_order_revision integer,
  p_actor_user_id uuid,
  p_actor_name text,
  p_reason text default null
) returns public.business_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_order public.store_orders%rowtype;
  v_document public.business_documents%rowtype;
  v_lines jsonb;
  v_current_lines jsonb;
begin
  if nullif(btrim(p_actor_name), '') is null then raise exception 'actor_name_required'; end if;
  select * into v_order from public.store_orders
  where company_id = p_company_id and id = p_order_id for update;
  if not found then raise exception 'order_not_found'; end if;
  if v_order.status not in ('submitted', 'received', 'in_delivery', 'delivered') then
    raise exception 'order_not_revisable';
  end if;
  if p_expected_order_revision is null or v_order.revision <> p_expected_order_revision then
    raise exception 'order_revision_conflict';
  end if;

  select * into v_document from public.business_documents
  where company_id = p_company_id and source_type = 'order'
    and source_key = 'order:' || p_order_id for update;
  if not found or v_document.status <> 'confirmed' then raise exception 'order_document_not_confirmed'; end if;
  if v_document.tax_invoice_locked_at is not null then raise exception 'tax invoiced documents are immutable'; end if;
  v_lines := public.order_sale_document_lines(p_company_id, p_order_id);

  select coalesce(jsonb_agg(jsonb_build_object(
    'product_catalog_id', l.product_catalog_id,
    'product_code', l.product_code_snapshot,
    'product_name', l.product_name_snapshot,
    'specification', l.specification_snapshot,
    'unit', l.unit_snapshot,
    'tax_type', l.tax_type_snapshot,
    'quantity', l.quantity,
    'unit_price', l.unit_price,
    'memo', l.memo
  ) order by l.sort_order), '[]'::jsonb)
  into v_current_lines
  from public.business_document_lines l
  where l.company_id = p_company_id and l.document_id = v_document.id;

  if v_current_lines = v_lines
     and v_document.document_date = v_order.delivery_date
     and coalesce(v_document.memo, '') = coalesce(nullif(btrim(v_order.request_memo), ''), '') then
    return v_document;
  end if;

  select * into v_document from public.save_business_document(
    p_company_id, v_document.id, v_order.customer_id, v_order.delivery_date,
    v_order.request_memo, v_lines, p_actor_user_id, p_actor_name,
    coalesce(nullif(btrim(p_reason), ''), '주문 수정'));
  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  values (p_actor_user_id, p_company_id, 'order_sale_document_revised',
    'business_document', v_document.id,
    jsonb_build_object('order_id', p_order_id, 'order_revision', v_order.revision,
      'document_revision', v_document.revision));
  return v_document;
end;
$$;

create function public.cancel_order_sale_document(
  p_company_id uuid,
  p_order_id uuid,
  p_actor_user_id uuid,
  p_actor_name text,
  p_reason text
) returns public.business_documents
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.business_documents%rowtype;
  v_was_cancelled boolean;
begin
  select * into v_document from public.business_documents
  where company_id = p_company_id and source_type = 'order'
    and source_key = 'order:' || p_order_id for update;
  if not found then raise exception 'order_document_not_found'; end if;
  v_was_cancelled := v_document.status = 'cancelled';
  select * into v_document from public.cancel_business_document(
    p_company_id, v_document.id, p_actor_user_id, p_actor_name, p_reason);
  if not v_was_cancelled then
    insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
    values (p_actor_user_id, p_company_id, 'order_sale_document_cancelled',
      'business_document', v_document.id, jsonb_build_object('order_id', p_order_id));
  end if;
  return v_document;
end;
$$;

create function public.record_business_document_receipt(
  p_company_id uuid,
  p_document_id uuid,
  p_revision integer,
  p_status text,
  p_store_account_id uuid,
  p_store_member_id uuid,
  p_memo text default null,
  p_photo_attachment_id uuid default null
) returns public.business_document_receipts
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_document public.business_documents%rowtype;
  v_receipt public.business_document_receipts%rowtype;
begin
  if p_status not in ('confirmed', 'disputed') then raise exception 'invalid_receipt_status'; end if;
  if p_status = 'disputed' and nullif(btrim(p_memo), '') is null then
    raise exception 'dispute_memo_required';
  end if;
  select * into v_document from public.business_documents
  where company_id = p_company_id and id = p_document_id for update;
  if not found or v_document.document_type <> 'sale' or v_document.status <> 'confirmed' then
    raise exception 'receivable_document_not_found';
  end if;
  if v_document.revision <> p_revision then raise exception 'document_revision_conflict'; end if;
  if not exists (
    select 1 from public.store_accounts a
    join public.store_account_members m
      on m.company_id = a.company_id and m.store_account_id = a.id
    where a.company_id = p_company_id and a.id = p_store_account_id
      and a.customer_id = v_document.customer_id
      and m.id = p_store_member_id and m.status = 'active'
  ) then raise exception 'store_member_scope_mismatch'; end if;
  if p_photo_attachment_id is not null and not exists (
    select 1 from public.customer_attachments a
    where a.company_id = p_company_id and a.id = p_photo_attachment_id
      and a.customer_id = v_document.customer_id
  ) then raise exception 'receipt_photo_scope_mismatch'; end if;

  insert into public.business_document_receipts(
    company_id, document_id, revision, status, store_account_id,
    store_member_id, memo, photo_attachment_id
  ) values (
    p_company_id, p_document_id, p_revision, p_status, p_store_account_id,
    p_store_member_id, nullif(btrim(p_memo), ''), p_photo_attachment_id
  ) on conflict (company_id, document_id, revision) do nothing
  returning * into v_receipt;
  if v_receipt.id is null then
    select * into v_receipt from public.business_document_receipts
    where company_id = p_company_id and document_id = p_document_id and revision = p_revision;
    if v_receipt.status <> p_status or v_receipt.store_member_id <> p_store_member_id
       or v_receipt.photo_attachment_id is distinct from p_photo_attachment_id
       or coalesce(v_receipt.memo, '') <> coalesce(nullif(btrim(p_memo), ''), '') then
      raise exception 'receipt_already_recorded';
    end if;
    return v_receipt;
  end if;

  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  select m.auth_user_id, p_company_id, 'business_document_receipt_recorded',
    'business_document', p_document_id,
    jsonb_build_object('revision', p_revision, 'status', p_status,
      'receipt_id', v_receipt.id, 'store_member_id', p_store_member_id)
  from public.store_account_members m
  where m.company_id = p_company_id and m.store_account_id = p_store_account_id
    and m.id = p_store_member_id;
  return v_receipt;
end;
$$;

revoke all on function public.order_sale_document_lines(uuid, uuid) from public, anon, authenticated, service_role;
revoke all on function public.confirm_order_sale_document(uuid, uuid, uuid, text) from public, anon, authenticated, service_role;
revoke all on function public.revise_order_sale_document(uuid, uuid, integer, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.cancel_order_sale_document(uuid, uuid, uuid, text, text) from public, anon, authenticated, service_role;
revoke all on function public.record_business_document_receipt(uuid, uuid, integer, text, uuid, uuid, text, uuid) from public, anon, authenticated, service_role;
grant execute on function public.order_sale_document_lines(uuid, uuid) to service_role;
grant execute on function public.confirm_order_sale_document(uuid, uuid, uuid, text) to service_role;
grant execute on function public.revise_order_sale_document(uuid, uuid, integer, uuid, text, text) to service_role;
grant execute on function public.cancel_order_sale_document(uuid, uuid, uuid, text, text) to service_role;
grant execute on function public.record_business_document_receipt(uuid, uuid, integer, text, uuid, uuid, text, uuid) to service_role;
commit;
