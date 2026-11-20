-- DRAFT ONLY. Run only if every corrected product still matches its saved after-row.
begin;
set transaction isolation level serializable;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $restore$
declare changed integer;
begin
  if (select count(*) from product_tax_backup_20261119.product_rows) <> 379
     or exists (select 1 from product_tax_backup_20261119.product_rows
       where after_row is null or restored_at is not null)
     or exists (
       select 1 from product_tax_backup_20261119.product_rows b
       left join public.product_catalog p on p.company_id = b.company_id and p.id = b.product_id
       where p.id is null or to_jsonb(p) is distinct from b.after_row
     ) then raise exception 'product_tax_restore_guard_failed'; end if;

  update public.product_catalog p
  set tax_type = b.before_row->>'tax_type',
      updated_at = (b.before_row->>'updated_at')::timestamptz
  from product_tax_backup_20261119.product_rows b
  where p.company_id = b.company_id and p.id = b.product_id;
  get diagnostics changed = row_count;
  if changed <> 379 or exists (
    select 1 from product_tax_backup_20261119.product_rows b
    join public.product_catalog p on p.company_id = b.company_id and p.id = b.product_id
    where to_jsonb(p) is distinct from b.before_row
  ) then raise exception 'product_tax_restore_result_changed'; end if;

  update product_tax_backup_20261119.product_rows set restored_at = clock_timestamp();
end $restore$;
commit;
