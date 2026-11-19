-- Existing RPC behavior only; new disposable PG17 database, synthetic data.
\set ON_ERROR_STOP on
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
begin;
insert into companies values('00000000-0000-4000-8000-000000000001');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,tax_type)
values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','합성 계란',1000,'exempt');
set local role service_role;
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; p uuid:='20000000-0000-4000-8000-000000000001';
  promo uuid:='30000000-0000-4000-8000-000000000001'; doc uuid:='10000000-0000-4000-8000-000000000001';
  promotion_content jsonb; document_content jsonb; saved_version jsonb;
begin
  promotion_content:=jsonb_build_object('productId',p,'name','합성 계란','displayName','합성 계란','startsOn',current_date::text,'endsOn','2099-12-31',
    'cost',1000,'margin',10,'stock',null,'perStoreLimit',null,'taxType','taxable','allowSheet',true,'badge','행사');
  perform pricing_p1(c,repeat('a',64),true,'save-promotion',jsonb_build_object('id',promo,'expected',0,'content',promotion_content));
  document_content:=jsonb_build_object('kind','sheet','title','합성 행사 문서','companyName','합성 회사','contact','','recipient','','footer','',
    'validUntil','2099-12-31','theme','blue','layout','table','showPrice',true,'showBrand',true,'showSpec',true,'lines',
    jsonb_build_array(jsonb_build_object('productId',p,'displayName','합성 계란','brand','','spec','','unit','개','price',1100,'taxType','taxable','visible',true,'promotionId',promo)));
  perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',doc,'expected',0,'content',document_content));
  saved_version:=pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id',doc,'expected',1));
  -- Explicit existing promotion correction uses its revision; prices stay fixed.
  promotion_content:=jsonb_set(promotion_content,'{taxType}','"exempt"');
  perform pricing_p1(c,repeat('a',64),true,'save-promotion',jsonb_build_object('id',promo,'expected',1,'content',promotion_content));
  if not exists(select from pricing_promotions where id=promo and tax_type='exempt' and revision=2 and price=1100)
    then raise exception 'explicit correction or price preservation failed'; end if;
  if not exists(select from pricing_documents where id=doc and revision=1 and content->'lines'->0->>'taxType'='taxable')
    then raise exception 'reading/correcting promotion rewrote draft'; end if;
  if not exists(select from pricing_document_versions v where v.id=(saved_version->>'id')::uuid and v.content->'lines'->0->>'taxType'='taxable' and v.content->'lines'->0->>'price'='1100')
    then raise exception 'published snapshot changed'; end if;
  begin
    perform pricing_p1(c,repeat('a',64),true,'save-promotion',jsonb_build_object('id',promo,'expected',1,'content',promotion_content));
    raise exception 'stale promotion edit should fail';
  exception when raise_exception then if SQLERRM<>'Stale promotion' then raise; end if; end;
end $$;
rollback;
\echo 'PASS: explicit promotion tax correction, stale guard, price/draft/published snapshot preservation'
