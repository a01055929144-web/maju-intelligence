-- DOWN: CX-140 ① 인덱스만 제거. 링크 데이터는 건드리지 않는다.
begin;
drop index if exists public.pricing_public_share_link_one_per_document_uq;
commit;
