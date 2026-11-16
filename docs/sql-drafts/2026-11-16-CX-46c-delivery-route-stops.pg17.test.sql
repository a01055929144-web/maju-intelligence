-- Disposable PostgreSQL 17 fixture only. Never run against production.
\set ON_ERROR_STOP on
do $$ begin
 if current_setting('server_version_num')::int not between 170000 and 179999
 then raise exception 'PostgreSQL 17 required'; end if;
end $$;
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table companies(id uuid primary key);
create table app_users(id uuid primary key);
create table normalized_customers(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table business_permit_leads(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table company_members(id uuid primary key,company_id uuid not null,user_id uuid,unique(company_id,id));
create table delivery_vehicle_master(id uuid primary key,company_id uuid not null);
create table route_plan_confirmations(
 id uuid primary key,company_id uuid not null,driver_name text not null,route_date date not null,
 customer_ids jsonb not null default '[]',created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),unique(company_id,driver_name,route_date));
create table store_orders(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table business_documents(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table company_message_templates(id uuid primary key,company_id uuid not null);
create table driver_message_templates(id uuid primary key,company_id uuid not null,driver_id uuid not null);

insert into companies values
 ('10000000-0000-4000-8000-000000000001'),('10000000-0000-4000-8000-000000000002');
insert into app_users values('90000000-0000-4000-8000-000000000001');
insert into normalized_customers values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001'),
 ('20000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000002');
insert into business_permit_leads values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into company_members values
 ('40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',null),
 ('40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002',null);
insert into delivery_vehicle_master values
 ('50000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('50000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into store_orders values
 ('60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('60000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into business_documents values
 ('70000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
 ('70000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into company_message_templates values
 ('80000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into driver_message_templates values
 ('81000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','90000000-0000-4000-8000-000000000001');
insert into route_plan_confirmations values(
 '82000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '기사 A','2026-11-16','["20000000-0000-4000-8000-000000000002","20000000-0000-4000-8000-000000000001"]',now(),now());

\ir 2026-11-16-CX-46c-delivery-route-stops.sql

do $$ begin
 if (select array_agg(customer_id order by stop_order) from delivery_route_stops)
    <> array['20000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-4000-8000-000000000001'::uuid]
 or (select customer_ids from route_plan_confirmations limit 1)
    <> '["20000000-0000-4000-8000-000000000002","20000000-0000-4000-8000-000000000001"]'::jsonb
 or not (select relrowsecurity from pg_class where oid='delivery_route_stops'::regclass)
 or has_table_privilege('authenticated','delivery_route_stops','select')
 or has_table_privilege('anon','delivery_route_stop_photos','insert')
 or not has_table_privilege('service_role','delivery_route_stops','update')
 or (select count(*) from driver_message_templates)<>1
 then raise exception 'CX-46c backfill, RLS, ACL, or template reuse failed'; end if;
end $$;

do $$
declare company_a constant uuid:='10000000-0000-4000-8000-000000000001';
begin
 begin insert into delivery_route_stops(company_id,route_date,driver_member_id,driver_name_snapshot,stop_order,stop_type,customer_id,lead_id)
  values(company_a,'2026-11-17','40000000-0000-4000-8000-000000000001','기사 A',1,'delivery','20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
  raise exception 'subject XOR accepted'; exception when check_violation then null; end;
 begin insert into delivery_route_stops(company_id,route_date,driver_member_id,driver_name_snapshot,stop_order,stop_type,customer_id)
  values(company_a,'2026-11-17','40000000-0000-4000-8000-000000000001','기사 A',1,'sales','20000000-0000-4000-8000-000000000001');
  raise exception 'sales customer accepted'; exception when check_violation then null; end;
 begin insert into delivery_route_stops(company_id,route_date,driver_member_id,driver_name_snapshot,stop_order,stop_type,customer_id)
  values(company_a,'2026-11-17','40000000-0000-4000-8000-000000000001','기사 A',1,'delivery','20000000-0000-4000-8000-000000000003');
  raise exception 'cross-company customer accepted'; exception when foreign_key_violation then null; end;
 begin insert into delivery_route_stops(company_id,route_date,driver_member_id,driver_name_snapshot,stop_order,stop_type,lead_id,vehicle_id)
  values(company_a,'2026-11-17','40000000-0000-4000-8000-000000000001','기사 A',1,'sales','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002');
  raise exception 'cross-company vehicle accepted'; exception when foreign_key_violation then null; end;
 begin update delivery_route_stops set status='partial' where stop_order=1;
  raise exception 'partial without reason accepted'; exception when check_violation then null; end;
 begin update delivery_route_stops set status='not_delivered',reason_code='quantity_short' where stop_order=1;
  raise exception 'wrong reason category accepted'; exception when foreign_key_violation then null; end;
 begin update delivery_route_stops set arrived_latitude=37.5 where stop_order=1;
  raise exception 'half coordinate accepted'; exception when check_violation then null; end;
end $$;

insert into delivery_route_stops(
 id,company_id,route_date,driver_member_id,driver_name_snapshot,stop_order,stop_type,lead_id,status,reason_code,handed_to_owner)
values('83000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
 '2026-11-17','40000000-0000-4000-8000-000000000001','기사 A',1,'sales','30000000-0000-4000-8000-000000000001','not_delivered','closed',false);

insert into delivery_route_stops(
 id,company_id,route_date,driver_member_id,driver_name_snapshot,stop_order,stop_type,customer_id)
values
 ('84000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','2026-11-18','40000000-0000-4000-8000-000000000001','기사 A',1,'delivery','20000000-0000-4000-8000-000000000001'),
 ('84000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','2026-11-18','40000000-0000-4000-8000-000000000001','기사 A',2,'delivery','20000000-0000-4000-8000-000000000002');
begin;
set constraints delivery_route_stops_driver_order_uq deferred;
update delivery_route_stops set stop_order=2 where id='84000000-0000-4000-8000-000000000001';
update delivery_route_stops set stop_order=1 where id='84000000-0000-4000-8000-000000000002';
commit;
do $$ begin
 if (select stop_order from delivery_route_stops where id='84000000-0000-4000-8000-000000000001')<>2
 or (select stop_order from delivery_route_stops where id='84000000-0000-4000-8000-000000000002')<>1
 then raise exception 'deferred stop order swap failed'; end if;
end $$;

do $$ begin
 begin insert into delivery_route_stop_photos(company_id,stop_id,order_id,storage_path,mime_type,sort_order)
  values('10000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',
   '60000000-0000-4000-8000-000000000002','private/cross.jpg','image/jpeg',1);
  raise exception 'cross-company order photo accepted'; exception when foreign_key_violation then null; end;
 begin insert into delivery_route_stop_photos(company_id,stop_id,storage_path,mime_type,sort_order)
  values('10000000-0000-4000-8000-000000000001','83000000-0000-4000-8000-000000000001',
   'private/six.jpg','image/jpeg',6);
  raise exception 'sixth photo accepted'; exception when check_violation then null; end;
end $$;

do $$ begin
 if not exists(select 1 from delivery_route_stops where source='manual') then
  raise exception 'CX-46c down refusal fixture missing';
 end if;
end $$;

delete from delivery_route_stops where source='manual';
\ir 2026-11-16-CX-46c-delivery-route-stops.down.sql
do $$ begin
 if to_regclass('public.delivery_route_stops') is not null
 or (select count(*) from route_plan_confirmations)<>1
 then raise exception 'CX-46c safe down failed'; end if;
end $$;
select 'CX-46c delivery route stops PG17 checks passed' as result;
