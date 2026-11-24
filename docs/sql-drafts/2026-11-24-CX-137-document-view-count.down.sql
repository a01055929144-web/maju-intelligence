-- DOWN: CX-137 조회수 함수 제거. 이미 쌓인 view_count와 view 이벤트는 지우지 않는다.
begin;
drop function if exists public.record_pricing_document_view_v1(uuid, uuid, text, text, boolean);
commit;
