-- WO-03 B+ 단위 환산 확장 SQL 초안. 운영 DB 적용 금지.
-- 기존 운영 원장 product_unit_conversions를 재사용한다.
-- product_purchase_units를 별도로 만들지 않는다.

begin;

alter table public.product_unit_conversions
  add column if not exists is_default_purchase boolean not null default false,
  add column if not exists memo text;

alter table public.product_unit_conversions
  drop constraint if exists product_unit_conversions_source_check;
alter table public.product_unit_conversions
  add constraint product_unit_conversions_source_check
  check (source in ('manual', 'supplier_match', 'legacy', 'category_rule'));

create unique index if not exists product_unit_conversions_one_default_purchase_uq
  on public.product_unit_conversions(company_id, product_catalog_id)
  where is_default_purchase;
create unique index if not exists product_unit_conversions_product_id_uq
  on public.product_unit_conversions(company_id, product_catalog_id, id);

create table if not exists public.category_unit_rules (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  category_id uuid not null,
  unit_name text not null,
  base_quantity numeric(14,3) not null,
  is_default_purchase boolean not null default false,
  weight_percent numeric(6,3),
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, id),
  unique(company_id, category_id, unit_name),
  foreign key(company_id, category_id)
    references public.product_categories(company_id, id) on delete cascade,
  check(length(btrim(unit_name)) between 1 and 40),
  check(base_quantity > 0),
  check(weight_percent is null or weight_percent > 0)
);

create unique index if not exists category_unit_rules_one_default_purchase_uq
  on public.category_unit_rules(company_id, category_id)
  where is_default_purchase;

create table if not exists public.product_unit_observations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_catalog_id uuid not null,
  conversion_id uuid not null,
  observed_base_quantity numeric(14,3) not null,
  observed_at timestamptz not null default now(),
  source_key text,
  created_by_name text,
  created_at timestamptz not null default now(),
  unique(company_id, id),
  foreign key(company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete cascade,
  foreign key(company_id, product_catalog_id, conversion_id)
    references public.product_unit_conversions(company_id, product_catalog_id, id) on delete cascade,
  check(observed_base_quantity > 0),
  check(source_key is null or length(btrim(source_key)) between 1 and 200)
);

create unique index if not exists product_unit_observations_source_uq
  on public.product_unit_observations(company_id, source_key)
  where source_key is not null;
create index if not exists product_unit_observations_recent_idx
  on public.product_unit_observations(company_id, product_catalog_id, conversion_id, observed_at desc, id desc);

create or replace function public.numeric_median(p_values numeric[])
returns numeric
language sql immutable strict
set search_path = pg_catalog, pg_temp
as $$
  select avg(value)
  from (
    select value
    from unnest(p_values) value
    order by value
    offset greatest((cardinality(p_values) - 1) / 2, 0)
    limit 2 - mod(cardinality(p_values), 2)
  ) middle_values;
$$;

create or replace function public.product_unit_recent_median(
  p_company_id uuid,
  p_product_id uuid,
  p_conversion_id uuid
) returns numeric
language sql stable security invoker
set search_path = pg_catalog, pg_temp
as $$
  with recent as (
    select o.observed_base_quantity
    from public.product_unit_observations o
    where o.company_id = p_company_id
      and o.product_catalog_id = p_product_id
      and o.conversion_id = p_conversion_id
    order by o.observed_at desc, o.id desc
    limit 5
  )
  select coalesce(
    public.numeric_median(array_agg(recent.observed_base_quantity)),
    (select c.base_quantity
     from public.product_unit_conversions c
     where c.company_id = p_company_id
       and c.product_catalog_id = p_product_id
       and c.id = p_conversion_id)
  )
  from recent;
$$;

create or replace function public.apply_category_unit_rule(
  p_company_id uuid,
  p_category_id uuid,
  p_product_ids uuid[],
  p_unit_name text,
  p_base_quantity numeric,
  p_is_default_purchase boolean,
  p_weight_percent numeric,
  p_keep_existing boolean,
  p_actor_name text
) returns integer
language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
declare
  v_product_count integer;
  v_changed integer := 0;
begin
  if coalesce(cardinality(p_product_ids), 0) = 0 then
    raise exception 'product_ids_required';
  end if;
  if length(btrim(coalesce(p_unit_name, ''))) = 0 or p_base_quantity <= 0 then
    raise exception 'invalid_unit_rule';
  end if;
  if not exists (
    select 1 from public.product_categories c
    where c.company_id = p_company_id and c.id = p_category_id and c.is_active
  ) then
    raise exception 'category_not_found';
  end if;

  select count(*) into v_product_count
  from public.product_catalog p
  where p.company_id = p_company_id
    and p.category_id = p_category_id
    and p.id = any(p_product_ids);
  if v_product_count <> cardinality(p_product_ids) then
    raise exception 'product_scope_mismatch';
  end if;

  if p_is_default_purchase then
    update public.category_unit_rules
      set is_default_purchase = false, updated_at = now()
    where company_id = p_company_id and category_id = p_category_id and is_default_purchase;
  end if;
  insert into public.category_unit_rules(
    company_id, category_id, unit_name, base_quantity, is_default_purchase,
    weight_percent, created_by_name
  ) values (
    p_company_id, p_category_id, btrim(p_unit_name), p_base_quantity,
    p_is_default_purchase, p_weight_percent, p_actor_name
  )
  on conflict(company_id, category_id, unit_name) do update set
    base_quantity = excluded.base_quantity,
    is_default_purchase = excluded.is_default_purchase,
    weight_percent = excluded.weight_percent,
    created_by_name = excluded.created_by_name,
    updated_at = now();

  if p_is_default_purchase and not p_keep_existing then
    update public.product_unit_conversions
      set is_default_purchase = false, updated_at = now()
    where company_id = p_company_id
      and product_catalog_id = any(p_product_ids)
      and is_default_purchase;
  end if;

  insert into public.product_unit_conversions(
    company_id, product_catalog_id, unit_name, base_quantity, is_base,
    is_confirmed, is_default_purchase, source, created_by_name
  )
  select p_company_id, product_id, btrim(p_unit_name), p_base_quantity, false,
         true,
         p_is_default_purchase and not (
           p_keep_existing and exists (
             select 1 from public.product_unit_conversions existing
             where existing.company_id = p_company_id
               and existing.product_catalog_id = product_id
               and existing.is_default_purchase
           )
         ),
         'category_rule', p_actor_name
  from unnest(p_product_ids) product_id
  on conflict(company_id, product_catalog_id, unit_name) do update set
    base_quantity = excluded.base_quantity,
    is_confirmed = true,
    is_default_purchase = excluded.is_default_purchase,
    source = 'category_rule',
    created_by_name = excluded.created_by_name,
    updated_at = now()
  where not p_keep_existing;
  get diagnostics v_changed = row_count;
  return v_changed;
end;
$$;

create or replace function public.apply_category_unit_rules_to_new_product()
returns trigger
language plpgsql security invoker
set search_path = pg_catalog, pg_temp
as $$
begin
  if new.category_id is null then return new; end if;
  insert into public.product_unit_conversions(
    company_id, product_catalog_id, unit_name, base_quantity, is_base,
    is_confirmed, is_default_purchase, source, created_by_name
  )
  select r.company_id, new.id, r.unit_name, r.base_quantity, false,
         true, r.is_default_purchase, 'category_rule', r.created_by_name
  from public.category_unit_rules r
  where r.company_id = new.company_id and r.category_id = new.category_id
  on conflict(company_id, product_catalog_id, unit_name) do nothing;
  return new;
end;
$$;

drop trigger if exists product_catalog_apply_category_unit_rules on public.product_catalog;
create trigger product_catalog_apply_category_unit_rules
after insert or update of category_id on public.product_catalog
for each row execute function public.apply_category_unit_rules_to_new_product();

alter table public.category_unit_rules enable row level security;
alter table public.product_unit_observations enable row level security;
revoke all on public.category_unit_rules, public.product_unit_observations from public, anon, authenticated;
grant select, insert, update, delete on public.category_unit_rules, public.product_unit_observations to service_role;
revoke all on function public.numeric_median(numeric[]) from public, anon, authenticated;
revoke all on function public.product_unit_recent_median(uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.apply_category_unit_rule(uuid, uuid, uuid[], text, numeric, boolean, numeric, boolean, text) from public, anon, authenticated;
revoke all on function public.apply_category_unit_rules_to_new_product() from public, anon, authenticated;
grant execute on function public.numeric_median(numeric[]) to service_role;
grant execute on function public.product_unit_recent_median(uuid, uuid, uuid) to service_role;
grant execute on function public.apply_category_unit_rule(uuid, uuid, uuid[], text, numeric, boolean, numeric, boolean, text) to service_role;
grant execute on function public.apply_category_unit_rules_to_new_product() to service_role;

commit;

-- DOWN 초안(승인 후 migration 승격 시 별도 실행):
-- drop trigger if exists product_catalog_apply_category_unit_rules on public.product_catalog;
-- drop function if exists public.apply_category_unit_rules_to_new_product();
-- drop function if exists public.apply_category_unit_rule(uuid, uuid, uuid[], text, numeric, boolean, numeric, boolean, text);
-- drop function if exists public.product_unit_recent_median(uuid, uuid, uuid);
-- drop function if exists public.numeric_median(numeric[]);
-- drop table if exists public.product_unit_observations;
-- drop table if exists public.category_unit_rules;
-- drop index if exists public.product_unit_conversions_product_id_uq;
-- drop index if exists public.product_unit_conversions_one_default_purchase_uq;
-- alter table public.product_unit_conversions drop column if exists memo, drop column if exists is_default_purchase;
