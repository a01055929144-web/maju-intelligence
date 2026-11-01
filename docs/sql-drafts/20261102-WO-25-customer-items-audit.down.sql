-- DRAFT ONLY: disable file import flags first. Preserve import audit records.
begin;
do $$ begin
 if exists(select 1 from public.import_jobs where target_type='customer_items') then
   raise exception 'Export and explicitly approve archival of customer_items audit jobs before schema down';
 end if;
end $$;
drop function public.import_customer_items_audited(uuid,text,text,text,jsonb,jsonb);
alter table public.import_jobs drop constraint import_jobs_target_type_check;
alter table public.import_jobs add constraint import_jobs_target_type_check
 check(target_type in ('product','customer','supplier','price_sheet','document'));
commit;
