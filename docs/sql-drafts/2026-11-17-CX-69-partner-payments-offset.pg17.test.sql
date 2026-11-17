\set ON_ERROR_STOP on
drop schema if exists public cascade; create schema public;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.normalized_customers(id uuid,company_id uuid,business_registration_number text,primary key(company_id,id));
create table public.product_suppliers(id uuid,company_id uuid,business_number text,linked_customer_id uuid,primary key(company_id,id));
create table public.business_documents(id uuid,company_id uuid,status text,customer_id uuid,supplier_id uuid,primary key(company_id,id));
create table public.partner_ledger_entries(id uuid primary key default gen_random_uuid(),company_id uuid,partner_type text,customer_id uuid,supplier_id uuid,entry_date date,entry_type text,amount bigint,supply_amount bigint default 0,tax_amount bigint default 0,source_document_id uuid,payment_method text,idempotency_key text,reverses_entry_id uuid,memo text,created_by_user_id uuid,created_by_name text,created_at timestamptz default now(),unique(company_id,idempotency_key));
create table public.business_document_payment_allocations(id uuid primary key default gen_random_uuid(),company_id uuid,document_id uuid,ledger_entry_id uuid,allocated_amount bigint,created_by_user_id uuid,created_by_name text);

\ir 2026-11-17-CX-69-partner-payments-offset.sql

insert into public.normalized_customers values('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','1234567890','001');
insert into public.product_suppliers values('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','1234567890','00000000-0000-0000-0000-0000000000a1','001');
insert into public.business_documents values('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','confirmed','00000000-0000-0000-0000-0000000000a1',null);
insert into public.partner_ledger_entries(company_id,partner_type,customer_id,entry_date,entry_type,amount,idempotency_key,created_by_name) values('00000000-0000-0000-0000-0000000000c1','customer','00000000-0000-0000-0000-0000000000a1',current_date,'sale',5000,'sale-1','PG17');
insert into public.partner_ledger_entries(company_id,partner_type,supplier_id,entry_date,entry_type,amount,idempotency_key,created_by_name) values('00000000-0000-0000-0000-0000000000c1','supplier','00000000-0000-0000-0000-0000000000b1',current_date,'purchase',4000,'purchase-1','PG17');

select public.record_partner_payment_v2('00000000-0000-0000-0000-0000000000c1','customer','00000000-0000-0000-0000-0000000000a1',current_date,1000,'bank','pay-1',null,'PG17','연결 입금','00000000-0000-0000-0000-0000000000d1');
select public.record_partner_payment_v2('00000000-0000-0000-0000-0000000000c1','customer','00000000-0000-0000-0000-0000000000a1',current_date,1000,'bank','pay-1',null,'PG17','연결 입금','00000000-0000-0000-0000-0000000000d1');
do $$ begin assert (select count(*) from public.partner_ledger_entries where idempotency_key='pay-1')=1; assert (select count(*) from public.business_document_payment_allocations)=1; end $$;
do $$ begin begin perform public.record_partner_payment_v2('00000000-0000-0000-0000-0000000000c1','customer','00000000-0000-0000-0000-0000000000a1',current_date,1001,'bank','pay-1',null,'PG17',null,null); raise exception 'expected conflict'; exception when others then assert sqlerrm='payment idempotency conflict',sqlerrm; end; end $$;

select public.reverse_partner_payment_v1('00000000-0000-0000-0000-0000000000c1',(select id from public.partner_ledger_entries where idempotency_key='pay-1'),'입금 취소','reverse-1',null,'PG17');
do $$ begin assert (select count(*) from public.partner_ledger_entries where reverses_entry_id=(select id from public.partner_ledger_entries where idempotency_key='pay-1'))=1; assert (select count(*) from public.business_document_payment_allocations)=0; end $$;

select public.offset_dual_partner_balance_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1',current_date,2000,'겸업 상계','offset-1',null,'PG17');
select public.offset_dual_partner_balance_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1',current_date,2000,'겸업 상계','offset-1',null,'PG17');
do $$ begin assert (select count(*) from public.partner_ledger_entries where idempotency_key like 'offset-1:%')=2; end $$;

do $$ begin begin perform public.offset_dual_partner_balance_v1('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000b1',current_date,9999,'초과','offset-2',null,'PG17'); raise exception 'expected balance guard'; exception when others then assert sqlerrm='offset exceeds partner balance',sqlerrm; end; end $$;
do $$ begin assert not has_function_privilege('anon','public.record_partner_payment_v2(uuid,text,uuid,date,bigint,text,text,uuid,text,text,uuid)','execute'); assert not has_function_privilege('authenticated','public.offset_dual_partner_balance_v1(uuid,uuid,uuid,date,bigint,text,text,uuid,text)','execute'); end $$;

\ir 2026-11-17-CX-69-partner-payments-offset.down.sql
do $$ begin assert to_regprocedure('public.record_partner_payment_v2(uuid,text,uuid,date,bigint,text,text,uuid,text,text,uuid)') is null; end $$;
\ir 2026-11-17-CX-69-partner-payments-offset.sql
do $$ begin assert to_regprocedure('public.reverse_partner_payment_v1(uuid,uuid,text,text,uuid,text)') is not null; end $$;
