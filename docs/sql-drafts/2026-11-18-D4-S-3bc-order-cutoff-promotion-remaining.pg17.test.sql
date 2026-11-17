\set ON_ERROR_STOP on
begin;

do $$ begin
  if current_setting('server_version_num')::integer < 170000 then raise exception 'PostgreSQL 17+ required'; end if;
end $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.product_catalog(id uuid primary key, company_id uuid not null, unique(company_id, id));
create table public.pricing_promotions(
  id uuid primary key, company_id uuid not null, product_id uuid not null,
  stock bigint, per_store_limit bigint, unique(company_id, id)
);
create table public.store_orders(
  id uuid primary key, company_id uuid not null, status text not null, unique(company_id, id)
);
create table public.store_order_lines(
  id uuid primary key, company_id uuid not null, order_id uuid not null, promotion_id uuid, quantity numeric(14,3) not null
);

\ir 2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.sql

insert into public.product_catalog(id, company_id) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001');
do $$ begin
  assert (select order_cutoff_days_before is null and order_cutoff_time is null from public.product_catalog limit 1), 'cutoff must default OFF';
  begin
    update public.product_catalog set order_cutoff_days_before = 1 where id = '00000000-0000-4000-8000-000000000011';
    raise exception 'unpaired cutoff accepted';
  exception when check_violation then null;
  end;
end $$;
update public.product_catalog set order_cutoff_days_before = 1, order_cutoff_time = time '18:00'
where id = '00000000-0000-4000-8000-000000000011';

insert into public.pricing_promotions(id, company_id, product_id, stock, per_store_limit) values
  ('00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 10, 4),
  ('00000000-0000-4000-8000-000000000201', '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000021', 99, 9);
insert into public.store_orders(id, company_id, status) values
  ('00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000001', 'submitted'),
  ('00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000001', 'cancelled');
insert into public.store_order_lines(id, company_id, order_id, promotion_id, quantity) values
  ('00000000-0000-4000-8000-000000000401', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000301', '00000000-0000-4000-8000-000000000101', 3),
  ('00000000-0000-4000-8000-000000000402', '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000302', '00000000-0000-4000-8000-000000000101', 6);

do $$
declare result record;
begin
  select * into result from public.promotion_remaining_v1(
    '00000000-0000-4000-8000-000000000001',
    array['00000000-0000-4000-8000-000000000101', '00000000-0000-4000-8000-000000000201']::uuid[]
  );
  assert result.promotion_id = '00000000-0000-4000-8000-000000000101', 'cross-company promotion leaked';
  assert result.reserved_quantity = 3 and result.remaining_quantity = 7, 'cancelled quantity affected remaining stock';
  assert result.per_store_limit = 4, 'per-store limit missing';
  assert not has_function_privilege('authenticated', 'public.promotion_remaining_v1(uuid,uuid[])', 'execute'), 'authenticated can execute';
  assert has_function_privilege('service_role', 'public.promotion_remaining_v1(uuid,uuid[])', 'execute'), 'service role cannot execute';
end $$;

\ir 2026-11-18-D4-S-3bc-order-cutoff-promotion-remaining.down.sql
do $$ begin
  assert to_regprocedure('public.promotion_remaining_v1(uuid,uuid[])') is null, 'function remained after down';
  assert not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'product_catalog' and column_name like 'order_cutoff%'), 'columns remained after down';
end $$;

rollback;
