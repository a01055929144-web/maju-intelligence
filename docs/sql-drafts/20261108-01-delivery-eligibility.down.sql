-- REVIEW ONLY: 운영 DB 실행 금지.
begin;
alter table public.normalized_customers
  drop constraint if exists normalized_customers_delivery_eligibility_check,
  drop column if exists delivery_eligibility;
commit;
