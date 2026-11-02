\set ON_ERROR_STOP on

begin;
create extension if not exists pgcrypto;
create schema if not exists auth;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated nologin; end if;
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role nologin; end if;
end $$;

drop table if exists public.admin_audit_logs cascade;
drop table if exists public.staff_invitations cascade;
drop table if exists public.company_members cascade;
drop table if exists public.app_users cascade;
drop table if exists public.companies cascade;

create table public.companies (id uuid primary key, name text not null);
create table public.app_users (id uuid primary key, name text not null);
create table public.company_members (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), user_id uuid not null references public.app_users(id),
  role text not null, permission_role text, duties text[] not null default '{}', status text not null default 'active', updated_at timestamptz default now(), unique(company_id,user_id)
);
create table public.staff_invitations (
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), accepted_by uuid references public.app_users(id),
  role text not null, permission_role text, duties text[] not null default '{}'
);
create table public.admin_audit_logs (
  id uuid primary key default gen_random_uuid(), actor_user_id uuid, company_id uuid, action text, target_type text, target_id uuid, metadata jsonb, created_at timestamptz default now()
);

\ir 20261102044000_wo21_role_settings.sql

insert into public.companies(id,name) values ('10000000-0000-4000-8000-000000000001','테스트 회사');
insert into public.app_users(id,name) values
 ('20000000-0000-4000-8000-000000000001','대표'),
 ('20000000-0000-4000-8000-000000000002','영업'),
 ('20000000-0000-4000-8000-000000000003','배송');
insert into public.company_members(company_id,user_id,role,permission_role,duties) values
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner','owner',array['sales','delivery']),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','sales','staff',array['sales']),
 ('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','driver','staff',array['delivery']);

select public.apply_role_settings_batch_v1(
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 array['20000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-4000-8000-000000000003'::uuid],
 'accounting','{"export_data":false}'::jsonb
);

do $$ begin
  if (select count(*) from public.company_members where permission_group_key='accounting' and permission_overrides='{"export_data":false}'::jsonb) <> 2 then
    raise exception 'batch_not_applied';
  end if;
  if (select count(*) from public.admin_audit_logs where action='role_settings_batch_applied') <> 2 then raise exception 'audit_missing'; end if;
  begin
    perform public.apply_role_settings_batch_v1(
      '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      array['20000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000002'::uuid], 'manager','{}'::jsonb
    );
    raise exception 'owner_mixed_batch_accepted';
  exception when others then
    if sqlerrm = 'owner_mixed_batch_accepted' then raise; end if;
  end;
end $$;

rollback;
