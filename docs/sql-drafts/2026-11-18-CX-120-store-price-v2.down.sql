-- CX-120 rollback. Function-only change; no data is removed.
begin;
drop function if exists public.self_order_price_v2(uuid,uuid,uuid,date,boolean);
commit;
