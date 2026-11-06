-- Disposable prerequisites for the real ERP and storefront migrations.
-- Never run against an existing or production database.
create table public.delivery_territories(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  name text not null default '', unique(company_id,id)
);
create table public.normalized_customers(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  customer_name text not null, address text, phone text, business_registration_number text,
  representative_name text, delivery_territory_id uuid, unique(company_id,id)
);
create table public.product_suppliers(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, business_number text, representative_name text, address text,
  contact_phone text, unique(company_id,id)
);
create table public.supplier_products(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  unique(company_id,id)
);
create table public.company_members(
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  unique(company_id,id)
);
create table public.customer_price_agreements(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, customer_id uuid not null,
  product_catalog_id uuid not null, sales_unit text not null, unit_price bigint not null,
  tax_type text not null, price_includes_tax boolean not null default false,
  status text not null default 'active', effective_from date not null default current_date,
  effective_until date
);
