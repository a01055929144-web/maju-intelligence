\set ON_ERROR_STOP on
-- Disposable loopback CI PG17 only. Exact P0/P1/P2/S2 migrations, synthetic surrounding tables.
do $$ begin if current_database() !~ '^store_member_order_test' then raise exception 'disposable_member_order_database_required'; end if; end $$;
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
\ir ../../supabase/migrations/20261102140834_store_account_manager_role_20261103.sql
create table public.app_users(id uuid primary key,status text not null);
grant select,update on public.app_users to service_role;
-- Synthetic surrounding tables reproduce their existing invoker read grants.
grant select on public.normalized_customers,public.customer_price_agreements to service_role;
create temporary table legacy_order_definition as
  select p.oid function_oid,p.proacl acl,md5(pg_get_functiondef(p.oid)) definition_hash
    from pg_proc p where p.oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure;
\ir ../../docs/sql-drafts/20261108-09-store-member-order.sql

-- Empty down/up is reversible; the legacy order RPC is preserved throughout.
\ir ../../docs/sql-drafts/20261108-09-store-member-order.down.sql
\ir ../../docs/sql-drafts/20261108-09-store-member-order.sql
insert into companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into delivery_territories values('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001');
insert into normalized_customers(id,company_id,customer_name,delivery_territory_id) values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic store','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','other store',null),
 ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','other company store',null);
insert into app_users values('50000000-0000-4000-8000-000000000001','active'),('50000000-0000-4000-8000-000000000002','active'),('50000000-0000-4000-8000-000000000003','active');
insert into store_accounts(id,company_id,customer_id,business_registration_number,business_status,business_status_verified_at,verification_request_id,terms_version,terms_accepted_at,status) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','1234567890','active',now(),'synthetic','v1',now(),'active'),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','2234567890','active',now(),'synthetic','v1',now(),'active'),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','3234567890','active',now(),'synthetic','v1',now(),'active');
insert into store_account_members(id,company_id,store_account_id,auth_user_id,role,status) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001','owner','active'),
 ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002','owner','active'),
 ('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','owner','active'),
 ('40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','staff','active');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price,sales_unit,tax_type) values
 ('60000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','synthetic',800,'BOX','exempt');
insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values
 ('70000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001',repeat('b',64),'sheet',1,
 '{"kind":"sheet","title":"synthetic","companyName":"synthetic","validUntil":"2099-12-31","showPrice":true,"theme":"blue","layout":"table","lines":[{"productId":"60000000-0000-4000-8000-000000000001","displayName":"snapshot product","spec":"snapshot spec","unit":"BOX","price":1200,"taxType":"exempt","visible":true}]}');
insert into pricing_document_versions(id,company_id,document_id,version,revision,content)
 select '80000000-0000-4000-8000-000000000001',company_id,id,1,1,content from pricing_documents;
insert into store_order_settings(company_id,cutoff_days_before) values('00000000-0000-4000-8000-000000000001',0);
insert into store_order_territory_rules(company_id,territory_id,delivery_weekdays) values
 ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',array[0,1,2,3,4,5,6]::smallint[]);
insert into storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at) values
 ('90000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001',repeat('a',32),repeat('a',64),'2099-12-31');
create function public.member_order_test_call(a uuid default '30000000-0000-4000-8000-000000000001',m uuid default '40000000-0000-4000-8000-000000000001',u uuid default '50000000-0000-4000-8000-000000000001',k uuid default gen_random_uuid()) returns jsonb language sql security invoker as $$
 select place_store_member_order(repeat('a',64),'2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',k,null,null,'',a,m,u);
$$;
create function public.member_order_test_reject(a uuid,m uuid,u uuid,expected text default 'Store member unavailable') returns void language plpgsql as $$
begin
 begin perform member_order_test_call(a,m,u); raise exception 'unexpected_member_order_allowed';
 exception when raise_exception then if sqlerrm<>expected then raise; end if; end;
end $$;
grant execute on function member_order_test_call(uuid,uuid,uuid,uuid),member_order_test_reject(uuid,uuid,uuid,text) to service_role;
do $$ begin
 if to_regprocedure('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)') is null then raise exception 'legacy_order_rpc_missing'; end if;
 if to_regprocedure('public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)') is null then raise exception 'member_order_rpc_missing'; end if;
 if (select definition_hash from legacy_order_definition) is distinct from
    md5(pg_get_functiondef('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure))
    then raise exception 'legacy_order_rpc_changed'; end if;
 if (select function_oid from legacy_order_definition) is distinct from 'public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure::oid
 or (select acl from legacy_order_definition) is distinct from (select proacl from pg_proc where oid='public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)'::regprocedure) then raise exception 'legacy_order_identity_or_privileges_changed'; end if;
 if has_function_privilege('anon','public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)','execute')
 or has_function_privilege('authenticated','public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)','execute') then raise exception 'public_rpc_execution'; end if;
end $$;
set role service_role;
-- The unchanged seven-argument RPC still accepts its existing link order and leaves actor fields null.
do $$ declare r jsonb; begin
 r:=place_store_order(repeat('a',64),'2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',gen_random_uuid(),null,null,'legacy compatibility');
 if not exists(select from store_orders where id=(r->>'id')::uuid and store_account_id is null and ordered_by_member_id is null and known_total=1200) then raise exception 'legacy_order_compatibility_lost'; end if;
 delete from store_order_requests where order_id=(r->>'id')::uuid;
 delete from store_order_lines where order_id=(r->>'id')::uuid;
 delete from store_orders where id=(r->>'id')::uuid;
end $$;
select 'legacy_seven_argument_rpc_unchanged_and_callable_pg17_pass';
-- Missing member, wrong store, other company, and forged user cannot write.
select member_order_test_reject(null,null,null);
select member_order_test_reject('30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','50000000-0000-4000-8000-000000000002');
select member_order_test_reject('30000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003');
select member_order_test_reject('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002');
do $$ declare r jsonb; role_name text; begin
 if exists(select from store_orders) or exists(select from store_order_requests) then raise exception 'unauthorized_order_written'; end if;
 foreach role_name in array array['owner','manager','staff'] loop
  update store_account_members set role=role_name where id='40000000-0000-4000-8000-000000000001';
  r:=member_order_test_call();
  if not exists(select from store_orders where id=(r->>'id')::uuid and store_account_id='30000000-0000-4000-8000-000000000001' and ordered_by_member_id='40000000-0000-4000-8000-000000000001') then raise exception 'member_audit_missing'; end if;
 end loop;
 r:=member_order_test_call(k=>'a0000000-0000-4000-8000-000000000001');
 if r is distinct from member_order_test_call(k=>'a0000000-0000-4000-8000-000000000001') then raise exception 'retry_result_changed'; end if;
 if (select count(*) from store_orders)<>4 or (select count(*) from store_order_lines)<>4 or (select count(*) from store_order_requests)<>4 then raise exception 'retry_duplicated_order'; end if;
 if exists(select from store_order_lines where product_name<>'snapshot product' or specification<>'snapshot spec' or sales_unit<>'BOX' or unit_price<>1200 or tax_type<>'exempt') then raise exception 'snapshot_changed'; end if;
 begin
  perform member_order_test_call(m=>'40000000-0000-4000-8000-000000000004',u=>'50000000-0000-4000-8000-000000000002',k=>'a0000000-0000-4000-8000-000000000001');
  raise exception 'other_member_reused_key';
 exception when raise_exception then if sqlerrm<>'Idempotency conflict' then raise; end if; end;
 -- Another active member may edit this store's order; the original author is preserved.
 perform place_store_member_order(repeat('a',64),'2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":2}]',
  gen_random_uuid(),(r->>'id')::uuid,1,'','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','50000000-0000-4000-8000-000000000002');
 if not exists(select from store_orders where id=(r->>'id')::uuid and revision=2 and ordered_by_member_id='40000000-0000-4000-8000-000000000001') then raise exception 'edit_reassigned_author'; end if;
 insert into store_orders(id,company_id,customer_id,link_id,document_version_id,delivery_date,idempotency_key)
 values('b0000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001','80000000-0000-4000-8000-000000000001','2099-01-05',gen_random_uuid());
 begin
  perform place_store_member_order(repeat('a',64),'2099-01-05','[{"productId":"60000000-0000-4000-8000-000000000001","quantity":1}]',
   gen_random_uuid(),'b0000000-0000-4000-8000-000000000001',1,'','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
  raise exception 'legacy_order_silently_attributed';
 exception when raise_exception then if sqlerrm<>'Order cannot be edited' then raise; end if; end;
 delete from store_orders where id='b0000000-0000-4000-8000-000000000001' and ordered_by_member_id is null;


 update store_account_members set status='removed',removed_at=now() where id='40000000-0000-4000-8000-000000000001';
 begin perform member_order_test_call(k=>'a0000000-0000-4000-8000-000000000001'); raise exception 'removed_member_replay_allowed';
 exception when raise_exception then if sqlerrm<>'Store member unavailable' then raise; end if; end;
 update store_account_members set status='invited',removed_at=null where id='40000000-0000-4000-8000-000000000001';
 perform member_order_test_reject('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 update store_account_members set status='active',role='owner' where id='40000000-0000-4000-8000-000000000001';
 update store_accounts set status='suspended' where id='30000000-0000-4000-8000-000000000001';
 perform member_order_test_reject('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 update store_accounts set status='active',business_status='closed' where id='30000000-0000-4000-8000-000000000001';
 perform member_order_test_reject('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 update store_accounts set business_status='active' where id='30000000-0000-4000-8000-000000000001';
 update app_users set status='suspended' where id='50000000-0000-4000-8000-000000000001';
 perform member_order_test_reject('30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');
 update app_users set status='active' where id='50000000-0000-4000-8000-000000000001';
 if (select count(*) from store_orders)<>4 then raise exception 'denied_request_changed_orders'; end if;
end $$;
reset role;
-- Leave a clean synthetic fixture for the two-connection race script.
delete from store_order_requests; delete from store_order_lines; delete from store_orders;
select 'store_member_order_pg17_pass';
