\set ON_ERROR_STOP on
begin;

do $$ begin
  if current_setting('server_version_num')::integer < 170000 then
    raise exception 'PostgreSQL 17+ required';
  end if;
end $$;

create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.business_permit_leads (
  id uuid primary key,
  company_id uuid not null,
  merged_into_lead_id uuid,
  unique(company_id, id)
);

\ir ../../docs/sql-drafts/2026-11-17-CX-83-company-lead-favorites.sql

insert into public.business_permit_leads(id, company_id) values
  ('00000000-0000-4000-8000-000000000011', '00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000012', '00000000-0000-4000-8000-000000000002');

select * from public.set_company_lead_favorite_v1(
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', true,
  '00000000-0000-4000-8000-000000000101', '첫 담당자'
);

do $$
declare first_row public.company_lead_favorites%rowtype;
begin
  select * into first_row from public.company_lead_favorites;
  perform pg_sleep(0.01);
  perform public.set_company_lead_favorite_v1(
    first_row.company_id, first_row.lead_id, true,
    '00000000-0000-4000-8000-000000000102', '두 번째 담당자'
  );
  if (select count(*) from public.company_lead_favorites) <> 1 then raise exception 'duplicate favorite'; end if;
  if (select starred_by_name from public.company_lead_favorites) <> '첫 담당자' then raise exception 'actor changed'; end if;
  if (select starred_at from public.company_lead_favorites) <> first_row.starred_at then raise exception 'timestamp changed'; end if;
end $$;

do $$ begin
  begin
    perform public.set_company_lead_favorite_v1(
      '00000000-0000-4000-8000-000000000002', '00000000-0000-4000-8000-000000000011', true,
      null, '다른 회사 사용자'
    );
    raise exception 'cross-company favorite accepted';
  exception when no_data_found then null;
  end;
end $$;

select * from public.set_company_lead_favorite_v1(
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', false,
  '00000000-0000-4000-8000-000000000101', '첫 담당자'
);
select * from public.set_company_lead_favorite_v1(
  '00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', false,
  '00000000-0000-4000-8000-000000000101', '첫 담당자'
);

do $$ begin
  if exists(select 1 from public.company_lead_favorites) then raise exception 'favorite not removed'; end if;
  if has_table_privilege('authenticated', 'public.company_lead_favorites', 'select') then raise exception 'authenticated can read'; end if;
  if not has_table_privilege('service_role', 'public.company_lead_favorites', 'select') then raise exception 'service role cannot read'; end if;
  if has_function_privilege('anon', 'public.set_company_lead_favorite_v1(uuid,uuid,boolean,uuid,text)', 'execute') then raise exception 'anon can execute'; end if;
  if has_function_privilege('authenticated', 'public.set_company_lead_favorite_v1(uuid,uuid,boolean,uuid,text)', 'execute') then raise exception 'authenticated can execute'; end if;
  if not has_function_privilege('service_role', 'public.set_company_lead_favorite_v1(uuid,uuid,boolean,uuid,text)', 'execute') then raise exception 'service role cannot execute'; end if;
end $$;

insert into public.company_lead_favorites(company_id, lead_id, starred_by_name)
values ('00000000-0000-4000-8000-000000000001', '00000000-0000-4000-8000-000000000011', 'rollback guard');
savepoint down_guard;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-17-CX-83-company-lead-favorites.down.sql
\set ON_ERROR_STOP on
rollback to savepoint down_guard;
do $$ begin
  if to_regclass('public.company_lead_favorites') is null then raise exception 'down dropped table with history'; end if;
  if not exists(select 1 from public.company_lead_favorites) then raise exception 'down deleted favorite history'; end if;
end $$;
delete from public.company_lead_favorites;
\ir ../../docs/sql-drafts/2026-11-17-CX-83-company-lead-favorites.down.sql

rollback;
