-- WO-03 rollback draft. Only safe before categories or product assignments exist.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.product_categories') is null
    or not exists (select 1 from information_schema.columns
      where table_schema='public' and table_name='product_catalog' and column_name='category_id')
  then raise exception 'wo03_not_fully_applied'; end if;
  if exists (select 1 from public.product_categories)
    or exists (select 1 from public.product_catalog where category_id is not null)
  then raise exception 'wo03_category_data_exists'; end if;
  if to_regprocedure('public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)') is not null
  then raise exception 'wo03_catalog_consumer_exists'; end if;
end $$;

alter table public.product_catalog
  drop constraint if exists product_catalog_category_fk,
  drop constraint if exists product_catalog_product_code_not_blank_check;
drop index if exists public.product_catalog_category_idx;
alter table public.product_catalog drop column category_id;
drop table public.product_categories;
drop function public.product_categories_validate_tree();
commit;
