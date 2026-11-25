-- DOWN: CX-149. 읽기 함수 1개만 제거(데이터·다른 함수 변경 없음).
begin;
drop function if exists public.received_document_products_v1(uuid, uuid, date);
notify pgrst, 'reload schema';
commit;
