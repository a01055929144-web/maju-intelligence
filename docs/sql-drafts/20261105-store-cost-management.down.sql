-- DRAFT rollback. Safe only before the feature is enabled and after explicit approval.
begin;
do $$
begin
  if exists(select 1 from public.store_cost_revisions limit 1)
    or exists(select 1 from public.store_cost_items limit 1) then
    raise exception 'store_cost_data_exists';
  end if;
end $$;
drop table public.store_cost_revisions;
drop table public.store_cost_items;
commit;
