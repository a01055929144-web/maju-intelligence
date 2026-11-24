-- DOWN: CX-138 U1 단위 대문자 트리거 제거. 이미 대문자로 저장된 값은 되돌리지 않는다(데이터 변경 없음).
begin;
drop trigger if exists product_catalog_unit_uppercase on public.product_catalog;
drop function if exists public.product_catalog_unit_uppercase_v1();
commit;
