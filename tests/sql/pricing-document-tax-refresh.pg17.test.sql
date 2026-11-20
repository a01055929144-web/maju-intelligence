\set ON_ERROR_STOP on
-- Existing P1 RPC only, new disposable PG17 database and synthetic rows.
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
begin;
insert into companies values('00000000-0000-4000-8000-000000000001');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,tax_type) values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','합성 계란',1000,'exempt');
set local role service_role;
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; p uuid:='20000000-0000-4000-8000-000000000001';
 d uuid:='10000000-0000-4000-8000-000000000001'; promo uuid:='30000000-0000-4000-8000-000000000001';
 content jsonb; promotion_content jsonb; line jsonb; saved_version jsonb; r jsonb;
begin
 promotion_content:=jsonb_build_object('productId',p,'name','합성 계란','displayName','합성 계란','startsOn',current_date::text,'endsOn','2099-12-31','cost',1000,'margin',0,'stock',null,'perStoreLimit',null,'taxType','taxable','allowSheet',true,'badge','행사');
 perform pricing_p1(c,repeat('a',64),true,'save-promotion',jsonb_build_object('id',promo,'expected',0,'content',promotion_content));
 line:=jsonb_build_object('productId',p,'displayName','합성 계란','brand','','spec','','unit','개','price',1000,'taxType','taxable','visible',true,'promotionId',null);
 content:=jsonb_build_object('kind','sheet','title','합성 세금 갱신','companyName','합성 회사','contact','','recipient','','footer','','validUntil','2099-12-31','theme','blue','layout','table','showPrice',true,'showBrand',true,'showSpec',true,'lines',jsonb_build_array(line,jsonb_set(line,'{promotionId}',to_jsonb(promo::text))));
 perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',0,'content',content));
 saved_version:=pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id',d,'expected',1));
 perform pricing_p1(c,repeat('a',64),true,'save-promotion',jsonb_build_object('id',promo,'expected',1,'content',jsonb_set(promotion_content,'{taxType}','"exempt"')));
 if not exists(select from pricing_documents saved where saved.id=d and saved.revision=1 and (saved.content#>>'{lines,0,taxType}')='taxable') then raise exception 'source correction changed draft automatically'; end if;
 content:=jsonb_set(jsonb_set(content,'{lines,0,taxType}','"exempt"'),'{lines,1,taxType}','"exempt"');
 r:=pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',1,'content',content));
 if r->>'revision'<>'2' or r#>>'{content,lines,0,taxType}'<>'exempt' or r#>>'{content,lines,1,taxType}'<>'exempt' or r#>>'{content,lines,0,price}'<>'1000' or r#>>'{content,lines,1,price}'<>'1000' then raise exception 'explicit draft tax save changed price or lost tax'; end if;
 if not exists(select from pricing_document_versions v where v.id=(saved_version->>'id')::uuid and v.content#>>'{lines,0,taxType}'='taxable' and v.content#>>'{lines,1,taxType}'='taxable') then raise exception 'published taxes changed'; end if;
end $$;
rollback;
\echo 'PASS: source correction does not auto-write draft; explicit tax save preserves prices and published snapshot'
