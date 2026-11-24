-- DOWN: CX-140 ③ 기본 단가표 포인터 표 제거(지정 기록만 사라지고 문서·링크는 그대로).
begin;
drop table if exists public.pricing_default_public_documents;
commit;
