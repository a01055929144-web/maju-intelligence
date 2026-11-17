begin;
drop function public.receive_store_order_with_sale_document(uuid, uuid, integer, uuid, text);
notify pgrst, 'reload schema';
commit;
