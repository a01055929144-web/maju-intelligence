-- DRAFT ONLY. Run only after application rollback and only while no separated address data exists.
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$ begin
  if exists(select 1 from public.store_owner_activation_requests
      where delivery_base_address is not null or delivery_address_detail is not null)
    or exists(select 1 from public.normalized_customers
      where delivery_base_address is not null or delivery_address_detail is not null)
    then raise exception 'public_owner_base_address_rollback_requires_manual_recovery'; end if;
end $$;

drop trigger if exists copy_public_owner_delivery_address on public.store_owner_activation_requests;
drop function if exists public.copy_public_owner_delivery_address_v1();
revoke all on function public.complete_public_store_owner_profile_v2(text,text,text,text,text,text,text,text)
  from public,anon,authenticated,service_role;
drop function if exists public.complete_public_store_owner_profile_v2(text,text,text,text,text,text,text,text);
alter table public.store_owner_activation_requests
  drop constraint if exists store_owner_activation_delivery_address_check,
  drop column if exists delivery_base_address,
  drop column if exists delivery_address_detail;
alter table public.normalized_customers
  drop constraint if exists normalized_customers_delivery_address_check,
  drop column if exists delivery_base_address,
  drop column if exists delivery_address_detail;
notify pgrst,'reload schema';
commit;
