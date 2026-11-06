-- DRAFT ONLY. Review data before rollback.
begin;
do $$ begin
  if exists(select 1 from public.store_cost_imports limit 1) then
    raise exception 'store_cost_import_data_exists';
  end if;
end $$;
drop function public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb);
drop table public.store_cost_imports;
commit;
