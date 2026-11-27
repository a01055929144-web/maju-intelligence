begin;
drop function public.cancel_customer_store_order(uuid, uuid, integer, text, uuid, uuid, text);
notify pgrst, 'reload schema';
commit;
