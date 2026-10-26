-- 검토용 초안. Claude 검토와 대표 승인 전 운영 DB 실행 금지.
-- 전제: 20261026223523_delivery_sales_structure_20261027 적용 완료.

begin;

create or replace function public.record_delivery_event_atomic(
  p_company_id uuid,
  p_customer_id uuid,
  p_memo text,
  p_actor_user_id uuid,
  p_actor_name text,
  p_idempotency_key text,
  p_event jsonb,
  p_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_note_id uuid;
  v_event_id uuid;
begin
  if not exists (select 1 from public.normalized_customers where company_id = p_company_id and id = p_customer_id) then
    raise exception 'customer_not_found';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items_must_be_array'; end if;

  insert into public.customer_notes(company_id, customer_id, note_type, memo, created_by_name, idempotency_key)
  values (p_company_id, p_customer_id, 'delivery', p_memo, nullif(btrim(p_actor_name), ''), p_idempotency_key)
  on conflict (company_id, customer_id, idempotency_key) where note_type = 'delivery' and idempotency_key is not null
  do update set memo = excluded.memo
  returning id into v_note_id;

  insert into public.delivery_events(
    company_id, customer_id, customer_note_id, recorded_by_user_id, recorded_by_name,
    event_type, cause_code, occurrence_stage, action_code, action_amount, status, memo
  ) values (
    p_company_id, p_customer_id, v_note_id, p_actor_user_id, nullif(btrim(p_actor_name), ''),
    p_event->>'eventType', nullif(p_event->>'causeCode', ''), nullif(p_event->>'occurrenceStage', ''),
    nullif(p_event->>'actionCode', ''), nullif(p_event->>'actionAmount', '')::numeric,
    coalesce(nullif(p_event->>'status', ''), 'received'), p_memo
  )
  on conflict (company_id, customer_note_id) do update set
    cause_code = excluded.cause_code, occurrence_stage = excluded.occurrence_stage,
    action_code = excluded.action_code, action_amount = excluded.action_amount,
    status = excluded.status, memo = excluded.memo, updated_at = now()
  returning id into v_event_id;

  delete from public.delivery_event_items where company_id = p_company_id and delivery_event_id = v_event_id;
  insert into public.delivery_event_items(
    company_id, delivery_event_id, line_number, product_id, item_name, quantity,
    quantity_unit, supplier_id, supplier_name
  )
  select p_company_id, v_event_id, ordinality::integer,
    nullif(item->>'productId', '')::uuid, btrim(item->>'itemName'),
    nullif(item->>'quantity', '')::numeric, nullif(item->>'quantityUnit', ''),
    nullif(item->>'supplierId', '')::uuid, nullif(item->>'supplierName', '')
  from jsonb_array_elements(p_items) with ordinality as x(item, ordinality);

  return jsonb_build_object('noteId', v_note_id, 'eventId', v_event_id);
end $$;

create or replace function public.record_lead_sales_offer_atomic(
  p_company_id uuid,
  p_lead_id uuid,
  p_action jsonb,
  p_actor_user_id uuid,
  p_actor_name text,
  p_memo text,
  p_items jsonb default '[]'::jsonb
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_action_id uuid;
  v_offer_id uuid;
begin
  if not exists (select 1 from public.business_permit_leads where company_id = p_company_id and id = p_lead_id) then
    raise exception 'lead_not_found';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'offer_items_required'; end if;

  insert into public.lead_actions(company_id, lead_id, action_type, result, memo, actor_name, actor_user_id, follow_up_at, collateral_types)
  values (
    p_company_id, p_lead_id, p_action->>'actionType', nullif(p_action->>'result', ''), p_memo,
    nullif(btrim(p_actor_name), ''), p_actor_user_id, nullif(p_action->>'followUpAt', '')::timestamptz,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_action->'collateralTypes', '[]'::jsonb))), '{}'::text[])
  ) returning id into v_action_id;

  insert into public.sales_offers(company_id, lead_id, lead_action_id, recorded_by_user_id, recorded_by_name, memo)
  values (p_company_id, p_lead_id, v_action_id, p_actor_user_id, nullif(btrim(p_actor_name), ''), p_memo)
  returning id into v_offer_id;

  insert into public.sales_offer_items(
    company_id, sales_offer_id, line_number, product_id, item_name, offered_price,
    currency_code, valid_until, sample_provided, sample_quantity, sample_unit
  )
  select p_company_id, v_offer_id, ordinality::integer,
    nullif(item->>'productId', '')::uuid, btrim(item->>'itemName'),
    nullif(item->>'offeredPrice', '')::numeric, coalesce(nullif(item->>'currencyCode', ''), 'KRW'),
    nullif(item->>'validUntil', '')::date, coalesce((item->>'sampleProvided')::boolean, false),
    nullif(item->>'sampleQuantity', '')::numeric, nullif(item->>'sampleUnit', '')
  from jsonb_array_elements(p_items) with ordinality as x(item, ordinality);

  return jsonb_build_object('actionId', v_action_id, 'offerId', v_offer_id);
end $$;

revoke all on function public.record_delivery_event_atomic(uuid, uuid, text, uuid, text, text, jsonb, jsonb) from public, anon, authenticated;
revoke all on function public.record_lead_sales_offer_atomic(uuid, uuid, jsonb, uuid, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_delivery_event_atomic(uuid, uuid, text, uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.record_lead_sales_offer_atomic(uuid, uuid, jsonb, uuid, text, text, jsonb) to service_role;

commit;
