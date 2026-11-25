begin;
revoke execute on function public.prepare_store_owner_activation_core_v1(uuid,uuid,uuid,text,text) from service_role;
commit;
