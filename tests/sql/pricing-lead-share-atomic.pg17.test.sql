\set ON_ERROR_STOP on
-- After actual P0/P1/P2/S2 + sharing up/down/up in a disposable PG17 DB.
grant select on business_permit_leads to service_role;
do $$ begin
  if current_setting('server_version_num')::integer/10000<>17 then raise exception 'PG17_required'; end if;
  if has_function_privilege('anon','record_pricing_lead_share_delivery(uuid,text,uuid,uuid,uuid,uuid,uuid,text,text,text)','execute')
    or has_function_privilege('authenticated','record_pricing_lead_share_delivery(uuid,text,uuid,uuid,uuid,uuid,uuid,text,text,text)','execute') then raise exception 'public_delivery_rpc'; end if;
end $$;
create function public.test_share_contact_failure() returns trigger language plpgsql as $$ begin
  if new.actor_name='fail-contact' then raise exception 'synthetic_contact_failure'; end if;
  return new;
end $$;
create trigger test_share_contact_failure before insert on lead_actions for each row execute function public.test_share_contact_failure();
create function public.test_share_bind_failure() returns trigger language plpgsql as $$ begin
  if new.id='60000000-0000-4000-8000-000000000041' and new.send_id is not null then raise exception 'synthetic_bind_failure'; end if;
  return new;
end $$;
create trigger test_share_bind_failure before update on pricing_document_share_links for each row execute function public.test_share_bind_failure();
set role service_role;
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
select '60000000-0000-4000-8000-000000000040',company_id,document_id,id,'30000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000040',repeat('a',64),repeat('1',32),repeat('2',64)
from pricing_document_versions where document_id='10000000-0000-4000-8000-000000000001';
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
select '60000000-0000-4000-8000-000000000041',company_id,document_id,id,'30000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000041',repeat('a',64),repeat('1',32),repeat('2',64)
from pricing_document_versions where document_id='10000000-0000-4000-8000-000000000001';
do $$ declare l pricing_document_share_links%rowtype; first_result jsonb; retry_result jsonb; begin
  select * into l from pricing_document_share_links where id='60000000-0000-4000-8000-000000000040';
  begin
    perform record_pricing_lead_share_delivery(l.company_id,l.created_by_key,l.id,l.document_id,l.document_version_id,l.lead_id,l.idempotency_key,'pricing-doc-paper-v1','link','fail-contact');
    raise exception 'contact_failure_not_raised';
  exception when raise_exception then if sqlerrm<>'synthetic_contact_failure' then raise; end if; end;
  if exists(select from pricing_document_sends where company_id=l.company_id and idempotency_key=l.idempotency_key)
    or exists(select from lead_actions where metadata->>'shareLinkId'=l.id::text)
    or exists(select from pricing_document_share_links where id=l.id and send_id is not null) then raise exception 'contact_failure_left_partial_delivery'; end if;
  first_result:=record_pricing_lead_share_delivery(l.company_id,l.created_by_key,l.id,l.document_id,l.document_version_id,l.lead_id,l.idempotency_key,'pricing-doc-paper-v1','link','합성 담당');
  -- Lost response / changed display name is not a new delivery.
  retry_result:=record_pricing_lead_share_delivery(l.company_id,l.created_by_key,l.id,l.document_id,l.document_version_id,l.lead_id,l.idempotency_key,'pricing-doc-paper-v1','link','변경된 표시 이름');
  if first_result<>retry_result then raise exception 'atomic_retry_ids_changed'; end if;
  if (select count(*) from pricing_document_sends where company_id=l.company_id and idempotency_key=l.idempotency_key)<>1
    or (select count(*) from lead_actions where company_id=l.company_id and lead_id=l.lead_id and metadata->>'idempotencyKey'=l.idempotency_key::text)<>1 then raise exception 'atomic_retry_duplicated'; end if;
  if not exists(select from lead_actions where id=(first_result->>'leadActionId')::uuid and id=(first_result->>'sendId')::uuid
    and action_type='quote' and result='견적 전달' and actor_name='합성 담당'
    and metadata=jsonb_build_object('pricingDocumentId',l.document_id,'documentVersionId',l.document_version_id,'shareLinkId',l.id,
      'sendId',(first_result->>'sendId')::uuid,'idempotencyKey',l.idempotency_key)) then raise exception 'contact_history_contract'; end if;
  begin
    perform record_pricing_lead_share_delivery(l.company_id,l.created_by_key,l.id,l.document_id,l.document_version_id,l.lead_id,l.idempotency_key,'different-template','link','합성 담당');
    raise exception 'changed_delivery_allowed';
  exception when raise_exception then if sqlerrm<>'share_delivery_conflict' then raise; end if; end;
  begin
    perform record_pricing_lead_share_delivery(l.company_id,repeat('b',64),l.id,l.document_id,l.document_version_id,l.lead_id,l.idempotency_key,'pricing-doc-paper-v1','link','합성 담당');
    raise exception 'other_actor_allowed';
  exception when raise_exception then if sqlerrm<>'share_document_not_found' then raise; end if; end;
  select * into l from pricing_document_share_links where id='60000000-0000-4000-8000-000000000041';
  begin
    perform record_pricing_lead_share_delivery(l.company_id,l.created_by_key,l.id,l.document_id,l.document_version_id,l.lead_id,l.idempotency_key,'pricing-doc-paper-v1','link','합성 담당');
    raise exception 'bind_failure_not_raised';
  exception when raise_exception then if sqlerrm<>'synthetic_bind_failure' then raise; end if; end;
  if exists(select from pricing_document_sends where company_id=l.company_id and idempotency_key=l.idempotency_key)
    or exists(select from lead_actions where metadata->>'shareLinkId'=l.id::text)
    or exists(select from pricing_document_share_links where id=l.id and send_id is not null) then raise exception 'bind_failure_left_partial_delivery'; end if;
end $$;
reset role;
drop trigger test_share_contact_failure on lead_actions;
drop function test_share_contact_failure();
drop trigger test_share_bind_failure on pricing_document_share_links;
drop function test_share_bind_failure();
select 'pricing_lead_share_atomic_send_contact_rollback_pg17_pass';
