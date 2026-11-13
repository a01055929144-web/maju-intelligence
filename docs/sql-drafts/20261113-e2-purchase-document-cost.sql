-- E2 DRAFT. 운영 적용 금지: 대표의 명시 승인 문구(DB-APPROVED) 전에는 supabase/migrations 로 옮기지 않는다.
-- 매입 전표(purchase) 확정 → 매입가 기록(purchase_receipt_lines, source='purchase_document'). 취소·정정 시 무효 표시(삭제 안 함).
-- 기존 confirm_business_document / cancel_business_document / save_business_document 본문은 바꾸지 않고,
-- business_documents 상태·revision 변경에 걸리는 AFTER 트리거로 처리한다(운영 본문 확인: 2026-11-13 읽기 조회, 저장소와 일치).
begin;

alter table public.purchase_receipt_lines
  add column if not exists source text not null default 'upload',
  add column if not exists business_document_id uuid,
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidated_reason text,
  add column if not exists hold_reason text,
  add column if not exists released_at timestamptz,
  add column if not exists released_by_name text;

alter table public.purchase_receipt_lines
  add constraint purchase_receipt_lines_hold_check check (hold_reason is null or hold_reason = 'variance_check'),
  add constraint purchase_receipt_lines_release_check check ((released_at is null) = (released_by_name is null) and (released_at is null or hold_reason is not null)),
  add constraint purchase_receipt_lines_source_check check (source in ('upload','purchase_document')),
  add constraint purchase_receipt_lines_source_doc_check check ((source = 'purchase_document') = (business_document_id is not null)),
  add constraint purchase_receipt_lines_invalid_reason_check check ((invalidated_at is null) = (invalidated_reason is null)),
  add constraint purchase_receipt_lines_document_fk foreign key (company_id, business_document_id)
    references public.business_documents(company_id, id);

create index if not exists purchase_receipt_lines_document_idx
  on public.purchase_receipt_lines(company_id, business_document_id) where business_document_id is not null;

-- CX-06 변동률 기준: domains/pricing/price-change.ts 의 PRICE_CHANGE_NEUTRAL_THRESHOLD_PERCENT(0.5)와 같은 값.
-- 현재 매입가 대비 이 값 이상 바뀌는 전표 줄은 기록만 하고 현재 매입가·판매가 반영은 대표 [반영]까지 보류(variance_check).
-- 값을 바꿀 때는 TS 상수도 함께(tests/purchase-document-cost-e2.test.ts 가 두 값을 비교한다).
create or replace function public.purchase_variance_hold_percent() returns numeric
language sql immutable set search_path = pg_catalog as $$ select 0.5::numeric $$;

-- 줄 → 상품 해석. 우선순위: 줄에 지정된 매입처 상품(확정·자동 매칭) > 같은 매입처의 상품 코드. 후보가 정확히 1개일 때만 인정.
-- reason: null=기록 가능 · product_link_required=상품 연결 필요 · unit_mismatch=단위 다름(건너뜀) · price_invalid=단가 0 이하
create or replace function public.resolve_purchase_document_lines(p_company uuid, p_document uuid)
returns table(line_id uuid, product_id uuid, reason text)
language sql stable security invoker set search_path = pg_catalog, public as $$
  select l.id, r.product_id,
    case when r.product_id is null then 'product_link_required'
         when l.unit_price <= 0 then 'price_invalid'
         when coalesce(nullif(btrim(r.purchase_unit),''), '') <> btrim(l.unit_snapshot) then 'unit_mismatch'
    end
  from public.business_document_lines l
  join public.business_documents d on d.company_id = l.company_id and d.id = l.document_id
  left join lateral (
    select (array_agg(c.id))[1] as product_id, (array_agg(c.purchase_unit))[1] as purchase_unit
    from (
      select pc.id, pc.purchase_unit
      from public.supplier_product_matches m
      join public.product_catalog pc on pc.company_id = m.company_id and pc.id = m.product_catalog_id
      where l.supplier_product_id is not null and m.company_id = l.company_id
        and m.supplier_product_id = l.supplier_product_id and m.match_status in ('auto','confirmed')
      union
      select pc.id, pc.purchase_unit
      from public.supplier_products sp
      join public.supplier_product_matches m on m.company_id = sp.company_id and m.supplier_product_id = sp.id
        and m.match_status in ('auto','confirmed')
      join public.product_catalog pc on pc.company_id = m.company_id and pc.id = m.product_catalog_id
      where l.supplier_product_id is null and nullif(btrim(l.product_code_snapshot),'') is not null
        and sp.company_id = l.company_id and sp.supplier_id = d.supplier_id
        and sp.supplier_code = btrim(l.product_code_snapshot)
    ) c
    having count(*) = 1
  ) r on true
  where l.company_id = p_company and l.document_id = p_document;
$$;

-- 상품의 현재 매입가를 '유효한 최신 행'(날짜 → 기록 시각 → id, CX-06 규칙)으로 맞춘다. 업로드(v2)와 같은 날짜 가드를 따른다.
-- 현재가가 날짜 없는 값이면(구 데이터) 덮지 않는다. 반환: 바뀐 상품 수.
create or replace function public.refresh_purchase_price_from_receipts(p_company uuid, p_products uuid[])
returns integer language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_changed integer := 0; v_prior text; v_row record; v_n integer;
begin
  v_prior := current_setting('maju.purchase_price_date_explicit', true);
  perform set_config('maju.purchase_price_date_explicit', 'on', true);
  for v_row in
    select distinct on (r.product_catalog_id) r.product_catalog_id as pid, r.receipt_date, r.unit_cost_ex_vat
    from public.purchase_receipt_lines r
    where r.company_id = p_company and r.product_catalog_id = any(p_products) and r.invalidated_at is null
      and (r.hold_reason is null or r.released_at is not null)
    order by r.product_catalog_id, r.receipt_date desc, r.created_at desc, r.id desc
  loop
    update public.product_catalog set purchase_price = v_row.unit_cost_ex_vat, purchase_price_date = v_row.receipt_date,
      updated_at = clock_timestamp()
    where company_id = p_company and id = v_row.pid
      and (purchase_price = 0 or purchase_price_date is not null)
      and (purchase_price, purchase_price_date) is distinct from (v_row.unit_cost_ex_vat, v_row.receipt_date);
    get diagnostics v_n = row_count; v_changed := v_changed + v_n;
  end loop;
  perform set_config('maju.purchase_price_date_explicit', coalesce(v_prior, ''), true);
  return v_changed;
end $$;

create or replace function public.record_purchase_document_costs()
returns trigger language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_products uuid[] := '{}'; v_changed integer := 0;
begin
  -- 취소·정정: 이전에 기록한 줄을 무효 표시(삭제 안 함)
  if old.status = 'confirmed' and (new.status = 'cancelled' or (new.status = 'confirmed' and new.revision > old.revision)) then
    with inv as (
      update public.purchase_receipt_lines set invalidated_at = now(),
        invalidated_reason = case when new.status = 'cancelled' then 'cancel' else 'revise' end
      where company_id = new.company_id and business_document_id = new.id and invalidated_at is null
      returning product_catalog_id)
    select coalesce(array_agg(distinct product_catalog_id), '{}') into v_products from inv;
  end if;
  -- 확정·정정 후 확정: 줄을 기록(연결·단위가 맞는 줄만. 나머지는 view 목록)
  if new.status = 'confirmed' and (old.status = 'draft' or new.revision > old.revision) then
    with ins as (
      insert into public.purchase_receipt_lines(
        company_id, receipt_date, dedupe_key, line_key, product_catalog_id, supplier_name, erp_code,
        product_name, spec, unit, quantity, unit_price, price_includes_vat, tax_type, unit_cost_ex_vat,
        supply_amount, vat_amount, total_amount, file_name, source_row_number, raw_values, created_by_name,
        source, business_document_id, hold_reason)
      select new.company_id, new.document_date, 'doc:' || new.id || ':' || new.revision || ':' || l.sort_order,
        x.product_id::text, x.product_id, new.partner_name_snapshot, l.product_code_snapshot,
        l.product_name_snapshot, l.specification_snapshot, l.unit_snapshot, l.quantity, l.unit_price, false,
        l.tax_type_snapshot, l.unit_price, l.supply_amount, l.tax_amount, l.total_amount, new.document_number,
        l.sort_order, '[]'::jsonb, coalesce(new.last_revised_by_name, new.confirmed_by_name),
        'purchase_document', new.id,
        case when pc.purchase_price > 0
              and abs((l.unit_price - pc.purchase_price) / pc.purchase_price * 100) >= public.purchase_variance_hold_percent()
             then 'variance_check' end
      from public.resolve_purchase_document_lines(new.company_id, new.id) x
      join public.business_document_lines l on l.company_id = new.company_id and l.id = x.line_id
      join public.product_catalog pc on pc.company_id = new.company_id and pc.id = x.product_id
      where x.reason is null
      returning product_catalog_id)
    select v_products || coalesce(array_agg(distinct product_catalog_id), '{}') into v_products from ins;
  end if;
  if cardinality(v_products) > 0 then
    v_changed := public.refresh_purchase_price_from_receipts(new.company_id, v_products);
    if v_changed > 0 then perform public.pricing_p0_command(new.company_id, '{"action":"recalculate"}'::jsonb); end if;
  end if;
  return new;
end $$;

drop trigger if exists record_purchase_document_costs on public.business_documents;
create trigger record_purchase_document_costs
after update of status, revision on public.business_documents
for each row when (new.document_type = 'purchase' and (new.status is distinct from old.status or new.revision is distinct from old.revision))
execute function public.record_purchase_document_costs();

-- 대표 확인 목록: 기록되지 못한 줄(상품 연결 필요·단위 다름·단가 이상) + 변동이 커서 반영 보류 중인 줄(variance_check)
create or replace view public.purchase_document_cost_pending_v with (security_invoker = true) as
select d.company_id, d.id as document_id, d.document_number, d.document_date, d.partner_name_snapshot as supplier_name,
  l.id as line_id, null::uuid as receipt_line_id, l.product_name_snapshot as product_name, l.unit_snapshot as unit,
  l.unit_price::numeric as unit_price, null::numeric as current_price, x.reason
from public.business_documents d
cross join lateral public.resolve_purchase_document_lines(d.company_id, d.id) x
join public.business_document_lines l on l.company_id = d.company_id and l.id = x.line_id
where d.document_type = 'purchase' and d.status = 'confirmed' and x.reason is not null
union all
select r.company_id, r.business_document_id, d.document_number, d.document_date, r.supplier_name,
  null::uuid, r.id, r.product_name, r.unit, r.unit_cost_ex_vat, pc.purchase_price, 'variance_check'
from public.purchase_receipt_lines r
join public.business_documents d on d.company_id = r.company_id and d.id = r.business_document_id
left join public.product_catalog pc on pc.company_id = r.company_id and pc.id = r.product_catalog_id
where r.source = 'purchase_document' and r.hold_reason = 'variance_check' and r.released_at is null and r.invalidated_at is null;

-- 대표가 [반영]: 보류 행을 풀고 현재 매입가·판매가 재계산. service_role 전용, 감사 기록은 같은 트랜잭션.
create or replace function public.release_purchase_document_hold(p_company uuid, p_receipt_line uuid, p_actor_user_id uuid, p_actor_name text)
returns jsonb language plpgsql security invoker set search_path = pg_catalog, public as $$
declare v_row public.purchase_receipt_lines%rowtype; v_changed integer;
begin
  if length(trim(coalesce(p_actor_name, ''))) not between 1 and 100 then raise exception 'invalid_actor'; end if;
  select * into v_row from public.purchase_receipt_lines where company_id = p_company and id = p_receipt_line for update;
  if not found or v_row.source <> 'purchase_document' or v_row.hold_reason is distinct from 'variance_check'
     or v_row.released_at is not null or v_row.invalidated_at is not null then
    raise exception 'purchase_hold_not_releasable';
  end if;
  update public.purchase_receipt_lines set released_at = now(), released_by_name = p_actor_name where id = v_row.id;
  v_changed := public.refresh_purchase_price_from_receipts(p_company, array[v_row.product_catalog_id]);
  if v_changed > 0 then perform public.pricing_p0_command(p_company, '{"action":"recalculate"}'::jsonb); end if;
  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  values (p_actor_user_id, p_company, 'purchase_variance_released', 'purchase_receipt_line', v_row.id,
    jsonb_build_object('actor_name', p_actor_name, 'document_id', v_row.business_document_id,
      'product_id', v_row.product_catalog_id, 'unit_cost_ex_vat', v_row.unit_cost_ex_vat, 'price_changed', v_changed > 0));
  return jsonb_build_object('receiptLineId', v_row.id, 'priceChanged', v_changed > 0);
end $$;

revoke all on function public.resolve_purchase_document_lines(uuid, uuid) from public, anon, authenticated;
revoke all on function public.refresh_purchase_price_from_receipts(uuid, uuid[]) from public, anon, authenticated;
revoke all on function public.record_purchase_document_costs() from public, anon, authenticated;
revoke all on function public.purchase_variance_hold_percent() from public, anon, authenticated;
revoke all on function public.release_purchase_document_hold(uuid, uuid, uuid, text) from public, anon, authenticated;
revoke all on public.purchase_document_cost_pending_v from public, anon, authenticated;
grant execute on function public.release_purchase_document_hold(uuid, uuid, uuid, text) to service_role;
grant execute on function public.resolve_purchase_document_lines(uuid, uuid) to service_role;
grant select on public.purchase_document_cost_pending_v to service_role;
commit;
