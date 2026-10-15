-- BIV platform admin phase 1: catalog, company-product links, admin roles.
-- REVIEW ONLY. DO NOT EXECUTE. No production migration has been approved.
-- The final migration must also include the barcode/code triggers from biv-platform-product-catalog.sql.

begin;

create table if not exists public.platform_admin_roles (
  admin_email text constraint platform_admin_roles_pkey primary key,
  display_name text not null,
  role text not null,
  is_active boolean not null default true,
  granted_by_email text,
  granted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_admin_roles_email_check check (admin_email = lower(btrim(admin_email))),
  constraint platform_admin_roles_role_check check (role in ('super_admin','catalog_operator'))
);

-- Do not seed ADMIN_EMAIL here. The application may bootstrap exactly one super_admin only
-- when this table is empty and a successful signed ADMIN_EMAIL login has already occurred.

create sequence if not exists public.platform_product_code_seq;

create table if not exists public.platform_brand_dictionary (
  id uuid default gen_random_uuid() constraint platform_brand_dictionary_pkey primary key,
  canonical_name text not null,
  normalized_name text not null,
  aliases text[] not null default '{}',
  is_active boolean not null default true,
  created_by_admin text not null,
  updated_by_admin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_brand_dictionary_normalized_name_key unique (normalized_name),
  constraint platform_brand_dictionary_name_check check (length(btrim(canonical_name)) between 1 and 120)
);

create table if not exists public.platform_products (
  id uuid default gen_random_uuid() constraint platform_products_pkey primary key,
  platform_product_code text not null default ('BIV-P-' || lpad(nextval('public.platform_product_code_seq')::text, 8, '0')),
  display_name text not null,
  normalized_name text not null,
  brand_id uuid,
  origin_name text,
  spec_value numeric(14,3),
  spec_unit text,
  standard_unit text not null,
  tax_type text,
  category text,
  usage_tags text[] not null default '{}',
  barcodes text[] not null default '{}',
  status text not null default 'active',
  inactive_reason text,
  merged_into_product_id uuid,
  created_by_admin text not null,
  updated_by_admin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_products_code_key unique (platform_product_code),
  constraint platform_products_brand_fk foreign key (brand_id) references public.platform_brand_dictionary(id) on delete set null,
  constraint platform_products_merged_fk foreign key (merged_into_product_id) references public.platform_products(id) on delete restrict,
  constraint platform_products_status_check check (status in ('active','inactive','merged')),
  constraint platform_products_tax_type_check check (tax_type is null or tax_type in ('taxable','exempt')),
  constraint platform_products_spec_value_check check (spec_value is null or spec_value > 0),
  constraint platform_products_inactive_reason_check check (status <> 'inactive' or length(btrim(inactive_reason)) > 0),
  constraint platform_products_merge_check check (
    (status = 'merged' and merged_into_product_id is not null and merged_into_product_id <> id)
    or (status <> 'merged' and merged_into_product_id is null)
  )
);
create index if not exists platform_products_name_idx on public.platform_products(normalized_name, status);
create index if not exists platform_products_barcodes_gin_idx on public.platform_products using gin(barcodes);

create or replace function public.platform_products_lock_code()
returns trigger language plpgsql set search_path=public,pg_temp as $$
begin
  if old.platform_product_code is distinct from new.platform_product_code then
    raise exception '플랫폼 품목코드는 변경할 수 없습니다.' using errcode='55000';
  end if;
  return new;
end;
$$;
drop trigger if exists platform_products_lock_code on public.platform_products;
create trigger platform_products_lock_code before update of platform_product_code
  on public.platform_products for each row execute function public.platform_products_lock_code();

create or replace function public.platform_products_assert_unique_barcodes()
returns trigger language plpgsql set search_path=public,pg_temp as $$
declare v_barcode text;
begin
  new.barcodes := coalesce(array(
    select distinct btrim(value) from unnest(coalesce(new.barcodes,'{}')) value
    where btrim(value)<>'' order by btrim(value)
  ),'{}');
  foreach v_barcode in array new.barcodes loop
    perform pg_advisory_xact_lock(hashtextextended('platform-barcode:'||v_barcode,0));
  end loop;
  if exists (
    select 1 from public.platform_products p
    where p.id<>new.id and p.status<>'merged' and p.barcodes && new.barcodes
  ) then
    raise exception '다른 플랫폼 품목이 이미 같은 바코드를 사용합니다.' using errcode='23505';
  end if;
  return new;
end;
$$;
drop trigger if exists platform_products_unique_barcodes on public.platform_products;
create trigger platform_products_unique_barcodes before insert or update of barcodes,status
  on public.platform_products for each row execute function public.platform_products_assert_unique_barcodes();

create table if not exists public.platform_product_aliases (
  id uuid default gen_random_uuid() constraint platform_product_aliases_pkey primary key,
  platform_product_id uuid not null constraint platform_product_aliases_product_fk
    references public.platform_products(id) on delete cascade,
  alias_name text not null,
  normalized_alias text not null,
  brand_name text,
  origin_name text,
  spec_value numeric(14,3),
  spec_unit text,
  unit_name text,
  source text not null default 'manual',
  evidence jsonb not null default '{}'::jsonb,
  is_confirmed boolean not null default false,
  confirmed_by_admin text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  constraint platform_product_aliases_source_check check (source in ('manual','company_confirmed','platform_confirmed','import')),
  constraint platform_product_aliases_signature_key unique
    nulls not distinct (platform_product_id,normalized_alias,brand_name,origin_name,spec_value,spec_unit,unit_name)
);
create index if not exists platform_product_aliases_lookup_idx on public.platform_product_aliases(normalized_alias, is_confirmed);

create table if not exists public.company_product_platform_links (
  id uuid default gen_random_uuid() constraint company_product_platform_links_pkey primary key,
  company_id uuid not null constraint company_product_platform_links_company_fk references public.companies(id) on delete cascade,
  source_type text not null,
  product_catalog_id uuid,
  supplier_product_id uuid,
  platform_product_id uuid not null constraint company_product_platform_links_platform_fk references public.platform_products(id) on delete restrict,
  match_status text not null,
  candidate_rank integer,
  match_score numeric(5,2) not null,
  field_matches jsonb not null default '{}'::jsonb,
  match_engine_version text not null,
  source_to_platform_ratio numeric(14,6),
  conversion_confirmed boolean not null default false,
  confirmed_by_type text,
  confirmed_by_member_id uuid,
  confirmed_by_name text,
  confirmed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_product_platform_links_catalog_fk foreign key (company_id, product_catalog_id)
    references public.product_catalog(company_id,id) on delete cascade,
  constraint company_product_platform_links_supplier_fk foreign key (company_id, supplier_product_id)
    references public.supplier_products(company_id,id) on delete cascade,
  constraint company_product_platform_links_member_fk foreign key (company_id, confirmed_by_member_id)
    references public.company_members(company_id,id) on delete set null (confirmed_by_member_id),
  constraint company_product_platform_links_source_check check (
    (source_type='product_catalog' and product_catalog_id is not null and supplier_product_id is null)
    or (source_type='supplier_product' and supplier_product_id is not null and product_catalog_id is null)
  ),
  constraint company_product_platform_links_status_check check (match_status in ('candidate','auto','confirmed','rejected')),
  constraint company_product_platform_links_rank_check check (candidate_rank is null or candidate_rank between 1 and 3),
  constraint company_product_platform_links_score_check check (match_score between 0 and 100),
  constraint company_product_platform_links_ratio_check check (source_to_platform_ratio is null or source_to_platform_ratio > 0),
  constraint company_product_platform_links_confirmer_type_check check (confirmed_by_type is null or confirmed_by_type in ('company_user','platform_admin'))
);
create unique index if not exists company_product_platform_links_active_catalog_uq
  on public.company_product_platform_links(company_id,product_catalog_id)
  where product_catalog_id is not null and match_status in ('auto','confirmed');
create unique index if not exists company_product_platform_links_active_supplier_uq
  on public.company_product_platform_links(company_id,supplier_product_id)
  where supplier_product_id is not null and match_status in ('auto','confirmed');
create unique index if not exists company_product_platform_links_catalog_candidate_rank_uq
  on public.company_product_platform_links(company_id,product_catalog_id,candidate_rank)
  where product_catalog_id is not null and match_status='candidate';
create unique index if not exists company_product_platform_links_supplier_candidate_rank_uq
  on public.company_product_platform_links(company_id,supplier_product_id,candidate_rank)
  where supplier_product_id is not null and match_status='candidate';
create index if not exists company_product_platform_links_queue_idx
  on public.company_product_platform_links(match_status, match_score desc, company_id, updated_at desc);

alter table public.platform_admin_roles enable row level security;
alter table public.platform_brand_dictionary enable row level security;
alter table public.platform_products enable row level security;
alter table public.platform_product_aliases enable row level security;
alter table public.company_product_platform_links enable row level security;

revoke all on public.platform_admin_roles, public.platform_brand_dictionary, public.platform_products,
  public.platform_product_aliases, public.company_product_platform_links from public, anon, authenticated;
revoke all on sequence public.platform_product_code_seq from public, anon, authenticated;
grant all on public.platform_admin_roles, public.platform_brand_dictionary, public.platform_products,
  public.platform_product_aliases, public.company_product_platform_links to service_role;
grant usage, select on sequence public.platform_product_code_seq to service_role;
revoke execute on function public.platform_products_lock_code() from public,anon,authenticated;
revoke execute on function public.platform_products_assert_unique_barcodes() from public,anon,authenticated;

commit;

-- Rollback draft: drop links -> aliases -> products -> brands -> roles -> sequence in that order.
