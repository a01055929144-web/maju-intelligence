-- REVIEW ONLY. Separate DB approval required. Never run on production from this PR.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';

alter table public.store_order_settings add column if not exists show_purchase_cost_direction boolean not null default false;

-- No existing receipt is implicitly declared valid. The purchase-history owner records a review.
create table if not exists public.storefront_cost_source_checks (
  id bigint generated always as identity primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_line_id uuid not null,
  receipt_snapshot jsonb not null check (jsonb_typeof(receipt_snapshot) = 'object'),
  correction_event_count bigint not null check (correction_event_count >= 0),
  eligible boolean not null,
  actor_name text not null check (length(trim(actor_name)) between 1 and 80),
  reason text not null check (length(trim(reason)) between 5 and 500),
  checked_at timestamptz not null default clock_timestamp(),
  foreign key (company_id, receipt_line_id) references public.purchase_receipt_lines(company_id, id) on delete cascade
);
create index if not exists storefront_cost_source_checks_line_idx on public.storefront_cost_source_checks(company_id, receipt_line_id, id desc);
create index if not exists purchase_receipt_lines_cost_direction_idx on public.purchase_receipt_lines(company_id, product_catalog_id, receipt_date desc) where product_catalog_id is not null;
alter table public.storefront_cost_source_checks enable row level security;
revoke all on public.storefront_cost_source_checks from public, anon, authenticated;
grant select, insert on public.storefront_cost_source_checks to service_role;
revoke all on sequence public.storefront_cost_source_checks_id_seq from public, anon, authenticated;
grant usage, select on sequence public.storefront_cost_source_checks_id_seq to service_role;

create or replace function public.set_storefront_cost_direction_visibility(p_company uuid, p_enabled boolean)
returns boolean language plpgsql security invoker set search_path = public, pg_temp as $$
begin
  if p_company is null or p_enabled is null then raise exception 'invalid_visibility'; end if;
  insert into public.store_order_settings(company_id, show_purchase_cost_direction)
    values(p_company, p_enabled)
    on conflict(company_id) do update set show_purchase_cost_direction = excluded.show_purchase_cost_direction, updated_at = now();
  return p_enabled;
end $$;

-- Internal integration contract for the purchase-history owner. No public endpoint calls this.
-- The caller must authenticate an owner/manager and explicitly exclude returns, errors and cancellations.
create or replace function public.check_storefront_cost_source(
  p_company uuid, p_line uuid, p_snapshot jsonb, p_eligible boolean, p_actor text, p_reason text
) returns bigint language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  receipt public.purchase_receipt_effective%rowtype;
  event_count bigint;
  check_id bigint;
begin
  if p_company is null or p_line is null or p_eligible is null
     or length(trim(coalesce(p_actor, ''))) not between 1 and 80
     or length(trim(coalesce(p_reason, ''))) not between 5 and 500 then raise exception 'invalid_source_check'; end if;
  perform 1 from public.purchase_receipt_lines where company_id = p_company and id = p_line for update;
  if not found then raise exception 'receipt_not_found'; end if;
  select * into receipt from public.purchase_receipt_effective where company_id = p_company and id = p_line;
  if not found or p_snapshot is distinct from to_jsonb(receipt) then raise exception 'receipt_changed_retry'; end if;
  if p_eligible and (receipt.product_catalog_id is null or coalesce(receipt.quantity, 0) <= 0
     or coalesce(receipt.unit_cost_ex_vat, 0) <= 0 or nullif(trim(receipt.unit), '') is null
     or receipt.tax_type is null or receipt.tax_type not in ('taxable', 'exempt')) then raise exception 'receipt_not_eligible'; end if;
  select count(*) into event_count from public.purchase_receipt_correction_events where company_id = p_company and receipt_line_id = p_line;
  insert into public.storefront_cost_source_checks(company_id, receipt_line_id, receipt_snapshot, correction_event_count, eligible, actor_name, reason)
    values(p_company, p_line, to_jsonb(receipt), event_count, p_eligible, trim(p_actor), trim(p_reason)) returning id into check_id;
  return check_id;
end $$;

create or replace function public.storefront_cost_directions(p_company uuid, p_products uuid[])
returns table(product_id uuid, sales_unit text, direction text)
language plpgsql stable security invoker set search_path = public, pg_temp as $$
begin
  if p_company is null or p_products is null or cardinality(p_products) > 100 then raise exception 'invalid_direction_scope'; end if;
  if not exists(select 1 from public.store_order_settings where company_id = p_company and show_purchase_cost_direction) then return; end if;
  return query
  with reviewed as (
    select e.product_catalog_id, e.unit, e.receipt_date, e.unit_cost_ex_vat
    from public.purchase_receipt_effective e
    join lateral (select c.* from public.storefront_cost_source_checks c
      where c.company_id = e.company_id and c.receipt_line_id = e.id order by c.id desc limit 1) checked on true
    where e.company_id = p_company and e.product_catalog_id = any(p_products)
      and checked.eligible and checked.receipt_snapshot = to_jsonb(e)
      and checked.correction_event_count = (select count(*) from public.purchase_receipt_correction_events ce where ce.company_id = e.company_id and ce.receipt_line_id = e.id)
      and e.quantity > 0 and e.unit_cost_ex_vat > 0 and nullif(trim(e.unit), '') is not null
      and e.tax_type in ('taxable', 'exempt')
      and e.receipt_date <= (now() at time zone 'Asia/Seoul')::date
  ), daily as (
    -- Same-day conflicting costs have no reliable chronological order: hide that comparison.
    select r.product_catalog_id, r.unit, r.receipt_date,
      case when count(distinct r.unit_cost_ex_vat) = 1 then min(r.unit_cost_ex_vat) end as cost
    from reviewed r group by r.product_catalog_id, r.unit, r.receipt_date
  ), ranked as (
    select d.*, row_number() over(partition by d.product_catalog_id, d.unit order by d.receipt_date desc) as n from daily d
  )
  select a.product_catalog_id, a.unit, case when a.cost > b.cost then 'up'::text else 'down'::text end
  from ranked a join ranked b on a.product_catalog_id = b.product_catalog_id and a.unit = b.unit and b.n = 2
  where a.n = 1 and a.cost is not null and b.cost is not null and a.cost <> b.cost;
end $$;

revoke all on function public.set_storefront_cost_direction_visibility(uuid,boolean) from public, anon, authenticated;
revoke all on function public.check_storefront_cost_source(uuid,uuid,jsonb,boolean,text,text) from public, anon, authenticated;
revoke all on function public.storefront_cost_directions(uuid,uuid[]) from public, anon, authenticated;
grant execute on function public.set_storefront_cost_direction_visibility(uuid,boolean) to service_role;
grant execute on function public.check_storefront_cost_source(uuid,uuid,jsonb,boolean,text,text) to service_role;
grant execute on function public.storefront_cost_directions(uuid,uuid[]) to service_role;
commit;
