-- Disposable PostgreSQL 17 fixture only. Never run against production.
\ir ../../tests/sql/pricing-p0-fixture.sql
alter table public.product_catalog
  add column sales_unit text not null default 'EA',
  add column updated_at timestamptz not null default now();
\ir 20261030-pricing-p0.sql

create table public.product_suppliers(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  unique(company_id, id)
);
create table public.product_catalog_imports(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null,
  file_name text not null, mapping jsonb not null default '{}'::jsonb,
  total_rows integer not null default 0, updated_count integer not null default 0,
  status text not null, created_by_name text, completed_at timestamptz,
  unique(company_id, id),
  foreign key(company_id, supplier_id) references public.product_suppliers(company_id, id) on delete cascade
);
create table public.supplier_products(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null, raw_unit text not null,
  latest_cost numeric(14,2), cost_confirmed boolean not null default false,
  last_seen_date date, updated_at timestamptz not null default now(),
  unique(company_id, id),
  foreign key(company_id, supplier_id) references public.product_suppliers(company_id, id) on delete cascade
);
create table public.supplier_product_matches(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  supplier_product_id uuid not null, product_catalog_id uuid not null,
  match_status text not null, purchase_to_sales_ratio numeric(14,3),
  conversion_confirmed boolean not null default false,
  foreign key(company_id, supplier_product_id) references public.supplier_products(company_id, id) on delete cascade,
  foreign key(company_id, product_catalog_id) references public.product_catalog(company_id, id) on delete cascade
);
create table public.supplier_product_cost_history(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  supplier_product_id uuid not null, import_id uuid not null,
  price_date date not null, purchase_price numeric(14,2) not null,
  foreign key(company_id, supplier_product_id) references public.supplier_products(company_id, id) on delete cascade,
  foreign key(company_id, import_id) references public.product_catalog_imports(company_id, id) on delete cascade,
  unique(company_id, supplier_product_id, import_id, price_date)
);
grant select, update on public.product_catalog to service_role;
grant select, insert on public.product_catalog_imports, public.supplier_product_cost_history to service_role;
grant select, update on public.supplier_products to service_role;
grant select on public.supplier_product_matches to service_role;
grant select on public.product_suppliers to service_role;
\ir 20261107-purchase-cost-batch.sql

begin;
insert into public.companies(id) values
 ('00000000-0000-4000-8000-000000000001'),
 ('00000000-0000-4000-8000-000000000002');
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,sales_unit) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A',100,'EA'),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B',50,'EA');
insert into public.product_suppliers(id,company_id) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
insert into public.supplier_products(id,company_id,supplier_id,raw_unit,latest_cost,cost_confirmed) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','BOX',2000,true),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','BOX',1000,true);
insert into public.supplier_product_matches(id,company_id,supplier_product_id,product_catalog_id,match_status,purchase_to_sales_ratio,conversion_confirmed) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','confirmed',20,true),
 ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','confirmed',20,true);
set local role service_role;
do $$
declare
  a uuid := '00000000-0000-4000-8000-000000000001';
  b uuid := '00000000-0000-4000-8000-000000000002';
  batch uuid := '50000000-0000-4000-8000-000000000001';
  request jsonb := '[{"productId":"10000000-0000-4000-8000-000000000001","supplierProductId":"30000000-0000-4000-8000-000000000001","expectedCost":100,"cost":200,"fileName":"test.xlsx"}]';
  result jsonb;
begin
  perform public.pricing_p0_command(a, '{"action":"defaults","margin":20,"rounding":10}');
  perform public.pricing_p0_command(a, '{"action":"recalculate"}');
  if (select price from public.pricing_items where company_id=a) <> 120 then raise exception 'initial_sale_price'; end if;

  result := public.save_purchase_cost_batch_v1(a, batch, request, 'tester');
  if result->>'status' <> 'applied' then raise exception 'save_status'; end if;
  if (select purchase_price from public.product_catalog where company_id=a) <> 200
    or (select latest_cost from public.supplier_products where company_id=a) <> 4000
    or (select price from public.pricing_items where company_id=a) <> 240 then
    raise exception 'cost_conversion_or_price';
  end if;
  if (public.save_purchase_cost_batch_v1(a, batch, request, 'tester')->>'status') <> 'already_applied'
    or (select count(*) from public.supplier_product_cost_history where company_id=a) <> 1 then
    raise exception 'same_batch_not_idempotent';
  end if;
  begin
    perform public.save_purchase_cost_batch_v1(
      a, batch,
      '[{"productId":"10000000-0000-4000-8000-000000000001","expectedCost":100,"cost":300}]',
      'tester'
    );
    raise exception 'digest_conflict_missing';
  exception when raise_exception then
    if sqlerrm = 'digest_conflict_missing' then raise; end if;
  end;
  begin
    perform public.save_purchase_cost_batch_v1(
      a, '50000000-0000-4000-8000-000000000002',
      '[{"productId":"10000000-0000-4000-8000-000000000002","expectedCost":50,"cost":60}]',
      'tester'
    );
    raise exception 'cross_company_write_allowed';
  exception when raise_exception then
    if sqlerrm = 'cross_company_write_allowed' then raise; end if;
  end;
  if (select purchase_price from public.product_catalog where company_id=b) <> 50 then
    raise exception 'cross_company_changed';
  end if;
  begin
    perform public.save_purchase_cost_batch_v1(
      a, '50000000-0000-4000-8000-000000000003',
      '[{"productId":"10000000-0000-4000-8000-000000000001","expectedCost":200,"cost":210},{"productId":"10000000-0000-4000-8000-000000000099","expectedCost":1,"cost":2}]',
      'tester'
    );
    raise exception 'partial_batch_committed';
  exception when raise_exception then
    if sqlerrm = 'partial_batch_committed' then raise; end if;
  end;
  if (select purchase_price from public.product_catalog where company_id=a) <> 200
    or (select count(*) from public.purchase_cost_batches where company_id=a) <> 1 then
    raise exception 'partial_batch_rollback';
  end if;
  if (public.restore_purchase_cost_batch_v1(a,batch,'tester')->>'status') <> 'restored'
    or (public.restore_purchase_cost_batch_v1(a,batch,'tester')->>'status') <> 'already_restored' then
    raise exception 'restore_idempotency';
  end if;
  if (select purchase_price from public.product_catalog where company_id=a) <> 100
    or (select latest_cost from public.supplier_products where company_id=a) <> 2000
    or (select price from public.pricing_items where company_id=a) <> 120
    or (select count(*) from public.supplier_product_cost_history where company_id=a) <> 2 then
    raise exception 'restore_values_or_audit';
  end if;
end $$;
reset role;
do $$
begin
  if has_table_privilege('anon', 'public.purchase_cost_batches', 'SELECT')
     or has_function_privilege('authenticated', 'public.save_purchase_cost_batch_v1(uuid,uuid,jsonb,text)', 'EXECUTE') then
    raise exception 'public_purchase_cost_access';
  end if;
end $$;
delete from public.companies where id = '00000000-0000-4000-8000-000000000001';
do $$
begin
  if exists(select 1 from public.purchase_cost_batches
            where company_id = '00000000-0000-4000-8000-000000000001') then
    raise exception 'company_delete_left_batches';
  end if;
end $$;
rollback;
