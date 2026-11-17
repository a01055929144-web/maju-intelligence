-- 2026-11-17-purchase-date-replace.sql 되돌리기.
-- 바꿔 넣기로 무효 처리된 행과 보관한 원가 이력을 먼저 되살린 뒤 트리거·컬럼을 지운다.
set lock_timeout = '3s';

drop trigger if exists purchase_cost_date_batch_replace_v2 on public.purchase_cost_date_batches_v2;
drop function if exists public.purchase_cost_date_batch_replace_v2();

update public.purchase_receipt_lines
   set invalidated_at = null, invalidated_reason = null
 where invalidated_reason like 'replaced_by_purchase_date_batch:%';

insert into public.supplier_product_cost_history
select (jsonb_populate_record(null::public.supplier_product_cost_history, item)).*
  from public.purchase_cost_date_batches_v2 b, jsonb_array_elements(b.replaced_cost_history) item
 where b.status = 'completed'
on conflict do nothing;

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
  on o.company_id = r.company_id and o.receipt_line_id = r.id;
revoke all on public.purchase_receipt_effective from public, anon, authenticated;
grant select on public.purchase_receipt_effective to service_role;

alter table public.purchase_cost_date_batches_v2
  drop constraint if exists purchase_cost_date_batches_v2_replaced_history_check,
  drop constraint if exists purchase_cost_date_batches_v2_replaced_count_check,
  drop column if exists replaced_cost_history,
  drop column if exists replaced_receipt_count;
