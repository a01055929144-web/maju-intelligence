-- LOCAL ISOLATED PG17 ONLY. Requires #180's synthetic pg17.test.sql fixtures.
-- Requires the review-hold proposal applied in an isolated database; never run in production.
begin;
insert into business_permit_leads(id,company_id,business_name,matched_customer_id)
values('20000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','mismatched synthetic lead','10000000-0000-4000-8000-000000000001');
insert into pricing_document_versions(id,company_id,document_id,version,revision,content)
values('50000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',90,90,
'{"kind":"quote","validUntil":"2099-12-31","lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","price":125,"taxType":"taxable"}]}');
insert into storefront_links(id,company_id,customer_id,document_version_id,can_order)
values('80000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000090',false);
insert into customer_price_agreements(id,company_id,customer_id,product_catalog_id,sales_unit,unit_price,tax_type)
values('60000000-0000-4000-8000-000000000090','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','BOX',777,'taxable');
create temporary table s2_mismatch_result as select record_pricing_document_acceptance(
'00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000090',
'70000000-0000-4000-8000-000000000090',repeat('7',64),'staff','10000000-0000-4000-8000-000000000002',
'20000000-0000-4000-8000-000000000090',null,false,null,'80000000-0000-4000-8000-000000000090','{}') as result;
do $$ begin
  if not (select (result->>'needsReview')::boolean from s2_mismatch_result)
    or exists(select from customer_price_agreements where source_pricing_document_version_id='50000000-0000-4000-8000-000000000090')
    or (select can_order from storefront_links where id='80000000-0000-4000-8000-000000000090') or exists(select from customer_pricing_document_links where document_version_id='50000000-0000-4000-8000-000000000090')
    or not exists(select from customer_price_agreements where id='60000000-0000-4000-8000-000000000090' and status='active' and unit_price=777)
    or coalesce((select (result->>'orderEnabled')::boolean from s2_mismatch_result),true) then
    raise exception 'review hold failed';
  end if;
end $$;
select jsonb_build_object('needsReview',(result->>'needsReview')::boolean,
  'agreementCreated',exists(select from customer_price_agreements where source_pricing_document_version_id='50000000-0000-4000-8000-000000000090'),
  'priceLinkCreated',exists(select from customer_pricing_document_links where document_version_id='50000000-0000-4000-8000-000000000090'),
  'orderEnabled',(select can_order from storefront_links where id='80000000-0000-4000-8000-000000000090')) as review_hold
from s2_mismatch_result;
-- Repeating a held request must return exactly the stored result, with one request row.
do $$ declare again jsonb; begin
  again:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000090',
    '70000000-0000-4000-8000-000000000090',repeat('7',64),'staff','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000090',null,false,null,'80000000-0000-4000-8000-000000000090','{}');
  if again is distinct from (select result from s2_mismatch_result)
    or (select count(*) from pricing_document_acceptance_requests where idempotency_key='70000000-0000-4000-8000-000000000090')<>1 then
    raise exception 'held request idempotency failed';
  end if;
end $$;

-- A normal quote still creates priority 1 + agreement 0 and activates its exact link.
insert into storefront_links(id,company_id,customer_id,document_version_id,can_order)
values('80000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000090',false);
do $$ declare accepted jsonb; begin
  accepted:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000090',
    '70000000-0000-4000-8000-000000000091',repeat('8',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,'80000000-0000-4000-8000-000000000091','{}');
  if (accepted->>'needsReview')::boolean
    or not exists(select from customer_price_agreements where customer_id='10000000-0000-4000-8000-000000000001' and source_pricing_document_version_id='50000000-0000-4000-8000-000000000090' and unit_price=125 and status='active')
    or not exists(select from customer_pricing_document_links where id=(accepted->>'pricingDocumentLinkId')::uuid and price_priority=1)
    or not (select can_order from storefront_links where id='80000000-0000-4000-8000-000000000091') then
    raise exception 'normal quote acceptance regression';
  end if;
end $$;

-- A normal sheet creates priority 2 without replacing or ending the quote agreement.
do $$ declare accepted jsonb; before_count integer; begin
  select count(*) into before_count from customer_price_agreements;
  accepted:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001',
    '70000000-0000-4000-8000-000000000092',repeat('9',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,null,'{}');
  if (accepted->>'needsReview')::boolean or (select count(*) from customer_price_agreements)<>before_count
    or not exists(select from customer_pricing_document_links where id=(accepted->>'pricingDocumentLinkId')::uuid and price_priority=2)
    or not exists(select from customer_price_agreements where customer_id='10000000-0000-4000-8000-000000000001' and source_pricing_document_version_id='50000000-0000-4000-8000-000000000090' and status='active') then
    raise exception 'normal sheet acceptance regression';
  end if;
end $$;

-- Ambiguous lead matching must hold as well, without touching a valid prior agreement.
insert into business_permit_leads(id,company_id,business_name,phone) values
('20000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000001','ambiguous one','01077779999'),
('20000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000001','ambiguous two','01077779999');
insert into storefront_links(id,company_id,customer_id,document_version_id,can_order)
values('80000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000090',false);
do $$ declare held jsonb; before_count integer; begin
  select count(*) into before_count from customer_price_agreements;
  held:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000090',
    '70000000-0000-4000-8000-000000000093',repeat('a',64),'staff','10000000-0000-4000-8000-000000000001',null,null,false,null,'80000000-0000-4000-8000-000000000092','{"businessName":"ambiguous","phone":"01077779999","address":"local"}');
  if not (held->>'needsReview')::boolean or (held->>'orderEnabled')::boolean
    or (select count(*) from customer_price_agreements)<>before_count
    or (select can_order from storefront_links where id='80000000-0000-4000-8000-000000000092') then
    raise exception 'ambiguous lead hold failed';
  end if;
end $$;
-- Ambiguous customer matching still records only a held request, without another customer.
insert into normalized_customers(id,company_id,import_id,customer_name,address,phone,normalized_key) values
('10000000-0000-4000-8000-000000000091','00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','ambiguous target','local target','01077778888','hold-test-customer-1'),
('10000000-0000-4000-8000-000000000092','00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','ambiguous target','local target','01077778888','hold-test-customer-2');
do $$ declare held jsonb; customer_count integer; agreement_count integer; begin
  select count(*) into customer_count from normalized_customers;
  select count(*) into agreement_count from customer_price_agreements;
  held:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000090',
    '70000000-0000-4000-8000-000000000094',repeat('b',64),'staff',null,'20000000-0000-4000-8000-000000000001',null,false,null,null,'{"businessName":"ambiguous target","phone":"01077778888","address":"local target"}');
  if not (held->>'needsReview')::boolean or (held->>'orderEnabled')::boolean or held->>'customerId' is not null
    or (select count(*) from normalized_customers)<>customer_count or (select count(*) from customer_price_agreements)<>agreement_count then
    raise exception 'ambiguous customer hold failed';
  end if;
end $$;
do $$ begin
  if has_function_privilege('anon','public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb)','EXECUTE')
    or not has_function_privilege('service_role','public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb)','EXECUTE') then
    raise exception 'function grants changed';
  end if;
end $$;
select jsonb_build_object('heldRetry',true,'normalQuote',true,'normalSheet',true,'ambiguousLeadHold',true,'ambiguousCustomerHold',true,'grantsPreserved',true) as regression_checks;
rollback;
