-- CX-134 PR1 PG17: 부가세 포함가 줄의 공급가·세액·총액이 어떤 T에서도 1원 어긋나지 않음을 증명.
-- 운영에 이미 적용된 생성 컬럼 식(CX-38b, docs/sql-drafts/2026-11-19-CX-38b-order-document-money-snapshot.sql)을 그대로 복사한 시험용 표를 쓴다.
-- 운영 DB·스키마 변경 없음(DDL 초안 없음: 규칙은 이미 운영 SQL에 있고 TS 쪽이 이를 따르도록 맞춤).
\set ON_ERROR_STOP on
begin;
create table vat_lines(
  id bigserial primary key, quantity numeric not null, unit_price bigint not null,
  tax_type_snapshot text not null, price_includes_tax_snapshot boolean not null,
  supply_amount bigint generated always as (case
    when price_includes_tax_snapshot and tax_type_snapshot = 'taxable'
      then round(round(quantity * unit_price) / 1.1)::bigint
    else round(quantity * unit_price)::bigint end) stored,
  tax_amount bigint generated always as (case
    when tax_type_snapshot = 'exempt' then 0
    when price_includes_tax_snapshot
      then (round(quantity * unit_price) - round(round(quantity * unit_price) / 1.1))::bigint
    else round(round(quantity * unit_price) * 0.1)::bigint end) stored,
  total_amount bigint generated always as (case
    when tax_type_snapshot = 'exempt' then round(quantity * unit_price)::bigint
    when price_includes_tax_snapshot then round(quantity * unit_price)::bigint
    else (round(quantity * unit_price) + round(round(quantity * unit_price) * 0.1))::bigint end) stored);

-- T = 50~100,000(50원 간격) 전부, 포함가 과세 1줄
insert into vat_lines(quantity, unit_price, tax_type_snapshot, price_includes_tax_snapshot)
select 1, t, 'taxable', true from generate_series(50, 100000, 50) t;

do $check$
declare bad integer; n integer;
begin
  select count(*) into n from vat_lines;
  if n <> 2000 then raise exception 'cx134_row_count %', n; end if;
  select count(*) into bad from vat_lines where supply_amount + tax_amount <> total_amount or total_amount <> unit_price;
  if bad <> 0 then raise exception 'cx134_sum_mismatch %', bad; end if;
  -- TS 정수식 floor((20T+11)/22)와 같은 공급가
  select count(*) into bad from vat_lines where supply_amount <> floor((20 * unit_price + 11) / 22.0)::bigint;
  if bad <> 0 then raise exception 'cx134_supply_formula_mismatch %', bad; end if;
end $check$;

-- 경계값: 공급가로 못 맞추는 500·1,050·1,600 포함
do $boundary$
declare t bigint; r record;
begin
  foreach t in array array[50, 300, 500, 850, 1050, 1600, 2450, 7550]::bigint[] loop
    select * into r from vat_lines where unit_price = t;
    if r.total_amount <> t or r.supply_amount + r.tax_amount <> t then raise exception 'cx134_boundary_mismatch %', t; end if;
  end loop;
  if (select supply_amount from vat_lines where unit_price = 500) <> 455
     or (select tax_amount from vat_lines where unit_price = 500) <> 45 then raise exception 'cx134_500_split'; end if;
end $boundary$;

-- 수량이 있어도 줄 총액 = round(수량×단가), 면세는 세액 0
insert into vat_lines(quantity, unit_price, tax_type_snapshot, price_includes_tax_snapshot)
values (3, 500, 'taxable', true), (0.5, 100, 'taxable', true), (2, 1000, 'exempt', true), (2, 1000, 'taxable', false);
do $qty$
begin
  if (select total_amount from vat_lines where quantity = 3 and unit_price = 500) <> 1500
    or (select supply_amount + tax_amount from vat_lines where quantity = 0.5 and unit_price = 100) <> 50
    or (select tax_amount from vat_lines where tax_type_snapshot = 'exempt') <> 0
    or (select total_amount from vat_lines where quantity = 2 and not price_includes_tax_snapshot) <> 2200
  then raise exception 'cx134_quantity_cases'; end if;
end $qty$;
rollback;
