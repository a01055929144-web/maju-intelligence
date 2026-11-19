\set ON_ERROR_STOP on
do $$ begin
  if current_database() !~ '^promotion_tax_backup_test_' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'disposable_pg17_required'; end if;
end $$;
\ir ../pricing-p1-fixture.sql
\ir ../../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../../supabase/migrations/20261102114601_pricing_p1.sql
alter table public.pricing_documents add column archived_at timestamptz;
insert into public.companies values(md5('synthetic-company-1')::uuid),(md5('synthetic-company-2')::uuid);
insert into public.product_catalog(id,company_id,purchase_product_name,purchase_price,tax_type)
select md5('synthetic-product-'||n)::uuid,md5('synthetic-company-'||case when n=5 then 2 else 1 end)::uuid,
  case when n<=3 then '합성 계란' else '합성 품목' end,1000+n*10,case when n=4 then 'taxable' else 'exempt' end
from generate_series(1,5) n;
insert into public.pricing_promotions
  (id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,tax_type,allow_sheet,badge,revision)
select md5('synthetic-promotion-'||n)::uuid,md5('synthetic-company-'||case when n=5 then 2 else 1 end)::uuid,
  md5('synthetic-product-'||n)::uuid,'합성 행사','합성 행사',
  (clock_timestamp() at time zone 'Asia/Seoul')::date-1,(clock_timestamp() at time zone 'Asia/Seoul')::date+10,
  1000+n*10,0,1000+n*10,'taxable',true,'행사',1
from generate_series(1,5) n;
insert into public.pricing_documents(id,company_id,owner_key,kind,revision,content)
select md5('synthetic-document')::uuid,md5('synthetic-company-1')::uuid,repeat('a',64),'sheet',20,
  jsonb_build_object('kind','sheet','lines',jsonb_agg(jsonb_build_object(
    'productId',md5('synthetic-product-'||case when n<=3 then n else 4 end)::uuid,
    'promotionId',case when n<=3 then md5('synthetic-promotion-'||n)::uuid end,
    'price',1000,'taxType','taxable','visible',true) order by n))
from generate_series(1,20) n;
insert into public.pricing_document_versions(company_id,document_id,version,revision,content)
select company_id,id,1,18,content from public.pricing_documents;
create table public.test_before_rows as
  select 'promotion'::text kind,id,to_jsonb(p) body from public.pricing_promotions p
  union all select 'draft',id,to_jsonb(d) from public.pricing_documents d
  union all select 'publication',id,to_jsonb(v) from public.pricing_document_versions v
  union all select 'product',id,to_jsonb(x) from public.product_catalog x;
