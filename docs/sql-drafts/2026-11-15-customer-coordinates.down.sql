-- DRAFT ONLY. Separate operating DB rollback approval required.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if exists (
    select 1
    from public.normalized_customers
    where num_nonnulls(latitude, longitude, geocode_accuracy, geocoded_at, geocoded_address) > 0
  ) then
    raise exception 'customer_coordinates_down_refused_data_exists';
  end if;
end $$;

insert into public.admin_audit_logs(action, target_type, metadata)
values (
  'customer_coordinates_schema_removed',
  'normalized_customers',
  jsonb_build_object('draft', '2026-11-15-customer-coordinates.down.sql')
);

alter table public.normalized_customers
  drop constraint normalized_customers_geocoded_address_check,
  drop constraint normalized_customers_geocode_metadata_check,
  drop constraint normalized_customers_geocode_accuracy_check,
  drop constraint normalized_customers_longitude_korea_check,
  drop constraint normalized_customers_latitude_korea_check,
  drop constraint normalized_customers_coordinate_pair_check,
  drop column geocoded_address,
  drop column geocoded_at,
  drop column geocode_accuracy,
  drop column longitude,
  drop column latitude;

commit;
