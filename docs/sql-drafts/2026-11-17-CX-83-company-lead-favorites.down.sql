-- CX-83 rollback draft. Data in company_lead_favorites is deleted permanently.
do $$ begin
  if exists(select 1 from public.company_lead_favorites limit 1) then
    raise exception 'refuse_down_with_company_lead_favorites';
  end if;
end $$;
drop function if exists public.set_company_lead_favorite_v1(uuid, uuid, boolean, uuid, text);
drop table if exists public.company_lead_favorites;
