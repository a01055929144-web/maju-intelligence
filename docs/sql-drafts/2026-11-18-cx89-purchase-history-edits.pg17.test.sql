\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table companies(id uuid primary key);
create table product_catalog(company_id uuid references companies,id uuid,canonical_name text,purchase_product_name text,sales_spec text,spec_value numeric,spec_unit text,sales_unit text,purchase_price numeric,purchase_price_date date,updated_at timestamptz,primary key(company_id,id));
create table purchase_receipt_lines(id uuid primary key default gen_random_uuid(),company_id uuid references companies,receipt_date date,dedupe_key text,line_key text,product_catalog_id uuid,supplier_name text,erp_code text,product_name text,spec text,unit text,quantity numeric,unit_price numeric,unit_cost_ex_vat numeric,price_includes_vat boolean default false,tax_type text,total_amount numeric,raw_values jsonb default '[]',created_by_name text,invalidated_at timestamptz,unique(company_id,dedupe_key));
create table purchase_receipt_line_overrides(company_id uuid,receipt_line_id uuid,product_catalog_id uuid,product_name text,spec text,unit text,unit_cost_ex_vat numeric,revision integer,corrected_at timestamptz,primary key(company_id,receipt_line_id));
create table purchase_receipt_correction_events(id uuid default gen_random_uuid(),company_id uuid,receipt_line_id uuid,before_value jsonb,after_value jsonb,reason text,actor_name text,created_at timestamptz default now());
create table price_recalc_runs(id uuid default gen_random_uuid(),company_id uuid);
create function pricing_p0_command(p_company uuid,p_command jsonb) returns void language sql as $$ insert into price_recalc_runs(company_id) values(p_company) $$;
grant all on all tables in schema public to service_role;
\ir 2026-11-18-cx89-purchase-history-edits.sql

do $$
declare c uuid:='10000000-0000-4000-8000-000000000001'; p uuid:='20000000-0000-4000-8000-000000000001'; old_id uuid; latest_id uuid; result jsonb;
begin
  insert into companies values(c);
  insert into product_catalog(company_id,id,canonical_name,purchase_price,purchase_price_date) values(c,p,'두부',1200,'2026-11-18');
  insert into purchase_receipt_lines(company_id,receipt_date,dedupe_key,line_key,product_catalog_id,product_name,quantity,unit_price,unit_cost_ex_vat)
  select c,date '2026-01-01'+(n%320),n::text,'두부',p,'두부',1,1000+n%20,1000+n%20 from generate_series(1,1369)n;
  select id into old_id from purchase_receipt_lines where company_id=c order by receipt_date,id limit 1;
  insert into purchase_receipt_lines(company_id,receipt_date,dedupe_key,line_key,product_catalog_id,product_name,quantity,unit_price,unit_cost_ex_vat)
    values(c,'2026-11-18','latest','두부',p,'두부',1,1200,1200) returning id into latest_id;
  result:=mutate_purchase_receipt_line(c,'correct',old_id,jsonb_build_object('cost',900,'quantity',0.3,'spec','300g','unit','봉'),'과거 기록 정정','대표',0);
  assert (result->>'recalculated')::boolean=false;
  assert (select quantity from purchase_receipt_effective where id=old_id)=0.3;
  result:=mutate_purchase_receipt_line(c,'correct',latest_id,jsonb_build_object('cost',1250,'quantity',1,'spec','1kg','unit','봉'),'최신 단가 정정','대표',0);
  assert (result->>'recalculated')::boolean=true;
  assert (select purchase_price from product_catalog where company_id=c and id=p)=1250;
  result:=mutate_purchase_receipt_line(c,'delete',latest_id,'{}','중복 매입 삭제','대표',1);
  assert not exists(select 1 from purchase_receipt_effective where id=latest_id);
  assert exists(select 1 from purchase_receipt_lines where id=latest_id);
  result:=mutate_purchase_receipt_line(c,'add',null,jsonb_build_object('receiptDate','2026-11-19','productId',p,'productName','두부','supplier','한빛','spec','1kg','unit','봉','quantity',1.5,'cost',1300),'누락 매입 추가','대표',0);
  assert (select count(*) from purchase_receipt_effective where company_id=c)=1370;
  assert (select count(*) from purchase_receipt_correction_events where company_id=c)=4;
  assert (select purchase_price from product_catalog where company_id=c and id=p)=1300;
end $$;
