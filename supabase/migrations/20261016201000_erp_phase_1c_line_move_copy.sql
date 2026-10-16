-- 운영 적용 완료(2026-10-16). 재실행 금지.
-- 원본: erp-phase-1c-line-move-copy.sql
-- ERP 1-C: 선택 품목 이동·복사 (매출처/매입처)
-- 선행: ERP 1단계 + 1-B v2 적용 완료. 여러 번 실행해도 안전.
--  * 이동: 같은 계열(매출→다른 매출처, 매입→다른 매입처). 원전표에서 빠지고 새 전표로 생성.
--          원전표가 발행 상태면 새 전표도 발행 상태로 만들고 원장을 양쪽에 반영.
--  * 복사: 매출↔매입 교차 가능. 원전표는 그대로, 새 전표는 항상 작성중.

begin;

alter table public.business_document_events
  drop constraint if exists business_document_events_event_type_check;
alter table public.business_document_events
  add constraint business_document_events_event_type_check
  check (event_type in ('revise', 'move', 'delete', 'tax_invoice_lock', 'line_move', 'line_copy'));

-- 내부용: 선택 품목을 save_business_document 형식의 jsonb로 변환
create or replace function public.erp_lines_to_jsonb(
  p_company_id uuid, p_document_id uuid, p_line_ids uuid[], p_include boolean, p_target_is_sale boolean
) returns jsonb
language sql stable security invoker set search_path = '' as $$
  select coalesce(jsonb_agg(jsonb_build_object(
    'product_catalog_id', case when p_target_is_sale then l.product_catalog_id end,
    'supplier_product_id', case when p_target_is_sale then null else l.supplier_product_id end,
    'product_code', l.product_code_snapshot,
    'product_name', l.product_name_snapshot,
    'specification', l.specification_snapshot,
    'unit', l.unit_snapshot,
    'tax_type', l.tax_type_snapshot,
    'quantity', l.quantity,
    'unit_price', l.unit_price,
    'memo', l.memo
  ) order by l.sort_order), '[]'::jsonb)
  from public.business_document_lines l
  where l.company_id = p_company_id and l.document_id = p_document_id
    and ((l.id = any(p_line_ids)) = p_include);
$$;

-- 내부용: 새 작성중 전표 헤더 생성(거래처 스냅샷은 save_business_document가 채움)
create or replace function public.erp_create_draft_header(
  p_company_id uuid, p_document_type text, p_partner_id uuid, p_document_date date,
  p_source_document_id uuid, p_actor_user_id uuid, p_actor_name text
) returns uuid
language plpgsql security invoker set search_path = '' as $$
declare
  v_id uuid;
begin
  insert into public.business_documents(
    company_id, document_type, document_number, document_date,
    customer_id, supplier_id, partner_name_snapshot, source_type, source_id,
    created_by_user_id, created_by_name
  ) values (
    p_company_id, p_document_type,
    public.next_erp_number(p_company_id, p_document_type, p_document_date), p_document_date,
    case when p_document_type in ('sale','sale_return') then p_partner_id end,
    case when p_document_type in ('purchase','purchase_return') then p_partner_id end,
    '-', 'manual', p_source_document_id, p_actor_user_id, p_actor_name
  ) returning id into v_id;
  return v_id;
end;
$$;

-- 선택 품목 이동
create or replace function public.move_business_document_lines(
  p_company_id uuid, p_document_id uuid, p_line_ids uuid[], p_target_partner_id uuid,
  p_actor_user_id uuid, p_actor_name text, p_reason text default null
) returns public.business_documents
language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.business_documents%rowtype;
  v_target public.business_documents%rowtype;
  v_is_sale boolean;
  v_selected integer; v_total_lines integer;
  v_moved jsonb; v_remaining jsonb;
  v_target_id uuid;
begin
  select * into v_source from public.business_documents
  where company_id = p_company_id and id = p_document_id for update;
  if not found then raise exception 'document not found'; end if;
  if v_source.document_type in ('sale_return', 'purchase_return') then
    raise exception 'lines of return documents cannot be moved';
  end if;
  if v_source.status = 'cancelled' then raise exception 'cancelled documents are immutable'; end if;
  if v_source.tax_invoice_locked_at is not null then raise exception 'tax invoiced documents are immutable'; end if;
  v_is_sale := v_source.document_type = 'sale';
  if p_target_partner_id = (case when v_is_sale then v_source.customer_id else v_source.supplier_id end) then
    raise exception 'target partner is the same as the current partner';
  end if;

  select count(*) filter (where id = any(p_line_ids)), count(*) into v_selected, v_total_lines
  from public.business_document_lines where company_id = p_company_id and document_id = p_document_id;
  if v_selected = 0 or v_selected <> coalesce(array_length(p_line_ids, 1), 0) then
    raise exception 'selected lines do not belong to this document';
  end if;
  if v_selected = v_total_lines then
    raise exception 'all lines selected: move the whole document instead';
  end if;

  v_moved := public.erp_lines_to_jsonb(p_company_id, p_document_id, p_line_ids, true, v_is_sale);
  v_remaining := public.erp_lines_to_jsonb(p_company_id, p_document_id, p_line_ids, false, v_is_sale);

  -- 새 전표(대상 거래처)
  v_target_id := public.erp_create_draft_header(p_company_id, v_source.document_type, p_target_partner_id,
    v_source.document_date, p_document_id, p_actor_user_id, p_actor_name);
  perform public.save_business_document(p_company_id, v_target_id, p_target_partner_id, v_source.document_date,
    '품목 이동: ' || v_source.document_number || coalesce(' (' || nullif(btrim(p_reason), '') || ')', ''),
    v_moved, p_actor_user_id, p_actor_name);

  -- 원전표에서 제외(발행 전표면 원장 차액 자동 기록, 세금계산서 초안 포함 시 거부)
  perform public.save_business_document(p_company_id, p_document_id,
    case when v_is_sale then v_source.customer_id else v_source.supplier_id end,
    v_source.document_date, v_source.memo, v_remaining, p_actor_user_id, p_actor_name,
    coalesce(nullif(btrim(p_reason), ''), '품목 ' || v_selected || '건 이동'));

  if v_source.status = 'confirmed' then
    perform public.confirm_business_document(p_company_id, v_target_id, p_actor_user_id, p_actor_name);
  end if;

  select * into v_target from public.business_documents where company_id = p_company_id and id = v_target_id;
  insert into public.business_document_events(
    company_id, document_id, event_type, from_customer_id, from_supplier_id, from_partner_name,
    to_customer_id, to_supplier_id, to_partner_name, before_total, after_total, reason, actor_user_id, actor_name
  ) values (
    p_company_id, p_document_id, 'line_move', v_source.customer_id, v_source.supplier_id, v_source.partner_name_snapshot,
    v_target.customer_id, v_target.supplier_id, v_target.partner_name_snapshot,
    v_source.total_amount, v_source.total_amount - v_target.total_amount,
    '품목 ' || v_selected || '건 → ' || v_target.document_number || coalesce(' (' || nullif(btrim(p_reason), '') || ')', ''),
    p_actor_user_id, p_actor_name
  );
  return v_target;
end;
$$;

-- 선택 품목 복사(매출↔매입 교차 가능, 새 전표는 작성중)
create or replace function public.copy_business_document_lines(
  p_company_id uuid, p_document_id uuid, p_line_ids uuid[],
  p_target_document_type text, p_target_partner_id uuid,
  p_actor_user_id uuid, p_actor_name text
) returns public.business_documents
language plpgsql security invoker set search_path = '' as $$
declare
  v_source public.business_documents%rowtype;
  v_target public.business_documents%rowtype;
  v_selected integer;
  v_lines jsonb;
  v_target_id uuid;
  v_today date := (now() at time zone 'Asia/Seoul')::date;
begin
  if p_target_document_type not in ('sale', 'purchase') then
    raise exception 'copy target must be a sale or purchase document';
  end if;
  select * into v_source from public.business_documents
  where company_id = p_company_id and id = p_document_id;
  if not found then raise exception 'document not found'; end if;

  select count(*) into v_selected from public.business_document_lines
  where company_id = p_company_id and document_id = p_document_id and id = any(p_line_ids);
  if v_selected = 0 or v_selected <> coalesce(array_length(p_line_ids, 1), 0) then
    raise exception 'selected lines do not belong to this document';
  end if;

  v_lines := public.erp_lines_to_jsonb(p_company_id, p_document_id, p_line_ids, true,
                                       p_target_document_type = 'sale');
  v_target_id := public.erp_create_draft_header(p_company_id, p_target_document_type, p_target_partner_id,
    v_today, p_document_id, p_actor_user_id, p_actor_name);
  select * into v_target from public.save_business_document(p_company_id, v_target_id, p_target_partner_id, v_today,
    '품목 복사: ' || v_source.document_number, v_lines, p_actor_user_id, p_actor_name);

  insert into public.business_document_events(
    company_id, document_id, event_type, from_customer_id, from_supplier_id, from_partner_name,
    to_customer_id, to_supplier_id, to_partner_name, before_total, after_total, reason, actor_user_id, actor_name
  ) values (
    p_company_id, p_document_id, 'line_copy', v_source.customer_id, v_source.supplier_id, v_source.partner_name_snapshot,
    v_target.customer_id, v_target.supplier_id, v_target.partner_name_snapshot,
    v_source.total_amount, v_source.total_amount,
    '품목 ' || v_selected || '건 → ' || v_target.document_number, p_actor_user_id, p_actor_name
  );
  return v_target;
end;
$$;

revoke execute on function public.erp_lines_to_jsonb(uuid,uuid,uuid[],boolean,boolean) from public, anon, authenticated;
revoke execute on function public.erp_create_draft_header(uuid,text,uuid,date,uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.move_business_document_lines(uuid,uuid,uuid[],uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.copy_business_document_lines(uuid,uuid,uuid[],text,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.erp_lines_to_jsonb(uuid,uuid,uuid[],boolean,boolean) to service_role;
grant execute on function public.erp_create_draft_header(uuid,text,uuid,date,uuid,uuid,text) to service_role;
grant execute on function public.move_business_document_lines(uuid,uuid,uuid[],uuid,uuid,text,text) to service_role;
grant execute on function public.copy_business_document_lines(uuid,uuid,uuid[],text,uuid,uuid,text) to service_role;

commit;
