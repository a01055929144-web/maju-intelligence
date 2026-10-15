-- Production schema record only. Applied manually on 2026-10-15; do not re-run there.
begin;

alter table public.product_catalog
  add column if not exists canonical_name text,
  add column if not exists brand_name text,
  add column if not exists origin_name text,
  add column if not exists spec_value numeric(14,3),
  add column if not exists spec_unit text,
  add column if not exists pack_quantity numeric(14,3),
  add column if not exists category text,
  add column if not exists usage_tags text[] not null default '{}',
  add column if not exists typical_menus text[] not null default '{}',
  add column if not exists barcodes text[] not null default '{}',
  add column if not exists is_active boolean not null default true;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='product_catalog_company_id_id_key') then
    alter table public.product_catalog add constraint product_catalog_company_id_id_key unique(company_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conname='product_catalog_spec_value_check') then
    alter table public.product_catalog add constraint product_catalog_spec_value_check check(spec_value is null or spec_value > 0);
  end if;
  if not exists (select 1 from pg_constraint where conname='product_catalog_pack_quantity_check') then
    alter table public.product_catalog add constraint product_catalog_pack_quantity_check check(pack_quantity is null or pack_quantity > 0);
  end if;
end $$;

create table if not exists public.product_suppliers (
  id uuid default gen_random_uuid() constraint product_suppliers_pkey primary key,
  company_id uuid not null constraint product_suppliers_company_fk references public.companies(id) on delete cascade,
  name text not null, aliases text[] not null default '{}', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint product_suppliers_company_id_id_key unique(company_id,id),
  constraint product_suppliers_company_id_name_key unique(company_id,name),
  constraint product_suppliers_name_check check(length(btrim(name)) > 0)
);

create table if not exists public.product_brand_dictionary (
  id uuid default gen_random_uuid() constraint product_brand_dictionary_pkey primary key,
  company_id uuid not null constraint product_brand_dictionary_company_fk references public.companies(id) on delete cascade,
  canonical_name text not null, aliases text[] not null default '{}', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint product_brand_dictionary_company_id_id_key unique(company_id,id),
  constraint product_brand_dictionary_company_name_key unique(company_id,canonical_name)
);

create table if not exists public.product_catalog_imports (
  id uuid default gen_random_uuid() constraint product_catalog_imports_pkey primary key,
  company_id uuid not null constraint product_catalog_imports_company_fk references public.companies(id) on delete cascade,
  supplier_id uuid not null, file_name text not null, mapping jsonb not null default '{}',
  total_rows integer not null default 0, created_count integer not null default 0, updated_count integer not null default 0,
  excluded_count integer not null default 0, warning_count integer not null default 0,
  status text not null default 'preview', error_message text, created_by_name text,
  created_at timestamptz not null default now(), completed_at timestamptz,
  constraint product_catalog_imports_company_id_id_key unique(company_id,id),
  constraint product_catalog_imports_status_check check(status in ('preview','processing','completed','failed')),
  constraint product_catalog_imports_supplier_fk foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id) on delete restrict
);

create table if not exists public.supplier_products (
  id uuid default gen_random_uuid() constraint supplier_products_pkey primary key,
  company_id uuid not null constraint supplier_products_company_fk references public.companies(id) on delete cascade,
  supplier_id uuid not null, supplier_code text, barcode text, source_fingerprint text not null,
  raw_name text not null, raw_spec text, raw_unit text, parsed_name text, parsed_brand text, parsed_origin text,
  parsed_spec_value numeric(14,3), parsed_spec_unit text, parsed_pack_quantity numeric(14,3),
  latest_cost numeric(14,2), cost_confirmed boolean not null default false, last_seen_date date,
  is_active boolean not null default true, parser_metadata jsonb not null default '{}',
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint supplier_products_company_id_id_key unique(company_id,id),
  constraint supplier_products_fingerprint_key unique(company_id,supplier_id,source_fingerprint),
  constraint supplier_products_cost_check check(latest_cost is null or latest_cost >= 0),
  constraint supplier_products_supplier_fk foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id) on delete cascade
);
create unique index if not exists supplier_products_supplier_code_uq on public.supplier_products(company_id,supplier_id,supplier_code) where supplier_code is not null and supplier_code <> '';
create index if not exists supplier_products_barcode_idx on public.supplier_products(company_id,barcode) where barcode is not null and barcode <> '';
create index if not exists supplier_products_supplier_active_idx on public.supplier_products(company_id,supplier_id,is_active,last_seen_date desc);

create table if not exists public.supplier_product_cost_history (
  id uuid default gen_random_uuid() constraint supplier_product_cost_history_pkey primary key,
  company_id uuid not null constraint supplier_product_cost_history_company_fk references public.companies(id) on delete cascade,
  supplier_product_id uuid not null, import_id uuid not null, price_date date not null,
  purchase_price numeric(14,2) not null, reference_sales_min numeric(14,2), reference_sales_median numeric(14,2), created_at timestamptz not null default now(),
  constraint supplier_product_cost_history_price_check check(purchase_price >= 0),
  constraint supplier_product_cost_history_product_fk foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade,
  constraint supplier_product_cost_history_import_fk foreign key(company_id,import_id) references public.product_catalog_imports(company_id,id) on delete cascade,
  constraint supplier_product_cost_history_key unique(company_id,supplier_product_id,import_id,price_date)
);

create table if not exists public.supplier_product_matches (
  id uuid default gen_random_uuid() constraint supplier_product_matches_pkey primary key,
  company_id uuid not null constraint supplier_product_matches_company_fk references public.companies(id) on delete cascade,
  supplier_product_id uuid not null, product_catalog_id uuid not null, match_status text not null,
  candidate_rank integer, match_score numeric(5,2) not null, name_matches boolean not null default false,
  brand_matches boolean not null default false, origin_matches boolean not null default false,
  spec_matches boolean not null default false, unit_matches boolean not null default false,
  confirmed_by text, confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  constraint supplier_product_matches_status_check check(match_status in ('candidate','auto','confirmed','rejected')),
  constraint supplier_product_matches_rank_check check(candidate_rank is null or candidate_rank between 1 and 3),
  constraint supplier_product_matches_score_check check(match_score between 0 and 100),
  constraint supplier_product_matches_product_fk foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade,
  constraint supplier_product_matches_catalog_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete cascade,
  constraint supplier_product_matches_pair_key unique(company_id,supplier_product_id,product_catalog_id)
);
create unique index if not exists supplier_product_one_active_match_uq on public.supplier_product_matches(company_id,supplier_product_id) where match_status in ('auto','confirmed');
create unique index if not exists supplier_product_candidate_rank_uq on public.supplier_product_matches(company_id,supplier_product_id,candidate_rank) where match_status='candidate';
create index if not exists supplier_product_matches_catalog_idx on public.supplier_product_matches(company_id,product_catalog_id,match_status);

create table if not exists public.product_supplier_defaults (
  company_id uuid not null constraint product_supplier_defaults_company_fk references public.companies(id) on delete cascade,
  product_catalog_id uuid not null, supplier_product_id uuid not null, updated_by_name text, updated_at timestamptz not null default now(),
  constraint product_supplier_defaults_pkey primary key(company_id,product_catalog_id),
  constraint product_supplier_defaults_catalog_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete cascade,
  constraint product_supplier_defaults_product_fk foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade
);

create table if not exists public.product_usage_evidence (
  id uuid default gen_random_uuid() constraint product_usage_evidence_pkey primary key,
  company_id uuid not null constraint product_usage_evidence_company_fk references public.companies(id) on delete cascade,
  product_catalog_id uuid not null, usage_tag text not null, source text not null, confidence numeric(5,4) not null default 0,
  evidence text, is_confirmed boolean not null default false, created_by_name text, created_at timestamptz not null default now(),
  constraint product_usage_evidence_source_check check(source in ('rule','purchase','ai','manual')),
  constraint product_usage_evidence_confidence_check check(confidence between 0 and 1),
  constraint product_usage_evidence_catalog_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete cascade,
  constraint product_usage_evidence_key unique(company_id,product_catalog_id,usage_tag,source)
);

create table if not exists public.product_price_observations (
  id uuid default gen_random_uuid() constraint product_price_observations_pkey primary key,
  company_id uuid not null constraint product_price_observations_company_fk references public.companies(id) on delete cascade,
  buyer_name text not null, buyer_code text, customer_id uuid, supplier_product_id uuid not null, product_catalog_id uuid, import_id uuid not null,
  price_date date not null, unit_price numeric(14,2) not null, quantity numeric(14,3), source_row_key text not null, created_at timestamptz not null default now(),
  constraint product_price_observations_price_check check(unit_price >= 0),
  constraint product_price_observations_quantity_check check(quantity is null or quantity >= 0),
  constraint product_price_observations_customer_fk foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete set null (customer_id),
  constraint product_price_observations_supplier_product_fk foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade,
  constraint product_price_observations_catalog_fk foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete set null (product_catalog_id),
  constraint product_price_observations_import_fk foreign key(company_id,import_id) references public.product_catalog_imports(company_id,id) on delete cascade,
  constraint product_price_observations_row_key unique(company_id,import_id,source_row_key)
);
create index if not exists product_price_observations_buyer_date_idx on public.product_price_observations(company_id,buyer_name,price_date desc);
create index if not exists product_price_observations_product_date_idx on public.product_price_observations(company_id,product_catalog_id,price_date desc) where product_catalog_id is not null;

alter table public.product_suppliers enable row level security;
alter table public.product_brand_dictionary enable row level security;
alter table public.product_catalog_imports enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_product_cost_history enable row level security;
alter table public.supplier_product_matches enable row level security;
alter table public.product_supplier_defaults enable row level security;
alter table public.product_usage_evidence enable row level security;
alter table public.product_price_observations enable row level security;
revoke all on public.product_suppliers,public.product_brand_dictionary,public.product_catalog_imports,public.supplier_products,public.supplier_product_cost_history,public.supplier_product_matches,public.product_supplier_defaults,public.product_usage_evidence,public.product_price_observations from anon,authenticated;
grant all on public.product_suppliers,public.product_brand_dictionary,public.product_catalog_imports,public.supplier_products,public.supplier_product_cost_history,public.supplier_product_matches,public.product_supplier_defaults,public.product_usage_evidence,public.product_price_observations to service_role;
commit;
