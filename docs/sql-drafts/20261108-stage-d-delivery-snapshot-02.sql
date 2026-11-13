-- 02 Stage D draft only. Do not apply to an operating database without approval.
begin;

alter table public.store_orders add column if not exists delivery_customer_name_snapshot text;
alter table public.store_orders add column if not exists delivery_address_snapshot text;
alter table public.store_orders add column if not exists delivery_address_detail_snapshot text;
alter table public.store_orders add column if not exists delivery_recipient_phone_snapshot text;
alter table public.store_orders add column if not exists delivery_loading_position_snapshot text;

do $$
begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.store_orders'::regclass
      and conname = 'store_orders_delivery_snapshot_complete_check'
  ) then
    alter table public.store_orders
      add constraint store_orders_delivery_snapshot_complete_check check (
        (
          delivery_customer_name_snapshot is null
          and delivery_address_snapshot is null
          and delivery_address_detail_snapshot is null
          and delivery_recipient_phone_snapshot is null
          and delivery_loading_position_snapshot is null
        )
        or (
          nullif(btrim(delivery_customer_name_snapshot), '') is not null
          and nullif(btrim(delivery_address_snapshot), '') is not null
        )
      );
  end if;
end $$;

create or replace function public.guard_store_order_delivery_snapshot_02()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.delivery_customer_name_snapshot is not null
    and row(
      new.delivery_customer_name_snapshot,
      new.delivery_address_snapshot,
      new.delivery_address_detail_snapshot,
      new.delivery_recipient_phone_snapshot,
      new.delivery_loading_position_snapshot
    ) is distinct from row(
      old.delivery_customer_name_snapshot,
      old.delivery_address_snapshot,
      old.delivery_address_detail_snapshot,
      old.delivery_recipient_phone_snapshot,
      old.delivery_loading_position_snapshot
    ) then
    raise exception 'store_order_delivery_snapshot_immutable';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_store_order_delivery_snapshot_02() from public;

drop trigger if exists store_orders_delivery_snapshot_immutable_02 on public.store_orders;
create trigger store_orders_delivery_snapshot_immutable_02
before update of
  delivery_customer_name_snapshot,
  delivery_address_snapshot,
  delivery_address_detail_snapshot,
  delivery_recipient_phone_snapshot,
  delivery_loading_position_snapshot
on public.store_orders
for each row execute function public.guard_store_order_delivery_snapshot_02();

create index if not exists store_orders_delivery_snapshot_candidates_02_idx
  on public.store_orders(company_id, delivery_date, customer_id, id)
  where status in ('submitted', 'received', 'in_delivery')
    and delivery_customer_name_snapshot is not null
    and delivery_address_snapshot is not null;

commit;

-- Rollback after explicit data-retention review only:
-- drop index if exists public.store_orders_delivery_snapshot_candidates_02_idx;
-- drop trigger if exists store_orders_delivery_snapshot_immutable_02 on public.store_orders;
-- drop function if exists public.guard_store_order_delivery_snapshot_02();
-- alter table public.store_orders drop constraint if exists store_orders_delivery_snapshot_complete_check;
-- alter table public.store_orders
--   drop column if exists delivery_loading_position_snapshot,
--   drop column if exists delivery_recipient_phone_snapshot,
--   drop column if exists delivery_address_detail_snapshot,
--   drop column if exists delivery_address_snapshot,
--   drop column if exists delivery_customer_name_snapshot;
