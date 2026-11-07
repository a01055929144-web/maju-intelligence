-- 운영 적용 전용 롤백 초안. erp_code에 데이터를 쓰기 시작한 뒤에는 먼저 백업한다.
begin;
drop index if exists public.product_catalog_erp_code_uq;
alter table public.product_catalog drop constraint if exists product_catalog_erp_code_not_blank_check;
alter table public.product_catalog drop column if exists erp_code;
commit;
