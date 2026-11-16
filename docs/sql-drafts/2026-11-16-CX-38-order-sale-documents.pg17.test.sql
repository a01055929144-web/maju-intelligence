-- Disposable PostgreSQL 17 fixture only. Never run against production.
\set ON_ERROR_STOP on
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create extension if not exists pgcrypto;

create table companies(id uuid primary key);
create table normalized_customers(
  id uuid primary key, company_id uuid not null, customer_name text, business_registration_number text,
  representative_name text, address text, phone text, unique(company_id,id));
create table product_catalog(
  id uuid primary key, company_id uuid not null, product_code text, purchase_price numeric,
  unique(company_id,id));
create table pricing_effective_source(
  company_id uuid, product_id uuid, cost numeric, effective_margin_bp integer, effective_rounding integer,
  primary key(company_id,product_id));
create view pricing_p0_effective as select *, 0::bigint as price from pricing_effective_source;
create function pricing_p0_price(cost numeric, bp integer, rounding integer, direct_price bigint default null)
returns bigint language sql immutable as $$
  select coalesce(direct_price, (ceil(cost * (10000 + bp) / 10000 / rounding) * rounding)::bigint)
$$;
create table store_accounts(
  id uuid primary key, company_id uuid not null, customer_id uuid not null, unique(company_id,id));
create table store_account_members(
  id uuid primary key, company_id uuid not null, store_account_id uuid not null, auth_user_id uuid,
  status text not null, unique(company_id,store_account_id,id));
create table store_orders(
  id uuid primary key, company_id uuid not null, customer_id uuid not null, delivery_date date not null,
  status text not null, delivery_fee bigint not null default 0, request_memo text not null default '',
  revision integer not null default 1, unique(company_id,id));
create table store_order_lines(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, order_id uuid not null,
  product_id uuid not null, product_name text not null, specification text not null default '',
  sales_unit text not null default '', quantity numeric not null, unit_price bigint,
  tax_type text not null, price_includes_tax boolean not null default false,
  is_market_price boolean not null default false);
create table store_cart_items(
  company_id uuid not null, store_account_id uuid not null, product_id uuid not null, quantity numeric not null,
  primary key(company_id,store_account_id,product_id));
create table customer_attachments(
  id uuid primary key, company_id uuid not null, customer_id uuid not null);
create table business_documents(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_type text not null,
  document_number text not null, document_date date not null, status text not null default 'draft',
  customer_id uuid, supplier_id uuid, original_document_id uuid, partner_name_snapshot text not null,
  partner_business_number_snapshot text, partner_representative_snapshot text,
  partner_address_snapshot text, partner_contact_snapshot text, source_type text not null,
  source_id uuid, source_key text, memo text, created_by_user_id uuid, created_by_name text not null,
  taxable_supply_amount bigint not null default 0, exempt_supply_amount bigint not null default 0,
  tax_amount bigint not null default 0, total_amount bigint not null default 0,
  revision integer not null default 0, tax_invoice_locked_at timestamptz,
  last_revised_at timestamptz, last_revised_by_name text,
  confirmed_by_user_id uuid, confirmed_by_name text, confirmed_at timestamptz,
  cancelled_by_user_id uuid, cancelled_by_name text, cancelled_at timestamptz,
  updated_at timestamptz not null default now(), unique(company_id,id),
  unique(company_id,source_type,source_key));
create table business_document_lines(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_id uuid not null,
  sort_order integer not null, product_catalog_id uuid, supplier_product_id uuid,
  product_code_snapshot text, product_name_snapshot text not null, specification_snapshot text,
  unit_snapshot text not null, tax_type_snapshot text not null, quantity numeric not null,
  unit_price bigint not null, memo text,
  supply_amount bigint generated always as (round(quantity*unit_price)::bigint) stored,
  tax_amount bigint generated always as (
    case when tax_type_snapshot='taxable' then round(round(quantity*unit_price)*0.1)::bigint else 0 end) stored,
  total_amount bigint generated always as (
    round(quantity*unit_price)::bigint + case when tax_type_snapshot='taxable'
      then round(round(quantity*unit_price)*0.1)::bigint else 0 end) stored);
create table partner_ledger_entries(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, source_document_id uuid,
  amount bigint not null, supply_amount bigint not null, tax_amount bigint not null,
  idempotency_key text not null, unique(company_id,idempotency_key));
create table inventory_movements(
  id uuid primary key default gen_random_uuid(), company_id uuid, source_document_id uuid,
  revision integer, quantity_delta numeric, unique(company_id,source_document_id,revision));
create table admin_audit_logs(
  id uuid primary key default gen_random_uuid(), actor_user_id uuid, company_id uuid,
  action text not null, target_type text, target_id uuid, metadata jsonb not null default '{}',
  created_at timestamptz not null default now());

create function next_erp_number(uuid,text,date) returns text language sql as
$$ select 'S-' || to_char($3,'YYYY') || '-000001' $$;
create function save_business_document(uuid,uuid,uuid,date,text,jsonb,uuid,text,text default null)
returns business_documents language plpgsql set search_path=public as $$
declare d business_documents%rowtype; old_total bigint; tx bigint; ex bigint; vat bigint; tot bigint;
begin
  select * into d from business_documents where company_id=$1 and id=$2 for update;
  if d.tax_invoice_locked_at is not null then raise exception 'tax invoiced documents are immutable'; end if;
  old_total:=d.total_amount;
  delete from business_document_lines where company_id=$1 and document_id=$2;
  insert into business_document_lines(company_id,document_id,sort_order,product_catalog_id,
    product_code_snapshot,product_name_snapshot,specification_snapshot,unit_snapshot,
    tax_type_snapshot,quantity,unit_price,memo)
  select $1,$2,x.ord,nullif(x.v->>'product_catalog_id','')::uuid,x.v->>'product_code',
    x.v->>'product_name',x.v->>'specification',x.v->>'unit',x.v->>'tax_type',
    (x.v->>'quantity')::numeric,(x.v->>'unit_price')::bigint,x.v->>'memo'
  from jsonb_array_elements($6) with ordinality x(v,ord);
  select coalesce(sum(supply_amount) filter(where tax_type_snapshot='taxable'),0),
    coalesce(sum(supply_amount) filter(where tax_type_snapshot='exempt'),0),
    coalesce(sum(tax_amount),0),coalesce(sum(total_amount),0)
  into tx,ex,vat,tot from business_document_lines where company_id=$1 and document_id=$2;
  update business_documents set customer_id=$3,document_date=$4,memo=nullif(btrim($5),''),
    taxable_supply_amount=tx,exempt_supply_amount=ex,tax_amount=vat,total_amount=tot,
    revision=case when status='confirmed' then revision+1 else revision end,
    last_revised_by_name=case when status='confirmed' then $8 else last_revised_by_name end
  where company_id=$1 and id=$2 returning * into d;
  if d.status='confirmed' and tot<>old_total then
    insert into partner_ledger_entries(company_id,source_document_id,amount,supply_amount,tax_amount,idempotency_key)
    values($1,$2,tot-old_total,(tx+ex)-(d.taxable_supply_amount+d.exempt_supply_amount),vat-d.tax_amount,
      'document:'||$2||':rev:'||d.revision) on conflict do nothing;
    insert into inventory_movements values(default,$1,$2,d.revision,0) on conflict do nothing;
  end if;
  return d;
end $$;
create function confirm_business_document(uuid,uuid,uuid,text)
returns business_documents language plpgsql set search_path=public as $$
declare d business_documents%rowtype;
begin
 update business_documents set status='confirmed',confirmed_by_user_id=$3,confirmed_by_name=$4,confirmed_at=now()
 where company_id=$1 and id=$2 and status='draft' returning * into d;
 if not found then raise exception 'only draft documents can be confirmed'; end if;
 insert into partner_ledger_entries(company_id,source_document_id,amount,supply_amount,tax_amount,idempotency_key)
 values($1,$2,case when d.document_type='sale_return' then -d.total_amount else d.total_amount end,
   case when d.document_type='sale_return' then -(d.taxable_supply_amount+d.exempt_supply_amount) else d.taxable_supply_amount+d.exempt_supply_amount end,
   case when d.document_type='sale_return' then -d.tax_amount else d.tax_amount end,'document:'||$2||':confirm');
 insert into inventory_movements values(default,$1,$2,0,case when d.document_type='sale_return' then 1 else -1 end);
 return d;
end $$;
create function cancel_business_document(uuid,uuid,uuid,text,text)
returns business_documents language plpgsql set search_path=public as $$
declare d business_documents%rowtype; net bigint;
begin
 select * into d from business_documents where company_id=$1 and id=$2 for update;
 if d.status='cancelled' then return d; end if;
 if d.tax_invoice_locked_at is not null then raise exception 'tax invoiced documents are immutable'; end if;
 select sum(amount) into net from partner_ledger_entries where company_id=$1 and source_document_id=$2;
 update business_documents set status='cancelled',cancelled_by_user_id=$3,cancelled_by_name=$4,cancelled_at=now()
 where company_id=$1 and id=$2 returning * into d;
 insert into partner_ledger_entries(company_id,source_document_id,amount,supply_amount,tax_amount,idempotency_key)
 values($1,$2,-net,0,0,'document:'||$2||':cancel') on conflict do nothing;
 insert into inventory_movements values(default,$1,$2,-1,1) on conflict do nothing;
 return d;
end $$;

\ir 2026-11-16-CX-38-order-sale-documents.sql

insert into companies values
 ('00000000-0000-0000-0000-0000000000c1'),('00000000-0000-0000-0000-0000000000c2');
insert into normalized_customers values
 ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','가짜 매장','0000000000','대표','가짜 주소','000-0000-0000'),
 ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c2','다른 회사','1111111111','대표','가짜 주소','000-0000-0000');
insert into product_catalog values
 ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1','TAX',1000),
 ('00000000-0000-0000-0000-0000000000a4','00000000-0000-0000-0000-0000000000c1','MKT',2000);
insert into pricing_effective_source values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a3',1000,1000,10),
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a4',2000,2000,10);
insert into store_accounts values
 ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1');
insert into store_account_members values
 ('00000000-0000-0000-0000-0000000000b2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1',null,'active');
-- 장바구니는 확정 전 임시 상태라 전표·원장·재고를 만들지 않는다.
insert into store_cart_items values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a3',2),
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a4',1);
do $$ begin
 assert (select count(*) from business_documents)=0,'cart must not create document';
 assert (select count(*) from partner_ledger_entries)=0,'cart must not create ledger';
 assert (select count(*) from inventory_movements)=0,'cart must not move inventory';
end $$;
insert into store_orders values
 ('00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','2026-11-17','submitted',1100,'문 앞',1);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a3','과세품','개',2,1100,'taxable',false),
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','00000000-0000-0000-0000-0000000000a4','시가품','개',1,null,'exempt',true);

select confirm_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',null,'담당');
select confirm_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',null,'담당');
do $$ begin
 assert (select count(*) from business_documents)=1,'confirm must be idempotent';
 assert (select count(*) from partner_ledger_entries)=1,'one confirm ledger';
 assert (select unit_price from business_document_lines where product_name_snapshot='시가품')=2400,'market proposal';
 assert (select tax_type_snapshot from business_document_lines where product_name_snapshot='배송비')='taxable','fee taxable';
 begin perform confirm_order_sale_document('00000000-0000-0000-0000-0000000000c2','00000000-0000-0000-0000-0000000000d1',null,'담당');
   assert false,'cross company must fail'; exception when raise_exception then assert sqlerrm='order_not_found'; end;
end $$;

update store_order_lines set quantity=3 where product_name='과세품';
update store_orders set revision=2 where id='00000000-0000-0000-0000-0000000000d1';
select revise_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',2,null,'담당','수량 수정');
select revise_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',2,null,'담당','수량 수정');
do $$ declare d business_documents%rowtype; begin
 select * into d from business_documents limit 1;
 assert d.revision=1,'retry must not create revision';
 assert (select sum(amount) from partner_ledger_entries where source_document_id=d.id)=d.total_amount,'ledger net equals revised total';
 update business_documents set tax_invoice_locked_at=now() where id=d.id;
 begin perform revise_order_sale_document(d.company_id,'00000000-0000-0000-0000-0000000000d1',2,null,'담당','잠금');
   assert false,'locked document must fail'; exception when raise_exception then assert sqlerrm='tax invoiced documents are immutable'; end;
 update business_documents set tax_invoice_locked_at=null where id=d.id;
end $$;

-- 시가 기준이 바뀌면 다음 주문 revision에서 새 제안 단가의 차액만 반영한다.
update pricing_effective_source set cost=2080
where company_id='00000000-0000-0000-0000-0000000000c1' and product_id='00000000-0000-0000-0000-0000000000a4';
update store_orders set revision=3 where id='00000000-0000-0000-0000-0000000000d1';
select revise_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',3,null,'담당','시가 단가 확정');
select revise_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1',3,null,'담당','시가 단가 확정');
do $$ declare d business_documents%rowtype; begin
 select * into d from business_documents where source_key='order:00000000-0000-0000-0000-0000000000d1';
 assert d.revision=2,'market retry must not create another revision';
 assert (select unit_price from business_document_lines where document_id=d.id and product_name_snapshot='시가품')=2500,'market final price';
 assert (select count(*) from partner_ledger_entries where source_document_id=d.id)=3,'confirm plus two revision deltas';
 assert (select sum(amount) from partner_ledger_entries where source_document_id=d.id)=d.total_amount,'market delta keeps ledger equal to total';
end $$;

select record_business_document_receipt(
 '00000000-0000-0000-0000-0000000000c1',(select id from business_documents where source_key='order:00000000-0000-0000-0000-0000000000d1'),2,'confirmed',
 '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2',null,null);
select record_business_document_receipt(
 '00000000-0000-0000-0000-0000000000c1',(select id from business_documents where source_key='order:00000000-0000-0000-0000-0000000000d1'),2,'confirmed',
 '00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000b2',null,null);
do $$ begin assert (select count(*) from business_document_receipts)=1,'receipt idempotent'; end $$;

-- 선택 수량 1개만 반품: 원전표 연결, 원장 감소, 재고 복귀.
insert into business_documents(company_id,document_type,document_number,document_date,status,customer_id,original_document_id,
 partner_name_snapshot,source_type,source_key,created_by_name)
select company_id,'sale_return','SR-2026-000001',document_date,'draft',customer_id,id,partner_name_snapshot,'manual','cx41:return','담당'
from business_documents where source_key='order:00000000-0000-0000-0000-0000000000d1';
select save_business_document('00000000-0000-0000-0000-0000000000c1',(select id from business_documents where source_key='cx41:return'),
 '00000000-0000-0000-0000-0000000000a1','2026-11-17','선택 수량 반품',
 jsonb_build_array(jsonb_build_object('product_catalog_id','00000000-0000-0000-0000-0000000000a3','product_code','TAX','product_name','과세품',
   'specification','','unit','개','tax_type','taxable','quantity',1,'unit_price',1100,'memo','부분 반품')),null,'담당','선택 반품');
select confirm_business_document('00000000-0000-0000-0000-0000000000c1',(select id from business_documents where source_key='cx41:return'),null,'담당');
do $$ declare original_total bigint; return_total bigint; begin
 select total_amount into original_total from business_documents where source_key='order:00000000-0000-0000-0000-0000000000d1';
 select total_amount into return_total from business_documents where source_key='cx41:return';
 assert (select sum(amount) from partner_ledger_entries)=original_total-return_total,'return reduces ledger by selected quantity';
 assert (select sum(quantity_delta) from inventory_movements)=0,'sale out plus selected return in fixture';
end $$;

-- 취소는 반품 원전표가 아닌 별도 주문으로 검증한다.
insert into store_orders values
 ('00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000a1','2026-11-17','submitted',0,'취소 주문',1);
insert into store_order_lines(company_id,order_id,product_id,product_name,sales_unit,quantity,unit_price,tax_type,is_market_price) values
 ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d2','00000000-0000-0000-0000-0000000000a3','과세품','개',1,1100,'taxable',false);
select confirm_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d2',null,'담당');

select cancel_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d2',null,'담당','취소');
select cancel_order_sale_document('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d2',null,'담당','취소');
do $$ declare d business_documents%rowtype; begin
 select * into d from business_documents where source_key='order:00000000-0000-0000-0000-0000000000d2';
 assert d.status='cancelled';
 assert (select sum(amount) from partner_ledger_entries where source_document_id=d.id)=0,'cancel ledger net zero';
 assert (select sum(quantity_delta) from inventory_movements where source_document_id=d.id)=0,'cancel inventory net zero';
end $$;

\set ON_ERROR_STOP off
\ir 2026-11-16-CX-38-order-sale-documents.down.sql
\set ON_ERROR_STOP on
do $$ begin assert to_regclass('public.business_document_receipts') is not null,'down must refuse evidence'; end $$;
delete from business_document_receipts;
\ir 2026-11-16-CX-38-order-sale-documents.down.sql
do $$ begin assert to_regclass('public.business_document_receipts') is null,'empty down must succeed'; end $$;
select 'CX-41 end-to-end order ledger inventory return PG17 checks passed' as result;
