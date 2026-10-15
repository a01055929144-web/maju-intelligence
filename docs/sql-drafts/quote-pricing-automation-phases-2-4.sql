-- DRAFT ONLY — DO NOT RUN. 2026-10-15 설계 검토용.
-- 적용 전 기존 UNIQUE/FK 이름을 재확인하고 단계별 migration으로 분리한다.
begin;

-- 1-B 표준 품목 승격
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
alter table public.product_catalog
  add constraint product_catalog_spec_value_check check(spec_value is null or spec_value > 0),
  add constraint product_catalog_pack_quantity_check check(pack_quantity is null or pack_quantity > 0);
do $$ begin
  if not exists (select 1 from pg_constraint where conrelid='public.product_catalog'::regclass and conname='product_catalog_company_id_id_key') then
    alter table public.product_catalog add constraint product_catalog_company_id_id_key unique(company_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.normalized_customers'::regclass and conname='normalized_customers_company_id_id_unique') then
    alter table public.normalized_customers add constraint normalized_customers_company_id_id_unique unique(company_id,id);
  end if;
  if not exists (select 1 from pg_constraint where conrelid='public.business_permit_leads'::regclass and conname='business_permit_leads_company_id_id_unique') then
    alter table public.business_permit_leads add constraint business_permit_leads_company_id_id_unique unique(company_id,id);
  end if;
end $$;

create table public.product_suppliers (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, aliases text[] not null default '{}', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,name)
);
create table public.product_brand_dictionary (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  canonical_name text not null, aliases text[] not null default '{}', is_active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,canonical_name)
);
create table public.product_catalog_imports (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null, file_name text not null, mapping jsonb not null default '{}', total_rows integer not null default 0,
  created_count integer not null default 0, updated_count integer not null default 0, excluded_count integer not null default 0,
  warning_count integer not null default 0, status text not null default 'preview', error_message text, created_by_name text,
  created_at timestamptz not null default now(), completed_at timestamptz, unique(company_id,id),
  check(status in ('preview','processing','completed','failed')),
  foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id) on delete restrict
);
create table public.supplier_products (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  supplier_id uuid not null, supplier_code text, barcode text, source_fingerprint text not null,
  raw_name text not null, raw_spec text, raw_unit text, parsed_name text, parsed_brand text, parsed_origin text,
  parsed_spec_value numeric(14,3), parsed_spec_unit text, parsed_pack_quantity numeric(14,3),
  latest_cost numeric(14,2), last_seen_date date, is_active boolean not null default true,
  parser_metadata jsonb not null default '{}', created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,supplier_id,source_fingerprint),
  check(latest_cost is null or latest_cost >= 0),
  foreign key(company_id,supplier_id) references public.product_suppliers(company_id,id) on delete cascade
);
create unique index supplier_products_supplier_code_uq on public.supplier_products(company_id,supplier_id,supplier_code)
  where supplier_code is not null and supplier_code <> '';
create index supplier_products_supplier_active_idx on public.supplier_products(company_id,supplier_id,is_active,last_seen_date desc);
create table public.supplier_product_cost_history (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  supplier_product_id uuid not null, import_id uuid not null, price_date date not null,
  purchase_price numeric(14,2) not null, reference_sales_min numeric(14,2), reference_sales_median numeric(14,2),
  created_at timestamptz not null default now(), check(purchase_price >= 0),
  foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade,
  foreign key(company_id,import_id) references public.product_catalog_imports(company_id,id) on delete cascade,
  unique(company_id,supplier_product_id,import_id,price_date)
);
create table public.supplier_product_matches (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  supplier_product_id uuid not null, product_catalog_id uuid not null,
  match_status text not null, candidate_rank integer, match_score numeric(5,2) not null,
  name_matches boolean not null default false, brand_matches boolean not null default false,
  origin_matches boolean not null default false, spec_matches boolean not null default false, unit_matches boolean not null default false,
  confirmed_by text, confirmed_at timestamptz, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  check(match_status in ('candidate','auto','confirmed','rejected')), check(candidate_rank is null or candidate_rank between 1 and 3),
  check(match_score between 0 and 100),
  foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade,
  foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete cascade,
  unique(company_id,supplier_product_id,product_catalog_id)
);
create unique index supplier_product_one_active_match_uq on public.supplier_product_matches(company_id,supplier_product_id)
  where match_status in ('auto','confirmed');
create unique index supplier_product_candidate_rank_uq on public.supplier_product_matches(company_id,supplier_product_id,candidate_rank)
  where match_status='candidate';
create index supplier_product_matches_catalog_idx on public.supplier_product_matches(company_id,product_catalog_id,match_status);
create table public.product_supplier_defaults (
  company_id uuid not null references public.companies(id) on delete cascade,
  product_catalog_id uuid not null, supplier_product_id uuid not null, updated_by_name text, updated_at timestamptz not null default now(),
  primary key(company_id,product_catalog_id),
  foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete cascade,
  foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete restrict
);

-- 1-C 용도 근거
create table public.product_usage_evidence (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  product_catalog_id uuid not null, usage_tag text not null, source text not null, confidence numeric(5,4) not null default 0,
  evidence text, is_confirmed boolean not null default false, created_by_name text, created_at timestamptz not null default now(),
  check(source in ('rule','purchase','ai','manual')), check(confidence between 0 and 1),
  foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete cascade,
  unique(company_id,product_catalog_id,usage_tag,source)
);

-- 거래처 판매 단가 (normalized_customers의 company_id,id UNIQUE는 운영 확인 후 조건부 추가)
create table public.customer_product_prices (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null, supplier_product_id uuid not null, product_catalog_id uuid, import_id uuid not null,
  price_date date not null, unit_price numeric(14,2) not null, quantity numeric(14,3), source_row_key text not null,
  created_at timestamptz not null default now(), check(unit_price >= 0), check(quantity is null or quantity >= 0),
  foreign key(company_id,customer_id) references public.normalized_customers(company_id,id) on delete cascade,
  foreign key(company_id,supplier_product_id) references public.supplier_products(company_id,id) on delete cascade,
  foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete set null (product_catalog_id),
  foreign key(company_id,import_id) references public.product_catalog_imports(company_id,id) on delete cascade,
  unique(company_id,import_id,source_row_key)
);
create index customer_product_prices_customer_date_idx on public.customer_product_prices(company_id,customer_id,price_date desc);
create index customer_product_prices_product_date_idx on public.customer_product_prices(company_id,product_catalog_id,price_date desc)
  where product_catalog_id is not null;

-- 2단계 업종 단가표
create table public.price_list_templates (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, industries text[] not null default '{}', default_margin_percent numeric(5,2) not null default 12,
  is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,name), check(default_margin_percent between 0 and 90)
);
create table public.price_list_industry_defaults (
  company_id uuid not null references public.companies(id) on delete cascade, industry text not null, template_id uuid not null,
  primary key(company_id,industry), foreign key(company_id,template_id) references public.price_list_templates(company_id,id) on delete cascade
);
create table public.price_list_template_items (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  template_id uuid not null, product_catalog_id uuid not null, sort_order integer not null default 0,
  default_quantity numeric(12,3) not null default 1, margin_percent numeric(5,2), fixed_sales_price numeric(14,2),
  foreign key(company_id,template_id) references public.price_list_templates(company_id,id) on delete cascade,
  foreign key(company_id,product_catalog_id) references public.product_catalog(company_id,id) on delete restrict,
  unique(company_id,template_id,product_catalog_id), check(default_quantity > 0),
  check(margin_percent is null or margin_percent between 0 and 90), check(fixed_sales_price is null or fixed_sales_price >= 0),
  check(margin_percent is null or fixed_sales_price is null)
);
create index price_list_templates_active_idx on public.price_list_templates(company_id,is_active,updated_at desc);
create index price_list_template_items_order_idx on public.price_list_template_items(company_id,template_id,sort_order);
alter table public.companies add column if not exists min_quote_margin_percent numeric(5,2) not null default 0;
alter table public.companies add constraint companies_min_quote_margin_percent_check check(min_quote_margin_percent between 0 and 90);
alter table public.sales_quotes add column if not exists pricing_label text;
-- 적용 전 기존 draft 중복을 조회하고 정리 승인 후 생성
create unique index sales_quotes_one_open_lead_draft_uq on public.sales_quotes(company_id,lead_id)
  where status='draft' and lead_id is not null;

-- 4단계 브랜드
create table public.customer_brands (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade,
  name text not null, normalized_name text not null, aliases text[] not null default '{}',
  brand_margin_percent numeric(5,2) not null default 10, min_margin_percent numeric(5,2) not null default 0,
  memo text, is_active boolean not null default true, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  unique(company_id,id), unique(company_id,normalized_name),
  check(brand_margin_percent between 0 and 90), check(min_margin_percent between 0 and 90)
);
create index customer_brands_active_idx on public.customer_brands(company_id,is_active,name);
alter table public.normalized_customers add column if not exists brand_id uuid;
alter table public.business_permit_leads add column if not exists brand_id uuid;
alter table public.normalized_customers add constraint normalized_customers_brand_fk foreign key(company_id,brand_id)
  references public.customer_brands(company_id,id) on delete set null (brand_id);
alter table public.business_permit_leads add constraint business_permit_leads_brand_fk foreign key(company_id,brand_id)
  references public.customer_brands(company_id,id) on delete set null (brand_id);

-- RLS: 앱 서버 service role만 접근
alter table public.product_suppliers enable row level security;
alter table public.product_brand_dictionary enable row level security;
alter table public.product_catalog_imports enable row level security;
alter table public.supplier_products enable row level security;
alter table public.supplier_product_cost_history enable row level security;
alter table public.supplier_product_matches enable row level security;
alter table public.product_supplier_defaults enable row level security;
alter table public.product_usage_evidence enable row level security;
alter table public.customer_product_prices enable row level security;
alter table public.price_list_templates enable row level security;
alter table public.price_list_industry_defaults enable row level security;
alter table public.price_list_template_items enable row level security;
alter table public.customer_brands enable row level security;
revoke all on public.product_suppliers,public.product_brand_dictionary,public.product_catalog_imports,public.supplier_products,public.supplier_product_cost_history,
  public.supplier_product_matches,public.product_supplier_defaults,public.product_usage_evidence,public.customer_product_prices,public.price_list_templates,
  public.price_list_industry_defaults,public.price_list_template_items,public.customer_brands from anon,authenticated;
grant all on public.product_suppliers,public.product_brand_dictionary,public.product_catalog_imports,public.supplier_products,public.supplier_product_cost_history,
  public.supplier_product_matches,public.product_supplier_defaults,public.product_usage_evidence,public.customer_product_prices,public.price_list_templates,
  public.price_list_industry_defaults,public.price_list_template_items,public.customer_brands to service_role;
commit;

-- ROLLBACK DRAFT: 신규 데이터 export 후 아래를 별도 트랜잭션으로 실행
-- begin;
-- drop index if exists public.sales_quotes_one_open_lead_draft_uq;
-- alter table public.sales_quotes drop column if exists pricing_label;
-- alter table public.companies drop constraint if exists companies_min_quote_margin_percent_check,
--   drop column if exists min_quote_margin_percent;
-- alter table public.business_permit_leads drop constraint if exists business_permit_leads_brand_fk,
--   drop column if exists brand_id;
-- alter table public.normalized_customers drop constraint if exists normalized_customers_brand_fk,
--   drop column if exists brand_id;
-- drop table if exists public.price_list_template_items,public.price_list_industry_defaults,public.price_list_templates;
-- drop table if exists public.customer_brands,public.customer_product_prices,public.product_usage_evidence;
-- drop table if exists public.product_supplier_defaults,public.supplier_product_matches,public.supplier_product_cost_history;
-- drop table if exists public.supplier_products,public.product_catalog_imports,public.product_brand_dictionary,public.product_suppliers;
-- alter table public.product_catalog drop constraint if exists product_catalog_spec_value_check,
--   drop constraint if exists product_catalog_pack_quantity_check,
--   drop constraint if exists product_catalog_company_id_id_key,
--   drop column if exists canonical_name,drop column if exists brand_name,drop column if exists origin_name,
--   drop column if exists spec_value,drop column if exists spec_unit,drop column if exists pack_quantity,
--   drop column if exists category,drop column if exists usage_tags,drop column if exists typical_menus,
--   drop column if exists barcodes,drop column if exists is_active;
-- commit;
