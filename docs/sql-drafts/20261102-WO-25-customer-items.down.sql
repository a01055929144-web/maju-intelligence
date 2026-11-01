-- DRAFT ONLY. Disable CUSTOMER_ITEMS_IMPORT_ENABLED first.
-- Export customer_items before approval: dropping this table removes imported history.
-- No CASCADE and no changes to existing company/customer/product/base-price tables.
begin;
drop function public.import_customer_items(uuid,jsonb);
drop table public.customer_items;
commit;
