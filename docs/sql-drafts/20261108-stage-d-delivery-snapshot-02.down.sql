-- 02 Stage D draft rollback. Data-retention approval is required before use.
begin;

drop index if exists public.store_orders_delivery_snapshot_candidates_02_idx;
drop trigger if exists store_orders_delivery_snapshot_immutable_02 on public.store_orders;
drop function if exists public.guard_store_order_delivery_snapshot_02();
alter table public.store_orders drop constraint if exists store_orders_delivery_snapshot_complete_check;
alter table public.store_orders
  drop column if exists delivery_loading_position_snapshot,
  drop column if exists delivery_recipient_phone_snapshot,
  drop column if exists delivery_address_detail_snapshot,
  drop column if exists delivery_address_snapshot,
  drop column if exists delivery_customer_name_snapshot;

commit;
