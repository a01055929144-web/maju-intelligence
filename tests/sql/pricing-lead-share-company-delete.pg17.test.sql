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
    raise exception using errcode='P7501',message='restore_successful_probe';
  exception
    when sqlstate 'P7501' then return jsonb_build_object('ok',true);
    when foreign_key_violation then
      get stacked diagnostics fk=constraint_name;
      return jsonb_build_object('ok',false,'constraint',fk);
  end;
end $$;
select 'company_delete_without_share='||pg_temp.probe_company_delete()::text;
do $$ begin if pg_temp.probe_company_delete()->>'ok' is distinct from 'true' then raise exception 'baseline_company_delete_failed'; end if; end $$;
insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
select '60000000-0000-4000-8000-000000000090',company_id,document_id,id,'30000000-0000-4000-8000-000000000001',
  '70000000-0000-4000-8000-000000000090',repeat('a',64),repeat('1',32),repeat('2',64)
from pricing_document_versions where document_id='10000000-0000-4000-8000-000000000001';
select record_pricing_lead_share_delivery(company_id,created_by_key,id,document_id,document_version_id,lead_id,idempotency_key,'pricing-doc-paper-v1','link','synthetic company delete')
from pricing_document_share_links where id='60000000-0000-4000-8000-000000000090';
select 'company_delete_with_share='||pg_temp.probe_company_delete()::text;
do $$ begin if pg_temp.probe_company_delete()->>'ok' is distinct from 'true' then raise exception 'shared_company_delete_failed'; end if; end $$;
do $$ begin
  if not exists(select from companies where id='00000000-0000-4000-8000-000000000001')
    or not exists(select from pricing_document_share_links where id='60000000-0000-4000-8000-000000000090')
    or not exists(select from lead_actions where metadata->>'shareLinkId'='60000000-0000-4000-8000-000000000090') then raise exception 'probe_did_not_restore_history'; end if;
end $$;
-- Retain the narrow history protection: a parent send alone cannot remove a share.
do $$ declare fk text; expected_fk text; begin
  select conname into expected_fk from pg_constraint where conrelid='pricing_document_share_links'::regclass
    and confrelid='pricing_document_sends'::regclass and contype='f';
  begin
    delete from pricing_document_sends where id=(select send_id from pricing_document_share_links where id='60000000-0000-4000-8000-000000000090');
    raise exception 'individual_send_delete_allowed';
  exception when foreign_key_violation then
    get stacked diagnostics fk=constraint_name;
    if fk is distinct from expected_fk then raise exception 'unexpected_delete_constraint_%',fk; end if;
  end;
  if (select count(*) from pricing_document_sends where company_id='00000000-0000-4000-8000-000000000001')<>2
    or (select count(*) from lead_actions where company_id='00000000-0000-4000-8000-000000000001')<>1 then raise exception 'delivery_contact_fixture_missing'; end if;
end $$;
delete from companies where id='00000000-0000-4000-8000-000000000001';
do $$ begin
  if exists(select from pricing_document_share_links where company_id='00000000-0000-4000-8000-000000000001')
    or exists(select from pricing_document_sends where company_id='00000000-0000-4000-8000-000000000001')
    or exists(select from pricing_document_versions where company_id='00000000-0000-4000-8000-000000000001')
    or exists(select from pricing_documents where company_id='00000000-0000-4000-8000-000000000001')
    or exists(select from business_permit_leads where company_id='00000000-0000-4000-8000-000000000001')
    or exists(select from lead_actions where company_id='00000000-0000-4000-8000-000000000001')
    or not exists(select from companies where id='00000000-0000-4000-8000-000000000002') then raise exception 'company_cascade_incomplete_or_foreign_company_lost'; end if;
end $$;
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.down.sql
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.sql
do $$ begin
  if exists(select from pricing_document_share_links) or not exists(select from companies where id='00000000-0000-4000-8000-000000000002') then raise exception 'empty_down_up_changed_foreign_company'; end if;
end $$;
select 'pricing_lead_share_company_delete_pg17_pass';
