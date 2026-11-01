\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;
create table if not exists public.companies(id uuid primary key);
create table if not exists public.product_categories(id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id));
\ir 20261102-WO-03-maju-category-match.sql

insert into public.companies(id) values ('10000000-0000-4000-8000-000000000001');
insert into public.maju_categories(name, industry_keys) values ('채소', array['식자재']) returning id \gset
insert into public.product_categories(company_id, level, name, maju_category_id) values ('10000000-0000-4000-8000-000000000001', 1, '신선 채소', :'id');
do $$ begin
  if has_table_privilege('anon', 'public.maju_categories', 'select') or has_table_privilege('authenticated', 'public.maju_categories', 'select') then
    raise exception 'maju categories exposed to public roles';
  end if;
  if not has_table_privilege('service_role', 'public.maju_categories', 'select') then raise exception 'service role cannot read maju categories'; end if;
end $$;
