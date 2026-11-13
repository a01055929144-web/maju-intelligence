\set ON_ERROR_STOP on
do $$ begin
  if current_setting('server_version_num')::int / 10000 <> 17 then
    raise exception 'postgres_17_required';
  end if;
end $$;

create table public.companies(id uuid primary key);
create table public.delivery_territories(
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null,
  is_active boolean not null default true,
  unique(company_id, id),
  unique(company_id, name)
);
create table public.delivery_territory_areas(
  company_id uuid not null,
  territory_id uuid not null,
  administrative_area text not null,
  primary key(company_id, administrative_area),
  foreign key(company_id, territory_id) references public.delivery_territories(company_id, id) on delete cascade
);
create table public.store_order_territory_rules(
  company_id uuid not null references public.companies(id) on delete cascade,
  territory_id uuid not null,
  delivery_weekdays smallint[] not null,
  primary key(company_id, territory_id),
  check(cardinality(delivery_weekdays) between 1 and 7 and delivery_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]),
  foreign key(company_id, territory_id) references public.delivery_territories(company_id, id) on delete cascade
);
create table public.normalized_customers(
  id uuid primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  address text,
  delivery_base_address text,
  delivery_address_detail text,
  delivery_territory_id uuid
);

insert into public.companies values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into public.normalized_customers values (
  '20000000-0000-4000-8000-000000000001',
  '00000000-0000-4000-8000-000000000001',
  'unchanged combined address', null, null, null
);
insert into public.delivery_territories(id, company_id, name) values (
  '10000000-0000-4000-8000-000000000002',
  '00000000-0000-4000-8000-000000000002',
  'unrelated territory'
);

begin;
select set_config('maju.target_company_id', '00000000-0000-4000-8000-000000000001', true);
\ir ../../docs/sql-drafts/20261110-02-songpa-delivery-seed.sql
commit;

do $$ begin
  if (select count(*) from public.delivery_territories where company_id = '00000000-0000-4000-8000-000000000001') <> 1
    or not exists (
      select 1 from public.delivery_territory_areas
      where company_id = '00000000-0000-4000-8000-000000000001'
        and territory_id = '02000000-0000-4000-8000-000000000001'
        and administrative_area = '서울특별시 송파구'
    ) or not exists (
      select 1 from public.store_order_territory_rules
      where company_id = '00000000-0000-4000-8000-000000000001'
        and territory_id = '02000000-0000-4000-8000-000000000001'
        and delivery_weekdays = array[1,2,3,4,5,6]::smallint[]
    ) then raise exception 'songpa_delivery_seed_not_exact'; end if;
  if not exists (
    select 1 from public.normalized_customers
    where id = '20000000-0000-4000-8000-000000000001'
      and address = 'unchanged combined address'
      and delivery_base_address is null and delivery_address_detail is null and delivery_territory_id is null
  ) then raise exception 'customer_was_changed'; end if;
  if (select count(*) from public.delivery_territories where company_id = '00000000-0000-4000-8000-000000000002') <> 1
    then raise exception 'other_company_was_changed'; end if;
end $$;

update public.normalized_customers
set delivery_territory_id = '02000000-0000-4000-8000-000000000001'
where id = '20000000-0000-4000-8000-000000000001';
\set ON_ERROR_STOP off
begin;
select set_config('maju.target_company_id', '00000000-0000-4000-8000-000000000001', true);
\ir ../../docs/sql-drafts/20261110-02-songpa-delivery-seed.down.sql
rollback;
\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from public.delivery_territories where id = '02000000-0000-4000-8000-000000000001')
    then raise exception 'in_use_rollback_deleted_seed'; end if;
end $$;

update public.normalized_customers set delivery_territory_id = null
where id = '20000000-0000-4000-8000-000000000001';
begin;
select set_config('maju.target_company_id', '00000000-0000-4000-8000-000000000001', true);
\ir ../../docs/sql-drafts/20261110-02-songpa-delivery-seed.down.sql
commit;

do $$ begin
  if exists(select 1 from public.delivery_territories where id = '02000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.delivery_territory_areas where territory_id = '02000000-0000-4000-8000-000000000001')
    or exists(select 1 from public.store_order_territory_rules where territory_id = '02000000-0000-4000-8000-000000000001')
    then raise exception 'exact_rollback_failed'; end if;
  if (select count(*) from public.delivery_territories where company_id = '00000000-0000-4000-8000-000000000002') <> 1
    then raise exception 'rollback_changed_other_company'; end if;
end $$;

select 'songpa_delivery_seed_pg17_pass';
