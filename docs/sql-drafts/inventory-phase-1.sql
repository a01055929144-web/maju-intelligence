-- REVIEW ONLY — DO NOT RUN IN ANY DATABASE.
-- Claude/local PostgreSQL validation and ERP Phase 1-B v2 RPC reconciliation are required.
-- This is a Phase 1 schema draft, not a Supabase migration.

begin;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.product_catalog'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (company_id, id)'
  ) then
    raise exception 'product_catalog(company_id,id) UNIQUE is required';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_documents'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (company_id, id)'
  ) then
    raise exception 'business_documents(company_id,id) UNIQUE is required';
  end if;
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_document_lines'::regclass
      and contype = 'u'
      and pg_get_constraintdef(oid) = 'UNIQUE (company_id, id)'
  ) then
    raise exception 'business_document_lines(company_id,id) UNIQUE is required';
  end if;
end $$;

create table if not exists public.product_unit_conversions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  unit_name text not null,
  base_quantity numeric(14,3) not null,
  is_base boolean not null default false,
  is_confirmed boolean not null default false,
  source text not null default 'manual',
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint product_unit_conversions_company_id_id_uq unique(company_id, id),
  constraint product_unit_conversions_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete cascade,
  constraint product_unit_conversions_unit_uq unique(company_id, product_catalog_id, unit_name),
  constraint product_unit_conversions_quantity_check check(base_quantity > 0),
  constraint product_unit_conversions_unit_check check(length(btrim(unit_name)) between 1 and 40),
  constraint product_unit_conversions_source_check check(source in ('manual','supplier_match','legacy'))
);

create unique index if not exists product_unit_conversions_one_base_uq
  on public.product_unit_conversions(company_id, product_catalog_id)
  where is_base;

create table if not exists public.product_inventory_settings (
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  tracking_enabled boolean not null default true,
  safety_stock_quantity numeric(14,3) not null default 0,
  preferred_supplier_product_id uuid,
  updated_by_user_id uuid references public.app_users(id) on delete set null,
  updated_by_name text,
  updated_at timestamptz not null default now(),
  primary key(company_id, product_catalog_id),
  constraint product_inventory_settings_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete cascade,
  constraint product_inventory_settings_safety_check check(safety_stock_quantity >= 0)
  -- Final SQL must add a composite FK for preferred_supplier_product_id after verifying
  -- supplier_products(company_id,id) UNIQUE in the applied schema.
);

create table if not exists public.inventory_movements (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  movement_type text not null,
  quantity_delta numeric(14,3) not null,
  unit_cost numeric(18,6),
  occurred_at timestamptz not null default now(),
  business_date date not null,
  source_document_id uuid,
  source_document_line_id uuid,
  source_document_number_snapshot text,
  source_line_number_snapshot integer,
  source_product_name_snapshot text not null,
  source_unit_snapshot text not null,
  source_quantity_snapshot numeric(14,3),
  source_base_quantity_snapshot numeric(14,3),
  source_conversion_ratio_snapshot numeric(14,6),
  revision_of_movement_id uuid,
  reason text,
  actor_user_id uuid references public.app_users(id) on delete set null,
  actor_name text,
  idempotency_key text not null,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint inventory_movements_company_id_id_uq unique(company_id, id),
  constraint inventory_movements_idempotency_uq unique(company_id, idempotency_key),
  constraint inventory_movements_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint inventory_movements_document_fk foreign key(company_id, source_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint inventory_movements_revision_fk foreign key(company_id, revision_of_movement_id)
    references public.inventory_movements(company_id, id) on delete restrict,
  constraint inventory_movements_type_check check(movement_type in (
    'purchase_in','sale_out','sale_return_in','purchase_return_out','adjustment','revision'
  )),
  constraint inventory_movements_quantity_check check(
    (movement_type in ('purchase_in','sale_return_in') and quantity_delta > 0)
    or (movement_type in ('sale_out','purchase_return_out') and quantity_delta < 0)
    or (movement_type in ('adjustment','revision') and quantity_delta <> 0)
  ),
  constraint inventory_movements_unit_cost_check check(unit_cost is null or unit_cost >= 0),
  constraint inventory_movements_idempotency_check check(length(btrim(idempotency_key)) between 1 and 200)
);

create index if not exists inventory_movements_product_date_idx
  on public.inventory_movements(company_id, product_catalog_id, business_date desc, occurred_at desc);
create index if not exists inventory_movements_document_idx
  on public.inventory_movements(company_id, source_document_id, occurred_at);

create table if not exists public.inventory_document_positions (
  company_id uuid not null references public.companies(id) on delete restrict,
  source_document_id uuid not null,
  product_catalog_id uuid not null,
  applied_base_quantity numeric(14,3) not null default 0,
  applied_inventory_value numeric(18,6) not null default 0,
  document_revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(company_id, source_document_id, product_catalog_id),
  constraint inventory_document_positions_document_fk foreign key(company_id, source_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint inventory_document_positions_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict
);

create table if not exists public.inventory_balances (
  company_id uuid not null references public.companies(id) on delete restrict,
  product_catalog_id uuid not null,
  on_hand_quantity numeric(14,3) not null default 0,
  inventory_value numeric(18,6) not null default 0,
  average_unit_cost numeric(18,6),
  negative_cost_estimate boolean not null default false,
  version bigint not null default 0,
  updated_at timestamptz not null default now(),
  primary key(company_id, product_catalog_id),
  constraint inventory_balances_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint inventory_balances_cost_check check(average_unit_cost is null or average_unit_cost >= 0)
);

create index if not exists inventory_balances_negative_idx
  on public.inventory_balances(company_id, on_hand_quantity)
  where on_hand_quantity < 0;

create table if not exists public.inventory_stocktakes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  status text not null default 'draft',
  counted_at timestamptz not null,
  reason text not null,
  posted_at timestamptz,
  posted_by_user_id uuid references public.app_users(id) on delete set null,
  posted_by_name text,
  idempotency_key text not null,
  created_by_user_id uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint inventory_stocktakes_company_id_id_uq unique(company_id, id),
  constraint inventory_stocktakes_idempotency_uq unique(company_id, idempotency_key),
  constraint inventory_stocktakes_status_check check(status in ('draft','posted','cancelled')),
  constraint inventory_stocktakes_reason_check check(length(btrim(reason)) between 1 and 500)
);

create table if not exists public.inventory_stocktake_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  stocktake_id uuid not null,
  product_catalog_id uuid not null,
  system_quantity_snapshot numeric(14,3),
  counted_quantity numeric(14,3) not null,
  difference_quantity numeric(14,3),
  adjustment_movement_id uuid,
  created_at timestamptz not null default now(),
  constraint inventory_stocktake_lines_company_id_id_uq unique(company_id, id),
  constraint inventory_stocktake_lines_product_uq unique(company_id, stocktake_id, product_catalog_id),
  constraint inventory_stocktake_lines_stocktake_fk foreign key(company_id, stocktake_id)
    references public.inventory_stocktakes(company_id, id) on delete cascade,
  constraint inventory_stocktake_lines_product_fk foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint inventory_stocktake_lines_movement_fk foreign key(company_id, adjustment_movement_id)
    references public.inventory_movements(company_id, id) on delete restrict,
  constraint inventory_stocktake_lines_count_check check(counted_quantity >= 0)
);

create or replace function public.reject_inventory_movement_mutation()
returns trigger language plpgsql security invoker set search_path = public as $$
begin
  raise exception '재고 원장은 수정하거나 삭제할 수 없습니다. 보정 이동을 추가하세요.';
end;
$$;

drop trigger if exists inventory_movements_append_only on public.inventory_movements;
create trigger inventory_movements_append_only
before update or delete on public.inventory_movements
for each row execute function public.reject_inventory_movement_mutation();

alter table public.product_unit_conversions enable row level security;
alter table public.product_inventory_settings enable row level security;
alter table public.inventory_movements enable row level security;
alter table public.inventory_document_positions enable row level security;
alter table public.inventory_balances enable row level security;
alter table public.inventory_stocktakes enable row level security;
alter table public.inventory_stocktake_lines enable row level security;

revoke all on table public.product_unit_conversions from public, anon, authenticated;
revoke all on table public.product_inventory_settings from public, anon, authenticated;
revoke all on table public.inventory_movements from public, anon, authenticated;
revoke all on table public.inventory_document_positions from public, anon, authenticated;
revoke all on table public.inventory_balances from public, anon, authenticated;
revoke all on table public.inventory_stocktakes from public, anon, authenticated;
revoke all on table public.inventory_stocktake_lines from public, anon, authenticated;
revoke all on function public.reject_inventory_movement_mutation() from public, anon, authenticated;

grant all on table public.product_unit_conversions to service_role;
grant all on table public.product_inventory_settings to service_role;
grant all on table public.inventory_movements to service_role;
grant all on table public.inventory_document_positions to service_role;
grant all on table public.inventory_balances to service_role;
grant all on table public.inventory_stocktakes to service_role;
grant all on table public.inventory_stocktake_lines to service_role;
grant execute on function public.reject_inventory_movement_mutation() to service_role;

-- FINALIZATION REQUIRED BEFORE EXECUTION:
-- 1. Add the verified supplier_products composite FK to product_inventory_settings.
-- 2. Implement apply_inventory_for_document as SECURITY INVOKER/service_role-only.
--    It must lock the document and balance rows, resolve confirmed supplier mappings,
--    compute document-product targets, append only the delta, and update position/balance
--    in the same transaction.
-- 3. Modify the applied ERP Phase 1-B v2 functions in-place:
--    confirm_business_document, save_business_document, cancel_business_document,
--    move_business_document_lines. copy_business_document_lines remains stock-neutral.
-- 4. Implement post_inventory_stocktake with the same idempotency and lock order.
-- 5. Add a rebuild/audit RPC that compares movement sums with inventory_balances.
-- 6. Validate PG function bodies against the exact operational ERP SQL before migration.

-- Draft is intentionally transaction-wrapped. Do not change this to COMMIT until reviewed.
rollback;

