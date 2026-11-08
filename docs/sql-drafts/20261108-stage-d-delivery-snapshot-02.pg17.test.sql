\set ON_ERROR_STOP on

create table public.companies (
  id uuid primary key
);

create table public.store_orders (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  delivery_date date not null,
  status text not null check (status in ('submitted', 'received', 'in_delivery', 'delivered', 'cancelled')),
  revision integer not null default 1
);

insert into public.companies(id) values
  ('a0000000-0000-4000-8000-000000000001'),
  ('b0000000-0000-4000-8000-000000000001');

insert into public.store_orders(id, company_id, customer_id, delivery_date, status)
values (
  '10000000-0000-4000-8000-000000000001',
  'a0000000-0000-4000-8000-000000000001',
  'c0000000-0000-4000-8000-000000000001',
  date '2026-11-08',
  'submitted'
);

\ir 20261108-stage-d-delivery-snapshot-02.sql

begin;

do $$
declare
  company_a constant uuid := 'a0000000-0000-4000-8000-000000000001';
  company_b constant uuid := 'b0000000-0000-4000-8000-000000000001';
  customer_a constant uuid := 'c0000000-0000-4000-8000-000000000001';
begin
  if not exists (
    select 1 from public.store_orders
    where id = '10000000-0000-4000-8000-000000000001'
      and delivery_customer_name_snapshot is null
      and delivery_address_snapshot is null
  ) then
    raise exception 'legacy_order_not_preserved';
  end if;

  insert into public.store_orders(
    id, company_id, customer_id, delivery_date, status,
    delivery_customer_name_snapshot, delivery_address_snapshot,
    delivery_address_detail_snapshot, delivery_recipient_phone_snapshot,
    delivery_loading_position_snapshot
  ) values
    ('20000000-0000-4000-8000-000000000001', company_a, customer_a, date '2026-11-08', 'submitted', '가 매장', '서울 강남구 1', '101호', '010-1111-2222', '후문'),
    ('20000000-0000-4000-8000-000000000002', company_a, customer_a, date '2026-11-08', 'cancelled', '가 매장', '서울 강남구 1', null, null, '후문'),
    ('20000000-0000-4000-8000-000000000003', company_a, customer_a, date '2026-11-08', 'delivered', '가 매장', '서울 강남구 1', null, null, '후문'),
    ('20000000-0000-4000-8000-000000000004', company_b, customer_a, date '2026-11-08', 'received', '나 매장', '서울 송파구 2', null, null, '정문');

  if (
    select count(*) from public.store_orders
    where company_id = company_a
      and delivery_date = date '2026-11-08'
      and status in ('submitted', 'received', 'in_delivery')
      and delivery_customer_name_snapshot is not null
      and delivery_address_snapshot is not null
  ) <> 1 then
    raise exception 'company_or_status_candidate_scope_failed';
  end if;

  if (
    select count(*) from public.store_orders
    where company_id = company_a
      and status in ('submitted', 'received', 'in_delivery')
      and (delivery_customer_name_snapshot is null or delivery_address_snapshot is null)
  ) <> 1 then
    raise exception 'legacy_blocked_order_not_visible';
  end if;

  delete from public.companies where id = company_b;
  if exists (select 1 from public.store_orders where company_id = company_b) then
    raise exception 'company_delete_left_delivery_rows';
  end if;
  if (select count(*) from public.store_orders where company_id = company_a) <> 4 then
    raise exception 'company_delete_crossed_tenant_boundary';
  end if;

  begin
    insert into public.store_orders(
      id, company_id, customer_id, delivery_date, status,
      delivery_customer_name_snapshot
    ) values (
      '30000000-0000-4000-8000-000000000001', company_a, customer_a,
      date '2026-11-08', 'submitted', '부분 사본'
    );
    raise exception 'partial_snapshot_allowed';
  exception when check_violation then
    null;
  end;

  begin
    update public.store_orders
    set delivery_address_snapshot = '변경된 주소'
    where id = '20000000-0000-4000-8000-000000000001';
    raise exception 'snapshot_update_allowed';
  exception when raise_exception then
    if sqlerrm <> 'store_order_delivery_snapshot_immutable' then raise; end if;
  end;
end $$;

rollback;

\ir 20261108-stage-d-delivery-snapshot-02.down.sql

do $$
begin
  if exists (
    select 1 from information_schema.columns
    where table_schema = 'public'
      and table_name = 'store_orders'
      and column_name like 'delivery_%_snapshot'
  ) then
    raise exception 'down_left_snapshot_columns';
  end if;
  if to_regprocedure('public.guard_store_order_delivery_snapshot_02()') is not null then
    raise exception 'down_left_snapshot_guard';
  end if;
  if not exists (
    select 1 from public.store_orders
    where id = '10000000-0000-4000-8000-000000000001'
  ) then
    raise exception 'down_removed_legacy_order';
  end if;
end $$;
