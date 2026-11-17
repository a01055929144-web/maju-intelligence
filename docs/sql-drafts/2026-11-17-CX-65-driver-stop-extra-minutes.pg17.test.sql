\set ON_ERROR_STOP on
do $$ begin
 if current_setting('server_version_num')::int not between 170000 and 179999
 then raise exception 'PostgreSQL 17 required'; end if;
end $$;
create schema if not exists public;
create table public.delivery_route_stops(id uuid primary key);
\ir 2026-11-17-CX-65-driver-stop-extra-minutes.sql

do $$
begin
  if not exists (
    select 1 from information_schema.columns
    where table_schema = 'public' and table_name = 'delivery_route_stops' and column_name = 'extra_minutes'
  ) then raise exception 'extra_minutes was not created'; end if;
end $$;

-- The schema-level 0..240 check is intentionally verified without retaining rows.
-- Existing fixture-independent tests can inspect the constraint definition.
do $$
declare definition text;
begin
  select pg_get_constraintdef(oid) into definition
  from pg_constraint where conname = 'delivery_route_stops_extra_minutes_range';
  if definition not like '%extra_minutes >= 0%' or definition not like '%extra_minutes <= 240%' then
    raise exception 'unexpected range constraint: %', definition;
  end if;
end $$;
\ir 2026-11-17-CX-65-driver-stop-extra-minutes.down.sql
drop table public.delivery_route_stops;
