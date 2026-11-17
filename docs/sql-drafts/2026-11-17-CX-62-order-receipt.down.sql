begin;
lock table public.business_documents in share row exclusive mode;
do $$ begin
  if exists (select 1 from public.business_documents
    where source_type = 'order' and document_type = 'sale' and status = 'draft') then
    raise exception 'cx62_down_refused_open_order_drafts';
  end if;
end $$;
drop trigger order_sale_document_requires_dispatch on public.business_documents;
drop function public.block_order_sale_document_early_confirmation();
drop function public.receive_store_order_with_sale_document(uuid, uuid, integer, uuid, text);
notify pgrst, 'reload schema';
commit;
