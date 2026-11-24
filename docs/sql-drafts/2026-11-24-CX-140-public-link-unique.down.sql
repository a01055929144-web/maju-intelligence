-- DOWN: CX-140 ① 트리거·함수만 제거. 링크 데이터는 건드리지 않는다.
begin;
drop trigger if exists pricing_public_share_link_unique on public.pricing_document_share_links;
drop function if exists public.pricing_public_share_link_unique_v1();
commit;
