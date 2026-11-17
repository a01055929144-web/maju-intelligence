begin;
lock table public.store_orders, public.business_documents in share row exclusive mode;
do $$ begin
  if exists (select 1 from public.business_documents
    where source_type = 'order' and document_type = 'sale' and status = 'draft') then
    raise exception 'cx62_down_refused_open_order_drafts';
  end if;
end $$;
drop trigger remove_cancelled_order_sale_draft on public.store_orders;
drop function public.remove_cancelled_order_sale_draft();
drop function public.receive_store_order_with_sale_document(uuid, uuid, integer, uuid, text);
notify pgrst, 'reload schema';
commit;
