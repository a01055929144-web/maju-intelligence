-- E2 down. 전표에서 기록된 매입 이력(source='purchase_document')을 지우므로 적용 전 db-approval 기록에 건수를 남긴다.
-- 이미 반영(released)된 줄이 바꾼 현재 매입가·판매가는 되돌리지 않는다(되돌리려면 업로드 되돌리기와 같은 별도 승인).
begin;
drop trigger if exists record_purchase_document_costs on public.business_documents;
drop view if exists public.purchase_document_cost_pending_v;
drop function if exists public.release_purchase_document_hold(uuid, uuid, uuid, text);
drop function if exists public.record_purchase_document_costs();
drop function if exists public.refresh_purchase_price_from_receipts(uuid, uuid[]);
drop function if exists public.resolve_purchase_document_lines(uuid, uuid);
drop function if exists public.purchase_variance_hold_percent();
delete from public.purchase_receipt_lines where source = 'purchase_document';
alter table public.purchase_receipt_lines
  drop constraint if exists purchase_receipt_lines_release_check,
  drop constraint if exists purchase_receipt_lines_hold_check,
  drop constraint if exists purchase_receipt_lines_document_fk,
  drop constraint if exists purchase_receipt_lines_invalid_reason_check,
  drop constraint if exists purchase_receipt_lines_source_doc_check,
  drop constraint if exists purchase_receipt_lines_source_check;
drop index if exists public.purchase_receipt_lines_document_idx;
alter table public.purchase_receipt_lines
  drop column if exists released_by_name, drop column if exists released_at, drop column if exists hold_reason,
  drop column if exists invalidated_reason, drop column if exists invalidated_at,
  drop column if exists business_document_id, drop column if exists source;
commit;
