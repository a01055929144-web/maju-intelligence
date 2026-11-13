-- Disposable PostgreSQL 17 fixture only. Never run against production.
-- 운영 테이블 중 E2가 읽고 쓰는 열만 만든 최소 fixture + 초안 SQL + down 왕복.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table companies(id uuid primary key);
create table business_documents(
  id uuid primary key, company_id uuid not null references companies(id), document_type text not null,
  status text not null default 'draft', revision integer not null default 0, supplier_id uuid,
  document_number text not null, document_date date not null, partner_name_snapshot text,
  confirmed_by_name text, last_revised_by_name text, unique(company_id, id));
create table business_document_lines(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, document_id uuid not null,
  sort_order integer not null, supplier_product_id uuid, product_code_snapshot text,
  product_name_snapshot text not null, specification_snapshot text, unit_snapshot text not null,
  tax_type_snapshot text not null, quantity numeric not null, unit_price bigint not null,
  supply_amount bigint generated always as (round(quantity * unit_price)::bigint) stored,
  tax_amount bigint generated always as (case when tax_type_snapshot='taxable' then round(round(quantity*unit_price)*0.1)::bigint else 0 end) stored,
  total_amount bigint generated always as (round(quantity*unit_price)::bigint + case when tax_type_snapshot='taxable' then round(round(quantity*unit_price)*0.1)::bigint else 0 end) stored);
create table product_catalog(
  id uuid primary key, company_id uuid not null, purchase_unit text, purchase_price numeric not null default 0,
  purchase_price_date date, updated_at timestamptz not null default now(), unique(company_id, id));
create table supplier_products(id uuid primary key, company_id uuid not null, supplier_id uuid not null, supplier_code text);
create table supplier_product_matches(id uuid primary key default gen_random_uuid(), company_id uuid not null,
  supplier_product_id uuid not null, product_catalog_id uuid not null, match_status text not null);
create table purchase_receipt_lines(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, receipt_date date not null,
  dedupe_key text not null, line_key text not null, product_catalog_id uuid, supplier_name text, erp_code text,
  product_name text not null, spec text, unit text, quantity numeric, unit_price numeric not null,
  price_includes_vat boolean not null, tax_type text, unit_cost_ex_vat numeric not null, supply_amount numeric,
  vat_amount numeric, total_amount numeric, file_name text, source_row_number integer,
  raw_values jsonb not null, created_by_name text, created_at timestamptz not null default clock_timestamp(),
  purchase_cost_date_batch_id uuid, unique(company_id, dedupe_key));
create table recalc_calls(company_id uuid);
create table admin_audit_logs(id uuid primary key default gen_random_uuid(), actor_user_id uuid, company_id uuid, action text not null, target_type text, target_id uuid, metadata jsonb not null default '{}', created_at timestamptz not null default now());
create function pricing_p0_command(p_company uuid, p_cmd jsonb) returns void language sql as
$$ insert into recalc_calls values (p_company) $$;

\ir 20261113-e2-purchase-document-cost.sql

insert into companies values ('00000000-0000-0000-0000-0000000000c1');
insert into product_catalog values
  ('00000000-0000-0000-0000-0000000000a1','00000000-0000-0000-0000-0000000000c1','kg',0,null,now()),
  ('00000000-0000-0000-0000-0000000000a2','00000000-0000-0000-0000-0000000000c1','kg',999,'2026-11-01',now()),
  ('00000000-0000-0000-0000-0000000000a3','00000000-0000-0000-0000-0000000000c1','kg',100,'2026-11-01',now());
insert into supplier_products values
  ('00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','CODE-2'),
  ('00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000d1','CODE-3');
insert into supplier_product_matches(company_id,supplier_product_id,product_catalog_id,match_status) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b1','00000000-0000-0000-0000-0000000000a2','confirmed'),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000b3','00000000-0000-0000-0000-0000000000a3','confirmed');
insert into business_documents(id,company_id,document_type,supplier_id,document_number,document_date,partner_name_snapshot) values
  ('00000000-0000-0000-0000-0000000000e1','00000000-0000-0000-0000-0000000000c1','purchase','00000000-0000-0000-0000-0000000000d1','PU-2026-000001','2026-11-10','매입처'),
  ('00000000-0000-0000-0000-0000000000e2','00000000-0000-0000-0000-0000000000c1','sale',null,'SA-2026-000001','2026-11-10','매출처'),
  ('00000000-0000-0000-0000-0000000000e3','00000000-0000-0000-0000-0000000000c1','purchase','00000000-0000-0000-0000-0000000000d1','PU-2026-000002','2026-11-11','매입처');
-- 줄 1: 코드로 연결(CODE-2, kg) → 기록 · 줄 2: 단위 다름 → 건너뜀 · 줄 3: 연결 없음 → 건너뜀
insert into business_document_lines(company_id,document_id,sort_order,product_code_snapshot,product_name_snapshot,unit_snapshot,tax_type_snapshot,quantity,unit_price) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1',1,'CODE-2','양파','kg','exempt',10,1000),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1',2,'CODE-2','양파박스','box','exempt',1,5000),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e1',3,'NOPE','무','kg','exempt',1,300),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e2',1,null,'판매','kg','exempt',1,100),
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e3',1,'CODE-3','대파','kg','exempt',1,1000);

-- draft 상태에서는 기록 없음, 판매 전표 확정은 무시
do $$ begin assert (select count(*) from purchase_receipt_lines) = 0; end $$;
update business_documents set status='confirmed', confirmed_by_name='담당' where id='00000000-0000-0000-0000-0000000000e2';
do $$ begin assert (select count(*) from purchase_receipt_lines) = 0, 'sale document must not record'; end $$;

-- 확정: 연결·단위가 맞는 1줄만 기록, 현재 매입가 갱신 + 재계산 호출
update business_documents set status='confirmed', confirmed_by_name='담당' where id='00000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from purchase_receipt_lines where source='purchase_document' and invalidated_at is null) = 1;
  assert (select unit_cost_ex_vat from purchase_receipt_lines) = 1000, 'supply unit price excl. VAT';
  assert (select hold_reason from purchase_receipt_lines) is null, '0.1% change is below the 20% hold threshold';
  assert (select purchase_price from product_catalog where id='00000000-0000-0000-0000-0000000000a2') = 1000;
  assert (select purchase_price_date from product_catalog where id='00000000-0000-0000-0000-0000000000a2') = date '2026-11-10';
  assert (select count(*) from recalc_calls) = 1;
  assert (select count(*) from purchase_document_cost_pending_v where reason='unit_mismatch') = 1;
  assert (select count(*) from purchase_document_cost_pending_v where reason='product_link_required') = 1;
end $$;

-- 정정(revision+1, 단가 1200 = +20%): 이전 행 무효 표시 + 새 행은 기록하되 반영 보류(variance_check). 현재가·재계산 그대로
delete from business_document_lines where document_id='00000000-0000-0000-0000-0000000000e1' and sort_order<>1;
update business_document_lines set unit_price=1200 where document_id='00000000-0000-0000-0000-0000000000e1';
update business_documents set revision=1, last_revised_by_name='정정자' where id='00000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from purchase_receipt_lines) = 2, 'old row kept';
  assert (select count(*) from purchase_receipt_lines where invalidated_reason='revise') = 1;
  assert (select count(*) from purchase_receipt_lines where hold_reason='variance_check' and released_at is null) = 1;
  assert (select purchase_price from product_catalog where id='00000000-0000-0000-0000-0000000000a2') = 1000, 'held row must not change the price';
  assert (select count(*) from recalc_calls) = 1, 'no recalculation while held';
  assert (select count(*) from purchase_document_cost_pending_v where reason='variance_check' and current_price=1000) = 1;
end $$;

-- 대표 [반영]: 가격이 바뀌고 재계산 + 감사 기록. 두 번째 반영은 거부
select release_purchase_document_hold('00000000-0000-0000-0000-0000000000c1',
  (select id from purchase_receipt_lines where hold_reason='variance_check'), null, '대표');
do $$ begin
  assert (select purchase_price from product_catalog where id='00000000-0000-0000-0000-0000000000a2') = 1200;
  assert (select count(*) from recalc_calls) = 2;
  assert (select count(*) from admin_audit_logs where action='purchase_variance_released' and metadata->>'actor_name'='대표') = 1;
  assert (select count(*) from purchase_document_cost_pending_v where reason='variance_check') = 0;
  begin
    perform release_purchase_document_hold('00000000-0000-0000-0000-0000000000c1',
      (select id from purchase_receipt_lines where hold_reason='variance_check'), null, '대표');
    assert false, 'double release must fail';
  exception when raise_exception then
    assert sqlerrm = 'purchase_hold_not_releasable', sqlerrm;
  end;
end $$;

-- 10배 단가 전표(100 → 1000): 기록은 되지만 판매가 재계산 없음 → 반영 후 바뀜
update business_documents set status='confirmed', confirmed_by_name='담당' where id='00000000-0000-0000-0000-0000000000e3';
do $$ begin
  assert (select count(*) from purchase_receipt_lines where business_document_id='00000000-0000-0000-0000-0000000000e3' and hold_reason='variance_check') = 1;
  assert (select purchase_price from product_catalog where id='00000000-0000-0000-0000-0000000000a3') = 100, '10x price must not apply';
  assert (select count(*) from recalc_calls) = 2, '10x price must not recalculate selling prices';
end $$;
select release_purchase_document_hold('00000000-0000-0000-0000-0000000000c1',
  (select id from purchase_receipt_lines where business_document_id='00000000-0000-0000-0000-0000000000e3'), null, '대표');
do $$ begin
  assert (select purchase_price from product_catalog where id='00000000-0000-0000-0000-0000000000a3') = 1000;
  assert (select count(*) from recalc_calls) = 3;
end $$;

-- +15%(1000 → 1150)는 보류 없이 바로 반영 + 재계산, 20% 미만이라 variance_check 없음
insert into business_documents(id,company_id,document_type,supplier_id,document_number,document_date,partner_name_snapshot) values
  ('00000000-0000-0000-0000-0000000000e4','00000000-0000-0000-0000-0000000000c1','purchase','00000000-0000-0000-0000-0000000000d1','PU-2026-000003','2026-11-12','매입처');
insert into business_document_lines(company_id,document_id,sort_order,product_code_snapshot,product_name_snapshot,unit_snapshot,tax_type_snapshot,quantity,unit_price) values
  ('00000000-0000-0000-0000-0000000000c1','00000000-0000-0000-0000-0000000000e4',1,'CODE-3','대파','kg','exempt',1,1150);
update business_documents set status='confirmed', confirmed_by_name='담당' where id='00000000-0000-0000-0000-0000000000e4';
do $$ begin
  assert (select count(*) from purchase_receipt_lines where business_document_id='00000000-0000-0000-0000-0000000000e4' and hold_reason is null) = 1, '+15% must not hold';
  assert (select purchase_price from product_catalog where id='00000000-0000-0000-0000-0000000000a3') = 1150, '+15% applies immediately';
  assert (select count(*) from recalc_calls) = 4;
end $$;

-- 취소: e1의 남은 유효 행 무효 표시. 현재가는 유효 행이 없으면 유지
update business_documents set status='cancelled' where id='00000000-0000-0000-0000-0000000000e1';
do $$ begin
  assert (select count(*) from purchase_receipt_lines where business_document_id='00000000-0000-0000-0000-0000000000e1' and invalidated_at is null) = 0;
  assert (select count(*) from purchase_receipt_lines where invalidated_reason='cancel') = 1;
  assert (select purchase_price from product_catalog where id='00000000-0000-0000-0000-0000000000a2') = 1200, 'price kept when no valid row remains';
end $$;

-- 제약: 전표 출처는 전표 ID 필수, 업로드는 전표 ID 금지
do $$ begin
  begin
    insert into purchase_receipt_lines(company_id,receipt_date,dedupe_key,line_key,product_name,unit_price,price_includes_vat,unit_cost_ex_vat,raw_values,source)
    values ('00000000-0000-0000-0000-0000000000c1','2026-11-10','x','x','x',1,false,1,'[]','purchase_document');
    assert false, 'source without document id must fail';
  exception when check_violation then null; end;
end $$;

-- down 왕복
\ir 20261113-e2-purchase-document-cost.down.sql
do $$ begin
  assert not exists (select 1 from information_schema.columns where table_name='purchase_receipt_lines' and column_name='source');
  assert not exists (select 1 from pg_trigger where tgname='record_purchase_document_costs');
  assert (select count(*) from purchase_receipt_lines) = 0;
end $$;
