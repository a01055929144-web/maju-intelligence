\set ON_ERROR_STOP on
do $$ begin
 if current_setting('server_version_num')::int not between 170000 and 179999 then raise exception 'PostgreSQL 17 required'; end if;
end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table public.delivery_route_stops(
 id uuid primary key,company_id uuid not null,driver_member_id uuid not null,route_date date not null,
 stop_type text not null,status text not null default 'planned',stop_order integer not null,
 arrived_at timestamptz,completed_at timestamptz,reason_category text,reason_code text,reason_detail text,
 handed_to_owner boolean default false,updated_at timestamptz default now(),
 constraint delivery_route_stops_driver_order_uq unique(company_id,route_date,driver_member_id,stop_order) deferrable initially deferred
);
\ir 2026-11-17-CX-65-driver-route-actions.sql

insert into public.delivery_route_stops(id,company_id,driver_member_id,route_date,stop_type,stop_order) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-17','delivery',1),
 ('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-17','delivery',2);
select public.reorder_driver_delivery_stops(
 '20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','2026-11-17',
 array['10000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000001'::uuid],array[1,2]);
do $$ begin
 if (select stop_order from delivery_route_stops where id='10000000-0000-4000-8000-000000000001')<>2 then raise exception 'atomic swap failed'; end if;
end $$;

update delivery_route_stops set status='not_delivered',arrived_at=clock_timestamp(),completed_at=clock_timestamp(),reason_code='closed' where stop_order=1;
select public.undo_driver_route_stop('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',(select completed_at from delivery_route_stops where id='10000000-0000-4000-8000-000000000002'));
do $$ begin
 if (select status from delivery_route_stops where id='10000000-0000-4000-8000-000000000002')<>'arrived' then raise exception 'undo failed'; end if;
end $$;

update delivery_route_stops set status='completed',arrived_at=clock_timestamp()-interval '10 seconds',completed_at=clock_timestamp()-interval '6 seconds' where stop_order=2;
do $$ begin
 perform public.undo_driver_route_stop('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',(select completed_at from delivery_route_stops where id='10000000-0000-4000-8000-000000000001'));
 raise exception 'expired undo accepted';
exception when serialization_failure then null;
end $$;

\ir 2026-11-17-CX-65-driver-route-actions.down.sql
drop table public.delivery_route_stops;
