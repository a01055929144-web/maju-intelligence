-- 승인 전 복구 초안. 기존 전표·원장은 삭제하지 않는다.
begin;
revoke all on function public.create_sales_document_from_store_order(uuid,uuid,uuid,uuid,text)
  from public, anon, authenticated, service_role;
drop function if exists public.create_sales_document_from_store_order(uuid,uuid,uuid,uuid,text);
commit;
