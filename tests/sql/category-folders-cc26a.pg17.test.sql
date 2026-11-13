\set ON_ERROR_STOP on
-- CC-26a folder order table. Runs after pricing-p0-fixture.sql and 20261030-pricing-p0.sql in a disposable DB.
do $$ begin
  if current_database() <> 'category_folders_cc26a_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_category_folders_pg17_required'; end if;
end $$;
-- Minimal stand-in for production normalized_customers (only the keys CC-19a needs).
create table public.normalized_customers(id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), customer_name text not null, unique(company_id,id));
grant select on public.normalized_customers to service_role;

insert into companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into product_catalog(id,company_id,category,purchase_product_name,purchase_price) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','농산 > 채소류','A',1000),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','농산>채소류 > 조미채소','B',1000),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','농산물','C',1000),
 ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','수산 > 생선','D',1000),
 ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','농산 > 채소류','OTHER',1000);

\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.sql
\ir ../../docs/sql-drafts/20261111-CC-26a-category-folders.sql

do $$
declare c uuid := '00000000-0000-4000-8000-000000000001'; o uuid := '00000000-0000-4000-8000-000000000002';
 r jsonb; v text;
begin
 -- backfill: every ancestor of every product category, per company, ordered by name among siblings.
 if (select count(*) from product_category_folders where company_id = c) <> 6 then raise exception 'backfill count for company 1 wrong'; end if;
 if (select count(*) from product_category_folders where company_id = o) <> 2 then raise exception 'backfill count for company 2 wrong'; end if;
 if (select string_agg(path, '|' order by sort_order) from product_category_folders where company_id = c and cc26a_parent(path) = '') <> '농산|농산물|수산' then raise exception 'top-level backfill order wrong'; end if;
 if (select sort_order from product_category_folders where company_id = c and path = '농산 > 채소류 > 조미채소') <> 0 then raise exception 'nested backfill order wrong'; end if;

 -- permissions: anon/authenticated cannot run either function; service_role can.
 if has_function_privilege('anon','public.reorder_product_category_folder(uuid,text,text)','execute')
   or has_function_privilege('authenticated','public.reorder_product_category_folder(uuid,text,text)','execute')
   or has_function_privilege('authenticated','public.move_product_category(uuid,text,text,uuid)','execute') then raise exception 'functions executable by app roles'; end if;
 if not has_function_privilege('service_role','public.reorder_product_category_folder(uuid,text,text)','execute') then raise exception 'service_role cannot reorder'; end if;
 if has_table_privilege('authenticated','public.product_category_folders','select') then raise exception 'folder table readable by authenticated'; end if;

 -- reorder: 수산 before 농산, then to the end.
 perform reorder_product_category_folder(c, '수산', '농산');
 if (select string_agg(path, '|' order by sort_order) from product_category_folders where company_id = c and cc26a_parent(path) = '') <> '수산|농산|농산물' then raise exception 'reorder before failed'; end if;
 perform reorder_product_category_folder(c, '수산', null);
 if (select string_agg(path, '|' order by sort_order) from product_category_folders where company_id = c and cc26a_parent(path) = '') <> '농산|농산물|수산' then raise exception 'reorder to end failed'; end if;
 if (select string_agg(path, '|' order by sort_order) from product_category_folders where company_id = o and cc26a_parent(path) = '') <> '농산' then raise exception 'other company changed'; end if;

 -- only siblings can be used as the position
 begin perform reorder_product_category_folder(c, '농산 > 채소류', '농산물'); raise exception 'non-sibling accepted';
 exception when others then if sqlerrm <> 'cc26a_not_siblings' then raise; end if; end;
 begin perform reorder_product_category_folder(c, '', null); raise exception 'empty path accepted';
 exception when others then if sqlerrm <> 'cc26a_invalid_path' then raise; end if; end;

 -- a folder created later by an upload (no order row yet) is picked up by the next reorder
 insert into product_catalog(id,company_id,category,purchase_product_name,purchase_price) values ('10000000-0000-4000-8000-000000000006',c,'축산 > 돈육','E',1000);
 perform reorder_product_category_folder(c, '축산', '농산');
 if (select string_agg(path, '|' order by sort_order) from product_category_folders where company_id = c and cc26a_parent(path) = '') <> '축산|농산|농산물|수산' then raise exception 'new folder not ordered'; end if;

 -- rename moves the order rows with it (and the margin links, via the CC-19a logic)
 r := move_product_category(c, '농산 > 채소류', '식품 > 채소');
 if exists(select 1 from product_category_folders where company_id = c and path in ('농산 > 채소류','농산 > 채소류 > 조미채소')) then raise exception 'old folder rows left behind'; end if;
 if not exists(select 1 from product_category_folders where company_id = c and path = '식품 > 채소 > 조미채소') then raise exception 'nested folder row not moved'; end if;
 if not exists(select 1 from product_category_folders where company_id = c and path = '식품 > 채소') then raise exception 'moved folder row missing'; end if;
 if not exists(select 1 from product_category_folders where company_id = o and path = '농산 > 채소류') then raise exception 'other company folder moved'; end if;

 -- merge onto an existing folder keeps the target's order and leaves no duplicate
 update product_category_folders set sort_order = 7 where company_id = c and path = '수산';
 insert into product_category_folders(company_id, path, sort_order) values (c, '수산 > 활어', 5);
 update product_category_folders set sort_order = 1 where company_id = c and path = '수산 > 생선';
 update product_catalog set category = '수산 > 활어' where id = '10000000-0000-4000-8000-000000000004';
 perform move_product_category(c, '수산 > 생선', '수산 > 활어');
 if exists(select 1 from product_category_folders where company_id = c and path = '수산 > 생선') then raise exception 'merge left the source folder row'; end if;
 if (select sort_order from product_category_folders where company_id = c and path = '수산 > 활어') <> 5 then raise exception 'merge did not keep target order'; end if;
 if (select count(*) from product_category_folders where company_id = c and path = '수산 > 활어') <> 1 then raise exception 'merge duplicated folder rows'; end if;

 begin perform move_product_category(c, '식품', '식품 > 채소 > 안으로'); raise exception 'move into itself accepted';
 exception when others then if sqlerrm <> 'cc17_cannot_move_into_itself' then raise; end if; end;
end $$;

-- a second apply is refused; down is refused after an order edit, then works on clean data; up can be applied again.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261111-CC-26a-category-folders.sql
rollback;
\set ON_ERROR_STOP on
update public.product_category_folders set updated_at = created_at + interval '1 minute' where path = '수산';
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261111-CC-26a-category-folders.down.sql
rollback;
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from public.product_category_folders) then raise exception 'down must have been refused (table gone)'; end if;
end $$;
update public.product_category_folders set updated_at = created_at;
\ir ../../docs/sql-drafts/20261111-CC-26a-category-folders.down.sql
do $$ begin
  if to_regclass('public.product_category_folders') is not null then raise exception 'down incomplete'; end if;
  if to_regprocedure('public.reorder_product_category_folder(uuid,text,text)') is not null then raise exception 'reorder function left behind'; end if;
  -- the CC-19a move still works without the order table
  perform public.move_product_category('00000000-0000-4000-8000-000000000001', '수산 > 활어', '수산 > 생선');
end $$;
\ir ../../docs/sql-drafts/20261111-CC-26a-category-folders.sql
select 'CC-26a PG17 OK';
