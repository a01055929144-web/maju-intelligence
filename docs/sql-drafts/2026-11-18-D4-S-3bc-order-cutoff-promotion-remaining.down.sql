-- D4 S-3b/S-3c rollback draft.
drop function if exists public.promotion_remaining_v1(uuid, uuid[]);
alter table public.product_catalog
  drop constraint if exists product_catalog_order_cutoff_pair_check,
  drop constraint if exists product_catalog_order_cutoff_days_check,
  drop column if exists order_cutoff_time,
  drop column if exists order_cutoff_days_before;
