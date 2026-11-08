\set ON_ERROR_STOP on
-- 09-owned data only. 02 supplies its own authenticated driver/route/stop fixtures and API runner.
select set_config('delivery09.fixture_host', :'HOST', false);
do $$ begin
  if current_database()<>'store_member_order_test_delivery_09_api'
    or current_setting('server_version_num')::integer/10000<>17
    or current_setting('delivery09.fixture_host',true) is distinct from '127.0.0.1' then
    raise exception 'disposable_delivery_09_api_loopback_pg17_required';
  end if;
end $$;
\ir store-order-delivery-producer-09.pg17.fixture.sql
\ir ../../docs/sql-drafts/20261108-09-order-delivery-producer.sql
set timezone='UTC';

create temporary table delivery09_api_seed as
select label,public.place_store_order_with_delivery_snapshot_09(
  repeat('a',64),'2099-01-05',
  '[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]'::jsonb,key,
  '{"deliveryCustomerNameSnapshot":"synthetic store","deliveryAddressSnapshot":"synthetic delivery address"}'::jsonb,
  null,null,'','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001'
) result
from (values
 ('first','a3100000-0000-4000-8000-000000000001'::uuid),
 ('second','a3100000-0000-4000-8000-000000000002'::uuid),
 ('cancelled','a3100000-0000-4000-8000-000000000003'::uuid)
) cases(label,key);
update public.store_orders set status='in_delivery' where id=(select (result->>'id')::uuid from delivery09_api_seed where label='second');
update public.store_orders set status='cancelled' where id=(select (result->>'id')::uuid from delivery09_api_seed where label='cancelled');
insert into public.store_orders(company_id,customer_id,link_id,document_version_id,delivery_date,idempotency_key,
  delivery_customer_name_snapshot,delivery_address_snapshot)
values('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',
  '90000000-0000-4000-8000-000000000002','80000000-0000-4000-8000-000000000001','2099-01-05',
  'a3100000-0000-4000-8000-000000000004','other store','other synthetic address');

do $$ begin
  if (select count(*) from public.store_orders)<>4 or (select count(*) from public.store_order_delivery_requests_09)<>3
    or exists(select from public.store_order_delivery_completions_09)
    or exists(select from public.store_order_delivery_completion_orders_09)
    or exists(select from public.store_order_delivery_completion_attachments_09) then
    raise exception 'delivery09_api_fixture_initial_state_invalid';
  end if;
end $$;

-- One stable command per setup; retries must reuse its time/event/pre-revisions/proof.
-- The output is synthetic JSON, not an API session or a claim of route authorization.
\pset format unaligned
\pset tuples_only on
with scope as (
  select '00000000-0000-4000-8000-000000000001'::uuid company_id,
    '20000000-0000-4000-8000-000000000001'::uuid customer_id,
    'a4000000-0000-4000-8000-000000000001'::uuid event_id,
    'a1000000-0000-4000-8000-000000000001'::uuid note_id,
    array['a2000000-0000-4000-8000-000000000001'::uuid,'a2000000-0000-4000-8000-000000000002'::uuid] attachments,
    date_trunc('milliseconds',clock_timestamp()+interval '1 second') completed_at
), orders as (
  select jsonb_agg(jsonb_build_object('orderId',result->>'id','orderRevision',1) order by result->>'id') pre,
    jsonb_agg(jsonb_build_object('orderId',result->>'id','orderRevision',2) order by result->>'id') post,
    jsonb_agg(result->>'id' order by result->>'id') ids,
    jsonb_object_agg(result->>'id',2) revisions
  from delivery09_api_seed where label in('first','second')
)
select 'delivery_completion_09_fixture_manifest='||jsonb_build_object(
  'schemaVersion',1,
  'command',jsonb_build_object('companyId',company_id,'customerId',customer_id,'deliveryDate','2099-01-05',
    'completionEventId',event_id,'idempotencyKey',event_id,
    'completedAt',to_char(completed_at at time zone 'UTC','YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
    'orders',pre,'proof',jsonb_build_object('noteId',note_id,'attachmentIds',attachments)),
  'expectedSqlResult',jsonb_build_object('companyId',company_id,'customerId',customer_id,'deliveryDate','2099-01-05',
    'completionEventId',event_id,'completedAt',completed_at,'orderIds',ids,'orderRevisions',revisions,'noteId',note_id,'attachmentIds',attachments),
  'expectedApiResult',jsonb_build_object('completion',jsonb_build_object('completionEventId',event_id,'completedAt',completed_at,'orders',post)),
  'countsBefore',jsonb_build_object('orders',4,'events',0,'orderRelations',0,'attachmentRelations',0),
  'countsAfterSuccessOrReplay',jsonb_build_object('orders',4,'events',1,'orderRelations',2,'attachmentRelations',2),
  'negativeReferences',jsonb_build_object(
    'alternateValidNoteId','a1000000-0000-4000-8000-000000000002',
    'otherCustomerNoteId','a1000000-0000-4000-8000-000000000003',
    'otherCompanyNoteId','a1000000-0000-4000-8000-000000000004',
    'wrongTypeNoteId','a1000000-0000-4000-8000-000000000005',
    'otherCustomerAttachmentId','a2000000-0000-4000-8000-000000000003',
    'otherCompanyAttachmentId','a2000000-0000-4000-8000-000000000004',
    'wrongTypeAttachmentId','a2000000-0000-4000-8000-000000000005',
    'cancelledOrderId',(select result->>'id' from delivery09_api_seed where label='cancelled'),
    'otherCustomerOrderId',(select id from public.store_orders where idempotency_key='a3100000-0000-4000-8000-000000000004'))
)::text from scope cross join orders;
select 'delivery_completion_09_api_fixture_ready';
