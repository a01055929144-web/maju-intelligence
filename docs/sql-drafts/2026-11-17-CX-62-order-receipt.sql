-- CX-62 draft. Apply only after approval. CX-38 line mapping and CX-13 order guard must already exist.
begin;

create function public.receive_store_order_with_sale_document(
  p_company_id uuid, p_order_id uuid, p_expected_revision integer,
  p_actor_user_id uuid, p_actor_name text
) returns jsonb language plpgsql security definer set search_path = '' as $$
declare
  v_order public.store_orders%rowtype;
  v_document public.business_documents%rowtype;
  v_customer jsonb;
  v_lines jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 1 then
    raise exception 'order_receipt_conflict';
  end if;
  select * into v_order from public.store_orders
    where company_id = p_company_id and id = p_order_id for update;
  if not found then raise exception 'order_receipt_conflict'; end if;

  if not ((v_order.status = 'submitted' and v_order.revision = p_expected_revision)
    or (v_order.status = 'received' and v_order.revision - 1 = p_expected_revision)) then
    raise exception 'order_receipt_conflict';
  end if;

  select * into v_document from public.business_documents
    where company_id = p_company_id and source_type = 'order' and source_key = 'order:' || p_order_id
    for update;
  if not found and v_order.status = 'submitted' then
    select to_jsonb(c) into v_customer from public.normalized_customers c
    where c.company_id = p_company_id and c.id = v_order.customer_id;
    if v_customer is null then raise exception 'order_customer_not_found'; end if;

    insert into public.business_documents(
      company_id, document_type, document_number, document_date, status,
      customer_id, partner_name_snapshot, partner_business_number_snapshot,
      partner_representative_snapshot, partner_address_snapshot, partner_contact_snapshot,
      source_type, source_id, source_key, memo, created_by_user_id, created_by_name
    ) values (
      p_company_id, 'sale', public.next_erp_number(p_company_id, 'sale', v_order.delivery_date),
      v_order.delivery_date, 'draft', v_order.customer_id,
      coalesce(nullif(btrim(v_customer->>'business_name'), ''), v_customer->>'customer_name', v_customer->>'name'),
      nullif(btrim(v_customer->>'business_registration_number'), ''),
      v_customer->>'representative_name', coalesce(btrim(v_customer->>'address'), ''),
      coalesce(v_customer->>'phone', v_customer->>'contact_phone'),
      'order', p_order_id, 'order:' || p_order_id, nullif(btrim(v_order.request_memo), ''),
      p_actor_user_id, p_actor_name
    ) returning * into v_document;
  end if;

  if v_document.id is null or (v_order.status = 'submitted' and v_document.status is distinct from 'draft')
    or (v_order.status = 'received' and v_document.status not in ('draft', 'confirmed'))
    or v_document.document_type is distinct from 'sale'
    or v_document.company_id is distinct from p_company_id
    or v_document.source_type is distinct from 'order'
    or v_document.source_id is distinct from p_order_id
    or v_document.source_key is distinct from 'order:' || p_order_id
    or v_document.customer_id is distinct from v_order.customer_id then
    raise exception 'order_receipt_document_unlinked';
  end if;

  if v_order.status = 'submitted' then
    v_lines := public.order_sale_document_lines(p_company_id, p_order_id);
    select * into v_document from public.save_business_document(
      p_company_id, v_document.id, v_order.customer_id, v_order.delivery_date,
      v_order.request_memo, v_lines, p_actor_user_id, p_actor_name, '고객사 접수');
    if v_document.status is distinct from 'draft' then
      raise exception 'order_receipt_document_unlinked';
    end if;
    -- The shared save RPC refreshes snapshots from the management customer record.
    -- Reapply the legal identity after its last save, in the receipt transaction.
    select to_jsonb(c) into strict v_customer from public.normalized_customers c
      where c.company_id = p_company_id and c.id = v_order.customer_id;
    update public.business_documents
      set partner_name_snapshot = coalesce(nullif(btrim(v_customer->>'business_name'), ''),
            v_customer->>'customer_name', v_customer->>'name'),
          partner_business_number_snapshot = nullif(btrim(v_customer->>'business_registration_number'), ''),
          partner_address_snapshot = coalesce(btrim(v_customer->>'address'), '')
      where company_id = p_company_id and id = v_document.id
      returning * into v_document;
    -- The existing line mapper may round gross prices at unit level. Reject a changed
    -- known total instead of accepting a discrepancy that could later reach the ledger.
    if not exists (select 1 from public.store_order_lines
      where company_id = p_company_id and order_id = p_order_id and is_market_price)
      and v_document.total_amount is distinct from v_order.known_total then
      raise exception 'order_receipt_amount_mismatch';
    end if;
    update public.store_orders set status = 'received', revision = revision + 1, updated_at = clock_timestamp()
      where company_id = p_company_id and id = p_order_id and status = 'submitted' and revision = p_expected_revision
      returning * into v_order;
    if not found then raise exception 'order_receipt_conflict'; end if;
  end if;
  return jsonb_build_object('id', v_order.id, 'status', v_order.status, 'revision', v_order.revision);
end $$;

revoke all on function public.receive_store_order_with_sale_document(uuid, uuid, integer, uuid, text) from public, anon, authenticated;
grant execute on function public.receive_store_order_with_sale_document(uuid, uuid, integer, uuid, text) to service_role;
-- Shared cancellation boundary for existing store and customer cancellation entry points.
create function public.remove_cancelled_order_sale_draft()
returns trigger language plpgsql security definer set search_path = '' as $$
declare
  v_document_id uuid;
begin
  select id into v_document_id from public.business_documents
    where company_id = new.company_id and document_type = 'sale'
      and source_type = 'order' and source_id = new.id and source_key = 'order:' || new.id
      and customer_id = new.customer_id and status = 'draft'
    for update;
  if found then
    delete from public.business_document_lines
      where company_id = new.company_id and document_id = v_document_id;
    delete from public.business_documents
      where company_id = new.company_id and id = v_document_id and status = 'draft';
  end if;
  return new;
end $$;
revoke all on function public.remove_cancelled_order_sale_draft() from public, anon, authenticated;
create trigger remove_cancelled_order_sale_draft
  after update of status on public.store_orders for each row
  when (old.status = 'received' and new.status = 'cancelled')
  execute function public.remove_cancelled_order_sale_draft();

notify pgrst, 'reload schema';
commit;
