\set ON_ERROR_STOP on
-- CC-22a company kind. Runs in a disposable DB after tests/sql/pricing-p0-fixture.sql (companies(id) only).
do $$ begin
  if current_database() <> 'company_kind_cc22a_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_company_kind_pg17_required'; end if;
end $$;
insert into public.companies(id) values
 ('898d85fc-c475-47e0-9943-91709e13a4bb'), ('04ebb7bb-8da0-4723-8211-f2a947939344'), ('00000000-0000-4000-8000-000000000001');

\ir ../../docs/sql-drafts/20261111-CC-22a-company-kind.sql

do $$ begin
  if (select company_kind from companies where id = '898d85fc-c475-47e0-9943-91709e13a4bb') <> 'internal' then raise exception 'vibe must be internal'; end if;
  if (select company_kind from companies where id = '04ebb7bb-8da0-4723-8211-f2a947939344') <> 'pilot' then raise exception 'js retail must be pilot'; end if;
  if (select company_kind from companies where id = '00000000-0000-4000-8000-000000000001') <> 'customer' then raise exception 'others default to customer'; end if;
  -- new companies default to customer
  insert into companies(id) values ('00000000-0000-4000-8000-000000000002');
  if (select company_kind from companies where id = '00000000-0000-4000-8000-000000000002') <> 'customer' then raise exception 'default must be customer'; end if;
  begin
    update companies set company_kind = 'hq' where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'invalid kind accepted';
  exception when check_violation then null; end;
  begin
    update companies set company_kind = null where id = '00000000-0000-4000-8000-000000000001';
    raise exception 'null kind accepted';
  exception when not_null_violation then null; end;
end $$;

-- a second apply is refused, down removes the column, and up can be applied again.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261111-CC-22a-company-kind.sql
rollback;
\set ON_ERROR_STOP on
\ir ../../docs/sql-drafts/20261111-CC-22a-company-kind.down.sql
do $$ begin
  if exists(select 1 from information_schema.columns where table_name = 'companies' and column_name = 'company_kind') then raise exception 'down incomplete'; end if;
end $$;
\ir ../../docs/sql-drafts/20261111-CC-22a-company-kind.sql
select 'CC-22a PG17 OK';
