-- Disposable PostgreSQL 17 fixture only. Never run against production.
\set ON_ERROR_STOP on
do $$ begin
 if current_setting('server_version_num')::int not between 170000 and 179999
 then raise exception 'PostgreSQL 17 required'; end if;
end $$;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.company_members(
 id uuid primary key, company_id uuid not null, user_id uuid not null, role text not null,
 status text not null, permission_role text, duties text[] not null default '{}', membership_expires_at timestamptz
);
create table public.store_profiles(
 id uuid primary key, status text not null, access_password text
);
create table public.store_accounts(
 id uuid primary key, company_id uuid not null, customer_id uuid not null,
 store_profile_id uuid not null, status text not null
);
create table public.delivery_route_stops(
 id uuid primary key, company_id uuid not null, driver_member_id uuid,
 customer_id uuid, stop_type text not null, route_date date not null, status text not null
);

insert into public.store_profiles values
 ('10000000-0000-4000-8000-000000000001','active','7391'),
 ('10000000-0000-4000-8000-000000000002','active','other-company-secret');
insert into public.store_accounts values
 ('20000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active'),
 ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','active');
insert into public.company_members values
 ('50000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','owner','active','owner','{}',null),
 ('50000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000002','driver','active','staff','{delivery}',null),
 ('50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000003','member','active','staff','{sales}',null),
 ('50000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000004','driver','active','staff','{delivery}',clock_timestamp()-interval '1 minute'),
 ('50000000-0000-4000-8000-000000000005','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000005','manager','inactive','manager','{}',null),
 ('50000000-0000-4000-8000-000000000006','30000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000006','driver','active','staff','{delivery}',null);
insert into public.delivery_route_stops values
 ('70000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','delivery',(clock_timestamp() at time zone 'Asia/Seoul')::date,'planned'),
 ('70000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000004','40000000-0000-4000-8000-000000000001','delivery',(clock_timestamp() at time zone 'Asia/Seoul')::date,'planned'),
 ('70000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000001','delivery',(clock_timestamp() at time zone 'Asia/Seoul')::date-1,'planned');

\ir 20261118-CX-73-store-access-password-read.sql

do $$
declare
 company_a constant uuid := '30000000-0000-4000-8000-000000000001';
 profile_a constant uuid := '10000000-0000-4000-8000-000000000001';
begin
 if public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000001',profile_a,null)<>'7391'
 then raise exception 'authorized office read failed'; end if;
 if public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000002',profile_a,'70000000-0000-4000-8000-000000000001')<>'7391'
 then raise exception 'assigned driver stop read failed'; end if;

 begin perform public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000002',profile_a,null);
  raise exception 'driver without stop accepted'; exception when raise_exception then
   if sqlerrm<>'store_access_password_read_forbidden' then raise; end if; end;
 begin perform public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000002',profile_a,'70000000-0000-4000-8000-000000000003');
  raise exception 'historical stop accepted'; exception when raise_exception then
   if sqlerrm<>'store_access_password_read_forbidden' then raise; end if; end;
 begin perform public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000003',profile_a,'70000000-0000-4000-8000-000000000001');
  raise exception 'sales staff accepted'; exception when raise_exception then
   if sqlerrm<>'store_access_password_read_forbidden' then raise; end if; end;
 begin perform public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000006',profile_a,'70000000-0000-4000-8000-000000000001');
  raise exception 'other driver stop accepted'; exception when raise_exception then
   if sqlerrm<>'store_access_password_read_forbidden' then raise; end if; end;
 begin perform public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000004',profile_a,'70000000-0000-4000-8000-000000000002');
  raise exception 'expired driver accepted'; exception when raise_exception then
   if sqlerrm<>'store_access_password_read_forbidden' then raise; end if; end;
 begin perform public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000005',profile_a,null);
  raise exception 'inactive manager accepted'; exception when raise_exception then
   if sqlerrm<>'store_access_password_read_forbidden' then raise; end if; end;
 begin perform public.read_store_access_password_v1(company_a,'60000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',null);
  raise exception 'cross-company store accepted'; exception when raise_exception then
   if sqlerrm<>'store_access_password_read_forbidden' then raise; end if; end;
end $$;

do $$ begin
 if has_function_privilege('anon','public.read_store_access_password_v1(uuid,uuid,uuid,uuid)','execute')
 or has_function_privilege('authenticated','public.read_store_access_password_v1(uuid,uuid,uuid,uuid)','execute')
 or not has_function_privilege('service_role','public.read_store_access_password_v1(uuid,uuid,uuid,uuid)','execute')
 then raise exception 'CX-73 function ACL failed'; end if;
end $$;

\ir 20261118-CX-73-store-access-password-read.down.sql
do $$ begin
 if to_regprocedure('public.read_store_access_password_v1(uuid,uuid,uuid,uuid)') is not null
 then raise exception 'CX-73 down failed'; end if;
end $$;
select 'CX-73 store access password read PG17 checks passed' as result;
