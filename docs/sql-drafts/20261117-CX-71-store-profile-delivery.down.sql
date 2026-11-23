-- Turn STORE_PROFILE_DELIVERY off before this guarded rollback.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';
do $$ begin
  if exists(select 1 from public.store_profiles where tax_invoice_email is not null or receive_method is not null or access_password is not null)
    or exists(select 1 from public.store_profile_attachments)
    or exists(select 1 from public.store_profile_delivery_requests)
  then raise exception 'cx71_delivery_data_exists'; end if;
end $$;
drop function public.update_store_profile_delivery_v1(uuid,uuid,jsonb,text);
drop table public.store_profile_delivery_requests;
drop table public.store_profile_attachments;
alter table public.store_profiles drop column access_password_updated_at,drop column access_password,drop column receive_method,drop column tax_invoice_email;
notify pgrst,'reload schema';
commit;
