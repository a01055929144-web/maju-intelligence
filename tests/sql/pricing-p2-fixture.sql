-- Disposable PG16 fixture. Never run against an existing or production database.
create table public.delivery_territories (
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  unique (company_id, id)
);
create table public.normalized_customers (
  id uuid primary key, company_id uuid not null references public.companies(id) on delete cascade,
  customer_name text not null, address text, delivery_territory_id uuid,
  unique (company_id, id)
);
create table public.customer_price_agreements (
  id uuid primary key, company_id uuid not null, customer_id uuid not null,
  product_catalog_id uuid not null, sales_unit text not null, unit_price bigint not null,
  tax_type text not null, price_includes_tax boolean not null default false,
  status text not null, effective_from date not null, effective_until date
);
create table public.business_documents (
  id uuid primary key, company_id uuid not null, customer_id uuid not null,
  document_date date not null, document_type text not null, status text not null
);
create table public.business_document_lines (
  id uuid primary key, company_id uuid not null, document_id uuid not null,
  product_catalog_id uuid, unit_price bigint not null
);

-- Minimal existing C6 membership shape for non-production vault authorization tests.
create table public.company_members (
 id uuid primary key, company_id uuid not null references companies(id) on delete cascade,
 user_id uuid not null, role text not null, status text not null default 'active',
 permission_role text, duties text[] not null default '{}', membership_expires_at timestamptz,
 unique(company_id,id), unique(company_id,user_id)
);
grant select,update on company_members to service_role;
