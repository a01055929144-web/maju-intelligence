-- CX-121 review draft rollback. Refuse after any extension state/publication exists.
begin;
do $$ begin
  if exists(select from public.pricing_document_extension_states limit 1)
    or exists(select from public.pricing_document_extension_reviews limit 1)
    or exists(select from public.pricing_document_extension_publishes limit 1)
    or exists(select from public.pricing_document_link_heads limit 1)
    or exists(select from public.pricing_document_share_link_heads limit 1) then
    raise exception 'cx121_down_refuses_existing_data';
  end if;
end $$;
drop trigger guard_pricing_document_extension_publish on public.pricing_document_versions;
drop function public.guard_pricing_document_extension_publish_v1();
drop function public.resolve_pricing_document_link_head_v1(uuid);
drop function public.pricing_document_extension_publish_v1(uuid,text,boolean,uuid,integer,text,text,uuid);
drop function public.pricing_document_extension_save_v1(uuid,text,boolean,uuid,integer,text,jsonb);
drop function public.pricing_document_extension_catalog_v1(uuid,text,boolean,uuid,integer,text,uuid[]);
drop function public.pricing_document_extension_review_v1(uuid,text,boolean,uuid,integer,text,date,text,jsonb,text);
drop function public.pricing_document_extension_price_fingerprint_v1(uuid,uuid,jsonb);
drop table public.pricing_document_share_link_heads;
drop table public.pricing_document_link_heads;
drop table public.pricing_document_extension_publishes;
drop table public.pricing_document_extension_reviews;
drop table public.pricing_document_extension_states;
commit;
