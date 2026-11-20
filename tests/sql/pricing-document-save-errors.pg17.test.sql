-- Standalone, synthetic-only reproduction; run in a NEW disposable PG17 DB.
\set ON_ERROR_STOP on
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
begin;
insert into companies values ('00000000-0000-4000-8000-000000000001');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,tax_type)
values ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','합성 면세 계란',1000,'exempt');
set local role service_role;
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; d uuid:='10000000-0000-4000-8000-000000000001';
  p uuid:='20000000-0000-4000-8000-000000000001'; promo uuid:='30000000-0000-4000-8000-000000000001';
  content jsonb; changed jsonb; r jsonb; saved_version jsonb; current_revision integer;
begin
  content:=jsonb_build_object('kind','sheet','title','합성 저장 재현','companyName','합성 회사','contact','','recipient','','footer','',
    'validUntil','2099-12-31','theme','blue','layout','table','showPrice',true,'showBrand',true,'showSpec',true,'lines',
    jsonb_build_array(jsonb_build_object('productId',p,'displayName','합성 면세 계란','brand','','spec','','unit','개','price',1000,'taxType','exempt','visible',true,'promotionId',null)));
  insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values(d,c,repeat('a',64),'sheet',19,content);
  changed:=jsonb_set(content,'{title}','"합성 편집 제목"');
  -- 19 is valid. A real revision mismatch is independent of line validation.
  r:=pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',19,'content',changed));
  if r->>'revision'<>'20' then raise exception 'revision 19 should save'; end if;
  begin
    perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',19,'content',content));
    raise exception 'expected stale rejection';
  exception when raise_exception then if SQLERRM<>'Stale document' then raise; end if; end;
  -- Same revision, missing promotion: validation precedes revision comparison.
  changed:=jsonb_set(content,'{lines,0,promotionId}',to_jsonb(promo::text));
  begin
    perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',20,'content',changed));
    raise exception 'expected missing promotion rejection';
  exception when raise_exception then if SQLERRM<>'Promotion not found' then raise; end if; end;
  insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,tax_type,allow_sheet,badge,revision)
    values(promo,c,p,'합성 행사','합성 행사',current_date,current_date+10,1000,0,1000,'taxable',false,'행사',1);
  begin
    perform pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',20,'content',changed));
    raise exception 'expected sheet-disabled rejection';
  exception when raise_exception then if SQLERRM<>'Promotion not enabled for sheets' then raise; end if; end;
  select revision into current_revision from pricing_documents where id=d;
  if current_revision<>20 then raise exception 'failed save changed revision'; end if;
  update pricing_promotions set allow_sheet=true where id=promo;
  r:=pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',20,'content',changed));
  -- Reproduce the tax mismatch: exempt catalog/input, taxable promotion wins.
  if r->'content'->'lines'->0->>'taxType'<>'taxable' then raise exception 'promotion tax precedence reproduction changed'; end if;
  saved_version:=pricing_p1(c,repeat('a',64),true,'publish',jsonb_build_object('id',d,'expected',21));
  update pricing_promotions set tax_type='exempt' where id=promo;
  r:=pricing_p1(c,repeat('a',64),true,'save',jsonb_build_object('id',d,'expected',21,'content',changed));
  if r->'content'->'lines'->0->>'taxType'<>'exempt' then raise exception 'draft refresh did not follow promotion'; end if;
  if (select v.content->'lines'->0->>'taxType' from pricing_document_versions v where v.id=(saved_version->>'id')::uuid)<>'taxable'
    then raise exception 'published snapshot changed'; end if;
end $$;
rollback;
\echo 'PASS: revision19, conflict, missing/sheet-disabled promotion, tax precedence, immutable version'
