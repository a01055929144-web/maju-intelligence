-- Fixture only, executed inside a disposable local database by the test runner.
do $$ begin if not exists(select from pg_roles where rolname='anon') then create role anon; end if; end $$;
do $$ begin if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if; end $$;
do $$ begin if not exists(select from pg_roles where rolname='service_role') then create role service_role bypassrls; end if; end $$;
create table public.companies(id uuid primary key);
create table public.product_catalog(id uuid primary key,company_id uuid not null references companies(id) on delete cascade,
 canonical_name text,purchase_product_name text not null,purchase_price numeric(14,2) not null,is_active boolean not null default true,unique(company_id,id));
grant select,update on companies,product_catalog to service_role;
