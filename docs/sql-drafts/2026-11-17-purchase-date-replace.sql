-- 2026-11-17 매입가 날짜별 업로드: 같은 날짜를 다시 올리면 새 파일이 최신본(정정본)이 된다.
-- 대표 요청(11/17 11:24): "매입가가 계속 바뀌고 지금이 최신 버전이면 과거 데이터도 정정해서 올라가야 한다."
--
-- 동작
-- 1) save_purchase_cost_date_batch_v2 가 배치를 completed 로 바꾸는 순간(같은 트랜잭션, BEFORE UPDATE 트리거)
--    이 배치에 들어 있는 날짜의 "이전 업로드" 매입 행을 무효 처리한다(invalidated_at · invalidated_reason).
--    - 대상: source='upload', 다른 배치, 아직 유효한 행.
--    - 날짜 없이 올려 업로드한 날이 찍힌 행(예: 10월 월합계를 11/04로 저장)은 원본 값에 그 날짜가 없으므로 건드리지 않는다.
--      → 이전 v2 배치 행이거나, 원본 값(raw_values)에 그 날짜(YYYY/MM/DD · YYYY-MM-DD · YYYY.MM.DD)가 적힌 행만 바꾼다.
--    - 매입처 원가 이력(supplier_product_cost_history)도 같은 매입처 품목·같은 날짜의 이전 행을 배치에 보관한 뒤 지운다.
-- 2) 되돌리기(restore_purchase_cost_date_batch_v2 → status restored) 때 무효 처리한 행을 다시 살리고, 보관한 원가 이력을 되살린다.
-- 3) purchase_receipt_effective(매입 이력 화면)는 무효 처리된 행을 보여 주지 않는다.
-- 저장·되돌리기 함수 본문은 바꾸지 않는다. 현재 매입가는 기존 규칙(같거나 더 최근 날짜면 반영) 그대로다.

set lock_timeout = '3s';

alter table public.purchase_cost_date_batches_v2
  add column if not exists replaced_receipt_count integer not null default 0,
  add column if not exists replaced_cost_history jsonb not null default '[]'::jsonb;

alter table public.purchase_cost_date_batches_v2
  drop constraint if exists purchase_cost_date_batches_v2_replaced_count_check,
  drop constraint if exists purchase_cost_date_batches_v2_replaced_history_check,
  add constraint purchase_cost_date_batches_v2_replaced_count_check check (replaced_receipt_count >= 0),
  add constraint purchase_cost_date_batches_v2_replaced_history_check check (jsonb_typeof(replaced_cost_history) = 'array');

create or replace function public.purchase_cost_date_batch_replace_v2()
returns trigger
language plpgsql
security definer
set search_path to 'pg_catalog', 'public'
as $function$
declare
  v_reason text := 'replaced_by_purchase_date_batch:' || new.id::text;
  v_count integer;
  v_history jsonb;
begin
  if old.status = 'processing' and new.status = 'completed' then
    update public.purchase_receipt_lines r
       set invalidated_at = clock_timestamp(), invalidated_reason = v_reason
     where r.company_id = new.company_id
       and r.source = 'upload'
       and r.invalidated_at is null
       and r.purchase_cost_date_batch_id is distinct from new.id
       and r.receipt_date in (
         select distinct n.receipt_date from public.purchase_receipt_lines n
          where n.company_id = new.company_id and n.purchase_cost_date_batch_id = new.id)
       and (r.purchase_cost_date_batch_id is not null
            or strpos(r.raw_values::text, to_char(r.receipt_date, 'YYYY/MM/DD')) > 0
            or strpos(r.raw_values::text, to_char(r.receipt_date, 'YYYY-MM-DD')) > 0
            or strpos(r.raw_values::text, to_char(r.receipt_date, 'YYYY.MM.DD')) > 0);
    get diagnostics v_count = row_count;
    new.replaced_receipt_count := v_count;

    with mine as (
      select distinct h.supplier_product_id, h.price_date
        from public.supplier_product_cost_history h
       where h.company_id = new.company_id
         and h.import_id in (select value::text::uuid from jsonb_each_text(new.supplier_import_ids))
    ), gone as (
      delete from public.supplier_product_cost_history h
       using mine
       where h.company_id = new.company_id
         and h.supplier_product_id = mine.supplier_product_id
         and h.price_date = mine.price_date
         and h.import_id not in (select value::text::uuid from jsonb_each_text(new.supplier_import_ids))
      returning h.*
    )
    select coalesce(jsonb_agg(to_jsonb(gone)), '[]'::jsonb) into v_history from gone;
    new.replaced_cost_history := v_history;
  elsif old.status = 'completed' and new.status = 'restored' then
    update public.purchase_receipt_lines
       set invalidated_at = null, invalidated_reason = null
     where company_id = new.company_id and invalidated_reason = v_reason;
    insert into public.supplier_product_cost_history
    select (jsonb_populate_record(null::public.supplier_product_cost_history, item)).*
      from jsonb_array_elements(old.replaced_cost_history) item
    on conflict do nothing;
  end if;
  return new;
end
$function$;

revoke all on function public.purchase_cost_date_batch_replace_v2() from public, anon, authenticated, service_role;

drop trigger if exists purchase_cost_date_batch_replace_v2 on public.purchase_cost_date_batches_v2;
create trigger purchase_cost_date_batch_replace_v2
  before update of status on public.purchase_cost_date_batches_v2
  for each row execute function public.purchase_cost_date_batch_replace_v2();

create or replace view public.purchase_receipt_effective with (security_invoker = true) as
select r.id, r.company_id, r.receipt_date, r.line_key,
  coalesce(o.product_catalog_id, r.product_catalog_id) as product_catalog_id,
  coalesce(o.product_name, r.product_name) as product_name,
  case when o.receipt_line_id is not null then o.spec else r.spec end as spec,
  case when o.receipt_line_id is not null then o.unit else r.unit end as unit,
  r.supplier_name, r.erp_code, r.quantity, r.unit_price,
  coalesce(o.unit_cost_ex_vat, r.unit_cost_ex_vat) as unit_cost_ex_vat,
  r.price_includes_vat, r.tax_type, r.total_amount,
  coalesce(o.revision, 0) as correction_revision, (o.receipt_line_id is not null) as corrected
from public.purchase_receipt_lines r
left join public.purchase_receipt_line_overrides o
  on o.company_id = r.company_id and o.receipt_line_id = r.id
where r.invalidated_at is null;
revoke all on public.purchase_receipt_effective from public, anon, authenticated;
grant select on public.purchase_receipt_effective to service_role;
