\set ON_ERROR_STOP on
-- CC-24 product delete/hide function. Runs after pricing-p0-fixture.sql and 20261030-pricing-p0.sql in a disposable DB.
do $$ begin
  if current_database() <> 'delete_products_cc24_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_delete_products_pg17_required'; end if;
end $$;
-- The fixture has no updated_at; production does.
alter table public.product_catalog add column updated_at timestamptz not null default now();
-- Stand-ins for two production history tables (the function skips the others because they do not exist here).
create table public.customer_price_agreements(id serial primary key, company_id uuid not null, product_catalog_id uuid not null,
  foreign key(company_id, product_catalog_id) references public.product_catalog(company_id, id) on delete restrict);
create table public.store_order_lines(id serial primary key, company_id uuid not null, product_id uuid not null,
  foreign key(company_id, product_id) references public.product_catalog(company_id, id));

insert into companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into product_catalog(id,company_id,category,purchase_product_name,purchase_price) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','농산','free',1),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','농산','in agreement',1),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','농산','in order',1),
 ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','농산','free 2',1),
 ('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000002','농산','other company',1);
insert into customer_price_agreements(company_id, product_catalog_id) values ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
insert into store_order_lines(company_id, product_id) values ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003');
-- A derived row that must disappear with its product (cascade), not block the delete.
insert into pricing_items(company_id, product_id) select company_id, id from product_catalog where company_id = '00000000-0000-4000-8000-000000000001' on conflict do nothing;

\ir ../../docs/sql-drafts/20261111-CC-24-delete-products.sql

do $$
declare c uuid := '00000000-0000-4000-8000-000000000001'; o uuid := '00000000-0000-4000-8000-000000000002';
 all_ids uuid[] := array['10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000005']::uuid[];
 r jsonb; v text;
begin
 if has_function_privilege('anon','public.cc24_delete_products(uuid,uuid[],boolean)','execute')
   or has_function_privilege('authenticated','public.cc24_delete_products(uuid,uuid[],boolean)','execute') then raise exception 'executable by app roles'; end if;
 if not has_function_privilege('service_role','public.cc24_delete_products(uuid,uuid[],boolean)','execute') then raise exception 'service_role cannot run'; end if;

 -- count only: 2 free, 2 used; the other company's id is ignored; nothing changes.
 r := cc24_delete_products(c, all_ids);
 if (r->>'found')::int <> 4 or (r->>'deletable')::int <> 2 or (r->>'hideOnly')::int <> 2 or (r->>'applied')::boolean then raise exception 'dry run counts wrong: %', r; end if;
 if (select count(*) from product_catalog) <> 5 or (select count(*) from product_catalog where not is_active) <> 0 then raise exception 'dry run changed data'; end if;

 -- apply: free ones are deleted (cascade rows too), used ones are hidden, history stays, the other company is untouched.
 r := cc24_delete_products(c, all_ids, true);
 if (r->>'deletable')::int <> 2 or (r->>'hideOnly')::int <> 2 or not (r->>'applied')::boolean then raise exception 'apply counts wrong: %', r; end if;
 if exists(select 1 from product_catalog where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004')) then raise exception 'free products not deleted'; end if;
 if (select count(*) from product_catalog where company_id = c and not is_active) <> 2 then raise exception 'used products not hidden'; end if;
 if (select count(*) from customer_price_agreements) <> 1 or (select count(*) from store_order_lines) <> 1 then raise exception 'history lost'; end if;
 if exists(select 1 from pricing_items where product_id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000004')) then raise exception 'cascade rows remain'; end if;
 if not (select is_active from product_catalog where id = '10000000-0000-4000-8000-000000000005') then raise exception 'other company touched'; end if;

 -- repeat is harmless: hidden stays hidden, nothing left to delete.
 r := cc24_delete_products(c, all_ids, true);
 if (r->>'found')::int <> 2 or (r->>'deletable')::int <> 0 or (r->>'hideOnly')::int <> 2 then raise exception 'repeat wrong: %', r; end if;

 -- wrong company id sees nothing.
 r := cc24_delete_products(o, array['10000000-0000-4000-8000-000000000002']::uuid[], true);
 if (r->>'found')::int <> 0 or (select count(*) from product_catalog where company_id = c) <> 2 then raise exception 'cross-company effect'; end if;

 -- invalid inputs.
 begin perform cc24_delete_products(c, '{}'::uuid[]); raise exception 'empty accepted'; exception when others then get stacked diagnostics v = message_text; if v <> 'cc24_invalid_ids' then raise; end if; end;
 begin perform cc24_delete_products(c, null); raise exception 'null accepted'; exception when others then get stacked diagnostics v = message_text; if v <> 'cc24_invalid_ids' then raise; end if; end;
 begin perform cc24_delete_products(c, (select array_agg(gen_random_uuid()) from generate_series(1, 501))); raise exception '501 accepted'; exception when others then get stacked diagnostics v = message_text; if v <> 'cc24_invalid_ids' then raise; end if; end;
end $$;

-- down removes the function; up works again.
\ir ../../docs/sql-drafts/20261111-CC-24-delete-products.down.sql
do $$ begin if to_regprocedure('public.cc24_delete_products(uuid,uuid[],boolean)') is not null then raise exception 'down did not drop'; end if; end $$;
\ir ../../docs/sql-drafts/20261111-CC-24-delete-products.sql
select 'CC-24 ok';
