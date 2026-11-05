-- DRAFT ONLY. Do not apply without DB-APPROVED for fcmdvveqmcgtioelzqun.
begin;

do $$
begin
  if to_regclass('public.store_cost_items') is not null
    or to_regclass('public.store_cost_revisions') is not null then
    raise exception 'store_cost_objects_already_exist_review_schema_first';
  end if;
end $$;

create table public.store_cost_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_account_id uuid not null,
  product_key text not null check (length(product_key) between 3 and 500),
  product_name text not null check (length(product_name) between 1 and 200),
  specification text not null default '' check (length(specification) <= 200),
  unit text not null check (length(unit) between 1 and 40),
  effective_on date not null,
  cost_krw bigint not null check (cost_krw between 0 and 1000000000),
  revision integer not null default 1 check (revision > 0),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, store_account_id, product_key),
  unique(company_id, store_account_id, id),
  foreign key(company_id, store_account_id)
    references public.store_accounts(company_id, id) on delete cascade
);

create table public.store_cost_revisions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  store_account_id uuid not null,
  store_cost_item_id uuid not null,
  revision integer not null check (revision > 0),
  effective_on date not null,
  product_name text not null check (length(product_name) between 1 and 200),
  specification text not null default '' check (length(specification) <= 200),
  unit text not null check (length(unit) between 1 and 40),
  cost_krw bigint not null check (cost_krw between 0 and 1000000000),
  change_kind text not null check (change_kind in ('import','edit')),
  actor_member_id uuid not null,
  source_file_name text check (source_file_name is null or length(source_file_name) between 1 and 255),
  source_sha256 text check (source_sha256 is null or source_sha256 ~ '^[0-9a-f]{64}$'),
  source_row_number integer check (source_row_number is null or source_row_number > 0),
  changed_at timestamptz not null default now(),
  unique(company_id, store_account_id, store_cost_item_id, revision),
  foreign key(company_id, store_account_id, store_cost_item_id)
    references public.store_cost_items(company_id, store_account_id, id) on delete cascade,
  foreign key(company_id, store_account_id, actor_member_id)
    references public.store_account_members(company_id, store_account_id, id)
    deferrable initially deferred,
  check ((change_kind = 'import') = (source_sha256 is not null and source_row_number is not null))
);

create unique index store_cost_revisions_import_row_uq
  on public.store_cost_revisions(company_id, store_account_id, source_sha256, source_row_number)
  where source_sha256 is not null;
create index store_cost_items_search_idx
  on public.store_cost_items(company_id, store_account_id, effective_on desc, product_name);
create index store_cost_revisions_history_idx
  on public.store_cost_revisions(company_id, store_account_id, store_cost_item_id, revision desc);

alter table public.store_cost_items enable row level security;
alter table public.store_cost_revisions enable row level security;
revoke all on public.store_cost_items, public.store_cost_revisions from public, anon, authenticated, service_role;
grant select, insert, update on public.store_cost_items to service_role;
grant select, insert on public.store_cost_revisions to service_role;

commit;
