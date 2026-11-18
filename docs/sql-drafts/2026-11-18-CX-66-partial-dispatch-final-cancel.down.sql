begin;
do $$ begin
  if exists(select 1 from public.order_dispatch_requests where request_payload is not null)
    or exists(select 1 from public.store_order_lines where shipped_quantity<>0 or cancelled_quantity<>0)
    or exists(select 1 from public.store_orders where sale_document_id is not null) then
    raise exception 'partial_dispatch_history_exists';
  end if;
end $$;
drop function if exists public.dispatch_store_orders_partial_final_cancel(uuid,jsonb,uuid,uuid,text);
alter table public.order_dispatch_requests drop column request_payload;
alter table public.business_document_lines
  drop constraint business_document_lines_source_order_line_fk,
  drop column source_order_line_id;
alter table public.store_order_lines
  drop constraint store_order_lines_dispatch_quantity_check,
  drop column cancelled_quantity,
  drop column shipped_quantity,
  drop constraint store_order_lines_company_id_id_uq;
alter table public.store_orders
  drop constraint store_orders_sale_document_fk,
  drop column sale_document_id,
  drop column shipped_at;
notify pgrst,'reload schema';
commit;
