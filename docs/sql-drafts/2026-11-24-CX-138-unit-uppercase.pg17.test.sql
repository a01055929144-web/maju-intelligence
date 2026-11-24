-- CX-138 U1 PG17: product_catalog 단위 대문자 트리거 (운영과 같은 열·기존 트리거를 가진 합성 표)
\set ON_ERROR_STOP on
begin;
create table public.product_catalog(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, product_code text, product_name text not null default 'x',
  purchase_unit text, sales_unit text, purchase_price numeric, unique (company_id, product_code));
-- 운영에 이미 있는 다른 트리거(단위와 무관한 열 갱신용)가 있어도 영향이 없음을 보기 위한 합성 트리거
create function public.synthetic_lock_code() returns trigger language plpgsql as $f$ begin return new; end $f$;
create trigger synthetic_lock_code before update of product_code on public.product_catalog for each row execute function public.synthetic_lock_code();
-- 이미 소문자로 들어 있던 행(트리거 적용 전 데이터)
insert into public.product_catalog(company_id, product_code, purchase_unit, sales_unit) values
  ('00000000-0000-0000-0000-0000000000c1', 'OLD', 'ea', 'kg');
commit;

\ir 2026-11-24-CX-138-unit-uppercase.sql

begin;
do $t$
declare c uuid := '00000000-0000-0000-0000-0000000000c1'; r record;
begin
  -- 기존 행은 건드리지 않는다(이 초안은 데이터를 바꾸지 않음)
  select * into r from public.product_catalog where product_code = 'OLD';
  if r.purchase_unit <> 'ea' or r.sales_unit <> 'kg' then raise exception 'existing_row_changed'; end if;

  -- insert: 영문은 대문자, 한글·숫자·기호는 그대로, NULL은 NULL
  insert into public.product_catalog(company_id, product_code, purchase_unit, sales_unit) values
    (c, 'A1', 'ea', 'Kg'), (c, 'A2', 'box', 'BOX'), (c, 'A3', '단', '팩'), (c, 'A4', 'g당', '500g'), (c, 'A5', null, null), (c, 'A6', 'pack/2입', 'ml');
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'A1') <> array['EA', 'KG'] then raise exception 'insert_upper'; end if;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'A2') <> array['BOX', 'BOX'] then raise exception 'already_upper'; end if;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'A3') <> array['단', '팩'] then raise exception 'korean_unchanged'; end if;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'A4') <> array['G당', '500G'] then raise exception 'mixed_korean_digits'; end if;
  if (select purchase_unit is not null or sales_unit is not null from public.product_catalog where product_code = 'A5') then raise exception 'null_stays_null'; end if;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'A6') <> array['PACK/2입', 'ML'] then raise exception 'symbols'; end if;

  -- update: 단위 열을 바꾸면 대문자, 다른 열만 바꾸면 단위는 그대로(기존 소문자 행도 건드리지 않음)
  update public.product_catalog set purchase_unit = 'bag' where product_code = 'A2';
  if (select purchase_unit from public.product_catalog where product_code = 'A2') <> 'BAG' then raise exception 'update_upper'; end if;
  update public.product_catalog set purchase_price = 100, product_name = 'y' where product_code = 'OLD';
  select * into r from public.product_catalog where product_code = 'OLD';
  if r.purchase_unit <> 'ea' or r.sales_unit <> 'kg' then raise exception 'other_column_update_touched_units'; end if;
  update public.product_catalog set sales_unit = 'ea' where product_code = 'OLD';
  select * into r from public.product_catalog where product_code = 'OLD';
  if r.sales_unit <> 'EA' or r.purchase_unit <> 'EA' then raise exception 'unit_update_normalizes_both'; end if;

  -- upsert(엑셀·업로드 경로): 충돌하는 새 행의 소문자도 대문자로 저장
  insert into public.product_catalog(company_id, product_code, purchase_unit, sales_unit) values (c, 'A1', 'dozen', 'ea')
    on conflict (company_id, product_code) do update set purchase_unit = excluded.purchase_unit, sales_unit = excluded.sales_unit;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'A1') <> array['DOZEN', 'EA'] then raise exception 'upsert_upper'; end if;
  insert into public.product_catalog(company_id, product_code, purchase_unit, sales_unit) values (c, 'A7', 'roll', 'roll')
    on conflict (company_id, product_code) do nothing;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'A7') <> array['ROLL', 'ROLL'] then raise exception 'upsert_insert_upper'; end if;

  -- 다른 회사 행에도 똑같이 적용(회사와 무관한 보장)
  insert into public.product_catalog(company_id, product_code, purchase_unit, sales_unit) values ('00000000-0000-0000-0000-0000000000c2', 'B1', 'set', 'pcs');
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'B1') <> array['SET', 'PCS'] then raise exception 'other_company'; end if;
end $t$;
rollback;

-- down: 트리거·함수만 사라지고 이미 저장된 값은 그대로, 이후에는 소문자가 다시 그대로 저장됨
begin;
insert into public.product_catalog(company_id, product_code, purchase_unit, sales_unit) values ('00000000-0000-0000-0000-0000000000c1', 'KEEP', 'ea', 'ea');
commit;
\ir 2026-11-24-CX-138-unit-uppercase.down.sql
do $d$ begin
  if to_regprocedure('public.product_catalog_unit_uppercase_v1()') is not null then raise exception 'down_function_remains'; end if;
  if exists (select 1 from pg_trigger where tgrelid = 'public.product_catalog'::regclass and tgname = 'product_catalog_unit_uppercase') then raise exception 'down_trigger_remains'; end if;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'KEEP') <> array['EA', 'EA'] then raise exception 'down_changed_data'; end if;
  if (select array[purchase_unit, sales_unit] from public.product_catalog where product_code = 'OLD') <> array['ea', 'kg'] then raise exception 'down_changed_old_row'; end if;
  insert into public.product_catalog(company_id, product_code, purchase_unit, sales_unit) values ('00000000-0000-0000-0000-0000000000c1', 'AFTER', 'ea', 'ea');
  if (select purchase_unit from public.product_catalog where product_code = 'AFTER') <> 'ea' then raise exception 'down_still_uppercases'; end if;
end $d$;
