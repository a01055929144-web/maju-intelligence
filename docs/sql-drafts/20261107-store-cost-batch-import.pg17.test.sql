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
    if sqlerrm <> 'invalid_store_cost' then raise; end if;
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

-- Two real sessions submit the exact same batch while the second waits on the account lock.
select dblink_connect('cost_same_batch','dbname='||current_database());
select dblink_exec('cost_same_batch','set statement_timeout = 15000');
create temporary table batch_peer as
  select * from dblink('cost_same_batch','select pg_backend_pid()') as t(pid integer);
create temporary table concurrent_batch_results(kind text primary key, result jsonb not null);
do $$ declare waiting boolean := false; begin
  perform 1 from public.store_accounts
    where company_id='00000000-0000-4000-8000-000000000001' and id='10000000-0000-4000-8000-000000000001'
    for update;
  perform dblink_send_query('cost_same_batch',$q$
    select public.import_store_cost_batch(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
      '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000006','concurrent.xlsx',
      '[{"sourceRowNumber":2,"productKey":"batch-concurrent-a||ea","productName":"동시 A","unit":"EA","effectiveOn":"2026-11-07","costKrw":100},{"sourceRowNumber":3,"productKey":"batch-concurrent-b||ea","productName":"동시 B","unit":"EA","effectiveOn":"2026-11-07","costKrw":200}]'::jsonb)
  $q$);
  for attempt in 1..500 loop
    perform pg_stat_clear_snapshot();
    if exists(select 1 from pg_stat_activity where pid=(select pid from batch_peer) and wait_event_type='Lock') then
      waiting := true; exit;
    end if;
    perform pg_sleep(0.01);
  end loop;
  if not waiting then raise exception 'batch_peer_did_not_wait_on_lock'; end if;
  insert into concurrent_batch_results values('first', public.import_store_cost_batch(
    '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
    '20000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000006','concurrent.xlsx',
    '[{"sourceRowNumber":2,"productKey":"batch-concurrent-a||ea","productName":"동시 A","unit":"EA","effectiveOn":"2026-11-07","costKrw":100},{"sourceRowNumber":3,"productKey":"batch-concurrent-b||ea","productName":"동시 B","unit":"EA","effectiveOn":"2026-11-07","costKrw":200}]'::jsonb));
end $$;
insert into concurrent_batch_results
  select 'second', result from dblink_get_result('cost_same_batch') as t(result jsonb);
select dblink_disconnect('cost_same_batch');
do $$ begin
  if not exists(select 1 from concurrent_batch_results where kind='first' and result @> '{"imported":2,"replayed":0,"total":2}')
    or not exists(select 1 from concurrent_batch_results where kind='second' and result @> '{"imported":0,"replayed":2,"total":2}')
    or (select count(distinct result->>'importDigest') from concurrent_batch_results)<>1
    or (select count(*) from public.store_cost_imports where import_id='40000000-0000-4000-8000-000000000006')<>1
    or (select count(*) from public.store_cost_items where product_key like 'batch-concurrent-%')<>2
    or exists(select 1 from public.store_cost_items where product_key like 'batch-concurrent-%' and revision<>1)
    or (select count(*) from public.store_cost_revisions r join public.store_cost_items i
      on i.company_id=r.company_id and i.store_account_id=r.store_account_id and i.id=r.store_cost_item_id
      where i.product_key like 'batch-concurrent-%')<>2
  then raise exception 'concurrent_batch_not_idempotent'; end if;
end $$;

-- Reuse an import ID, product and source row across both tenant axes, including the same store UUID in another company.
insert into public.companies(id) values('00000000-0000-4000-8000-000000000002');
insert into public.store_accounts(company_id,id) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002'),
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001');
insert into public.store_account_members(company_id,store_account_id,id,role,status) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','manager','active'),
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004','owner','active');
create temporary table batch_scopes(company_id uuid, store_id uuid, member_id uuid, cost bigint);
insert into batch_scopes values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',101),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003',202),
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000004',303);
do $$ declare scope record; rows jsonb; result jsonb; begin
  for scope in select * from batch_scopes loop
    rows := jsonb_build_array(jsonb_build_object('sourceRowNumber',2,'productKey','batch-isolation||ea',
      'productName','격리 품목','unit','EA','effectiveOn','2026-11-07','costKrw',scope.cost));
    result := public.import_store_cost_batch(scope.company_id,scope.store_id,scope.member_id,
      '40000000-0000-4000-8000-000000000007','isolation.xlsx',rows);
    if not (result @> '{"imported":1,"replayed":0,"total":1}') then raise exception 'scoped_batch_not_imported'; end if;
    result := public.import_store_cost_batch(scope.company_id,scope.store_id,scope.member_id,
      '40000000-0000-4000-8000-000000000007','renamed.xlsx',rows);
    if not (result @> '{"imported":0,"replayed":1,"total":1}') then raise exception 'scoped_batch_not_replayed'; end if;
  end loop;
  if (select count(*) from public.store_cost_imports where import_id='40000000-0000-4000-8000-000000000007')<>3
    or (select count(distinct import_digest) from public.store_cost_imports where import_id='40000000-0000-4000-8000-000000000007')<>3
    or (select count(*) from public.store_cost_items where product_key='batch-isolation||ea')<>3
    or (select count(*) from batch_scopes s join public.store_cost_items i on i.company_id=s.company_id
      and i.store_account_id=s.store_id where i.product_key='batch-isolation||ea' and i.cost_krw=s.cost and i.revision=1)<>3
    or (select count(*) from batch_scopes s join public.store_cost_revisions r on r.company_id=s.company_id
      and r.store_account_id=s.store_id where r.product_name='격리 품목' and r.cost_krw=s.cost and r.actor_member_id=s.member_id and r.revision=1)<>3
  then raise exception 'batch_scope_isolation_failed'; end if;
end $$;

-- A member from another store/company, or a forged company/store pair, cannot create any records.
do $$ declare scope record; imports_before bigint; items_before bigint; revisions_before bigint; begin
  select count(*) into imports_before from public.store_cost_imports;
  select count(*) into items_before from public.store_cost_items;
  select count(*) into revisions_before from public.store_cost_revisions;
  for scope in select * from (values
    ('00000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000003'::uuid),
    ('00000000-0000-4000-8000-000000000001'::uuid,'10000000-0000-4000-8000-000000000001'::uuid,'20000000-0000-4000-8000-000000000004'::uuid),
    ('00000000-0000-4000-8000-000000000002'::uuid,'10000000-0000-4000-8000-000000000002'::uuid,'20000000-0000-4000-8000-000000000004'::uuid)
  ) as scopes(company_id,store_id,member_id) loop
    begin
      perform public.import_store_cost_batch(scope.company_id,scope.store_id,scope.member_id,
        '40000000-0000-4000-8000-000000000008','forged.xlsx',
        '[{"sourceRowNumber":2,"productKey":"forged-scope||ea","productName":"위조 범위","unit":"EA","effectiveOn":"2026-11-07","costKrw":999}]'::jsonb);
      raise exception 'cross_scope_batch_allowed';
    exception when others then if sqlerrm <> 'store_cost_manager_required' then raise; end if; end;
  end loop;
  if (select count(*) from public.store_cost_imports)<>imports_before
    or (select count(*) from public.store_cost_items)<>items_before
    or (select count(*) from public.store_cost_revisions)<>revisions_before
  then raise exception 'cross_scope_batch_changed_data'; end if;
end $$;

delete from public.companies where id in ('00000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000002');
\ir 20261107-store-cost-batch-import.down.sql
\ir 20261105-store-cost-management.down.sql
do $$ begin
  if to_regclass('public.store_cost_imports') is not null or to_regclass('public.store_cost_items') is not null
  then raise exception 'store_cost_batch_down_failed'; end if;
end $$;
