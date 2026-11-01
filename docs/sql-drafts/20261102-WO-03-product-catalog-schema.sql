-- WO-03 상품관리 SQL 초안. 운영 DB 적용 금지.
-- 기존 product_catalog.product_code를 ERP 코드로 재사용한다.
-- 기존 product_supplier_defaults, supplier_products, product_inventory_settings도 그대로 사용한다.

begin;

create table if not exists public.product_categories (
  id uuid default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  parent_id uuid,
  level smallint not null,
  name text not null,
  margin_bp integer not null default 0,
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key (id),
  unique (company_id, id),
  foreign key (company_id, parent_id)
    references public.product_categories(company_id, id) on delete cascade,
  check (level between 1 and 3),
  check (length(btrim(name)) between 1 and 80),
  check (margin_bp between 0 and 100000),
  check (parent_id is null or parent_id <> id)
);

create unique index if not exists product_categories_root_name_uq
  on public.product_categories(company_id, lower(btrim(name)))
  where parent_id is null;
create unique index if not exists product_categories_child_name_uq
  on public.product_categories(company_id, parent_id, lower(btrim(name)))
  where parent_id is not null;
create index if not exists product_categories_tree_idx
  on public.product_categories(company_id, parent_id, sort_order, name);

create or replace function public.product_categories_validate_tree()
returns trigger language plpgsql set search_path to 'public' as $$
declare parent_level smallint;
begin
  if new.parent_id is null then
    if new.level <> 1 then raise exception '최상위 상품 구분은 1단계여야 합니다.'; end if;
    return new;
  end if;
  select level into parent_level from public.product_categories
  where company_id = new.company_id and id = new.parent_id;
  if parent_level is null or new.level <> parent_level + 1 or new.level > 3 then
    raise exception '상품 구분은 부모 다음 단계여야 하며 최대 3단계입니다.';
  end if;
  return new;
end $$;
drop trigger if exists product_categories_validate_tree on public.product_categories;
create trigger product_categories_validate_tree
before insert or update of company_id, parent_id, level on public.product_categories
for each row execute function public.product_categories_validate_tree();

alter table public.product_catalog
  add column if not exists category_id uuid;

do $$ begin
  alter table public.product_catalog
    add constraint product_catalog_category_fk
    foreign key (company_id, category_id)
    references public.product_categories(company_id, id) on delete set null (category_id);
exception when duplicate_object then null;
end $$;

do $$ begin
  alter table public.product_catalog
    add constraint product_catalog_product_code_not_blank_check
    check (product_code is null or length(btrim(product_code)) between 1 and 80);
exception when duplicate_object then null;
end $$;

create index if not exists product_catalog_category_idx
  on public.product_catalog(company_id, category_id, is_active);

alter table public.product_categories enable row level security;
revoke all on public.product_categories from public, anon, authenticated;
grant select, insert, update, delete on public.product_categories to service_role;
revoke all on function public.product_categories_validate_tree() from public, anon, authenticated;
grant execute on function public.product_categories_validate_tree() to service_role;

commit;
