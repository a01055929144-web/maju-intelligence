-- DRAFT ONLY. Separate operating DB approval required. No backfill or application change.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.normalized_customers') is null
    or to_regclass('public.admin_audit_logs') is null then
    raise exception 'customer_coordinates_prerequisites_required';
  end if;
end $$;

alter table public.normalized_customers
  add column latitude double precision,
  add column longitude double precision,
  add column geocode_accuracy text,
  add column geocoded_at timestamptz,
  add column geocoded_address text,
  add constraint normalized_customers_coordinate_pair_check
    check ((latitude is null) = (longitude is null)),
  add constraint normalized_customers_latitude_korea_check
    check (latitude is null or latitude between 33 and 39),
  add constraint normalized_customers_longitude_korea_check
    check (longitude is null or longitude between 124 and 132),
  add constraint normalized_customers_geocode_accuracy_check
    check (geocode_accuracy is null or geocode_accuracy in ('exact', 'approx', 'manual', 'lead')),
  add constraint normalized_customers_geocode_metadata_check
    check (
      (latitude is null and geocode_accuracy is null and geocoded_at is null)
      or
      (latitude is not null and geocode_accuracy is not null and geocoded_at is not null)
    ),
  add constraint normalized_customers_geocoded_address_check
    check (geocoded_address is null or nullif(btrim(geocoded_address), '') is not null);

comment on column public.normalized_customers.geocode_accuracy is
  'Coordinate source quality: exact address, approximate address, manual pin, or converted lead.';
comment on column public.normalized_customers.geocoded_address is
  'Address text used to obtain the stored coordinate; null is allowed for a manual pin.';

insert into public.admin_audit_logs(action, target_type, metadata)
values (
  'customer_coordinates_schema_added',
  'normalized_customers',
  jsonb_build_object(
    'draft', '2026-11-15-customer-coordinates.sql',
    'existing_rows', (select count(*) from public.normalized_customers),
    'backfilled_rows', 0
  )
);

commit;
