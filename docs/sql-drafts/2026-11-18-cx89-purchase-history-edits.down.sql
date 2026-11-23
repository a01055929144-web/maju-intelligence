begin;
drop function if exists public.mutate_purchase_receipt_line(uuid,text,uuid,jsonb,text,text,integer);
create or replace view public.purchase_receipt_effective with (security_invoker = true) as
select r.id,r.company_id,r.receipt_date,r.line_key,coalesce(o.product_catalog_id,r.product_catalog_id) product_catalog_id,
  coalesce(o.product_name,r.product_name) product_name,case when o.receipt_line_id is not null then o.spec else r.spec end spec,
  case when o.receipt_line_id is not null then o.unit else r.unit end unit,r.supplier_name,r.erp_code,r.quantity,r.unit_price,
  coalesce(o.unit_cost_ex_vat,r.unit_cost_ex_vat) unit_cost_ex_vat,r.price_includes_vat,r.tax_type,r.total_amount,
  coalesce(o.revision,0) correction_revision,(o.receipt_line_id is not null) corrected
from public.purchase_receipt_lines r left join public.purchase_receipt_line_overrides o on o.company_id=r.company_id and o.receipt_line_id=r.id
where r.invalidated_at is null;
revoke all on public.purchase_receipt_effective from public,anon,authenticated;
grant select on public.purchase_receipt_effective to service_role;
alter table public.purchase_receipt_line_overrides drop column if exists deleted_at,drop column if exists quantity;
commit;
