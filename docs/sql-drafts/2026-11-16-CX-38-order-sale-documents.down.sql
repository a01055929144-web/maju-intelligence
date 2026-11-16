-- CX-38 rollback draft. Disable callers first. Never discard receipt evidence.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$
begin
  if exists (select 1 from public.business_document_receipts) then
    raise exception 'CX-38 down refused: business_document_receipts contains evidence';
  end if;
end;
$$;

drop function if exists public.record_business_document_receipt(uuid, uuid, integer, text, uuid, uuid, text, uuid);
drop function if exists public.cancel_order_sale_document(uuid, uuid, uuid, text, text);
drop function if exists public.revise_order_sale_document(uuid, uuid, integer, uuid, text, text);
drop function if exists public.confirm_order_sale_document(uuid, uuid, uuid, text);
drop function if exists public.order_sale_document_lines(uuid, uuid);
drop table public.business_document_receipts;
alter table public.customer_attachments drop constraint customer_attachments_company_id_id_uq;
commit;
