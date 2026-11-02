-- LOCAL ISOLATED PG17 ONLY. Requires #180's synthetic pg17.test.sql fixtures.
-- Reproduces the currently applied function; this is not a production fix or migration.
begin;
insert into business_permit_leads(id,company_id,business_name,matched_customer_id)
values('20000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','mismatched synthetic lead','10000000-0000-4000-8000-000000000001');
insert into pricing_document_versions(id,company_id,document_id,version,revision,content)
values('50000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',90,90,
'{"kind":"quote","validUntil":"2099-12-31","lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","price":125,"taxType":"taxable"}]}');
insert into storefront_links(id,company_id,customer_id,document_version_id,can_order)
values('80000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000090',false);
create temporary table s2_mismatch_result as select record_pricing_document_acceptance(
'00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000090',
'70000000-0000-4000-8000-000000000090',repeat('7',64),'staff','10000000-0000-4000-8000-000000000002',
'20000000-0000-4000-8000-000000000090',null,false,null,'80000000-0000-4000-8000-000000000090','{}') as result;
do $$ begin
  if not (select (result->>'needsReview')::boolean from s2_mismatch_result)
    or not exists(select from customer_price_agreements where source_pricing_document_version_id='50000000-0000-4000-8000-000000000090')
    or not (select can_order from storefront_links where id='80000000-0000-4000-8000-000000000090') then
    raise exception 'expected applied-SQL mismatch behavior was not reproduced';
  end if;
end $$;
select jsonb_build_object('needsReview',(result->>'needsReview')::boolean,
  'agreementCreated',exists(select from customer_price_agreements where source_pricing_document_version_id='50000000-0000-4000-8000-000000000090'),
  'priceLinkCreated',exists(select from customer_pricing_document_links where document_version_id='50000000-0000-4000-8000-000000000090'),
  'orderEnabled',(select can_order from storefront_links where id='80000000-0000-4000-8000-000000000090')) as mismatch_repro
from s2_mismatch_result;
rollback;
