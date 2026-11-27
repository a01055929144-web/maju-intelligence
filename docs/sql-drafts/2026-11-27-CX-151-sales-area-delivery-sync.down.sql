-- CX-151 rollback draft. Synced delivery territory rows are intentionally retained.
begin;

drop function if exists public.set_sales_area_delivery_disabled_v1(uuid, uuid, boolean);
drop function if exists public.sync_sales_areas_to_default_delivery_territory_v1(uuid);
drop function if exists public.sales_area_delivery_sync_status_v1(uuid);

alter table public.company_lead_search_regions
  drop column if exists delivery_disabled;

commit;
