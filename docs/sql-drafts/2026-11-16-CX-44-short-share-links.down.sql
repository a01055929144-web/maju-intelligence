-- CX-44 rollback draft. Disable SHORT_SHARE_LINKS callers first.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';
do $$ begin
  if exists (select 1 from public.pricing_document_share_links where short_code is not null)
    or exists (select 1 from public.storefront_links where short_code is not null)
    or exists (select 1 from public.pricing_document_share_events)
    or exists (
      select 1 from public.storefront_link_events
      where event_type in ('order_start', 'signup', 'first_order')
    ) then
    raise exception 'CX-44 down refused: short-link tracking evidence exists';
  end if;
end $$;
drop function public.record_pricing_document_short_event_v1(uuid,uuid,text,text);
drop function public.resolve_storefront_short_link_v1(text,text,text,boolean,uuid);
drop function public.resolve_pricing_document_short_link_v1(text,text,text,boolean,uuid);
drop function public.assign_storefront_short_code_v1(uuid,uuid,text);
drop function public.assign_pricing_document_short_code_v1(uuid,uuid,text,uuid);
drop function public.short_share_code_v1();
drop trigger storefront_short_code_guard on public.storefront_links;
drop trigger pricing_document_share_short_code_guard on public.pricing_document_share_links;
drop function public.guard_short_share_code_v1();
drop table public.pricing_document_share_events;
alter table public.storefront_link_events drop constraint storefront_link_events_event_type_check;
alter table public.storefront_link_events add constraint storefront_link_events_event_type_check
  check (event_type in ('view','cart','order','sent','reminder'));
drop index public.storefront_links_short_code_uq;
alter table public.storefront_links
  drop constraint storefront_links_short_channel_check,
  drop constraint storefront_links_short_code_check,
  drop column short_channel,
  drop column short_code;
drop index public.pricing_document_share_links_short_code_uq;
alter table public.pricing_document_share_links
  drop constraint pricing_document_share_links_short_sender_fk,
  drop constraint pricing_document_share_links_view_count_check,
  drop constraint pricing_document_share_links_short_channel_check,
  drop constraint pricing_document_share_links_short_code_check,
  drop column view_count,
  drop column last_viewed_at,
  drop column first_viewed_at,
  drop column short_sent_by_member_id,
  drop column short_channel,
  drop column short_code;
commit;
