-- DRAFT ONLY. Do not run without approval for the named operating project.
-- The backup is private inside the same database, not an external disaster backup.
begin;
set transaction isolation level serializable;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create schema product_tax_backup_20261119;
revoke all on schema product_tax_backup_20261119 from public, anon, authenticated, service_role;
create table product_tax_backup_20261119.product_rows (
  product_id uuid primary key,
  company_id uuid not null,
  before_row jsonb not null,
  after_row jsonb,
  receipt_rows integer not null,
  backed_up_at timestamptz not null default clock_timestamp(),
  restored_at timestamptz
);
alter table product_tax_backup_20261119.product_rows enable row level security;
revoke all on product_tax_backup_20261119.product_rows from public, anon, authenticated, service_role;

create temporary table product_tax_candidates on commit drop as
select p.company_id, p.id product_id, to_jsonb(p) before_row, e.receipt_rows
from public.product_catalog p
join (
  select company_id, product_catalog_id, count(*)::integer receipt_rows
  from public.purchase_receipt_lines
  where product_catalog_id is not null
  group by company_id, product_catalog_id
  having bool_and(tax_type = 'taxable' and vat_amount > 0)
) e on e.company_id = p.company_id and e.product_catalog_id = p.id
where p.tax_type = 'exempt';

do $check$
begin
  if (select count(*) from product_tax_candidates) <> 379
     or (select count(*) from product_tax_candidates where (before_row->>'is_active')::boolean) <> 378
     or (select sum(receipt_rows) from product_tax_candidates) <> 722
     or (select count(distinct company_id) from product_tax_candidates) <> 1 then
    raise exception 'product_tax_candidate_scope_changed';
  end if;
end $check$;

insert into product_tax_backup_20261119.product_rows
  (product_id, company_id, before_row, receipt_rows)
select product_id, company_id, before_row, receipt_rows from product_tax_candidates;

do $change$
declare changed integer;
begin
  update public.product_catalog p
  set tax_type = 'taxable', updated_at = clock_timestamp()
  from product_tax_candidates c
  where p.company_id = c.company_id and p.id = c.product_id and p.tax_type = 'exempt';
  get diagnostics changed = row_count;
  if changed <> 379 then raise exception 'product_tax_update_count_changed'; end if;
  if exists (
    select 1 from product_tax_candidates c
    join public.product_catalog p on p.company_id = c.company_id and p.id = c.product_id
    where p.tax_type <> 'taxable'
       or (to_jsonb(p) - 'tax_type' - 'updated_at')
          is distinct from (c.before_row - 'tax_type' - 'updated_at')
  ) then raise exception 'product_tax_unexpected_field_changed'; end if;
  update product_tax_backup_20261119.product_rows b
  set after_row = to_jsonb(p)
  from public.product_catalog p
  where p.company_id = b.company_id and p.id = b.product_id;
end $change$;

select count(*) corrected_products,
  count(*) filter (where (before_row->>'is_active')::boolean) active_products,
  sum(receipt_rows) supporting_receipts
from product_tax_backup_20261119.product_rows;
commit;
