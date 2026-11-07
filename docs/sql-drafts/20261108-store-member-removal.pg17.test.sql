\set ON_ERROR_STOP on

begin;
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create schema if not exists public;
create table public.store_accounts(
  id uuid, company_id uuid, status text not null, business_status text not null,
  primary key(company_id,id)
);
create table public.store_account_members(
  id uuid, company_id uuid, store_account_id uuid, role text not null, status text not null,
  removed_by_member_id uuid, removed_at timestamptz,
  primary key(company_id,store_account_id,id),
  foreign key(company_id,store_account_id) references public.store_accounts(company_id,id),
  foreign key(company_id,store_account_id,removed_by_member_id) references public.store_account_members(company_id,store_account_id,id),
  check(role in ('owner','manager','staff')), check((status='removed')=(removed_at is not null))
);
create table public.store_account_member_events(
  id bigint generated always as identity primary key, company_id uuid, store_account_id uuid,
  member_id uuid, event_type text, actor_member_id uuid,
  foreign key(company_id,store_account_id,member_id) references public.store_account_members(company_id,store_account_id,id),
  foreign key(company_id,store_account_id,actor_member_id) references public.store_account_members(company_id,store_account_id,id)
);
commit;

\ir 20261108-store-member-removal.sql

insert into public.store_accounts values
 ('20000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','active','active'),
 ('20000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','active','active');
insert into public.store_account_members(id,company_id,store_account_id,role,status) values
 ('30000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner','active'),
 ('30000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','manager','active'),
 ('30000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','staff','active'),
 ('30000000-0000-4000-8000-000000000004','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','staff','active'),
 ('30000000-0000-4000-8000-000000000005','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','owner','active');

select public.remove_store_member_v1(
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000003');
select public.remove_store_member_v1(
 '10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
 '30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002');

do $$ begin
  if (select count(*) from public.store_account_members where status='removed' and removed_at is not null and removed_by_member_id is not null)<>2
    or (select count(*) from public.store_account_member_events where event_type='remove')<>2 then raise exception 'removal audit failed'; end if;
  begin
    perform public.remove_store_member_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001');
    raise exception 'owner removal should fail'; exception when others then if sqlerrm='owner removal should fail' then raise; end if; end;
  begin
    perform public.remove_store_member_v1('10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      '30000000-0000-4000-8000-000000000004','30000000-0000-4000-8000-000000000005');
    raise exception 'cross-store removal should fail'; exception when others then if sqlerrm='cross-store removal should fail' then raise; end if; end;
end $$;

\ir 20261108-store-member-removal.down.sql
drop table public.store_account_member_events, public.store_account_members, public.store_accounts;
