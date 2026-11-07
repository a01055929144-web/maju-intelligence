\set ON_ERROR_STOP on
drop schema if exists public cascade;
create schema public;
create extension if not exists pgcrypto;
create extension if not exists dblink;
do $$ begin if not exists(select 1 from pg_roles where rolname='anon') then create role anon nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='authenticated') then create role authenticated nologin; end if; end $$;
do $$ begin if not exists(select 1 from pg_roles where rolname='service_role') then create role service_role nologin bypassrls; end if; end $$;

create table public.companies(id uuid primary key);
create table public.store_accounts(
  id uuid not null, company_id uuid not null references public.companies(id) on delete cascade,
  business_status text not null default 'active' check(business_status in ('active','closed','suspended')),
  status text not null default 'active' check(status in ('pending','active','suspended','closed')),
  primary key(company_id,id)
);
create table public.store_account_members(
  id uuid not null, company_id uuid not null, store_account_id uuid not null, auth_user_id uuid,
  role text not null check(role in ('owner','manager','staff')),
  status text not null check(status in ('invited','active','removed')),
  primary key(company_id,store_account_id,id),
  foreign key(company_id,store_account_id) references public.store_accounts(company_id,id) on delete cascade
);

\ir 20261105-store-cost-management.sql
\ir 20261107-store-cost-batch-import.sql

insert into public.companies(id) values('00000000-0000-4000-8000-000000000001');
insert into public.store_accounts(company_id,id) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001');
insert into public.store_account_members(company_id,store_account_id,id,role,status) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner','active'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000002','staff','active');

-- A bad second row rolls the whole batch back, including its import record.
do $$ begin
  begin
    perform public.import_store_cost_batch(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','costs.xlsx',
      '[{"sourceRowNumber":2,"productKey":"onion|15kg|bag","productName":"양파","specification":"15kg","unit":"망","effectiveOn":"2026-11-07","costKrw":18000},{"sourceRowNumber":3,"productKey":"potato||kg","productName":"감자","specification":"","unit":"kg","effectiveOn":"2026-11-07","costKrw":1000000001}]'::jsonb
    );
    raise exception 'invalid_batch_allowed';
  exception when others then
    if sqlerrm not in ('invalid_store_cost','invalid_batch_allowed') then raise; end if;
  end;
  if exists(select 1 from public.store_cost_imports) or exists(select 1 from public.store_cost_items)
    or exists(select 1 from public.store_cost_revisions) then raise exception 'failed_batch_was_not_atomic'; end if;
end $$;

select public.import_store_cost_batch(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','costs.xlsx',
  '[{"sourceRowNumber":2,"productKey":"onion|15kg|bag","productName":"양파","specification":"15kg","unit":"망","effectiveOn":"2026-11-07","costKrw":18000},{"sourceRowNumber":3,"productKey":"potato||kg","productName":"감자","specification":"","unit":"kg","effectiveOn":"2026-11-07","costKrw":9000}]'::jsonb
);

do $$ declare result jsonb; begin
  result := public.import_store_cost_batch(
    '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','renamed.xlsx',
    '[{"sourceRowNumber":2,"productKey":"onion|15kg|bag","productName":"양파","specification":"15kg","unit":"망","effectiveOn":"2026-11-07","costKrw":18000},{"sourceRowNumber":3,"productKey":"potato||kg","productName":"감자","specification":"","unit":"kg","effectiveOn":"2026-11-07","costKrw":9000}]'::jsonb
  );
  if (result->>'imported')::integer <> 0 or (result->>'replayed')::integer <> 2
    or (select count(*) from public.store_cost_items) <> 2 or (select count(*) from public.store_cost_revisions) <> 2
  then raise exception 'batch_replay_not_idempotent'; end if;
end $$;

do $$ begin
  begin
    perform public.import_store_cost_batch(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000001','costs.xlsx',
      '[{"sourceRowNumber":2,"productKey":"onion|15kg|bag","productName":"양파","specification":"15kg","unit":"망","effectiveOn":"2026-11-07","costKrw":19000}]'::jsonb
    );
    raise exception 'changed_retry_allowed';
  exception when others then if sqlerrm <> 'store_cost_import_conflict' then raise; end if; end;
  begin
    perform public.import_store_cost_batch(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000002','40000000-0000-4000-8000-000000000002','staff.xlsx',
      '[{"sourceRowNumber":2,"productKey":"x||ea","productName":"X","specification":"","unit":"EA","effectiveOn":"2026-11-07","costKrw":1}]'::jsonb
    );
    raise exception 'staff_batch_allowed';
  exception when others then if sqlerrm <> 'store_cost_manager_required' then raise; end if; end;
  if has_function_privilege('anon','public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)','execute')
    or has_function_privilege('authenticated','public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)','execute')
    or not has_function_privilege('service_role','public.import_store_cost_batch(uuid,uuid,uuid,uuid,text,jsonb)','execute')
  then raise exception 'batch_rpc_privileges_wrong'; end if;
end $$;

do $$ begin
  update public.store_accounts set status='suspended'
    where company_id='00000000-0000-4000-8000-000000000001' and id='10000000-0000-4000-8000-000000000001';
  begin
    perform public.import_store_cost_batch(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000003','stopped.xlsx',
      '[{"sourceRowNumber":2,"productKey":"blocked-status||ea","productName":"차단","specification":"","unit":"EA","effectiveOn":"2026-11-07","costKrw":1}]'::jsonb
    );
    raise exception 'suspended_store_batch_allowed';
  exception when others then if sqlerrm <> 'store_cost_manager_required' then raise; end if; end;
  update public.store_accounts set status='active', business_status='closed'
    where company_id='00000000-0000-4000-8000-000000000001' and id='10000000-0000-4000-8000-000000000001';
  begin
    perform public.import_store_cost_batch(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000004','closed.xlsx',
      '[{"sourceRowNumber":2,"productKey":"blocked-business||ea","productName":"차단","specification":"","unit":"EA","effectiveOn":"2026-11-07","costKrw":1}]'::jsonb
    );
    raise exception 'closed_business_batch_allowed';
  exception when others then if sqlerrm <> 'store_cost_manager_required' then raise; end if; end;
  update public.store_accounts set business_status='active'
    where company_id='00000000-0000-4000-8000-000000000001' and id='10000000-0000-4000-8000-000000000001';
  if exists(select 1 from public.store_cost_imports where import_id in
    ('40000000-0000-4000-8000-000000000003','40000000-0000-4000-8000-000000000004'))
  then raise exception 'blocked_store_import_was_recorded'; end if;
end $$;

-- A concurrent business closure commits before the waiting batch can recheck the locked account.
select dblink_connect('cost_store_close','dbname='||current_database());
select dblink_send_query('cost_store_close',$q$
  with changed as (
    update public.store_accounts set business_status='closed'
    where company_id='00000000-0000-4000-8000-000000000001' and id='10000000-0000-4000-8000-000000000001'
    returning 1
  ), waited as (select pg_sleep(1) from changed)
  select count(*) from waited
$q$);
select pg_sleep(0.2);
do $$ begin
  begin
    perform public.import_store_cost_batch(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000005','closing.xlsx',
      '[{"sourceRowNumber":2,"productKey":"concurrent-block||ea","productName":"차단","specification":"","unit":"EA","effectiveOn":"2026-11-07","costKrw":1}]'::jsonb
    );
    raise exception 'concurrent_closure_batch_allowed';
  exception when others then if sqlerrm <> 'store_cost_manager_required' then raise; end if; end;
end $$;
select * from dblink_get_result('cost_store_close') as t(changed bigint);
select dblink_disconnect('cost_store_close');
update public.store_accounts set business_status='active'
where company_id='00000000-0000-4000-8000-000000000001' and id='10000000-0000-4000-8000-000000000001';
do $$ begin
  if exists(select 1 from public.store_cost_imports where import_id='40000000-0000-4000-8000-000000000005')
    or exists(select 1 from public.store_cost_items where product_key='concurrent-block||ea')
  then raise exception 'concurrent_closed_store_write_recorded'; end if;
end $$;

delete from public.companies where id='00000000-0000-4000-8000-000000000001';
\ir 20261107-store-cost-batch-import.down.sql
\ir 20261105-store-cost-management.down.sql
do $$ begin
  if to_regclass('public.store_cost_imports') is not null or to_regclass('public.store_cost_items') is not null
  then raise exception 'store_cost_batch_down_failed'; end if;
end $$;
