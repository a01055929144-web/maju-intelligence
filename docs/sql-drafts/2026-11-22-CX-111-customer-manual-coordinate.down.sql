-- DRAFT ONLY. Keep CUSTOMER_MANUAL_COORDINATE_ENABLED=false before rollback.
begin;
drop function if exists public.set_customer_manual_coordinate_atomic(uuid, uuid, double precision, double precision, uuid, text, text);
notify pgrst, 'reload schema';
commit;
