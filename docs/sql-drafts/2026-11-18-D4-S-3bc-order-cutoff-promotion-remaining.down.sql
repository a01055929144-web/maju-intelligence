-- D4 S-3b/S-3c rollback draft. Stop if a cutoff value or consumer exists.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regprocedure('public.promotion_remaining_v1(uuid,uuid[])') is null
    or (select count(*) from information_schema.columns
        where table_schema='public' and table_name='product_catalog'
          and column_name in ('order_cutoff_days_before','order_cutoff_time')) <> 2
  then raise exception 'd4_not_fully_applied'; end if;
  if exists (select 1 from public.product_catalog
      where order_cutoff_days_before is not null or order_cutoff_time is not null)
  then raise exception 'd4_cutoff_values_exist'; end if;
  if to_regprocedure('public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)') is not null
    or exists (select 1 from pg_depend dependency
      where dependency.refobjid=to_regprocedure('public.promotion_remaining_v1(uuid,uuid[])')
        and dependency.deptype='n')
  then raise exception 'd4_consumer_exists'; end if;
end $$;

drop function public.promotion_remaining_v1(uuid, uuid[]);
alter table public.product_catalog
  drop constraint if exists product_catalog_order_cutoff_pair_check,
  drop constraint if exists product_catalog_order_cutoff_days_check,
  drop column order_cutoff_time,
  drop column order_cutoff_days_before;
commit;
