-- WO-03 CategoryMatch SQL 초안. 운영 DB 적용 금지.
begin;

create table if not exists public.maju_categories (
  id uuid primary key default gen_random_uuid(),
  parent_id uuid references public.maju_categories(id) on delete restrict,
  name text not null,
  industry_keys text[] not null default '{}',
  sort_order integer not null default 0,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  check (length(btrim(name)) between 1 and 80)
);
create unique index if not exists maju_categories_name_uq on public.maju_categories(lower(btrim(name)));

alter table public.product_categories add column if not exists maju_category_id uuid;
do $$ begin
  alter table public.product_categories add constraint product_categories_maju_category_fk
    foreign key (maju_category_id) references public.maju_categories(id) on delete set null;
exception when duplicate_object then null;
end $$;
create index if not exists product_categories_maju_category_idx on public.product_categories(company_id, maju_category_id);

alter table public.maju_categories enable row level security;
revoke all on public.maju_categories from public, anon, authenticated;
grant select, insert, update, delete on public.maju_categories to service_role;

commit;
