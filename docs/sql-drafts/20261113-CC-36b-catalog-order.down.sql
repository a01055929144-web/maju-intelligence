-- CC-36b down. 전체 상품 링크나 그 주문, 또는 품목 메모가 있으면 거부한다(데이터를 지우지 않는다).
begin;
do $$ begin
  if exists (select 1 from public.storefront_links where source = 'catalog')
     or exists (select 1 from public.store_orders where document_version_id is null)
     or exists (select 1 from public.store_order_lines where line_memo is not null or memo_kind is not null or memo_tags is not null or memo_original is not null) then
    raise exception 'catalog_order_in_use';
  end if;
end $$;

drop function if exists public.place_store_catalog_member_order_v1(text, date, jsonb, uuid, uuid, integer, text, uuid, uuid, uuid);
drop function if exists public.place_store_catalog_order_v1(text, date, jsonb, uuid, uuid, integer, text);
drop function if exists public.place_store_catalog_order_core_v1(text, date, jsonb, uuid, uuid, integer, text, uuid, uuid, uuid);
drop function if exists public.issue_catalog_storefront_links_v1(uuid, jsonb, timestamptz, uuid);

alter table public.store_order_lines
  drop constraint if exists store_order_lines_memo_original_check,
  drop constraint if exists store_order_lines_memo_tags_check,
  drop constraint if exists store_order_lines_memo_pair_check,
  drop constraint if exists store_order_lines_memo_kind_check,
  drop constraint if exists store_order_lines_memo_len_check,
  drop column if exists memo_original,
  drop column if exists memo_edited_at,
  drop column if exists memo_edited_by_user_id,
  drop column if exists memo_tags,
  drop column if exists memo_kind,
  drop column if exists line_memo;

alter table public.store_orders alter column document_version_id set not null;
alter table public.storefront_links drop constraint if exists storefront_links_source_version_check;
alter table public.storefront_links alter column document_version_id set not null;
alter table public.storefront_links drop constraint if exists storefront_links_source_check;
alter table public.storefront_links drop column if exists source;
commit;
