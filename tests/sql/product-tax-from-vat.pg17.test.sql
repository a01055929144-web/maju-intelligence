-- Synthetic PG17 fixture for the guarded draft and its rollback.
create table public.product_catalog (
  id uuid primary key,
  company_id uuid not null,
  tax_type text,
  is_active boolean not null default true,
  purchase_price numeric not null default 1000,
  default_sales_price numeric not null default 1200,
  updated_at timestamptz not null default now()
);
create table public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  product_catalog_id uuid,
  tax_type text,
  vat_amount numeric
);
insert into public.product_catalog (id, company_id, tax_type, is_active)
select ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       '10000000-0000-4000-8000-000000000001'::uuid, 'exempt', i <> 379
from generate_series(1, 379) i;
insert into public.purchase_receipt_lines (company_id, product_catalog_id, tax_type, vat_amount)
select '10000000-0000-4000-8000-000000000001'::uuid,
       ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'taxable', 100
from generate_series(1, 379) i;
insert into public.purchase_receipt_lines (company_id, product_catalog_id, tax_type, vat_amount)
select '10000000-0000-4000-8000-000000000001'::uuid,
       ('00000000-0000-4000-8000-' || lpad(i::text, 12, '0'))::uuid,
       'taxable', 100
from generate_series(1, 343) i;
insert into public.product_catalog (id, company_id, tax_type)
values ('00000000-0000-4000-8000-000000000380', '10000000-0000-4000-8000-000000000001', 'exempt');
insert into public.purchase_receipt_lines (company_id, product_catalog_id, tax_type, vat_amount)
values
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000380', 'taxable', 100),
  ('10000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000380', 'exempt', 0);
