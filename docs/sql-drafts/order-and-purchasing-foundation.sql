-- DRAFT ONLY — DO NOT RUN. Schema review required before each phase.
begin;

-- Phase A: manual product management, units, tax and immutable company product codes
alter table public.product_catalog
  add column if not exists product_code text,
  add column if not exists purchase_to_sales_ratio numeric(14,6),
  add column if not exists tax_type text,
  add constraint product_catalog_product_code_uq unique(company_id,product_code),
  add constraint product_catalog_conversion_check check(purchase_to_sales_ratio is null or purchase_to_sales_ratio > 0),
  add constraint product_catalog_tax_type_check check(tax_type is null or tax_type in ('taxable','exempt'));
alter table public.supplier_products
  add column if not exists parsed_tax_type text,
  add constraint supplier_products_tax_type_check check(parsed_tax_type is null or parsed_tax_type in ('taxable','exempt'));
alter table public.supplier_product_matches
  add column if not exists purchase_to_sales_ratio numeric(14,6),
  add column if not exists conversion_confirmed boolean not null default false,
  add constraint supplier_product_matches_conversion_check check(purchase_to_sales_ratio is null or purchase_to_sales_ratio > 0);

create table if not exists public.product_code_counters (
  company_id uuid primary key references public.companies(id) on delete cascade,
  last_value bigint not null default 0 check(last_value >= 0)
);
create table if not exists public.product_sales_price_history (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  product_catalog_id uuid not null, previous_price bigint, next_price bigint not null check(next_price >= 0),
  changed_by_user_id uuid, changed_by_name text, changed_at timestamptz not null default now(),
  constraint product_sales_price_history_product_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete restrict
);

-- Phase B: accepted quote -> customer contract price
create table if not exists public.customer_price_agreements (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, product_catalog_id uuid not null, sales_unit text not null,
  unit_price bigint not null check(unit_price >= 0), tax_type text not null check(tax_type in ('taxable','exempt')),
  effective_from date not null, effective_until date, source_quote_id uuid, status text not null default 'active' check(status in ('draft','active','ended','cancelled')),
  created_by_name text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint customer_price_agreements_period_check check(effective_until is null or effective_until >= effective_from),
  constraint customer_price_agreements_customer_fk foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  constraint customer_price_agreements_product_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete restrict,
  constraint customer_price_agreements_quote_fk foreign key(source_quote_id) references public.sales_quotes(id) on delete set null
);
create index if not exists customer_price_agreements_lookup_idx on public.customer_price_agreements(company_id,customer_id,product_catalog_id,effective_from desc);

alter table public.sales_quote_items
  add column if not exists product_name_snapshot text,
  add column if not exists sales_unit_snapshot text,
  add column if not exists purchase_unit_snapshot text,
  add column if not exists conversion_ratio_snapshot numeric(14,6),
  add column if not exists tax_type_snapshot text,
  add column if not exists supply_amount bigint,
  add column if not exists tax_amount bigint,
  add column if not exists total_amount bigint;

-- Phase C: partner linkage and customer portal
create table if not exists public.business_partner_links (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid, supplier_id uuid, business_registration_number text, confirmed_by_name text, confirmed_at timestamptz,
  constraint business_partner_links_customer_fk foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  constraint business_partner_links_supplier_fk foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id) on delete cascade,
  constraint business_partner_links_side_check check(customer_id is not null or supplier_id is not null)
);
create table if not exists public.customer_portal_users (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, auth_user_id uuid not null, display_name text not null, status text not null default 'active' check(status in ('active','disabled')),
  created_at timestamptz not null default now(),
  constraint customer_portal_users_customer_fk foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  constraint customer_portal_users_scope_uq unique(company_id,customer_id,auth_user_id)
);

-- Phase D: order and purchasing snapshots
create table if not exists public.sales_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, requested_delivery_date date not null, status text not null check(status in ('draft','submitted','confirmed','purchasing','ready','delivering','completed','cancelled')),
  submitted_by_portal_user_id uuid, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint sales_orders_customer_fk foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete restrict
);
create table if not exists public.sales_order_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  order_id uuid not null references public.sales_orders(id) on delete cascade, product_catalog_id uuid,
  product_name_snapshot text not null, specification_snapshot text, sales_unit_snapshot text not null,
  quantity numeric(14,3) not null check(quantity > 0), unit_price bigint not null check(unit_price >= 0),
  tax_type_snapshot text not null check(tax_type_snapshot in ('taxable','exempt')), supply_amount bigint not null, tax_amount bigint not null, total_amount bigint not null
);
create table if not exists public.purchase_orders (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null, expected_receipt_date date, status text not null check(status in ('draft','ordered','partially_received','received','cancelled')),
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint purchase_orders_supplier_fk foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id) on delete restrict
);

-- Phase E: append-only receivable/payable ledger
create table if not exists public.partner_ledger_entries (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  partner_type text not null check(partner_type in ('customer','supplier')), customer_id uuid, supplier_id uuid,
  entry_type text not null check(entry_type in ('sale','receipt','purchase','payment','adjustment','reversal')),
  amount bigint not null, supply_amount bigint not null default 0, tax_amount bigint not null default 0,
  payment_method text check(payment_method is null or payment_method in ('bank','card','cash','other')),
  source_type text, source_id uuid, idempotency_key text not null, reverses_entry_id uuid references public.partner_ledger_entries(id) on delete restrict,
  created_by_user_id uuid, created_by_name text, created_at timestamptz not null default now(),
  constraint partner_ledger_entries_idempotency_uq unique(company_id,idempotency_key),
  constraint partner_ledger_entries_partner_check check((partner_type='customer' and customer_id is not null and supplier_id is null) or (partner_type='supplier' and supplier_id is not null and customer_id is null))
);

-- Phase F: invoice adapter persistence
create table if not exists public.tax_invoice_documents (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, document_type text not null check(document_type in ('tax_invoice','exempt_invoice')),
  status text not null default 'pending' check(status in ('pending','issued','sent','failed','cancelled')),
  supply_amount bigint not null, tax_amount bigint not null, total_amount bigint not null,
  provider text, provider_document_id text, nts_approval_number text, recipient_email text, error_message text,
  issued_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);

-- Every new table must enable RLS, revoke anon/authenticated, grant service_role, and use
-- company_id composite FKs where the referenced table supports them. Add those statements
-- in the phase-specific migration after production constraint names are re-verified.
rollback;
