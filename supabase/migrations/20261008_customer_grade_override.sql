alter table public.normalized_customers
  add column if not exists grade_override text;

alter table public.normalized_customers
  drop constraint if exists normalized_customers_grade_override_check;

alter table public.normalized_customers
  add constraint normalized_customers_grade_override_check
  check (grade_override is null or grade_override in ('A', 'B', 'C'));

comment on column public.normalized_customers.grade_override is
  '운영자가 지정한 거래처 등급. null이면 월 매출 기반 자동 등급을 사용한다.';
