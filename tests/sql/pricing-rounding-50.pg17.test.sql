-- Disposable PG17 only. Real P0/P1/template definitions; no production connection.
\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int not between 170000 and 179999 or current_database() not in ('cx133_rounding_test','cx133_rounding_down_test') then raise exception 'Disposable PG17 database required'; end if; end $$;
\ir pricing-p1-fixture.sql
\ir ../../docs/sql-drafts/20261030-pricing-p0.sql
\ir ../../docs/sql-drafts/20261030-pricing-p1.sql
create table public.normalized_customers(id uuid primary key,company_id uuid not null references public.companies(id),customer_name text not null default '합성 매장',unique(company_id,id));
grant select on public.normalized_customers to service_role;
\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.sql
create temp table cx133_function_before as select oid,proowner,proacl,proconfig,provolatile,prosecdef,prosrc from pg_proc where oid='public.pricing_p0_price(numeric,integer,integer,bigint)'::regprocedure;
\ir ../../docs/sql-drafts/2026-11-24-CX-133-rounding-50.sql
do $$ begin
 if not exists(select 1 from cx133_function_before b join pg_proc p on p.oid=b.oid
 where p.proowner=b.proowner and p.proacl is not distinct from b.proacl and p.proconfig is not distinct from b.proconfig
 and p.provolatile=b.provolatile and p.prosecdef=b.prosecdef
 and p.prosrc=replace(b.prosrc,'rounding not in (1,10,100)','rounding not in (1,10,50,100)')) then raise exception 'function metadata or formula changed'; end if;
end $$;
insert into companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','합성 품목',1833),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','타사 합성 품목',1833);
select pricing_p0_command('00000000-0000-4000-8000-000000000001','{"action":"defaults","margin":10,"rounding":10}');
select pricing_p0_command('00000000-0000-4000-8000-000000000002','{"action":"defaults","margin":10,"rounding":10}');
select pricing_p0_command('00000000-0000-4000-8000-000000000001','{"action":"recalculate"}');
select pricing_p0_command('00000000-0000-4000-8000-000000000002','{"action":"recalculate"}');
insert into margin_groups(company_id,name,margin_bp,rounding) values ('00000000-0000-4000-8000-000000000001','합성 그룹',1000,10);
insert into margin_templates(company_id,name,margin_bp,rounding) values ('00000000-0000-4000-8000-000000000001','합성 카탈로그',1000,10);
insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('a',64),'sheet',1,
 '{"kind":"sheet","title":"확정 단가표","companyName":"합성 유통","contact":"","recipient":"","footer":"","validUntil":"2099-12-31","theme":"blue","layout":"table","showPrice":true,"showBrand":true,"showSpec":true,"lines":[{"productId":"10000000-0000-4000-8000-000000000001","displayName":"합성 품목","price":2020,"taxType":"exempt","visible":true,"unit":"봉"}]}');
insert into pricing_document_versions(company_id,document_id,version,revision,content) select company_id,id,1,revision,content from pricing_documents;
insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,tax_type,badge,revision)
 values ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','행사','합성 행사','2000-01-01','2099-12-31',1833,1000,1990,'exempt','행사',1);
create temp table cx133_frozen as select (select jsonb_agg(to_jsonb(v)) from pricing_document_versions v) versions,
 (select jsonb_agg(to_jsonb(p)) from pricing_promotions p) promotions,
 (select jsonb_agg(to_jsonb(i) order by product_id) from pricing_items i) items,
 (select count(*) from price_recalc_runs) runs;
\if :{?CX133_DOWN_ONLY}
\ir ../../docs/sql-drafts/2026-11-24-CX-133-rounding-50.down.sql
do $$ begin
 if pricing_p0_price(1833,1000,10)<>2020 then raise exception 'old calculation changed'; end if;
 begin perform pricing_p0_price(1833,1000,50); raise exception '50 accepted after down';
 exception when raise_exception then if sqlerrm<>'Invalid price inputs' then raise; end if; end;
 begin update pricing_settings set rounding=50; raise exception 'settings 50 accepted after down'; exception when check_violation then null; end;
 begin update margin_groups set rounding=50; raise exception 'group 50 accepted after down'; exception when check_violation then null; end;
 begin update margin_templates set rounding=50; raise exception 'template 50 accepted after down'; exception when check_violation then null; end;
 if (select jsonb_agg(to_jsonb(v)) from pricing_document_versions v) is distinct from (select versions from cx133_frozen) then raise exception 'down changed publication'; end if;
 if not exists(select 1 from cx133_function_before b join pg_proc p on p.oid=b.oid where p.prosrc=b.prosrc and p.proacl is not distinct from b.proacl and p.proowner=b.proowner) then raise exception 'down function metadata changed'; end if;
end $$;
select 'cx133_down_pass';
\else
set role service_role;
do $$ declare c uuid:='00000000-0000-4000-8000-000000000001'; begin
 if pricing_p0_price(1833,1000,1)<>2017 or pricing_p0_price(1833,1000,10)<>2020 or pricing_p0_price(1833,1000,50)<>2050 or pricing_p0_price(1833,1000,100)<>2100
 or pricing_p0_price(2050,0,50)<>2050 or pricing_p0_price(50.01,0,50)<>100 or pricing_p0_price(49.99,0,50)<>50
 or pricing_p0_price(0,1000,50)<>0 or pricing_p0_price(1833,1000,50,1997)<>1997 then raise exception 'rounding mismatch'; end if;
 perform pricing_p0_command(c,'{"action":"defaults","margin":10,"rounding":50}');
 update margin_groups set rounding=50 where company_id=c;
 update margin_templates set rounding=50 where company_id=c;
 if (pricing_p0_state(c)->>'pendingCount')::int<>1 then raise exception 'rounding change did not queue'; end if;
end $$;
reset role;
do $$ begin
 if (select jsonb_agg(to_jsonb(i) order by product_id) from pricing_items i) is distinct from (select items from cx133_frozen)
 or (select count(*) from price_recalc_runs)<>(select runs from cx133_frozen) then raise exception 'saving rounding applied prices'; end if;
end $$;
select pricing_p0_command('00000000-0000-4000-8000-000000000001','{"action":"recalculate"}');
do $$ begin
 if (select price from pricing_items where product_id='10000000-0000-4000-8000-000000000001')<>2050
 or (select applied_rounding from pricing_items where product_id='10000000-0000-4000-8000-000000000001')<>50
 or (select price from pricing_items where product_id='10000000-0000-4000-8000-000000000002')<>2020 then raise exception 'apply or company isolation failed'; end if;
 if (select jsonb_agg(to_jsonb(v)) from pricing_document_versions v) is distinct from (select versions from cx133_frozen)
 or (select jsonb_agg(to_jsonb(p)) from pricing_promotions p) is distinct from (select promotions from cx133_frozen) then raise exception 'publication or promotion changed'; end if;
end $$;
select 'cx133_rounding_50_pass';
\endif
