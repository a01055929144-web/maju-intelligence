\set ON_ERROR_STOP on
-- New disposable PG17 DB only. Pricing target tables come from exact migration files.
do $$ begin
  if current_setting('server_version_num')::integer/10000<>17 then raise exception 'PG17_required'; end if;
end $$;
\ir pricing-p1-fixture.sql
\ir ../../supabase/migrations/20261102114600_pricing_p0.sql
\ir ../../supabase/migrations/20261102114601_pricing_p1.sql
\ir pricing-p2-fixture.sql
\ir ../../supabase/migrations/20261102114602_pricing_p2_store_ordering.sql

-- Minimal surrounding pre-S2 lead/import prerequisites, not replacements for P1/S2 tables.
create table public.customer_imports(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies,
  source text not null default 'excel',row_count integer not null default 0,status text not null default 'completed',quality_score integer not null default 0,completed_at timestamptz);
alter table public.normalized_customers add column import_id uuid references customer_imports,
  add column phone text,add column business_registration_number text,add column normalized_key text;
create table public.business_permit_leads(id uuid primary key,company_id uuid not null references companies,
  business_name text not null,address text,phone text,source text not null default 'manual_upload',is_active boolean not null default true,
  matched_customer_id uuid,is_duplicate boolean not null default false,status text not null default '신규 수집',
  updated_at timestamptz not null default now(),merged_into_lead_id uuid,unique(company_id,id));
do $$ begin
  if exists(select from pg_constraint where conrelid='public.pricing_document_versions'::regclass
    and contype='u' and pg_get_constraintdef(oid)='UNIQUE (company_id, document_id, id)') then raise exception 'unexpected_pre_S2_triple_unique'; end if;
  if to_regclass('public.pricing_document_sends') is not null then raise exception 'unexpected_pre_S2_send_table'; end if;
end $$;
\ir ../../supabase/migrations/20261102124354_s2_sales_to_order_acceptance_20261102.sql
do $$ begin
  if not exists(select from pg_constraint where conrelid='public.pricing_document_versions'::regclass
    and contype='u' and conname='pricing_document_versions_company_document_id_key'
    and pg_get_constraintdef(oid)='UNIQUE (company_id, document_id, id)') then raise exception 'S2_triple_unique_missing'; end if;
end $$;

\ir ../../docs/sql-drafts/20261106-09-lead-document-share.sql
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.down.sql
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.sql

insert into companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,sales_product_name,sales_unit,tax_type)
  values('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic product',1000,'public product','BOX','exempt');
insert into business_permit_leads(id,company_id,business_name)
  values('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic lead');
create temp table integration_refs(document_id uuid,version_id uuid,version_content jsonb,send_id uuid,send_snapshot jsonb);
do $$
declare c uuid:='00000000-0000-4000-8000-000000000001'; d uuid:='10000000-0000-4000-8000-000000000001';
  a text:=repeat('a',64); b text:=repeat('b',64); content jsonb; published jsonb; version_id uuid;
begin
  content:=jsonb_build_object('kind','quote','title','migration integration','companyName','synthetic company','contact','','recipient','synthetic lead','footer','',
    'validUntil','2099-12-31','theme','blue','layout','table','showPrice',true,'showBrand',true,'showSpec',true,
    'lines',jsonb_build_array(jsonb_build_object('productId','40000000-0000-4000-8000-000000000001','displayName','public product','brand','','spec','1kg','unit','BOX',
      'price',1200,'taxType','exempt','visible',true,'promotionId',null)));
  perform pricing_p1(c,a,true,'save',jsonb_build_object('id',d,'expected',0,'content',content));
  published:=pricing_p1(c,a,true,'publish',jsonb_build_object('id',d,'expected',1));
  version_id:=(published->>'id')::uuid;
  -- Existing write ownership remains. Internal shared reads use #261's repository, not old RPC list/versions.
  begin
    perform pricing_p1(c,b,true,'save',jsonb_build_object('id',d,'expected',1,'content',content));
    raise exception 'foreign_quote_write_allowed';
  exception when raise_exception then if sqlerrm<>'Document not found' then raise; end if; end;
  begin
    perform pricing_p1(c,b,true,'publish',jsonb_build_object('id',d,'expected',1));
    raise exception 'foreign_quote_publish_allowed';
  exception when raise_exception then if sqlerrm<>'Document not found' then raise; end if; end;
  -- The draft's external-link issuance restriction is independent of company-internal reading.
  begin
    insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
      values('60000000-0000-4000-8000-000000000002',c,d,version_id,'30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',b,repeat('c',32),repeat('d',64));
    raise exception 'foreign_quote_external_share_allowed';
  exception when raise_exception then if sqlerrm<>'share_document_not_found' then raise; end if; end;
  insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
    values('60000000-0000-4000-8000-000000000001',c,d,version_id,'30000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',a,repeat('c',32),repeat('d',64));
  if exists(select from pricing_document_sends) then raise exception 'link_prepare_created_send'; end if;
  insert into pricing_document_sends(id,company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key)
    values('50000000-0000-4000-8000-000000000001',c,d,version_id,'30000000-0000-4000-8000-000000000001','actual-template','table','staff','70000000-0000-4000-8000-000000000001',a);
  update pricing_document_share_links set send_id='50000000-0000-4000-8000-000000000001' where id='60000000-0000-4000-8000-000000000001';
  insert into integration_refs select d,version_id,published->'content',s.id,to_jsonb(s) from pricing_document_sends s where s.id='50000000-0000-4000-8000-000000000001';
end $$;

-- Nonempty down must refuse; then prove exact migration-created snapshots and send rows survive.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if (select count(*) from pricing_document_share_links)<>1 then raise exception 'nonempty_down_lost_link'; end if;
  if not exists(select from integration_refs r join pricing_document_versions v on v.id=r.version_id and v.document_id=r.document_id and v.content=r.version_content
    join pricing_document_sends s on s.id=r.send_id and to_jsonb(s)=r.send_snapshot) then raise exception 'down_changed_migrated_history'; end if;
end $$;
delete from pricing_document_share_links;
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.down.sql
\ir ../../docs/sql-drafts/20261106-09-lead-document-share.sql
do $$ begin
  if not exists(select from integration_refs r join pricing_document_versions v on v.id=r.version_id and v.content=r.version_content
    join pricing_document_sends s on s.id=r.send_id and to_jsonb(s)=r.send_snapshot) then raise exception 'empty_down_up_changed_history'; end if;
end $$;
select 'pricing_lead_share_actual_P0_P1_P2_S2_migrations_pg17_pass';
