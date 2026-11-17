-- CX-83 rollback draft. Data in company_lead_favorites is deleted permanently.
drop function if exists public.set_company_lead_favorite_v1(uuid, uuid, boolean, uuid, text);
drop table if exists public.company_lead_favorites;
