-- REVIEW ONLY: 운영 적용 전 별도 DB-APPROVED 필요. 원본 매입 기록은 수정하지 않는다.
begin;

create unique index if not exists purchase_receipt_lines_company_id_id_uq
  on public.purchase_receipt_lines(company_id, id);

create table if not exists public.purchase_receipt_line_overrides (
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_line_id uuid not null,
  product_catalog_id uuid,
  product_name text not null,
  spec text,
  unit text,
  unit_cost_ex_vat numeric(14,2) not null check (unit_cost_ex_vat between 0 and 1000000000),
  revision integer not null default 1 check (revision > 0),
  corrected_at timestamptz not null default now(),
  primary key (company_id, receipt_line_id),
  constraint purchase_receipt_override_line_fk foreign key (company_id, receipt_line_id)
    references public.purchase_receipt_lines(company_id, id) on delete cascade,
  constraint purchase_receipt_override_product_fk foreign key (company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete set null (product_catalog_id)
);

create table if not exists public.purchase_receipt_correction_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_line_id uuid not null,
  before_value jsonb not null,
  after_value jsonb not null,
  reason text not null check (length(trim(reason)) between 5 and 500),
  actor_name text not null check (length(trim(actor_name)) between 1 and 80),
  created_at timestamptz not null default now(),
  constraint purchase_receipt_correction_line_fk foreign key (company_id, receipt_line_id)
    references public.purchase_receipt_lines(company_id, id) on delete cascade
);
create index if not exists purchase_receipt_correction_events_line_idx
  on public.purchase_receipt_correction_events(company_id, receipt_line_id, created_at desc);

alter table public.purchase_receipt_line_overrides enable row level security;
alter table public.purchase_receipt_correction_events enable row level security;
revoke all on public.purchase_receipt_line_overrides, public.purchase_receipt_correction_events from public, anon, authenticated;
grant select, insert, update on public.purchase_receipt_line_overrides to service_role;
grant select, insert on public.purchase_receipt_correction_events to service_role;

create or replace view public.purchase_receipt_effective with (security_invoker = true) as
select r.id, r.company_id, r.receipt_date, r.line_key,
  coalesce(o.product_catalog_id, r.product_catalog_id) as product_catalog_id,
  coalesce(o.product_name, r.product_name) as product_name,
  case when o.receipt_line_id is not null then o.spec else r.spec end as spec,
  case when o.receipt_line_id is not null then o.unit else r.unit end as unit,
  r.supplier_name, r.erp_code, r.quantity, r.unit_price,
  coalesce(o.unit_cost_ex_vat, r.unit_cost_ex_vat) as unit_cost_ex_vat,
  r.price_includes_vat, r.tax_type, r.total_amount,
  coalesce(o.revision, 0) as correction_revision, (o.receipt_line_id is not null) as corrected
from public.purchase_receipt_lines r
left join public.purchase_receipt_line_overrides o
  on o.company_id = r.company_id and o.receipt_line_id = r.id;
revoke all on public.purchase_receipt_effective from public, anon, authenticated;
grant select on public.purchase_receipt_effective to service_role;

create or replace function public.correct_purchase_receipt_line(
  p_company uuid, p_line uuid, p_product uuid, p_cost numeric,
  p_reason text, p_actor text, p_expected_revision integer
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  original public.purchase_receipt_lines;
  previous public.purchase_receipt_line_overrides;
  catalog public.product_catalog;
  next_product uuid;
  next_name text;
  next_spec text;
  next_unit text;
  next_revision integer;
  before_value jsonb;
  after_value jsonb;
begin
  if p_expected_revision is null or p_expected_revision < 0
     or p_cost is null or p_cost < 0 or p_cost > 1000000000 or p_cost <> round(p_cost, 2)
     or length(trim(coalesce(p_reason, ''))) not between 5 and 500
     or length(trim(coalesce(p_actor, ''))) not between 1 and 80 then
    raise exception 'invalid_receipt_correction';
  end if;
  select * into original from public.purchase_receipt_lines
    where company_id = p_company and id = p_line for update;
  if not found then raise exception 'receipt_line_not_found'; end if;
  select * into previous from public.purchase_receipt_line_overrides
    where company_id = p_company and receipt_line_id = p_line for update;
  if coalesce(previous.revision, 0) <> p_expected_revision then
    raise exception 'receipt_correction_conflict';
  end if;

  next_product := coalesce(p_product, previous.product_catalog_id, original.product_catalog_id);
  next_name := coalesce(previous.product_name, original.product_name);
  next_spec := case when previous.receipt_line_id is not null then previous.spec else original.spec end;
  next_unit := case when previous.receipt_line_id is not null then previous.unit else original.unit end;
  if p_product is not null then
    select * into catalog from public.product_catalog
      where company_id = p_company and id = p_product;
    if not found then raise exception 'product_not_in_company'; end if;
    next_name := coalesce(nullif(trim(catalog.canonical_name), ''), catalog.purchase_product_name);
    next_spec := coalesce(nullif(trim(catalog.sales_spec), ''),
      case when catalog.spec_value is not null then catalog.spec_value::text || coalesce(catalog.spec_unit, '') end);
    next_unit := catalog.sales_unit;
  end if;
  next_revision := coalesce(previous.revision, 0) + 1;
  before_value := jsonb_build_object('product_catalog_id', coalesce(previous.product_catalog_id, original.product_catalog_id),
    'product_name', coalesce(previous.product_name, original.product_name),
    'spec', case when previous.receipt_line_id is not null then previous.spec else original.spec end,
    'unit', case when previous.receipt_line_id is not null then previous.unit else original.unit end,
    'unit_cost_ex_vat', coalesce(previous.unit_cost_ex_vat, original.unit_cost_ex_vat));
  insert into public.purchase_receipt_line_overrides
    (company_id, receipt_line_id, product_catalog_id, product_name, spec, unit, unit_cost_ex_vat, revision, corrected_at)
    values (p_company, p_line, next_product, next_name, next_spec, next_unit, p_cost, next_revision, now())
    on conflict (company_id, receipt_line_id) do update set
      product_catalog_id = excluded.product_catalog_id, product_name = excluded.product_name,
      spec = excluded.spec, unit = excluded.unit, unit_cost_ex_vat = excluded.unit_cost_ex_vat,
      revision = excluded.revision, corrected_at = excluded.corrected_at;
  after_value := jsonb_build_object('product_catalog_id', next_product, 'product_name', next_name,
    'spec', next_spec, 'unit', next_unit, 'unit_cost_ex_vat', p_cost);
  insert into public.purchase_receipt_correction_events
    (company_id, receipt_line_id, before_value, after_value, reason, actor_name)
    values (p_company, p_line, before_value, after_value, trim(p_reason), trim(p_actor));
  return jsonb_build_object('revision', next_revision);
end $$;
revoke all on function public.correct_purchase_receipt_line(uuid, uuid, uuid, numeric, text, text, integer) from public, anon, authenticated;
grant execute on function public.correct_purchase_receipt_line(uuid, uuid, uuid, numeric, text, text, integer) to service_role;

commit;

-- Rollback (별도 승인, 먼저 정정 기록 유무 확인):
-- begin;
-- drop function if exists public.correct_purchase_receipt_line(uuid, uuid, uuid, numeric, text, text, integer);
-- drop view if exists public.purchase_receipt_effective;
-- drop table if exists public.purchase_receipt_correction_events;
-- drop table if exists public.purchase_receipt_line_overrides;
-- drop index if exists public.purchase_receipt_lines_company_id_id_uq;
-- commit;
