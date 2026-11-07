-- Refuse destructive rollback once activation history exists.
do $$ begin
  if exists(select 1 from public.store_owner_activation_requests) then raise exception 'store_owner_activation_history_exists'; end if;
end $$;
drop function public.activate_store_owner_v1(text,uuid,text,timestamptz,text,text,timestamptz,text);
drop function public.prepare_store_owner_activation_v1(uuid,uuid,uuid,text);
drop table public.store_owner_activation_requests;
