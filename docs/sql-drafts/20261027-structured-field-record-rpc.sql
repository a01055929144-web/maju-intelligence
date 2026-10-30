-- 검토용 초안. Claude 검토와 대표 승인 전 운영 DB 실행 금지.
-- 전제: 20261026223523_delivery_sales_structure_20261027 적용 완료.
-- 2026-10-27 22:45 운영 읽기 전용 점검: 필요한 컬럼 31개 모두 존재, delivery_events_customer_note_uq 존재,
--   두 함수는 아직 없음. 멱등 인덱스는 note_type 조건 없는 부분 인덱스라 DO UPDATE에 note_type 가드를 추가함.
--
-- 검토 체크리스트
-- 1. 함수 서명은 아래 REVOKE/GRANT의 서명과 반드시 일치한다.
-- 2. company_id와 customer/lead의 동일 회사 소유권을 INSERT 전에 검증한다.
-- 3. idempotency_key별 transaction advisory lock으로 동시 재시도를 직렬화한다.
-- 4. 함수 한 호출 안에서 원본 note/action + header + items를 저장한다.
-- 5. plpgsql 함수 실행 중 하나라도 실패하면 호출 트랜잭션 전체가 롤백된다.

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
  v_status text;
begin
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then raise exception 'idempotency_key_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':delivery:' || p_idempotency_key, 0));
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'company_not_found'; end if;
  if not exists (select 1 from public.normalized_customers where company_id = p_company_id and id = p_customer_id) then
    raise exception 'customer_not_found';
  end if;
  if jsonb_typeof(p_items) <> 'array' then raise exception 'items_must_be_array'; end if;
  v_status := coalesce(nullif(p_event->>'status', ''), 'received');

  -- A retry must return the original record. Updating a note or replacing its
  -- items under the same key would let a late retry rewrite a completed event.
  select n.id, e.id into v_note_id, v_event_id
    from public.customer_notes n
    left join public.delivery_events e
      on e.company_id = n.company_id and e.customer_note_id = n.id
   where n.company_id = p_company_id
     and n.customer_id = p_customer_id
     and n.note_type = 'delivery'
     and n.idempotency_key = p_idempotency_key;
  if v_note_id is not null then
    if v_event_id is null then raise exception 'idempotency_key_conflict'; end if;
    return jsonb_build_object('noteId', v_note_id, 'eventId', v_event_id, 'replayed', true);
  end if;

  insert into public.customer_notes(company_id, customer_id, note_type, memo, created_by_name, idempotency_key)
  values (p_company_id, p_customer_id, 'delivery', p_memo, nullif(btrim(p_actor_name), ''), p_idempotency_key)
  -- Match the deployed partial unique index predicate exactly. A non-delivery
  -- note using the same key is a conflict and must never be modified here.
  on conflict (company_id, customer_id, idempotency_key) where idempotency_key is not null
  do nothing
  returning id into v_note_id;
  if v_note_id is null then raise exception 'idempotency_key_conflict'; end if;

  insert into public.delivery_events(
    company_id, customer_id, customer_note_id, recorded_by_user_id, recorded_by_name,
    event_type, cause_code, occurrence_stage, action_code, action_amount, status, resolved_at, memo
  ) values (
    p_company_id, p_customer_id, v_note_id, p_actor_user_id, nullif(btrim(p_actor_name), ''),
    p_event->>'eventType', nullif(p_event->>'causeCode', ''), nullif(p_event->>'occurrenceStage', ''),
    nullif(p_event->>'actionCode', ''), nullif(p_event->>'actionAmount', '')::numeric,
    v_status, case when v_status = 'completed' then now() else null end, p_memo
  )
  on conflict (company_id, customer_note_id) do nothing
  returning id into v_event_id;
  if v_event_id is null then raise exception 'idempotency_key_conflict'; end if;

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
  p_idempotency_key text,
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
  if p_idempotency_key is null or btrim(p_idempotency_key) = '' then raise exception 'idempotency_key_required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text || ':sales:' || p_idempotency_key, 0));
  if not exists (select 1 from public.companies where id = p_company_id) then raise exception 'company_not_found'; end if;
  if not exists (select 1 from public.business_permit_leads where company_id = p_company_id and id = p_lead_id) then
    raise exception 'lead_not_found';
  end if;
  if jsonb_typeof(p_items) <> 'array' or jsonb_array_length(p_items) = 0 then raise exception 'offer_items_required'; end if;

  select a.id, o.id into v_action_id, v_offer_id
    from public.lead_actions a
    join public.sales_offers o
      on o.company_id = a.company_id and o.lead_id = a.lead_id and o.lead_action_id = a.id
   where a.company_id = p_company_id
     and a.lead_id = p_lead_id
     and a.metadata->>'structuredIdempotencyKey' = p_idempotency_key
   limit 1;
  if v_action_id is not null then
    return jsonb_build_object('actionId', v_action_id, 'offerId', v_offer_id, 'replayed', true);
  end if;

  insert into public.lead_actions(company_id, lead_id, action_type, result, memo, actor_name, follow_up_at, collateral_types, metadata)
  values (
    p_company_id, p_lead_id, p_action->>'actionType', nullif(p_action->>'result', ''), p_memo,
    nullif(btrim(p_actor_name), ''), nullif(p_action->>'followUpAt', '')::timestamptz,
    coalesce(array(select jsonb_array_elements_text(coalesce(p_action->'collateralTypes', '[]'::jsonb))), '{}'::text[]),
    jsonb_build_object('structuredIdempotencyKey', p_idempotency_key)
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
revoke all on function public.record_lead_sales_offer_atomic(uuid, uuid, jsonb, uuid, text, text, text, jsonb) from public, anon, authenticated;
grant execute on function public.record_delivery_event_atomic(uuid, uuid, text, uuid, text, text, jsonb, jsonb) to service_role;
grant execute on function public.record_lead_sales_offer_atomic(uuid, uuid, jsonb, uuid, text, text, text, jsonb) to service_role;

commit;
