\set ON_ERROR_STOP on
-- Disposable synthetic fixture only. No operating connection or data.
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if;
end $$;
create table companies(id uuid primary key);
create table business_permit_leads(id uuid primary key,company_id uuid references companies,merged_into_lead_id uuid,unique(company_id,id));
create table public.lead_actions(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies,lead_id uuid not null references business_permit_leads,
  action_type text not null,result text,memo text,actor_name text,metadata jsonb not null default '{}'::jsonb,created_at timestamptz not null default now());
grant select,insert on public.lead_actions to service_role;
create table normalized_customers(id uuid primary key,company_id uuid references companies,unique(company_id,id));
create table pricing_documents(id uuid primary key,company_id uuid references companies,kind text,owner_key text,archived_at timestamptz,unique(company_id,id));
create table pricing_document_versions(id uuid primary key,company_id uuid,document_id uuid,content jsonb,
  unique(company_id,id),unique(company_id,document_id,id),foreign key(company_id,document_id) references pricing_documents(company_id,id));
-- Existing S2 send contract, not a proposed production schema change.
create table pricing_document_sends(id uuid primary key default gen_random_uuid(),company_id uuid references companies,
  document_id uuid not null,document_version_id uuid not null,lead_id uuid,customer_id uuid,
  template_id text not null,layout text not null,channel text not null,idempotency_key uuid not null,sent_by_key text not null,
  unique(company_id,id),unique(company_id,idempotency_key),check(num_nonnulls(lead_id,customer_id)=1),
  foreign key(company_id,document_id,document_version_id) references pricing_document_versions(company_id,document_id,id),
  foreign key(company_id,lead_id) references business_permit_leads(company_id,id),
  foreign key(company_id,customer_id) references normalized_customers(company_id,id));
insert into companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into pricing_documents values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','sheet',repeat('a',64),null),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','quote',repeat('b',64),null),
 ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','sheet',repeat('b',64),null);
insert into pricing_document_versions values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',jsonb_build_object('validUntil','2099-12-31','lines',jsonb_build_array(jsonb_build_object('price',1200)))),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','{"validUntil":"2099-12-31"}'),
 ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','{"validUntil":"2099-12-31"}'),
 ('20000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{"validUntil":"2000-01-01"}');
insert into business_permit_leads values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',null),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',null),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002',null),
 ('30000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
insert into normalized_customers values ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
-- Managed projects can grant service_role ALL through default privileges; the draft must still remove DELETE.
alter default privileges in schema public grant all on tables to service_role;
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.sql
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.down.sql
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.sql

create function pg_temp.expect_error(command text,expected text) returns void language plpgsql as $$
begin
  begin execute command;
  exception when others then if position(expected in sqlerrm)>0 then return; else raise; end if; end;
  raise exception 'expected_error_missing: %',expected;
end $$;
create function pg_temp.prepare_link(link_id uuid,request_key uuid,doc uuid default '10000000-0000-4000-8000-000000000001',
  version_id uuid default '20000000-0000-4000-8000-000000000001',lead uuid default '30000000-0000-4000-8000-000000000001',actor text default repeat('a',64),ttl smallint default 14)
returns void language sql as $$
  insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash,ttl_days)
    values(link_id,'00000000-0000-4000-8000-000000000001',doc,version_id,lead,request_key,actor,repeat('c',32),repeat('d',64),ttl)
    on conflict(company_id,idempotency_key) do nothing;
$$;
select pg_temp.prepare_link('60000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001');
select pg_temp.prepare_link('60000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000001');
do $$ begin
  if (select count(*) from pricing_document_share_links)<>1 or exists(select from pricing_document_sends) then raise exception 'prepare_created_delivery_or_duplicate'; end if;
  if not exists(select from pricing_document_share_links where send_id is null and expires_at-created_at=interval '14 days') then raise exception 'ttl_not_server_derived'; end if;
  if has_table_privilege('anon','pricing_document_share_links','select') or has_table_privilege('authenticated','pricing_document_share_links','insert')
    or has_table_privilege('service_role','pricing_document_share_links','delete') then raise exception 'direct_privilege_leak'; end if;
  if not (select relrowsecurity from pg_class where oid='pricing_document_share_links'::regclass) then raise exception 'rls_off'; end if;
  if (select prosecdef from pg_proc where oid='validate_pricing_document_share_link()'::regprocedure) then raise exception 'unexpected_definer'; end if;
end $$;
select pg_temp.expect_error($q$select pg_temp.prepare_link('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003',version_id=>'20000000-0000-4000-8000-000000000003')$q$,'share_version_not_found');
select pg_temp.expect_error($q$select pg_temp.prepare_link('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003',lead=>'30000000-0000-4000-8000-000000000003')$q$,'share_lead_not_found');
select pg_temp.expect_error($q$select pg_temp.prepare_link('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003',lead=>'30000000-0000-4000-8000-000000000004')$q$,'share_lead_not_found');
select pg_temp.expect_error($q$select pg_temp.prepare_link('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003',doc=>'10000000-0000-4000-8000-000000000002',version_id=>'20000000-0000-4000-8000-000000000002')$q$,'share_document_not_found');
select pg_temp.expect_error($q$select pg_temp.prepare_link('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003',version_id=>'20000000-0000-4000-8000-000000000004')$q$,'share_document_expired');
select pg_temp.expect_error($q$select pg_temp.prepare_link('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003',ttl=>31::smallint)$q$,'pricing_share_');
select pg_temp.prepare_link('60000000-0000-4000-8000-000000000002','70000000-0000-4000-8000-000000000002',doc=>'10000000-0000-4000-8000-000000000002',version_id=>'20000000-0000-4000-8000-000000000002',actor=>repeat('b',64));
update pricing_documents set archived_at=clock_timestamp() where id='10000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$select pg_temp.prepare_link('60000000-0000-4000-8000-000000000003','70000000-0000-4000-8000-000000000003')$q$,'share_document_not_found');
update pricing_documents set archived_at=null where id='10000000-0000-4000-8000-000000000001';
insert into pricing_document_sends(id,company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key) values
 ('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','actual-template','table','staff','70000000-0000-4000-8000-000000000001',repeat('a',64)),
 ('50000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','actual-template','table','staff','80000000-0000-4000-8000-000000000002',repeat('a',64));
insert into pricing_document_sends(id,company_id,document_id,document_version_id,customer_id,template_id,layout,channel,idempotency_key,sent_by_key) values
 ('50000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','actual-template','table','staff','80000000-0000-4000-8000-000000000003',repeat('a',64));
insert into pricing_document_sends(id,company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key) values
 ('50000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003','actual-template','table','staff','80000000-0000-4000-8000-000000000004',repeat('b',64));
insert into pricing_document_sends(id,company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key) values
 ('50000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','actual-template','table','staff','80000000-0000-4000-8000-000000000005',repeat('a',64)),
 ('50000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','actual-template','table','staff','70000000-0000-4000-8000-000000000002',repeat('a',64));
select pg_temp.expect_error($q$update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000002' where id='60000000-0000-4000-8000-000000000001'$q$,'share_send_mismatch');
select pg_temp.expect_error($q$update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000003' where id='60000000-0000-4000-8000-000000000001'$q$,'share_send_mismatch');
select pg_temp.expect_error($q$update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000004' where id='60000000-0000-4000-8000-000000000001'$q$,'share_send_mismatch');
select pg_temp.expect_error($q$update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000005' where id='60000000-0000-4000-8000-000000000001'$q$,'share_send_mismatch');
select pg_temp.expect_error($q$update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000006' where id='60000000-0000-4000-8000-000000000002'$q$,'share_send_mismatch');
update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000001' where id='60000000-0000-4000-8000-000000000001';
update pricing_document_share_links set send_id=send_id where id='60000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$update pricing_document_share_links set send_id=null where id='60000000-0000-4000-8000-000000000001'$q$,'share_send_immutable');
select pg_temp.expect_error($q$update pricing_document_share_links set lead_id='30000000-0000-4000-8000-000000000002' where id='60000000-0000-4000-8000-000000000001'$q$,'share_context_immutable');
select pg_temp.expect_error($q$update pricing_document_share_links set token_hash=repeat('f',64) where id='60000000-0000-4000-8000-000000000001'$q$,'share_context_immutable');
select pg_temp.expect_error($q$update pricing_document_share_links set expires_at=expires_at+interval '1 day' where id='60000000-0000-4000-8000-000000000001'$q$,'share_context_immutable');
update pricing_document_share_links set revoked_at=clock_timestamp() where id='60000000-0000-4000-8000-000000000001';
select pg_temp.expect_error($q$update pricing_document_share_links set revoked_at=null where id='60000000-0000-4000-8000-000000000001'$q$,'share_revocation_final');

-- Expected guard error; transaction must roll back with link/send/version history intact.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if (select count(*) from pricing_document_share_links)<>2 or (select count(*) from pricing_document_sends)<>6
    or (select count(*) from pricing_document_versions)<>4 then raise exception 'down_removed_history'; end if;
end $$;
-- Fixture owner alone clears its synthetic links to verify the permitted empty down/up path.
delete from pricing_document_share_links;
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.down.sql
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.sql
select 'pricing_lead_document_share_pg17_pass';
