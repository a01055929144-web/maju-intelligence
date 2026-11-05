-- Disposable PostgreSQL 17 database only. Never run against production.
do $$ begin
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
alter role service_role bypassrls;

create table public.companies (id uuid primary key);
create table public.product_catalog (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null,
  canonical_name text,
  purchase_product_name text,
  sales_spec text,
  spec_value numeric,
  spec_unit text,
  sales_unit text,
  primary key (company_id, id)
);
create table public.purchase_receipt_lines (
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_date date not null,
  line_key text not null,
  product_catalog_id uuid,
  product_name text not null,
  spec text,
  unit text,
  supplier_name text,
  erp_code text,
  quantity numeric,
  unit_price numeric,
  unit_cost_ex_vat numeric,
  price_includes_vat boolean,
  tax_type text,
  total_amount numeric,
  foreign key (company_id, product_catalog_id) references public.product_catalog(company_id, id) on delete set null (product_catalog_id)
);
grant usage on schema public to service_role;
grant select on public.purchase_receipt_lines, public.product_catalog to service_role;
insert into public.companies values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into public.product_catalog(company_id,id,canonical_name,spec_value,spec_unit,sales_unit) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','두부',1,'kg','봉'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','계란',30,'구','판'),
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','다른 회사 상품',1,'kg','봉');
insert into public.purchase_receipt_lines(id,company_id,receipt_date,line_key,product_catalog_id,product_name,spec,unit,supplier_name,erp_code,quantity,unit_price,unit_cost_ex_vat,price_includes_vat,tax_type,total_amount) values
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','2026-11-05','두부','10000000-0000-4000-8000-000000000001','두부','1kg','봉','공급사','A1',10,1000,1000,false,'exempt',10000);

\ir 20261105-purchase-receipt-corrections.sql

set role service_role;
select public.correct_purchase_receipt_line(
  '00000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  900.25, '상품 연결과 단가 오입력', '테스트 담당', 0
);
do $$ begin
  if not exists (
    select 1 from public.purchase_receipt_effective
    where company_id='00000000-0000-4000-8000-000000000001'
      and product_name='계란' and unit_cost_ex_vat=900.25 and correction_revision=1
  ) then raise exception 'effective correction missing'; end if;
  if not exists (
    select 1 from public.purchase_receipt_lines
    where id='20000000-0000-4000-8000-000000000001'
      and product_name='두부' and unit_cost_ex_vat=1000 and total_amount=10000
  ) then raise exception 'raw receipt changed'; end if;
  if (select count(*) from public.purchase_receipt_correction_events) <> 1 then
    raise exception 'correction audit missing';
  end if;
end $$;

do $$ begin
  perform public.correct_purchase_receipt_line(
    '00000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    null, 800, '같은 버전 충돌 시험', '테스트 담당', 0
  );
  raise exception 'stale revision accepted';
exception when others then
  if sqlerrm <> 'receipt_correction_conflict' then raise; end if;
end $$;

do $$ begin
  perform public.correct_purchase_receipt_line(
    '00000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    800, '다른 회사 상품 거부', '테스트 담당', 1
  );
  raise exception 'cross-company product accepted';
exception when others then
  if sqlerrm <> 'product_not_in_company' then raise; end if;
end $$;
reset role;

-- Simulate the existing date/item upsert: raw cost changes, effective correction remains.
update public.purchase_receipt_lines set unit_cost_ex_vat=1100
  where id='20000000-0000-4000-8000-000000000001';
do $$ begin
  if (select unit_cost_ex_vat from public.purchase_receipt_effective
      where id='20000000-0000-4000-8000-000000000001') <> 900.25 then
    raise exception 'correction lost after reupload';
  end if;
end $$;
delete from public.companies where id='00000000-0000-4000-8000-000000000001';
do $$ begin
  if exists(select 1 from public.purchase_receipt_line_overrides)
     or exists(select 1 from public.purchase_receipt_correction_events) then
    raise exception 'company cascade left correction records';
  end if;
end $$;
