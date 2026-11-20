do $$ begin
  if exists(select 1 from public.lead_bulk_enrichment_jobs limit 1) then raise exception 'refuse_down_with_lead_bulk_history'; end if;
end $$;
drop function if exists public.retry_lead_bulk_enrichment_failures(uuid,uuid);
drop function if exists public.cancel_lead_bulk_enrichment_job(uuid,uuid);
drop function if exists public.complete_lead_bulk_enrichment_item(uuid,uuid,boolean,jsonb,text);
drop function if exists public.claim_lead_bulk_enrichment_item(uuid,uuid,int);
drop function if exists public.create_lead_bulk_enrichment_job(uuid,text,uuid[],uuid,text);
drop table if exists public.lead_bulk_enrichment_items;
drop table if exists public.lead_bulk_enrichment_jobs;
