\set ON_ERROR_STOP on
do $$ begin
 if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'PostgreSQL 17 required'; end if;
end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.delivery_route_stops(
 id uuid primary key, company_id uuid not null, driver_member_id uuid not null, route_date date not null,
 stop_type text not null, status text not null default 'planned', stop_order integer not null,
 arrived_at timestamptz, completed_at timestamptz, updated_at timestamptz default now()
);
\ir 2026-11-18-CX-108-driver-bulk-complete.sql

insert into public.delivery_route_stops(id,company_id,driver_member_id,route_date,stop_type,status,stop_order) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-18','delivery','planned',1),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-18','delivery','arrived',2),
 ('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','2026-11-18','delivery','planned',3);

select public.complete_driver_delivery_stops_atomic(
 '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-18',
 array['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid]);
do $$ begin
 if (select count(distinct completed_at) from delivery_route_stops where id in ('10000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002')) <> 1
    or (select count(*) from delivery_route_stops where status='completed') <> 2
 then raise exception 'atomic completion failed'; end if;
end $$;

update delivery_route_stops set status='planned',completed_at=null where company_id='20000000-0000-4000-8000-000000000001';
update delivery_route_stops set status='completed',completed_at=clock_timestamp() where id='10000000-0000-4000-8000-000000000002';
do $$ begin
 perform public.complete_driver_delivery_stops_atomic(
  '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-18',
  array['10000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000002'::uuid]);
 raise exception 'partial completion accepted';
exception when serialization_failure then null;
end $$;
do $$ begin
 if (select status from delivery_route_stops where id='10000000-0000-4000-8000-000000000001') <> 'planned'
 then raise exception 'failed batch mutated another stop'; end if;
end $$;

do $$ begin
 perform public.complete_driver_delivery_stops_atomic(
  '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-18',
  array['10000000-0000-4000-8000-000000000003'::uuid]);
 raise exception 'cross-company stop accepted';
exception when serialization_failure then null;
end $$;

\ir 2026-11-18-CX-108-driver-bulk-complete.down.sql
drop table public.delivery_route_stops;
