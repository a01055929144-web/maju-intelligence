\set ON_ERROR_STOP on
-- Disposable PG17 only; exact pricing migrations, surrounding lead fixtures aligned to 20260818 CASCADE.
\ir pricing-lead-document-share-migrations.pg17.test.sql
alter table business_permit_leads drop constraint business_permit_leads_company_id_fkey,
  add constraint business_permit_leads_company_id_fkey foreign key(company_id) references companies(id) on delete cascade;
alter table lead_actions drop constraint lead_actions_company_id_fkey, drop constraint lead_actions_lead_id_fkey,
  add constraint lead_actions_company_id_fkey foreign key(company_id) references companies(id) on delete cascade,
  add constraint lead_actions_lead_id_fkey foreign key(lead_id) references business_permit_leads(id) on delete cascade;
create function pg_temp.probe_company_delete() returns jsonb language plpgsql as $$
declare fk text; begin
  begin
    delete from companies where id='00000000-0000-4000-8000-000000000001';
    raise exception using errcode='P0002',message='restore_successful_probe';
  exception
    when no_data_found then return jsonb_build_object('ok',true);
    when foreign_key_violation then
      get stacked diagnostics fk=constraint_name;
      return jsonb_build_object('ok',false,'constraint',fk);
  end;
end $$;
select 'company_delete_without_share='||pg_temp.probe_company_delete()::text;
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
select '60000000-0000-4000-8000-000000000090',company_id,document_id,id,'30000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000090',repeat('a',64),repeat('1',32),repeat('2',64)
from pricing_document_versions where document_id='10000000-0000-4000-8000-000000000001';
select record_pricing_lead_share_delivery(company_id,created_by_key,id,document_id,document_version_id,lead_id,idempotency_key,'pricing-doc-paper-v1','link','synthetic company delete')
from pricing_document_share_links where id='60000000-0000-4000-8000-000000000090';
select 'company_delete_with_share='||pg_temp.probe_company_delete()::text;
do $$ begin
  if not exists(select from companies where id='00000000-0000-4000-8000-000000000001')
    or not exists(select from pricing_document_share_links where id='60000000-0000-4000-8000-000000000090')
    or not exists(select from lead_actions where metadata->>'shareLinkId'='60000000-0000-4000-8000-000000000090') then raise exception 'probe_did_not_restore_history'; end if;
end $$;
select 'pricing_lead_share_company_delete_probe_pg17_pass';
