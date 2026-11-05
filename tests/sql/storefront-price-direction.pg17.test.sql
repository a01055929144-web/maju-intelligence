\set ON_ERROR_STOP on
do $$ begin
  if not exists(select 1 from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
  if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
end $$;
create table public.store_order_settings(company_id uuid primary key, notice text not null default '', updated_at timestamptz not null default now());
insert into public.store_order_settings(company_id,notice) values ('00000000-0000-4000-8000-000000000001','preserve'),('00000000-0000-4000-8000-000000000002','other');
grant select,insert,update on public.store_order_settings to service_role;
\ir ../../docs/sql-drafts/20261105-storefront-price-direction.sql
do $$ begin
  if exists(select 1 from public.store_order_settings where show_storefront_price_direction) then raise exception 'must default OFF'; end if;
  if has_function_privilege('anon','public.set_storefront_price_direction_visibility(uuid,boolean)','EXECUTE') or has_function_privilege('authenticated','public.set_storefront_price_direction_visibility(uuid,boolean)','EXECUTE') then raise exception 'public execution'; end if;
end $$;
set role service_role;
select public.set_storefront_price_direction_visibility('00000000-0000-4000-8000-000000000001',true);
reset role;
do $$ begin
  if not (select show_storefront_price_direction from public.store_order_settings where notice='preserve') then raise exception 'opt in failed'; end if;
  if (select show_storefront_price_direction from public.store_order_settings where notice='other') then raise exception 'cross company mutation'; end if;
  begin
    perform public.set_storefront_price_direction_visibility('00000000-0000-4000-8000-000000000001',null);
    raise exception 'null accepted';
  exception when raise_exception then
    if sqlerrm <> 'invalid_visibility' then raise; end if;
  end;
end $$;
\ir ../../docs/sql-drafts/20261105-storefront-price-direction.down.sql
do $$ begin
  if (select count(*) from public.store_order_settings where notice in ('preserve','other'))<>2 then raise exception 'existing settings lost'; end if;
end $$;
\ir ../../docs/sql-drafts/20261105-storefront-price-direction.sql
do $$ begin
  if exists(select 1 from public.store_order_settings where show_storefront_price_direction) then raise exception 'reapply must default OFF'; end if;
end $$;
select 'selling price direction up-down-up PASS';
