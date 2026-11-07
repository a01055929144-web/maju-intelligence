\set ON_ERROR_STOP on
do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

drop schema if exists public cascade; create schema public;
grant usage on schema public to public;
create schema if not exists extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists dblink with schema extensions;
create table companies(id uuid primary key);
create table customer_imports(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),source text not null default 'excel',row_count integer not null default 0,status text not null default 'completed',quality_score integer not null default 0,completed_at timestamptz);
create table normalized_customers(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),import_id uuid not null references customer_imports(id),customer_name text not null,address text,phone text,business_registration_number text,normalized_key text not null,unique(company_id,id),unique(company_id,normalized_key));
create table business_permit_leads(id uuid primary key default gen_random_uuid(),company_id uuid not null references companies(id),business_name text not null,address text,phone text,source text not null default 'manual_upload',is_active boolean not null default true,matched_customer_id uuid,is_duplicate boolean not null default false,status text not null default '신규 수집',updated_at timestamptz not null default now(),unique(company_id,id));
create table product_catalog(id uuid primary key,company_id uuid not null references companies(id),sales_unit text,tax_type text,is_active boolean not null default true,unique(company_id,id));
create table pricing_documents(id uuid primary key,company_id uuid not null references companies(id),owner_key text not null,kind text not null,revision integer not null,content jsonb not null,unique(company_id,id));
create table pricing_document_versions(id uuid primary key,company_id uuid not null references companies(id),document_id uuid not null,version integer not null,revision integer not null,content jsonb not null,published_at timestamptz not null default now(),unique(company_id,document_id,version),unique(company_id,document_id,revision),foreign key(company_id,document_id) references pricing_documents(company_id,id));
create unique index pricing_document_versions_company_id_id_uq on pricing_document_versions(company_id,id);
create table customer_price_agreements(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,product_catalog_id uuid not null,sales_unit text not null,unit_price bigint not null,tax_type text not null,unique(company_id,id));
alter table customer_price_agreements add column price_includes_tax boolean not null default false, add column effective_from date not null default current_date, add column effective_until date, add column status text not null default 'active', add column created_by_name text, add column ended_at timestamptz, add column updated_at timestamptz not null default now();
create table storefront_links(id uuid primary key default gen_random_uuid(),company_id uuid not null,customer_id uuid not null,document_version_id uuid not null,token_nonce text,token_hash text,expires_at timestamptz,issued_by_user_id uuid,revoked_at timestamptz,can_order boolean not null default true,unique(company_id,id));
create table store_orders(id uuid primary key default gen_random_uuid(),company_id uuid not null,unique(company_id,id));
create table store_order_settings(company_id uuid primary key references companies(id));

\ir 20261102-S2-sales-to-order-acceptance.sql

-- Production P2 already owns this RPC. The fixture keeps only its reuse/idempotency contract.
create function issue_storefront_links(p_company uuid,p_document_version uuid,p_links jsonb,p_expires_at timestamptz,p_actor_user_id uuid default null,p_actor_key text default null)
returns table(issued_customer_id uuid,issued_link_id uuid,issued_token_nonce text,issued_token_hash text,was_created boolean)
language plpgsql security definer set search_path=public,pg_temp as $$
declare x jsonb; c uuid; existing storefront_links%rowtype;
begin
  perform 1 from companies where id=p_company for update;
  x:=p_links->0; c:=(x->>'customerId')::uuid;
  if not exists(select from normalized_customers where company_id=p_company and id=c) then raise exception 'cross_company_customer'; end if;
  select * into existing from storefront_links where company_id=p_company and customer_id=c and document_version_id=p_document_version and revoked_at is null and expires_at>now();
  if found then return query select c,existing.id,existing.token_nonce,existing.token_hash,false; return; end if;
  insert into storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at,issued_by_user_id,can_order)
  values((x->>'id')::uuid,p_company,c,p_document_version,x->>'nonce',x->>'hash',p_expires_at,p_actor_user_id,false)
  returning storefront_links.id into existing.id;
  return query select c,existing.id,x->>'nonce',x->>'hash',true;
end $$;

\ir 20261108-S2-acceptance-order-link.sql

insert into companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into customer_imports(id,company_id) values('90000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into normalized_customers(id,company_id,import_id,customer_name,normalized_key) values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','existing','existing');
insert into business_permit_leads values('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','ambiguous shop');
insert into product_catalog values('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','BOX','taxable',true);
insert into pricing_documents values('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('a',64),'sheet',1,'{}');
insert into pricing_documents values('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001',repeat('c',64),'quote',1,'{}');
-- 작성 중 문서는 pricing_documents에 저장되며 게시 검증 트리거 대상이 아니다.
insert into pricing_documents values('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001',repeat('b',64),'sheet',1,'{"lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","taxType":"unknown"}]}');

do $$ begin
  begin
    insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values('50000000-0000-4000-8000-000000000009','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',9,9,'{"lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"EA","taxType":"taxable"}]}');
    raise exception 'unit validation did not fail';
  exception when others then if sqlerrm='unit validation did not fail' then raise; end if; end;
end $$;
do $$ begin
  begin
    insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values('50000000-0000-4000-8000-000000000008','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003',8,8,'{"lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","taxType":"taxable"},{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","taxType":"taxable"}]}');
    raise exception 'duplicate product validation did not fail';
  exception when others then if sqlerrm='duplicate product validation did not fail' then raise; end if; end;
end $$;
insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',1,1,'{"kind":"sheet","validUntil":"2099-12-31","lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","taxType":"taxable"}]}');

insert into pricing_document_sends(company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key)
values('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','sheet-v1','table','kakao','60000000-0000-4000-8000-000000000001','staff:1');
do $$ begin
  begin
    insert into pricing_document_sends(company_id,document_id,document_version_id,lead_id,customer_id,template_id,layout,channel,idempotency_key,sent_by_key)
    values('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','bad','table','link','60000000-0000-4000-8000-000000000002','staff:1');
    raise exception 'send xor did not fail';
  exception when check_violation then null; end;
end $$;

do $$ declare a jsonb; b jsonb; begin
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',repeat('f',64),'kakao_login','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,true,'ambiguous_lead_match',null,'{"deliveryDropLocation":"rear door"}');
  b:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000001',repeat('f',64),'kakao_login','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,true,'ambiguous_lead_match',null,'{"deliveryDropLocation":"rear door"}');
  if a<>b or a->>'needsReview'<>'true' then raise exception 'acceptance idempotency/review failed'; end if;
end $$;

insert into business_permit_leads(id,company_id,business_name,address,phone) values
('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','same one','A','01012345678'),
('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','same two','B','01012345678');
do $$ declare a jsonb; begin
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000002',repeat('e',64),'kakao_start','10000000-0000-4000-8000-000000000001',null,null,false,null,null,'{"businessName":"ambiguous","phone":"010-1234-5678","address":"C"}');
  if a->>'needsReview'<>'true' or a->>'leadId' is not null then raise exception 'ambiguous lead did not continue for review'; end if;
end $$;

-- 기존 리드가 다른 거래처에 연결돼도 예외 대신 검토 표시로 수락을 계속한다.
insert into normalized_customers(id,company_id,import_id,customer_name,normalized_key)
values('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','second','second');
do $$ declare a jsonb; begin
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000004',repeat('c',64),'staff','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',null,false,null,null,'{}');
  if a->>'needsReview'<>'true' or (select matched_customer_id from business_permit_leads where id='20000000-0000-4000-8000-000000000001')<>'10000000-0000-4000-8000-000000000001' then raise exception 'lead mismatch review boundary failed'; end if;
end $$;

-- 거래처 후보가 여러 개면 신규 거래처·가격 연결·주문 활성화를 만들지 않는다.
insert into normalized_customers(id,company_id,import_id,customer_name,address,phone,normalized_key) values
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','duplicate shop','same address','01077776666','dup-1'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','duplicate shop','same address','01077776666','dup-2');
insert into storefront_links(id,company_id,customer_id,document_version_id,can_order) values('80000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000001',false);
do $$ declare a jsonb; before_count integer; begin
  select count(*) into before_count from normalized_customers;
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000005',repeat('b',64),'store',null,null,null,false,null,'80000000-0000-4000-8000-000000000001','{"businessName":"duplicate shop","phone":"010-7777-6666","address":"same address"}');
  if a->>'needsReview'<>'true' or a->>'customerId' is not null or a->>'orderEnabled'<>'false' then raise exception 'ambiguous customer was not held'; end if;
  if (select count(*) from normalized_customers)<>before_count or (select can_order from storefront_links where id='80000000-0000-4000-8000-000000000001') then raise exception 'ambiguous customer created or activated order'; end if;
end $$;

-- 만료 게시본은 수락할 수 없다.
insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values('50000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001',7,7,'{"kind":"sheet","validUntil":"2000-01-01","lines":[{"visible":true,"productId":"30000000-0000-4000-8000-000000000001","unit":"BOX","taxType":"taxable"}]}');
do $$ begin
  begin
    perform record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000007','70000000-0000-4000-8000-000000000006',repeat('a',64),'store','10000000-0000-4000-8000-000000000001',null,null,false,null,null,'{}');
    raise exception 'expired document was accepted';
  exception when others then if sqlerrm='expired document was accepted' then raise; end if; end;
end $$;

-- 동시 같은 멱등 키는 unique 오류를 노출하지 않고 한 저장 결과로 수렴한다.
create function public.test_s2_delay_remote() returns trigger language plpgsql as $$ begin if current_setting('application_name')='idem_remote' and new.idempotency_key='70000000-0000-4000-8000-000000000007' then perform pg_sleep(1); end if; return new; end $$;
create trigger test_s2_delay_remote before insert on pricing_document_acceptance_requests for each row execute function public.test_s2_delay_remote();
create temporary table test_s2_concurrent_results(source text primary key,result jsonb not null);
select extensions.dblink_connect('idem','dbname='||current_database()||' user='||current_user||' application_name=idem_remote');
select extensions.dblink_send_query('idem',$q$select record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007',repeat('9',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,null,'{}')$q$);
select pg_sleep(0.1);
insert into test_s2_concurrent_results values('local',record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000007',repeat('9',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,null,'{}'));
insert into test_s2_concurrent_results select 'remote',result from extensions.dblink_get_result('idem') as t(result jsonb);
select extensions.dblink_disconnect('idem');
drop trigger test_s2_delay_remote on pricing_document_acceptance_requests;
drop function public.test_s2_delay_remote();
do $$ begin
  if (select count(*) from pricing_document_acceptance_requests where idempotency_key='70000000-0000-4000-8000-000000000007')<>1 then raise exception 'concurrent idempotency duplicated'; end if;
  if (select count(*) from test_s2_concurrent_results)<>2 or (select count(distinct result::text) from test_s2_concurrent_results)<>1 then raise exception 'concurrent idempotency result mismatch'; end if;
end $$;
do $$ declare a jsonb; begin
  a:=record_pricing_document_acceptance('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000003',repeat('d',64),'store',null,null,null,false,null,null,'{"businessName":"new shop","phone":"010-9999-8888","address":"new address","deliveryDropLocation":"side door"}');
  if a->>'customerId' is null or a->>'leadId' is null then raise exception 'new lead/customer conversion failed'; end if;
  if not exists(select from customer_imports where company_id='00000000-0000-4000-8000-000000000001' and source='pricing_acceptance') then raise exception 'acceptance import audit missing'; end if;
end $$;

do $$ declare h text:=repeat('a',64); begin
  if pricing_s2_public_request_guard('00000000-0000-4000-8000-000000000001','accept',h,'{}',1)<>'allowed' then raise exception 'guard allow failed'; end if;
  if pricing_s2_public_request_guard('00000000-0000-4000-8000-000000000001','accept',h,'{}',1)<>'rate_limited' then raise exception 'guard rate failed'; end if;
  if not exists(select from pricing_public_request_audit where outcome='rate_limited') then raise exception 'rate audit missing'; end if;
end $$;

do $$ begin
  if has_table_privilege('anon','pricing_document_sends','select') or has_table_privilege('authenticated','store_accounts','select') then raise exception 'direct access leaked'; end if;
  if has_function_privilege('anon','record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb)','execute') then raise exception 'rpc access leaked'; end if;
end $$;

update normalized_customers set delivery_drop_location='rear door' where id='10000000-0000-4000-8000-000000000001';
do $$ begin if (select delivery_drop_location from normalized_customers where id='10000000-0000-4000-8000-000000000001')<>'rear door' then raise exception 'delivery drop location missing'; end if; end $$;

insert into store_order_settings values('00000000-0000-4000-8000-000000000001');

-- Existing customer and retry converge on one acceptance and one active order link.
do $$ declare a jsonb; b jsonb; begin
  a:=accept_pricing_document_and_issue_storefront_link('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000010',repeat('1',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,'{}','81000000-0000-4000-8000-000000000001',repeat('1',32),repeat('2',64),now()+interval '1 year');
  update storefront_links set revoked_at=now() where id=(a->>'storefrontLinkId')::uuid;
  b:=accept_pricing_document_and_issue_storefront_link('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000010',repeat('1',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,'{}','81000000-0000-4000-8000-000000000002',repeat('3',32),repeat('4',64),now()+interval '1 year');
  if a<>b or a->>'orderEnabled'<>'true' or a->>'storefrontLinkId' is null then raise exception 'existing customer order link retry failed'; end if;
  if (select count(*) from storefront_links where acceptance_request_id is not null and customer_id='10000000-0000-4000-8000-000000000001')<>1 then raise exception 'retry duplicated storefront link'; end if;
  if exists(select from storefront_links where id='81000000-0000-4000-8000-000000000002') then raise exception 'revoked link retry reissued storefront link'; end if;
end $$;

-- New customer creates one customer and receives the same reusable P2 link contract.
do $$ declare a jsonb; begin
  a:=accept_pricing_document_and_issue_storefront_link('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000011',repeat('5',64),'kakao_start',null,null,null,false,null,'{"businessName":"brand new","phone":"010-5555-6666","address":"new road"}','81000000-0000-4000-8000-000000000003',repeat('5',32),repeat('6',64),now()+interval '1 year');
  if a->>'customerId' is null or a->>'orderEnabled'<>'true' or a->>'storefrontLinkId' is null then raise exception 'new customer order link failed'; end if;
end $$;

-- Ambiguous customer stays review-only and cannot receive an order link.
do $$ declare a jsonb; before_links integer; begin
  select count(*) into before_links from storefront_links;
  a:=accept_pricing_document_and_issue_storefront_link('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000012',repeat('7',64),'store',null,null,null,false,null,'{"businessName":"duplicate shop","phone":"010-7777-6666","address":"same address"}','81000000-0000-4000-8000-000000000004',repeat('7',32),repeat('8',64),now()+interval '1 year');
  if a->>'needsReview'<>'true' or a->>'orderEnabled'<>'false' or a->>'storefrontLinkId' is not null then raise exception 'ambiguous customer order boundary failed'; end if;
  if (select count(*) from storefront_links)<>before_links then raise exception 'ambiguous customer received link'; end if;
end $$;

-- Cross-company customer references are rejected before link issuance.
insert into customer_imports(id,company_id) values('90000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002');
insert into normalized_customers(id,company_id,import_id,customer_name,normalized_key) values('10000000-0000-4000-8000-000000000099','00000000-0000-4000-8000-000000000002','90000000-0000-4000-8000-000000000002','other','other');
do $$ begin
  begin
    perform accept_pricing_document_and_issue_storefront_link('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000014',repeat('a',64),'staff','10000000-0000-4000-8000-000000000099',null,null,false,null,'{}','81000000-0000-4000-8000-000000000006',repeat('b',32),repeat('c',64),now()+interval '1 year');
    raise exception 'cross-company acceptance was allowed';
  exception when others then if sqlerrm='cross-company acceptance was allowed' then raise; end if; end;
end $$;

-- Order setup absence is part of the stored idempotent result; later setup cannot mutate the same request.
delete from store_order_settings where company_id='00000000-0000-4000-8000-000000000001';
do $$ declare a jsonb; b jsonb; begin
  a:=accept_pricing_document_and_issue_storefront_link('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000015',repeat('d',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,'{}','81000000-0000-4000-8000-000000000007',repeat('d',32),repeat('e',64),now()+interval '1 year');
  insert into store_order_settings values('00000000-0000-4000-8000-000000000001');
  b:=accept_pricing_document_and_issue_storefront_link('00000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','70000000-0000-4000-8000-000000000015',repeat('d',64),'staff','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',null,false,null,'{}','81000000-0000-4000-8000-000000000008',repeat('f',32),repeat('f',64),now()+interval '1 year');
  if a<>b or a->>'orderEnabled'<>'false' or a->>'orderSetupRequired'<>'true' then raise exception 'order setup retry changed stored result'; end if;
  if exists(select from storefront_links where id in('81000000-0000-4000-8000-000000000007','81000000-0000-4000-8000-000000000008')) then raise exception 'order setup retry issued storefront link'; end if;
end $$;

select 'S2 sales-to-order acceptance PG17 checks passed' as result;

-- send/audit 등 어떤 신규 이력이라도 있으면 down은 전체 롤백되어야 한다.
\set ON_ERROR_STOP off
\ir 20261102-S2-sales-to-order-acceptance.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if to_regclass('public.pricing_document_sends') is null then raise exception 'destructive down was not refused'; end if;
end $$;
