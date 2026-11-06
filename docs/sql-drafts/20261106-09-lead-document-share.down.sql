-- REVIEW-ONLY 09 DRAFT. First turn sharing OFF; never remove real link/delivery history.
begin;
do $$ begin
  if exists(select from public.pricing_document_share_links limit 1) then
    raise exception 'lead_share_down_refused_data_exists';
  end if;
end $$;
drop function public.record_pricing_lead_share_delivery(uuid,text,uuid,uuid,uuid,uuid,uuid,text,text,text);

drop table public.pricing_document_share_links;
drop function public.validate_pricing_document_share_link();
commit;
