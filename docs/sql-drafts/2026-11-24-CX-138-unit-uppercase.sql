-- DRAFT ONLY. CX-138 U1: 상품 단위의 영문은 DB에서 항상 대문자로 저장한다. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 원인: 업로드·새 상품·상품관리·엑셀·API 어느 경로도 단위를 대문자로 바꾸지 않아 ea·kg·box가 그대로 들어가고,
--       단가표 확정(단위 대문자 규칙)이 11/24 10:21에 실패했다. 화면마다 고치면 새 경로가 생길 때 또 샌다 → 표에서 한 번에 보장.
-- 한글 단위(단·팩·판 등)와 숫자·기호는 upper()가 바꾸지 않는다. 비어 있는 값(NULL)은 그대로 둔다.
-- 기존 행은 건드리지 않는다(이 초안은 데이터를 수정하지 않음). 이후 insert·upsert·단위 열 update에서만 적용된다.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create function public.product_catalog_unit_uppercase_v1() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.purchase_unit := upper(new.purchase_unit);
  new.sales_unit := upper(new.sales_unit);
  return new;
end $$;

create trigger product_catalog_unit_uppercase
  before insert or update of purchase_unit, sales_unit on public.product_catalog
  for each row execute function public.product_catalog_unit_uppercase_v1();

commit;
