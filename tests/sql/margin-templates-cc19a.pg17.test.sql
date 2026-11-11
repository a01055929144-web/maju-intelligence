\set ON_ERROR_STOP on
-- CC-19a margin templates + CC-17 folder move. Runs after pricing-p0-fixture.sql and 20261030-pricing-p0.sql in a disposable DB.
do $$ begin
  if current_database() <> 'margin_templates_cc19a_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_margin_templates_pg17_required'; end if;
end $$;
-- Minimal stand-in for production normalized_customers (only the keys this draft needs).
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

do $$
declare c uuid := '00000000-0000-4000-8000-000000000001'; o uuid := '00000000-0000-4000-8000-000000000002';
 g uuid; t uuid; r jsonb; n integer;
begin
 -- anon/authenticated cannot run the move; service_role can.
 if has_function_privilege('anon','public.move_product_category(uuid,text,text,uuid)','execute')
   or has_function_privilege('authenticated','public.move_product_category(uuid,text,text,uuid)','execute') then raise exception 'move executable by app roles'; end if;
 if not has_function_privilege('service_role','public.move_product_category(uuid,text,text,uuid)','execute') then raise exception 'service_role cannot move'; end if;

 insert into margin_groups(company_id,name,margin_bp) values (c,'채소 마진',2000) returning id into g;
 insert into margin_group_categories(company_id,category,group_id) values (c,'농산 > 채소류',g),(c,'농산 > 채소류 > 조미채소',g);
 insert into margin_templates(company_id,name,margin_bp) values (c,'도매',1000) returning id into t;
 insert into margin_template_categories(company_id,template_id,category,margin_bp) values (c,t,'농산 > 채소류',800);
 insert into margin_template_items(company_id,template_id,product_id,margin_bp) values (c,t,'10000000-0000-4000-8000-000000000001',500);

 -- template tables are company-bound: a product from another company is rejected.
 begin
   insert into margin_template_items(company_id,template_id,product_id,margin_bp) values (c,t,'10000000-0000-4000-8000-000000000005',500);
   raise exception 'cross-company template item accepted';
 exception when foreign_key_violation then null; end;
 begin
   insert into normalized_customers(company_id,customer_name) values (o,'타사 거래처');
   update normalized_customers set margin_template_id = t where company_id = o;
   raise exception 'cross-company customer template accepted';
 exception when foreign_key_violation then null; end;

 -- folder rename: products, group links and template links move together, including the "A>B" spelling and children; "농산물" is untouched.
 r := move_product_category(c,'농산 > 채소류','식품 > 채소');
 if (r->>'productCount')::int <> 2 then raise exception 'expected 2 products, got %', r; end if;
 if (select count(*) from product_catalog where company_id=c and category like '식품 > 채소%') <> 2 then raise exception 'products not moved'; end if;
 if (select category from product_catalog where id='10000000-0000-4000-8000-000000000003') <> '농산물' then raise exception 'prefix sibling moved'; end if;
 if (select count(*) from margin_group_categories where company_id=c and category in ('식품 > 채소','식품 > 채소 > 조미채소')) <> 2 then raise exception 'group links not moved'; end if;
 if not exists(select 1 from margin_template_categories where template_id=t and category='식품 > 채소') then raise exception 'template link not moved'; end if;
 -- other company untouched
 if (select category from product_catalog where id='10000000-0000-4000-8000-000000000005') <> '농산 > 채소류' then raise exception 'other company changed'; end if;
 if (select product_count from product_category_moves where company_id=c) <> 2 then raise exception 'history missing'; end if;

 -- merge onto an existing folder: target margin link wins, no primary-key collision.
 insert into margin_group_categories(company_id,category,group_id) values (c,'수산',g);
 insert into margin_group_categories(company_id,category,group_id) values (c,'수산 > 생선',g);
 update product_catalog set category='수산 > 활어' where id='10000000-0000-4000-8000-000000000004';
 insert into margin_group_categories(company_id,category,group_id) values (c,'수산 > 활어',g);
 perform move_product_category(c,'수산 > 생선','수산 > 활어');
 if exists(select 1 from margin_group_categories where company_id=c and category='수산 > 생선') then raise exception 'merge left source link'; end if;

 -- LIKE wildcards in folder names match literally: moving 'x_y' must not touch 'xzy' or 'x%y' folders.
 insert into product_catalog(id,company_id,category,purchase_product_name,purchase_price) values
  ('10000000-0000-4000-8000-000000000011',c,'x_y > 하위','W1',1000),('10000000-0000-4000-8000-000000000012',c,'xzy > 하위','W2',1000),('10000000-0000-4000-8000-000000000013',c,'x%y > 하위','W3',1000);
 r := move_product_category(c,'x_y','moved');
 if (r->>'productCount')::int <> 1 then raise exception 'wildcard folder moved wrong rows: %', r; end if;
 if (select count(*) from product_catalog where company_id=c and category in ('xzy > 하위','x%y > 하위')) <> 2 then raise exception 'wildcard sibling moved'; end if;

 begin perform move_product_category(c,'식품','식품 > 채소 > 안으로'); raise exception 'move into itself accepted';
 exception when others then if sqlerrm <> 'cc17_cannot_move_into_itself' then raise; end if; end;
 begin perform move_product_category(c,'식품',''); raise exception 'empty path accepted';
 exception when others then if sqlerrm <> 'cc17_invalid_path' then raise; end if; end;
end $$;

-- down refuses while templates exist, then succeeds after cleanup and the up can be applied again.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.down.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin
 if to_regclass('public.margin_templates') is null then raise exception 'down must be refused while templates/history exist'; end if;
end $$;
delete from normalized_customers;
delete from margin_templates;
delete from product_category_moves;
\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.down.sql
do $$ begin
 if to_regclass('public.margin_templates') is not null or to_regprocedure('public.move_product_category(uuid,text,text,uuid)') is not null then raise exception 'down incomplete'; end if;
end $$;
\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.sql
select 'CC-19a PG17 OK';
