-- S-2b DOWN DRAFT. Refuses rollback while profile changes or company notifications exist.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
  if to_regclass('public.company_notifications') is null then raise exception 's2b_not_applied'; end if;
  if exists(select 1 from public.company_notifications) or exists(select 1 from public.store_profile_change_events)
    or exists(select 1 from public.store_profiles where representative_name is not null or access_note is not null
      or delivery_contact_phone is not null or preferred_delivery_time is not null)
    then raise exception 's2b_down_refused_data_exists'; end if;
end $$;
drop function public.apply_store_profile_notification_v1(uuid,uuid,uuid,boolean);
drop function public.confirm_new_store_account_v1(uuid,uuid,uuid,uuid,text);
drop function public.update_store_profile_v1(uuid,uuid,jsonb,text);
drop table public.store_profile_change_events;
drop table public.company_notifications;
alter table public.store_profiles drop column representative_name,drop column access_note,
  drop column delivery_contact_phone,drop column preferred_delivery_time;
commit;
