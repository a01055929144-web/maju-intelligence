\set ON_ERROR_STOP on
-- Disposable synthetic database only. No operating identifiers, values or credentials.
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
\ir fixtures/document-footer-format.baseline.sql
\ir ../../docs/sql-drafts/2026-11-19-document-footer-format.sql
\ir fixtures/document-vat-outer.baseline.sql
create temporary table vat_functions_before as select oid,proowner,proacl,prosecdef,md5(pg_get_functiondef(oid)) definition_hash from pg_proc where oid in ('public.pricing_p1(uuid,text,boolean,text,jsonb)'::regprocedure,'public.pricing_p1_clean(uuid,jsonb)'::regprocedure);
insert into companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,tax_type) values
('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','합성 과세 상품',1000,'taxable'),
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','합성 면세 상품',1000,'exempt');
do $$ declare p jsonb; begin
 p:=jsonb_build_object('productId','20000000-0000-4000-8000-000000000001','name','합성 행사','displayName','합성 행사','startsOn','2020-01-01','endsOn','2099-12-31','cost',1000,'margin',10,'stock',null,'perStoreLimit',null,'taxType','taxable','allowSheet',true,'badge','행사');
 perform pricing_p1('00000000-0000-4000-8000-000000000001',repeat('a',64),true,'save-promotion',jsonb_build_object('id','30000000-0000-4000-8000-000000000001','expected',0,'content',p));
 p:=p||'{"name":"합성 임박","displayName":"합성 임박","cost":60,"margin":0,"badge":"임박"}'::jsonb;
 perform pricing_p1('00000000-0000-4000-8000-000000000001',repeat('a',64),true,'save-promotion',jsonb_build_object('id','30000000-0000-4000-8000-000000000002','expected',0,'content',p));
end $$;
create temporary table vat_payload(content jsonb);
insert into vat_payload values(jsonb_build_object('kind','sheet','title','합성 가격 계약','companyName','합성 회사','contact','','recipient','','footer','첫째 줄'||chr(10)||'둘째 줄','validUntil','2099-12-31','theme','blue','layout','table','showPrice',true,'showBrand',true,'showSpec',true,
 'display','{"columns":2,"promoLayout":"table","priceIncludesTax":true,"productWidth":72,"showTaxType":true,"autoPromos":true,"footerFontSize":16,"footerBold":true}'::jsonb,
 'lines',jsonb_build_array(
 jsonb_build_object('productId','20000000-0000-4000-8000-000000000001','displayName','합성 일반','brand','','spec','1kg','unit','개','price',1000,'taxType','taxable','visible',true,'promotionId',null,'priceIncludesTax',true),
 jsonb_build_object('productId','20000000-0000-4000-8000-000000000002','displayName','합성 면세','brand','','spec','1kg','unit','개','price',1000,'taxType','exempt','visible',true,'promotionId',null),
 jsonb_build_object('productId','20000000-0000-4000-8000-000000000001','displayName','위조 입력','brand','','spec','1kg','unit','개','price',999,'taxType','exempt','visible',true,'promotionId','30000000-0000-4000-8000-000000000001','priceIncludesTax',false),
 jsonb_build_object('productId','20000000-0000-4000-8000-000000000001','displayName','위조 임박','brand','','spec','1kg','unit','개','price',11,'taxType','taxable','visible',true,'promotionId','30000000-0000-4000-8000-000000000002','priceIncludesTax',false))));
do $$ declare payload jsonb; begin
 select content into payload from vat_payload;
 perform pricing_p1('00000000-0000-4000-8000-000000000001',repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','expected',0,'content',payload));
 perform pricing_p1('00000000-0000-4000-8000-000000000001',repeat('a',64),true,'publish',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','expected',1));
end $$;
create temporary table vat_legacy_versions as select id,content from pricing_document_versions;
\ir ../../docs/sql-drafts/2026-11-19-document-vat-contract.sql
-- Before any new-mode data exists, down must restore both exact definitions and retain old versions.
\ir ../../docs/sql-drafts/2026-11-19-document-vat-contract.down.sql
do $$ begin
 if exists(select from vat_functions_before old join pg_proc p using(oid) where old.definition_hash<>md5(pg_get_functiondef(p.oid))) then raise exception 'exact rollback failed'; end if;
 if exists(select from vat_legacy_versions old join pricing_document_versions v using(id) where old.content is distinct from v.content) then raise exception 'rollback changed publication'; end if;
end $$;
\ir ../../docs/sql-drafts/2026-11-19-document-vat-contract.sql
do $$ declare c uuid:='00000000-0000-4000-8000-000000000001'; payload jsonb; cleaned jsonb; saved jsonb; retry jsonb; published jsonb; begin
 select content||'{"priceContract":"promotion-gross-v1"}'::jsonb into payload from vat_payload;
 cleaned:=pricing_p1_clean(c,payload);
 if cleaned->>'priceContract'<>'promotion-gross-v1' or cleaned#>>'{lines,0,priceIncludesTax}'<>'false' or cleaned#>>'{lines,2,priceIncludesTax}'<>'true' or cleaned#>>'{lines,2,price}'<>'1100' or cleaned#>>'{lines,3,price}'<>'60' or cleaned#>>'{lines,2,taxType}'<>'taxable' then raise exception 'server price basis or canonical promotion price incorrect'; end if;
 if cleaned#>>'{display,footerFontSize}'<>'16' or cleaned#>>'{display,footerBold}'<>'true' or cleaned#>>'{display,productWidth}'<>'72' or cleaned#>>'{display,priceIncludesTax}'<>'true' then raise exception 'existing display settings lost'; end if;
 if pricing_p1_clean(c,payload-'priceContract')->'lines'->2 ? 'priceIncludesTax' then raise exception 'legacy line was reinterpreted'; end if;
 saved:=pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000002','expected',0,'content',payload));
 if saved#>>'{content,priceContract}'<>'promotion-gross-v1' then raise exception 'new mode not stored'; end if;
 -- An older client drops unknown fields. The server retains the stored document basis.
 select jsonb_set((saved->'content')-'priceContract','{lines}',jsonb_agg(value-'priceIncludesTax')) into payload from jsonb_array_elements(saved#>'{content,lines}');
 saved:=pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000002','expected',1,'content',payload));
 if saved->>'revision'<>'2' or saved#>>'{content,priceContract}'<>'promotion-gross-v1' or saved#>>'{content,lines,3,priceIncludesTax}'<>'true' then raise exception 'older client downgraded price meaning'; end if;
 retry:=pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000002','expected',1,'content',payload));
 if retry is distinct from saved then raise exception 'same save retry changed document'; end if;
 published:=pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id','10000000-0000-4000-8000-000000000002','expected',2));
 if published#>>'{content,lines,2,price}'<>'1100' or published#>>'{content,lines,3,price}'<>'60' or published#>>'{content,lines,3,priceIncludesTax}'<>'true' then raise exception 'publication price contract lost'; end if;
 begin
  perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000002','expected',0,'content',payload));
  raise exception 'stale write accepted';
 exception when raise_exception then if SQLERRM<>'Stale document' then raise; end if; end;
 select content||'{"priceContract":"promotion-gross-v1"}'::jsonb into payload from vat_payload;
 begin
  perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000001','expected',1,'content',payload));
  raise exception 'legacy upgraded in place';
 exception when raise_exception then if SQLERRM<>'Document price contract cannot change' then raise; end if; end;
 begin
  perform pricing_p1('00000000-0000-4000-8000-000000000002',repeat('a',64),true,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000003','expected',0,'content',payload));
  raise exception 'foreign product accepted';
 exception when raise_exception then if SQLERRM<>'Product not found in company' then raise; end if; end;
 begin
  perform pricing_p1(c,repeat('b',64),false,'save',jsonb_build_object('id','10000000-0000-4000-8000-000000000003','expected',0,'content',payload));
  raise exception 'sales sheet write accepted';
 exception when raise_exception then if SQLERRM<>'Manager required' then raise; end if; end;
 if exists(select from vat_legacy_versions old join pricing_document_versions v using(id) where old.content is distinct from v.content) then raise exception 'old publication changed'; end if;
 if exists(select from vat_functions_before old join pg_proc p using(oid) where p.proowner<>old.proowner or p.proacl is distinct from old.proacl or p.prosecdef<>old.prosecdef) then raise exception 'owner ACL or security changed'; end if;
 if has_function_privilege('anon','public.pricing_p1(uuid,text,boolean,text,jsonb)','execute') or has_function_privilege('authenticated','public.pricing_p1_clean(uuid,jsonb)','execute') then raise exception 'browser execute grant'; end if;
end $$;
create temporary table vat_before_refused_down as select 'draft' kind,id,to_jsonb(d) value from pricing_documents d union all select 'version',id,to_jsonb(v) from pricing_document_versions v;
-- Execute the real rollback in a separate connection: failure must leave committed data intact.
\setenv DOCUMENT_VAT_TEST_DATABASE :DBNAME
\! if psql -X --dbname="$DOCUMENT_VAT_TEST_DATABASE" --set=ON_ERROR_STOP=1 --file=docs/sql-drafts/2026-11-19-document-vat-contract.down.sql >/tmp/document-vat-refused-down.log 2>&1; then exit 1; fi; grep -q document_vat_down_refused_contract_in_use /tmp/document-vat-refused-down.log
select 1 / (not :'SHELL_ERROR'::boolean)::integer as expected_vat_down_refusal;
do $$ begin
 if md5(pg_get_functiondef('public.pricing_p1(uuid,text,boolean,text,jsonb)'::regprocedure))<>'a4bf4bc10888477d6333c85410193cca' or md5(pg_get_functiondef('public.pricing_p1_clean(uuid,jsonb)'::regprocedure))<>'ec5268774da473705242e05514eea7c5' then raise exception 'refused rollback changed functions'; end if;
 if exists(select from vat_before_refused_down old left join (select 'draft' kind,id,to_jsonb(d) value from pricing_documents d union all select 'version',id,to_jsonb(v) from pricing_document_versions v) now using(kind,id) where old.value is distinct from now.value) then raise exception 'refused rollback changed data'; end if;
end $$;
\echo 'PASS: new document gross promotion basis, canonical prices, legacy snapshots, old-client retention, retry, scope, ACL, exact pre-use down and in-use refusal'
