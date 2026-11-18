\set ON_ERROR_STOP on
-- NEW disposable PG17 only, synthetic values; no operating connection.
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
\ir fixtures/document-display-storage.baseline.sql
create temporary table display_function_before as select oid,proowner,proacl,md5(pg_get_functiondef(oid)) as definition_hash from pg_proc where oid='public.pricing_p1_clean(uuid,jsonb)'::regprocedure;
select 'BASELINE_HASH',definition_hash from display_function_before;
insert into companies values('00000000-0000-4000-8000-000000000001');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,tax_type) values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','합성 과세 상품',1000,'taxable');
create temporary table display_test_content(content jsonb);
insert into display_test_content values(jsonb_build_object('kind','sheet','title','합성 표시 설정','companyName','합성 회사','contact','','recipient','','footer','첫째 줄'||chr(10)||'둘째 줄',
 'validUntil','2099-12-31','theme','blue','layout','table','showPrice',true,'showBrand',true,'showSpec',true,
 'lines',jsonb_build_array(jsonb_build_object('productId','20000000-0000-4000-8000-000000000001','displayName','합성 상품','brand','','spec','','unit','개','price',1000,'taxType','taxable','visible',true,'promotionId',null)),
 'display',jsonb_build_object('columns',3,'promoLayout','table','info','[]'::jsonb,'priceIncludesTax',true,'productWidth',72,'showTaxType',true,'autoPromos',true,'privateStaffValue','PRIVATE_SYNTHETIC')));
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; d uuid:='10000000-0000-4000-8000-000000000001'; payload jsonb;
begin
 select content into payload from display_test_content;
 if public.pricing_p1_clean(c,payload)->'display' ? 'priceIncludesTax' then raise exception 'baseline did not reproduce display loss'; end if;
 perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',0,'content',payload));
 perform pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id',d,'expected',1));
end $$;
create temporary table display_published_before as select id,content from pricing_document_versions;
\ir ../../docs/sql-drafts/2026-11-18-document-display-storage.sql
select 'UPDATED_HASH',md5(pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure));
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; d uuid:='10000000-0000-4000-8000-000000000001'; payload jsonb; cleaned jsonb;
begin
 select content into payload from display_test_content;
 cleaned:=public.pricing_p1_clean(c,payload);
 if cleaned->'display' is distinct from '{"columns":3,"promoLayout":"table","info":[],"productWidth":72,"priceIncludesTax":true,"showTaxType":true,"autoPromos":true}'::jsonb then raise exception 'display whitelist not retained'; end if;
 if cleaned->'lines'->0->>'price'<>'1000' or cleaned->>'footer'<>E'첫째 줄\n둘째 줄' then raise exception 'price or linebreak changed'; end if;
 if cleaned::text like '%PRIVATE_SYNTHETIC%' then raise exception 'unknown field leaked'; end if;
 cleaned:=public.pricing_p1_clean(c,payload-'display');
 if cleaned#>>'{display,priceIncludesTax}'<>'false' or cleaned#>>'{display,showTaxType}'<>'false' or cleaned#>>'{display,autoPromos}'<>'false' or cleaned#>>'{display,productWidth}'<>'65' then raise exception 'legacy defaults changed'; end if;
 cleaned:=public.pricing_p1_clean(c,jsonb_set(payload,'{display}','{"priceIncludesTax":"true","productWidth":999,"showTaxType":"true","autoPromos":1}'));
 if cleaned#>>'{display,priceIncludesTax}'<>'false' or cleaned#>>'{display,productWidth}'<>'80' or cleaned#>>'{display,showTaxType}'<>'false' or cleaned#>>'{display,autoPromos}'<>'false' then raise exception 'invalid settings not normalized'; end if;
 perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',1,'content',payload));
 perform pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id',d,'expected',2));
 if not exists(select from pricing_document_versions where revision=2 and content#>>'{display,priceIncludesTax}'='true' and content#>>'{lines,0,price}'='1000') then raise exception 'save/publish contract lost'; end if;
 if exists(select from display_published_before b join pricing_document_versions v using(id) where b.content is distinct from v.content) then raise exception 'old publication mutated'; end if;
 if not exists(select from pg_proc p join display_function_before b on p.oid=b.oid where p.proowner=b.proowner and p.proacl is not distinct from b.proacl) then raise exception 'OID owner ACL changed'; end if;
 if has_function_privilege('anon','public.pricing_p1_clean(uuid,jsonb)','execute') or has_function_privilege('authenticated','public.pricing_p1_clean(uuid,jsonb)','execute') or not has_function_privilege('service_role','public.pricing_p1_clean(uuid,jsonb)','execute') then raise exception 'browser/server execute boundary changed'; end if;
end $$;
create temporary table display_all_versions_before_down as select id,content from pricing_document_versions;
\ir ../../docs/sql-drafts/2026-11-18-document-display-storage.down.sql
do $$ begin
 if md5(pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure)) is distinct from (select definition_hash from display_function_before) then raise exception 'down did not restore exact function'; end if;
 if not exists(select from pg_proc p join display_function_before b on p.oid=b.oid where p.proowner=b.proowner and p.proacl is not distinct from b.proacl) then raise exception 'down changed OID owner ACL'; end if;
 if exists(select from display_all_versions_before_down b join pricing_document_versions v using(id) where b.content is distinct from v.content) then raise exception 'down rewrote publication'; end if;
end $$;
\echo 'PASS: display loss reproduction, whitelist, defaults, save/publish, immutable versions, OID/owner/ACL and down'
