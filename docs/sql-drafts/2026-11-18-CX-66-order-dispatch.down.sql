begin;
do $$ begin
  if exists (select 1 from public.order_dispatch_requests) then
    raise exception 'order_dispatch_history_exists';
  end if;
end $$;
drop trigger if exists order_sale_document_requires_dispatch on public.business_documents;
drop function if exists public.block_order_sale_document_early_confirmation();
drop function if exists public.dispatch_store_orders(uuid,uuid[],uuid,uuid,text);
drop table if exists public.order_dispatch_requests;
notify pgrst, 'reload schema';
commit;
