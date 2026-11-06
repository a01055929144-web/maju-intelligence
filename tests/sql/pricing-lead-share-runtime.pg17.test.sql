\set ON_ERROR_STOP on
-- Run AFTER #285's pinned actual P0/P1/P2/S2 migration test, on its disposable CI DB.
-- Only surrounding lead read privileges are fixture-specific; pricing grants come from actual migrations.
grant select on business_permit_leads to service_role;
do $$ begin
  if current_setting('server_version_num')::integer/10000<>17 then raise exception 'PG17_required'; end if;
  if has_table_privilege('anon','pricing_document_share_links','select') or has_table_privilege('authenticated','pricing_document_share_links','insert')
    or has_table_privilege('service_role','pricing_document_share_links','delete') then raise exception 'share_direct_privileges'; end if;
end $$;
set role service_role;
-- App inserts omit expires_at: the draft trigger derives both times. Retry must preserve the nonce/hash/ID.
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash,ttl_days)
select '60000000-0000-4000-8000-000000000010',company_id,document_id,id,'30000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000010',repeat('a',64),repeat('1',32),repeat('2',64),14
from pricing_document_versions where document_id='10000000-0000-4000-8000-000000000001'
on conflict(company_id,idempotency_key) do nothing;
do $$ begin
  if not exists(select from pricing_document_share_links where id='60000000-0000-4000-8000-000000000010'
    and send_id is null and expires_at=created_at+interval '14 days') then raise exception 'prepare_contract'; end if;
end $$;
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
select '60000000-0000-4000-8000-000000000011',company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,repeat('3',32),repeat('4',64)
from pricing_document_share_links where id='60000000-0000-4000-8000-000000000010'
on conflict(company_id,idempotency_key) do nothing;
do $$ declare i integer; result text; begin
  if (select count(*) from pricing_document_share_links)<>1 or not exists(select from pricing_document_share_links
    where id='60000000-0000-4000-8000-000000000010' and token_nonce=repeat('1',32)) then raise exception 'retry_replaced_link'; end if;
  for i in 1..11 loop
    result:=pricing_s2_public_request_guard('00000000-0000-4000-8000-000000000001','lead-document-prepare-v1',repeat('9',64),
      '{"shareLinkId":"60000000-0000-4000-8000-000000000010"}'::jsonb,10);
    if result is distinct from case when i<=10 then 'allowed' else 'rate_limited' end then raise exception 'prepare_rate_limit'; end if;
  end loop;
  for i in 1..21 loop
    result:=pricing_s2_public_request_guard('00000000-0000-4000-8000-000000000001','lead-document-read-v1',repeat('9',64),
      '{"shareLinkId":"60000000-0000-4000-8000-000000000010"}'::jsonb,20);
    if result is distinct from case when i<=20 then 'allowed' else 'rate_limited' end then raise exception 'read_rate_limit'; end if;
  end loop;
end $$;
insert into pricing_document_sends(id,company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key)
select '50000000-0000-4000-8000-000000000010',company_id,document_id,document_version_id,lead_id,'pricing-doc-paper-v1','table','link',idempotency_key,created_by_key
from pricing_document_share_links where id='60000000-0000-4000-8000-000000000010'
on conflict(company_id,idempotency_key) do nothing;
update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000010' where id='60000000-0000-4000-8000-000000000010' and send_id is null;
update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000010' where id='60000000-0000-4000-8000-000000000010' and send_id is null;
-- Same atomic predicates as public reads: technical viewing must never undo acceptance.
update pricing_document_sends set acceptance_status='accepted' where id='50000000-0000-4000-8000-000000000010';
update pricing_document_sends set acceptance_status='viewed',viewed_at=clock_timestamp()
  where id='50000000-0000-4000-8000-000000000010' and acceptance_status='sent' and viewed_at is null;
do $$ begin
  if not exists(select from pricing_document_sends where id='50000000-0000-4000-8000-000000000010' and acceptance_status='accepted' and viewed_at is null)
    then raise exception 'view_overwrote_acceptance'; end if;
end $$;
update pricing_document_share_links set revoked_at=clock_timestamp() where id='60000000-0000-4000-8000-000000000010' and revoked_at is null;
do $$ begin
  begin
    update pricing_document_share_links set revoked_at=null where id='60000000-0000-4000-8000-000000000010';
    raise exception 'revocation_reversed';
  exception when raise_exception then if sqlerrm<>'share_revocation_final' then raise; end if; end;
end $$;
reset role;
select 'pricing_lead_share_runtime_service_permissions_pg17_pass';
