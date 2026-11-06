\set ON_ERROR_STOP on

do $$ begin
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;

drop schema if exists public cascade;
create schema public;
grant usage on schema public to public, anon, authenticated, service_role;
create extension if not exists pgcrypto;

create table public.companies(id uuid primary key);
create table public.normalized_customers(
  id uuid primary key, company_id uuid not null references public.companies(id),
  customer_name text not null, business_registration_number text, representative_name text,
  address text, phone text, unique(company_id,id)
);
create table public.store_orders(
  id uuid primary key, company_id uuid not null references public.companies(id), customer_id uuid not null,
  delivery_date date not null, status text not null, taxable_supply bigint not null,
  exempt_supply bigint not null, tax_amount bigint not null, delivery_fee bigint not null,
  known_total bigint not null, has_market_price boolean not null, request_memo text not null default '',
  unique(company_id,id), foreign key(company_id,customer_id) references public.normalized_customers(company_id,id)
);
create table public.store_order_lines(
  id uuid primary key, company_id uuid not null, order_id uuid not null, product_id uuid not null,
  product_name text not null, specification text not null default '', sales_unit text not null,
  quantity numeric(14,3) not null, unit_price bigint, tax_type text not null,
  price_includes_tax boolean not null default false, is_market_price boolean not null default false,
  supply_amount bigint generated always as (case when unit_price is null then null else round(quantity*unit_price)::bigint end) stored,
  tax_amount bigint generated always as (case when unit_price is null then null when tax_type='taxable' then round(round(quantity*unit_price)*0.1)::bigint else 0 end) stored,
  total_amount bigint generated always as (case when unit_price is null then null else round(quantity*unit_price)::bigint + case when tax_type='taxable' then round(round(quantity*unit_price)*0.1)::bigint else 0 end end) stored,
  foreign key(company_id,order_id) references public.store_orders(company_id,id)
);
create table public.business_documents(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_type text not null,
  document_number text not null, document_date date not null, status text not null, customer_id uuid,
  partner_name_snapshot text not null, partner_business_number_snapshot text,
  partner_representative_snapshot text, partner_address_snapshot text, partner_contact_snapshot text,
  source_type text not null, source_id uuid, source_key text, taxable_supply_amount bigint not null default 0,
  exempt_supply_amount bigint not null default 0, tax_amount bigint not null default 0,
  total_amount bigint not null default 0, memo text, created_by_user_id uuid, created_by_name text not null,
  unique(company_id,id)
);
create unique index business_documents_source_key_uq
  on public.business_documents(company_id,source_type,source_key) where source_key is not null;
create table public.business_document_lines(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_id uuid not null,
  product_catalog_id uuid, product_name text not null, specification text, unit text not null,
  tax_type text not null, quantity numeric(14,3) not null, unit_price bigint not null,
  supply_amount bigint not null, tax_amount bigint not null, total_amount bigint not null
);
create table public.partner_ledger_entries(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, source_document_id uuid
);

create function public.next_erp_number(uuid,text,date) returns text
language sql as $$ select 'S-2026-000001' $$;
create function public.save_business_document(uuid,uuid,uuid,date,text,jsonb,uuid,text,text)
returns public.business_documents language plpgsql as $$
declare v public.business_documents%rowtype;
begin
  insert into public.business_document_lines(company_id,document_id,product_catalog_id,product_name,specification,unit,tax_type,quantity,unit_price,supply_amount,tax_amount,total_amount)
  select $1,$2,(x->>'product_catalog_id')::uuid,x->>'product_name',x->>'specification',x->>'unit',x->>'tax_type',
    (x->>'quantity')::numeric,(x->>'unit_price')::bigint,
    round((x->>'quantity')::numeric*(x->>'unit_price')::bigint)::bigint,
    case when x->>'tax_type'='taxable' then round(round((x->>'quantity')::numeric*(x->>'unit_price')::bigint)*0.1)::bigint else 0 end,
    round((x->>'quantity')::numeric*(x->>'unit_price')::bigint)::bigint + case when x->>'tax_type'='taxable' then round(round((x->>'quantity')::numeric*(x->>'unit_price')::bigint)*0.1)::bigint else 0 end
  from jsonb_array_elements($6) x;
  update public.business_documents d set
    taxable_supply_amount=(select coalesce(sum(supply_amount),0) from public.business_document_lines where document_id=d.id and tax_type='taxable'),
    exempt_supply_amount=(select coalesce(sum(supply_amount),0) from public.business_document_lines where document_id=d.id and tax_type='exempt'),
    tax_amount=(select coalesce(sum(tax_amount),0) from public.business_document_lines where document_id=d.id),
    total_amount=(select coalesce(sum(total_amount),0) from public.business_document_lines where document_id=d.id), memo=$5
  where d.company_id=$1 and d.id=$2 returning * into v;
  return v;
end $$;

\ir 20261106-store-order-to-sales-ledger.sql

insert into public.companies values
 ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.normalized_customers(id,company_id,customer_name) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','alpha');
insert into public.store_orders values
 ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-11-06','submitted',1000,0,100,0,1100,false,''),
 ('20000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-11-06','submitted',1000,0,100,100,1200,false,''),
 ('20000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-11-06','cancelled',1000,0,100,0,1100,false,'');
insert into public.store_order_lines(id,company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable'),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable'),
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000001','item','BOX',1,1000,'taxable');

do $$ declare a jsonb; b jsonb; begin
  a:=public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester');
  b:=public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester');
  if a->>'alreadyCreated'<>'false' or b->>'alreadyCreated'<>'true' or a->>'salesDocumentId'<>b->>'salesDocumentId' then raise exception 'idempotency failed'; end if;
  if (select count(*) from public.business_documents)<>1 or exists(select 1 from public.partner_ledger_entries) then raise exception 'draft/ledger boundary failed'; end if;
end $$;

do $$ begin
  begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001',gen_random_uuid(),'tester'); raise exception 'cross-company accepted';
  exception when others then if sqlerrm='cross-company accepted' then raise; end if; end;
  begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002',gen_random_uuid(),'tester'); raise exception 'delivery fee accepted';
  exception when others then if sqlerrm='delivery fee accepted' then raise; end if; end;
  begin perform public.create_sales_document_from_store_order('00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',gen_random_uuid(),'tester'); raise exception 'cancelled order accepted';
  exception when others then if sqlerrm='cancelled order accepted' then raise; end if; end;
end $$;

do $$ begin
  if has_function_privilege('anon','public.create_sales_document_from_store_order(uuid,uuid,uuid,text)','execute') then raise exception 'anon can execute'; end if;
  if has_function_privilege('authenticated','public.create_sales_document_from_store_order(uuid,uuid,uuid,text)','execute') then raise exception 'authenticated can execute'; end if;
  if not has_function_privilege('service_role','public.create_sales_document_from_store_order(uuid,uuid,uuid,text)','execute') then raise exception 'service role cannot execute'; end if;
end $$;

\ir 20261106-store-order-to-sales-ledger.down.sql
do $$ begin
  if to_regprocedure('public.create_sales_document_from_store_order(uuid,uuid,uuid,text)') is not null then raise exception 'down left function'; end if;
  if (select count(*) from public.business_documents)<>1 then raise exception 'down removed documents'; end if;
end $$;
