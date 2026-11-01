-- WO-25 company field definitions rollback. REVIEW-ONLY DRAFT; 운영 DB 적용 금지.
-- 재사용 중인 excel_mapping_presets, import_jobs, import_rows는 변경하거나 삭제하지 않는다.

begin;

drop trigger if exists seed_company_product_field_definitions_after_company_insert on public.companies;
drop table if exists public.company_field_definitions;
drop function if exists public.seed_company_product_field_definitions_on_company_insert();
drop function if exists public.protect_system_company_field_definitions();
drop function if exists public.seed_company_product_field_definitions(uuid);

commit;
