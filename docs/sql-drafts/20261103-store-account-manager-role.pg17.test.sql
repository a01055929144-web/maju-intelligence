\set ON_ERROR_STOP on
drop schema if exists public cascade;
create schema public;

create table public.store_account_members (
  id uuid primary key,
  role text not null constraint store_account_members_role_check
    check(role in ('owner','staff'))
);

insert into public.store_account_members(id,role) values
  ('10000000-0000-4000-8000-000000000001','owner'),
  ('10000000-0000-4000-8000-000000000002','staff');

\ir 20261103-store-account-manager-role.sql

do $$
begin
  if (select count(*) from public.store_account_members)<>2 then
    raise exception 'existing_rows_changed';
  end if;
end $$;

insert into public.store_account_members(id,role)
values('10000000-0000-4000-8000-000000000003','manager');

do $$
begin
  begin
    insert into public.store_account_members(id,role)
    values('10000000-0000-4000-8000-000000000004','admin');
    raise exception 'unknown_role_was_allowed';
  exception when check_violation then null;
  end;
end $$;

-- manager 데이터가 있으면 down 전체가 롤백돼 manager 허용 상태를 유지한다.
\set ON_ERROR_STOP off
\ir 20261103-store-account-manager-role.down.sql
\set ON_ERROR_STOP on
do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.store_account_members'::regclass
      and conname='store_account_members_role_check'
      and pg_get_constraintdef(oid) like '%manager%'
  ) then
    raise exception 'unsafe_down_was_not_rolled_back';
  end if;
end $$;

delete from public.store_account_members where role='manager';
\ir 20261103-store-account-manager-role.down.sql

do $$
begin
  if (select count(*) from public.store_account_members)<>2 then
    raise exception 'down_changed_existing_rows';
  end if;
  begin
    insert into public.store_account_members(id,role)
    values('10000000-0000-4000-8000-000000000005','manager');
    raise exception 'manager_still_allowed_after_down';
  exception when check_violation then null;
  end;
end $$;

select 'store account manager role PG17 checks passed' as result;
