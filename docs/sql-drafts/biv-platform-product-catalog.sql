-- BIV platform product catalog strategy draft, 2026-10-16.
-- REVIEW ONLY. DO NOT EXECUTE IN ANY ENVIRONMENT UNTIL EACH PHASE IS APPROVED.
-- This file intentionally contains the complete target model; implementation must split it by phase.
-- For the platform admin console, the three biv-platform-admin-phase-*.sql files are now normative.

begin;

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
  constraint platform_brand_dictionary_name_check check (length(btrim(canonical_name)) between 1 and 120),
  constraint platform_brand_dictionary_normalized_check check (length(btrim(normalized_name)) between 1 and 120)
);

create table if not exists public.platform_products (
  id uuid default gen_random_uuid() constraint platform_products_pkey primary key,
  platform_product_code text not null default (
    'BIV-P-' || lpad(nextval('public.platform_product_code_seq')::text, 8, '0')
  ),
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
  merged_into_product_id uuid,
  created_by_admin text not null,
  updated_by_admin text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint platform_products_code_key unique (platform_product_code),
  constraint platform_products_brand_fk foreign key (brand_id)
    references public.platform_brand_dictionary(id) on delete set null,
  constraint platform_products_merged_fk foreign key (merged_into_product_id)
    references public.platform_products(id) on delete restrict,
  constraint platform_products_status_check check (status in ('active','inactive','merged')),
  constraint platform_products_tax_type_check check (tax_type is null or tax_type in ('taxable','exempt')),
  constraint platform_products_spec_value_check check (spec_value is null or spec_value > 0),
  constraint platform_products_merge_check check (
    (status = 'merged' and merged_into_product_id is not null and merged_into_product_id <> id)
    or (status <> 'merged' and merged_into_product_id is null)
  ),
  constraint platform_products_name_check check (length(btrim(display_name)) between 1 and 200),
  constraint platform_products_unit_check check (length(btrim(standard_unit)) between 1 and 40)
);

create index if not exists platform_products_normalized_name_idx
  on public.platform_products (normalized_name, status);
create index if not exists platform_products_brand_idx
  on public.platform_products (brand_id, status);
create index if not exists platform_products_barcodes_gin_idx
  on public.platform_products using gin (barcodes);

create or replace function public.platform_products_lock_code()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  if old.platform_product_code is distinct from new.platform_product_code then
    raise exception '플랫폼 품목코드는 변경할 수 없습니다.' using errcode = '55000';
  end if;
  return new;
end;
$$;

drop trigger if exists platform_products_lock_code on public.platform_products;
create trigger platform_products_lock_code
before update of platform_product_code on public.platform_products
for each row execute function public.platform_products_lock_code();

-- Arrays do not provide cross-row uniqueness. Lock each barcode key in the transaction,
-- then reject overlaps. Application writes must also normalize digits before calling this trigger.
create or replace function public.platform_products_assert_unique_barcodes()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
declare
  v_barcode text;
begin
  new.barcodes := coalesce(array(
    select distinct btrim(value)
    from unnest(coalesce(new.barcodes, '{}')) value
    where btrim(value) <> ''
    order by btrim(value)
  ), '{}');

  foreach v_barcode in array new.barcodes loop
    perform pg_advisory_xact_lock(hashtextextended('platform-barcode:' || v_barcode, 0));
  end loop;

  if exists (
    select 1
    from public.platform_products p
    where p.id <> new.id
      and p.status <> 'merged'
      and p.barcodes && new.barcodes
  ) then
    raise exception '다른 플랫폼 품목이 이미 같은 바코드를 사용합니다.' using errcode = '23505';
  end if;
  return new;
end;
$$;

drop trigger if exists platform_products_unique_barcodes on public.platform_products;
create trigger platform_products_unique_barcodes
before insert or update of barcodes, status on public.platform_products
for each row execute function public.platform_products_assert_unique_barcodes();

create table if not exists public.platform_product_aliases (
  id uuid default gen_random_uuid() constraint platform_product_aliases_pkey primary key,
  platform_product_id uuid not null,
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
  constraint platform_product_aliases_product_fk foreign key (platform_product_id)
    references public.platform_products(id) on delete cascade,
  constraint platform_product_aliases_source_check check (source in ('manual','company_confirmed','platform_confirmed','import')),
  constraint platform_product_aliases_spec_check check (spec_value is null or spec_value > 0),
  constraint platform_product_aliases_signature_key unique
    (platform_product_id, normalized_alias, brand_name, origin_name, spec_value, spec_unit, unit_name)
);
create index if not exists platform_product_aliases_lookup_idx
  on public.platform_product_aliases (normalized_alias, is_confirmed);

create table if not exists public.company_product_platform_links (
  id uuid default gen_random_uuid() constraint company_product_platform_links_pkey primary key,
  company_id uuid not null constraint company_product_platform_links_company_fk
    references public.companies(id) on delete cascade,
  source_type text not null,
  product_catalog_id uuid,
  supplier_product_id uuid,
  platform_product_id uuid not null constraint company_product_platform_links_platform_product_fk
    references public.platform_products(id) on delete restrict,
  match_status text not null,
  candidate_rank integer,
  match_score numeric(5,2) not null,
  name_matches boolean not null default false,
  brand_matches boolean not null default false,
  origin_matches boolean not null default false,
  spec_matches boolean not null default false,
  unit_matches boolean not null default false,
  barcode_matches boolean not null default false,
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
    references public.product_catalog(company_id, id) on delete cascade,
  constraint company_product_platform_links_supplier_product_fk foreign key (company_id, supplier_product_id)
    references public.supplier_products(company_id, id) on delete cascade,
  constraint company_product_platform_links_confirmer_member_fk foreign key (company_id, confirmed_by_member_id)
    references public.company_members(company_id, id) on delete set null (confirmed_by_member_id),
  constraint company_product_platform_links_source_check check (
    (source_type = 'product_catalog' and product_catalog_id is not null and supplier_product_id is null)
    or (source_type = 'supplier_product' and supplier_product_id is not null and product_catalog_id is null)
  ),
  constraint company_product_platform_links_status_check check (match_status in ('candidate','auto','confirmed','rejected')),
  constraint company_product_platform_links_rank_check check (candidate_rank is null or candidate_rank between 1 and 3),
  constraint company_product_platform_links_score_check check (match_score between 0 and 100),
  constraint company_product_platform_links_ratio_check check (source_to_platform_ratio is null or source_to_platform_ratio > 0),
  constraint company_product_platform_links_confirmer_check check (
    (confirmed_by_type is null and confirmed_by_member_id is null and confirmed_at is null)
    or (confirmed_by_type = 'company_user' and confirmed_by_member_id is not null and confirmed_at is not null)
    or (confirmed_by_type = 'platform_admin' and confirmed_by_member_id is null and confirmed_at is not null)
  )
);

create unique index if not exists company_product_platform_links_pair_catalog_uq
  on public.company_product_platform_links(company_id, product_catalog_id, platform_product_id)
  where product_catalog_id is not null;
create unique index if not exists company_product_platform_links_pair_supplier_uq
  on public.company_product_platform_links(company_id, supplier_product_id, platform_product_id)
  where supplier_product_id is not null;
create unique index if not exists company_product_platform_links_active_catalog_uq
  on public.company_product_platform_links(company_id, product_catalog_id)
  where product_catalog_id is not null and match_status in ('auto','confirmed');
create unique index if not exists company_product_platform_links_active_supplier_uq
  on public.company_product_platform_links(company_id, supplier_product_id)
  where supplier_product_id is not null and match_status in ('auto','confirmed');
create unique index if not exists company_product_platform_links_candidate_catalog_rank_uq
  on public.company_product_platform_links(company_id, product_catalog_id, candidate_rank)
  where product_catalog_id is not null and match_status = 'candidate';
create unique index if not exists company_product_platform_links_candidate_supplier_rank_uq
  on public.company_product_platform_links(company_id, supplier_product_id, candidate_rank)
  where supplier_product_id is not null and match_status = 'candidate';
create index if not exists company_product_platform_links_platform_idx
  on public.company_product_platform_links(platform_product_id, match_status, company_id);

create table if not exists public.company_platform_data_consents (
  company_id uuid not null constraint company_platform_data_consents_company_fk
    references public.companies(id) on delete cascade,
  purpose text not null,
  policy_version text not null,
  consent_status text not null,
  consented_by_member_id uuid,
  consented_by_name text not null,
  consented_at timestamptz,
  revoked_at timestamptz,
  updated_at timestamptz not null default now(),
  constraint company_platform_data_consents_pkey primary key (company_id, purpose),
  constraint company_platform_data_consents_member_fk foreign key (company_id, consented_by_member_id)
    references public.company_members(company_id, id) on delete set null (consented_by_member_id),
  constraint company_platform_data_consents_purpose_check check (purpose in ('cost_benchmarking')),
  constraint company_platform_data_consents_status_check check (consent_status in ('granted','revoked')),
  constraint company_platform_data_consents_time_check check (
    (consent_status = 'granted' and consented_at is not null and revoked_at is null)
    or (consent_status = 'revoked' and revoked_at is not null)
  )
);

create table if not exists public.company_platform_data_consent_events (
  id uuid default gen_random_uuid() constraint company_platform_data_consent_events_pkey primary key,
  company_id uuid not null constraint company_platform_data_consent_events_company_fk
    references public.companies(id) on delete cascade,
  purpose text not null,
  policy_version text not null,
  event_type text not null,
  actor_member_id uuid,
  actor_name text not null,
  policy_snapshot jsonb not null,
  created_at timestamptz not null default now(),
  constraint company_platform_data_consent_events_member_fk foreign key (company_id, actor_member_id)
    references public.company_members(company_id, id) on delete set null (actor_member_id),
  constraint company_platform_data_consent_events_purpose_check check (purpose in ('cost_benchmarking')),
  constraint company_platform_data_consent_events_type_check check (event_type in ('granted','revoked'))
);
create index if not exists company_platform_data_consent_events_company_idx
  on public.company_platform_data_consent_events(company_id, purpose, created_at desc);

create table if not exists public.platform_market_benchmark_settings (
  singleton boolean primary key default true constraint platform_market_benchmark_settings_singleton_check check (singleton),
  active_policy_version text not null,
  minimum_other_company_count integer not null default 3,
  lookback_days integer not null default 90,
  reverse_proposal_threshold_percent numeric(7,2) not null default 10,
  updated_by_admin text not null,
  updated_at timestamptz not null default now(),
  constraint platform_market_benchmark_settings_minimum_check check (minimum_other_company_count >= 3),
  constraint platform_market_benchmark_settings_lookback_check check (lookback_days between 1 and 3650),
  constraint platform_market_benchmark_settings_threshold_check check (reverse_proposal_threshold_percent > 0)
);

create table if not exists public.platform_data_access_audit_logs (
  id uuid default gen_random_uuid() constraint platform_data_access_audit_logs_pkey primary key,
  admin_email text not null,
  admin_name text not null,
  admin_role text not null,
  action text not null,
  purpose text not null,
  platform_product_id uuid,
  request_id text not null,
  ip_hash text,
  filters jsonb not null default '{}'::jsonb,
  result_row_count integer not null default 0,
  created_at timestamptz not null default now(),
  constraint platform_data_access_audit_logs_product_fk foreign key (platform_product_id)
    references public.platform_products(id) on delete set null,
  constraint platform_data_access_audit_logs_count_check check (result_row_count >= 0)
);
create index if not exists platform_data_access_audit_logs_created_idx
  on public.platform_data_access_audit_logs(created_at desc, admin_email);
create index if not exists platform_data_access_audit_logs_product_idx
  on public.platform_data_access_audit_logs(platform_product_id, created_at desc)
  where platform_product_id is not null;

create or replace function public.reject_append_only_mutation()
returns trigger
language plpgsql
set search_path = public, pg_temp
as $$
begin
  raise exception 'append-only 기록은 수정하거나 삭제할 수 없습니다.' using errcode = '55000';
end;
$$;

drop trigger if exists company_platform_data_consent_events_append_only on public.company_platform_data_consent_events;
create trigger company_platform_data_consent_events_append_only
before update or delete on public.company_platform_data_consent_events
for each row execute function public.reject_append_only_mutation();

drop trigger if exists platform_data_access_audit_logs_append_only on public.platform_data_access_audit_logs;
create trigger platform_data_access_audit_logs_append_only
before update or delete on public.platform_data_access_audit_logs
for each row execute function public.reject_append_only_mutation();

-- Company-facing aggregate. The server MUST derive p_requesting_company_id from the signed
-- company session; never trust a query/body company ID. This function returns no raw rows.
create or replace function public.get_company_market_benchmark(
  p_requesting_company_id uuid,
  p_platform_product_id uuid,
  p_as_of_date date default ((now() at time zone 'Asia/Seoul')::date)
)
returns table (
  platform_product_id uuid,
  median_unit_cost numeric,
  p25_unit_cost numeric,
  p75_unit_cost numeric,
  source_count_bucket text
)
language sql
security invoker
set search_path = public, pg_temp
as $$
  with settings as (
    select active_policy_version, minimum_other_company_count, lookback_days
    from public.platform_market_benchmark_settings
    where singleton = true
  ), eligible_company_costs as (
    select
      l.company_id,
      percentile_cont(0.5) within group (
        order by (sp.latest_cost / l.source_to_platform_ratio)
      )::numeric as company_unit_cost
    from public.company_product_platform_links l
    join public.supplier_products sp
      on sp.company_id = l.company_id
     and sp.id = l.supplier_product_id
    join public.company_platform_data_consents c
      on c.company_id = l.company_id
     and c.purpose = 'cost_benchmarking'
     and c.consent_status = 'granted'
    cross join settings s
    where l.platform_product_id = p_platform_product_id
      and l.source_type = 'supplier_product'
      and l.match_status = 'confirmed'
      and l.conversion_confirmed = true
      and l.source_to_platform_ratio > 0
      and sp.cost_confirmed = true
      and sp.is_active = true
      and sp.latest_cost is not null
      and sp.latest_cost >= 0
      and sp.last_seen_date >= p_as_of_date - s.lookback_days
      and c.policy_version = s.active_policy_version
      and l.company_id <> p_requesting_company_id
    group by l.company_id
  ), aggregate_result as (
    select
      count(*)::integer as source_company_count,
      percentile_cont(0.5) within group (order by company_unit_cost)::numeric as median_cost,
      percentile_cont(0.25) within group (order by company_unit_cost)::numeric as p25_cost,
      percentile_cont(0.75) within group (order by company_unit_cost)::numeric as p75_cost
    from eligible_company_costs
  )
  select
    p_platform_product_id,
    round(a.median_cost, 2),
    round(a.p25_cost, 2),
    round(a.p75_cost, 2),
    case
      when a.source_company_count between 3 and 5 then '3-5'
      when a.source_company_count between 6 and 10 then '6-10'
      else '11+'
    end
  from aggregate_result a
  cross join settings s
  where a.source_company_count >= greatest(3, s.minimum_other_company_count);
$$;

alter table public.platform_brand_dictionary enable row level security;
alter table public.platform_products enable row level security;
alter table public.platform_product_aliases enable row level security;
alter table public.company_product_platform_links enable row level security;
alter table public.company_platform_data_consents enable row level security;
alter table public.company_platform_data_consent_events enable row level security;
alter table public.platform_market_benchmark_settings enable row level security;
alter table public.platform_data_access_audit_logs enable row level security;

revoke all on public.platform_brand_dictionary,
  public.platform_products,
  public.platform_product_aliases,
  public.company_product_platform_links,
  public.company_platform_data_consents,
  public.company_platform_data_consent_events,
  public.platform_market_benchmark_settings,
  public.platform_data_access_audit_logs
from public, anon, authenticated;

grant all on public.platform_brand_dictionary,
  public.platform_products,
  public.platform_product_aliases,
  public.company_product_platform_links,
  public.company_platform_data_consents,
  public.company_platform_data_consent_events,
  public.platform_market_benchmark_settings,
  public.platform_data_access_audit_logs
to service_role;

revoke all on function public.platform_products_assert_unique_barcodes() from public, anon, authenticated;
revoke all on function public.platform_products_lock_code() from public, anon, authenticated;
revoke all on function public.reject_append_only_mutation() from public, anon, authenticated;
revoke all on function public.get_company_market_benchmark(uuid, uuid, date) from public, anon, authenticated;
revoke all on sequence public.platform_product_code_seq from public, anon, authenticated;
grant usage, select on sequence public.platform_product_code_seq to service_role;
grant execute on function public.get_company_market_benchmark(uuid, uuid, date) to service_role;

-- Intentionally no SELECT/INSERT/UPDATE/DELETE RLS policies. The current application uses
-- server-side service_role after requireAdminSession/company-session checks. No browser access.

commit;

-- -----------------------------------------------------------------------------
-- ROLLBACK DRAFT (run only after a separately approved data-retention/export plan)
-- -----------------------------------------------------------------------------
-- begin;
-- drop function if exists public.get_company_market_benchmark(uuid, uuid, date);
-- drop trigger if exists platform_data_access_audit_logs_append_only on public.platform_data_access_audit_logs;
-- drop trigger if exists company_platform_data_consent_events_append_only on public.company_platform_data_consent_events;
-- drop function if exists public.reject_append_only_mutation();
-- drop table if exists public.platform_data_access_audit_logs;
-- drop table if exists public.platform_market_benchmark_settings;
-- drop table if exists public.company_platform_data_consent_events;
-- drop table if exists public.company_platform_data_consents;
-- drop table if exists public.company_product_platform_links;
-- drop table if exists public.platform_product_aliases;
-- drop trigger if exists platform_products_unique_barcodes on public.platform_products;
-- drop trigger if exists platform_products_lock_code on public.platform_products;
-- drop function if exists public.platform_products_assert_unique_barcodes();
-- drop function if exists public.platform_products_lock_code();
-- drop table if exists public.platform_products;
-- drop table if exists public.platform_brand_dictionary;
-- drop sequence if exists public.platform_product_code_seq;
-- commit;
