-- DRAFT rollback. Run only before runtime integration and after explicit approval.
begin;
do $$ begin
  if exists(select 1 from public.company_distributor_industries)
    or exists(select 1 from public.distributor_industry_categories) then
    raise exception 'Remove approved distributor industry data before rollback';
  end if;
end $$;
drop function if exists public.admin_set_company_distributor_industries(uuid, uuid[], text, text);
drop function if exists public.admin_save_distributor_industry_category(uuid, text, text, text, text);
drop function if exists public.preview_distributor_industry_category_impact(uuid);
drop function if exists public.preview_company_distributor_industries(uuid, uuid[]);
drop table if exists public.company_distributor_industries;
drop table if exists public.distributor_industry_categories;
notify pgrst, 'reload schema';
commit;
