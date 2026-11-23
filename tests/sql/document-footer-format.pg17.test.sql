\set ON_ERROR_STOP on
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
\ir fixtures/document-footer-format.baseline.sql
create temporary table footer_function_before as select oid,proowner,proacl,md5(pg_get_functiondef(oid)) as definition_hash from pg_proc where oid='public.pricing_p1_clean(uuid,jsonb)'::regprocedure;
insert into companies values('00000000-0000-4000-8000-000000000001');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,tax_type) values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','합성 비고 상품',1000,'exempt');
create temporary table footer_test_content(content jsonb);
insert into footer_test_content values(jsonb_build_object('kind','sheet','title','합성 비고 서식','companyName','합성 회사','contact','','recipient','','footer','첫째 줄'||chr(10)||'둘째 줄',
 'validUntil','2099-12-31','theme','blue','layout','table','showPrice',true,'showBrand',true,'showSpec',true,
 'lines',jsonb_build_array(jsonb_build_object('productId','20000000-0000-4000-8000-000000000001','displayName','합성 상품','brand','','spec','','unit','개','price',1000,'taxType','exempt','visible',true,'promotionId',null)),
 'display',jsonb_build_object('columns',2,'promoLayout','table','info','[]'::jsonb,'priceIncludesTax',true,'productWidth',72,'showTaxType',true,'autoPromos',true,'footerFontSize',16,'footerBold',true,'privateStyle','PRIVATE_SYNTHETIC')));
do $$ declare payload jsonb; begin
 select content into payload from footer_test_content;
 if public.pricing_p1_clean('00000000-0000-4000-8000-000000000001',payload)->'display' ? 'footerFontSize' then raise exception 'baseline did not reproduce footer format loss'; end if;
 perform pricing_p1('00000000-0000-4000-8000-000000000001',repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','expected',0,'content',payload));
 perform pricing_p1('00000000-0000-4000-8000-000000000001',repeat('a',64),true,'publish',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','expected',1));
end $$;
create temporary table footer_old_versions as select id,content from pricing_document_versions;
\ir ../../docs/sql-drafts/2026-11-19-document-footer-format.sql
select 'FOOTER_HASH',md5(pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure));
do $$ declare c uuid:='00000000-0000-4000-8000-000000000001'; payload jsonb; cleaned jsonb; size integer; begin
 select content into payload from footer_test_content;
 for size in select unnest(array[12,14,16]) loop
  cleaned:=public.pricing_p1_clean(c,jsonb_set(payload,'{display,footerFontSize}',to_jsonb(size)));
  if cleaned#>>'{display,footerFontSize}'<>size::text or cleaned#>>'{display,footerBold}'<>'true' then raise exception 'supported footer setting lost'; end if;
 end loop;
 cleaned:=public.pricing_p1_clean(c,payload);
 if cleaned#>>'{display,priceIncludesTax}'<>'true' or cleaned#>>'{display,productWidth}'<>'72' or cleaned#>>'{display,showTaxType}'<>'true' or cleaned#>>'{display,autoPromos}'<>'true' then raise exception '#1150 settings changed'; end if;
 if cleaned->>'footer'<>E'첫째 줄\n둘째 줄' or cleaned#>>'{lines,0,price}'<>'1000' or cleaned::text like '%PRIVATE_SYNTHETIC%' then raise exception 'text/price/whitelist changed'; end if;
 cleaned:=public.pricing_p1_clean(c,jsonb_set(payload,'{display}','{"footerFontSize":"16","footerBold":"true"}'));
 if cleaned->'display' ? 'footerFontSize' or cleaned->'display' ? 'footerBold' then raise exception 'invalid style accepted'; end if;
 cleaned:=public.pricing_p1_clean(c,payload-'display');
 if cleaned->'display' ? 'footerFontSize' or cleaned->'display' ? 'footerBold' then raise exception 'legacy style default changed'; end if;
 perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','expected',1,'content',payload));
 perform pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','expected',2));
 if not exists(select from pricing_document_versions where revision=2 and content#>>'{display,footerFontSize}'='16' and content#>>'{display,footerBold}'='true') then raise exception 'published style lost'; end if;
 if exists(select from footer_old_versions old join pricing_document_versions v using(id) where old.content is distinct from v.content) then raise exception 'old publication changed'; end if;
 if not exists(select from pg_proc p join footer_function_before old on p.oid=old.oid where p.proowner=old.proowner and p.proacl is not distinct from old.proacl) then raise exception 'OID owner ACL changed'; end if;
 if has_function_privilege('anon','public.pricing_p1_clean(uuid,jsonb)','execute') or has_function_privilege('authenticated','public.pricing_p1_clean(uuid,jsonb)','execute') or not has_function_privilege('service_role','public.pricing_p1_clean(uuid,jsonb)','execute') then raise exception 'execute scope changed'; end if;
end $$;
create temporary table footer_versions_before_down as select id,content from pricing_document_versions;
\ir ../../docs/sql-drafts/2026-11-19-document-footer-format.down.sql
do $$ begin
 if md5(pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure)) is distinct from (select definition_hash from footer_function_before) then raise exception 'down did not restore #1150'; end if;
 if exists(select from footer_versions_before_down old join pricing_document_versions v using(id) where old.content is distinct from v.content) then raise exception 'down rewrote snapshots'; end if;
end $$;
\echo 'PASS: footer size/bold/linebreak save/publish, legacy/four-setting preservation, OID owner ACL and exact down'
