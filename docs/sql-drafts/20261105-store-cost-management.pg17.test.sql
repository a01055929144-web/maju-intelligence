\set ON_ERROR_STOP on
drop schema if exists public cascade;
create schema public;
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin bypassrls;

create table public.companies(id uuid primary key);
create table public.store_accounts(
  id uuid not null,
  company_id uuid not null references public.companies(id) on delete cascade,
  primary key(company_id,id)
);
create table public.store_account_members(
  id uuid not null,
  company_id uuid not null,
  store_account_id uuid not null,
  auth_user_id uuid,
  role text not null check(role in ('owner','manager','staff')),
  status text not null check(status in ('invited','active','removed')),
  primary key(company_id,store_account_id,id),
  foreign key(company_id,store_account_id) references public.store_accounts(company_id,id) on delete cascade
);

\ir 20261105-store-cost-management.sql

insert into public.companies(id) values
  ('00000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002');
insert into public.store_accounts(company_id,id) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001'),
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002');
insert into public.store_account_members(company_id,store_account_id,id,role,status) values
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','owner','active'),
  ('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003','staff','active'),
  ('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','owner','active');

insert into public.store_cost_items(id,company_id,store_account_id,product_key,product_name,specification,unit,effective_on,cost_krw)
values('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','양파|15kg|망','양파','15kg','망','2026-11-05',18000);
insert into public.store_cost_revisions(company_id,store_account_id,store_cost_item_id,revision,effective_on,product_name,specification,unit,cost_krw,change_kind,actor_member_id,source_file_name,source_sha256,source_row_number)
values('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'2026-11-05','양파','15kg','망',18000,'import','20000000-0000-4000-8000-000000000001','costs.xlsx',repeat('a',64),2)
on conflict do nothing;

select public.save_store_cost(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '양파|15kg|망','양파','15kg','망','2026-11-06',19000,'30000000-0000-4000-8000-000000000001',1,null,null,null
);
do $$
begin
  begin
    perform public.save_store_cost(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      '양파|15kg|망','양파','15kg','망','2026-11-07',20000,'30000000-0000-4000-8000-000000000001',1,null,null,null
    );
    raise exception 'stale_edit_allowed';
  exception when others then
    if sqlerrm <> 'store_cost_revision_conflict' then raise; end if;
  end;
  if (select revision from public.store_cost_items where id='30000000-0000-4000-8000-000000000001')<>2
    or (select count(*) from public.store_cost_revisions where store_cost_item_id='30000000-0000-4000-8000-000000000001')<>2 then
    raise exception 'failed_edit_was_not_atomic';
  end if;
end $$;
do $$
declare replay jsonb;
begin
  replay := public.save_store_cost(
    '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
    '변조된키|EA','변조된 이름','','EA','2026-11-08',99999,null,null,'new.xlsx',repeat('b',64),3
  );
  if replay->>'id' <> '30000000-0000-4000-8000-000000000001' or (replay->>'replayed')::boolean is not true then
    raise exception 'replay_did_not_return_original_item';
  end if;
end $$;
select public.save_store_cost(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '양파|15kg|망','양파','15kg','망','2026-11-07',20000,null,null,'new.xlsx',repeat('b',64),3
);
insert into public.store_cost_revisions(company_id,store_account_id,store_cost_item_id,revision,effective_on,product_name,specification,unit,cost_krw,change_kind,actor_member_id,source_file_name,source_sha256,source_row_number)
values('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001',1,'2026-11-05','양파','15kg','망',18000,'import','20000000-0000-4000-8000-000000000001','costs.xlsx',repeat('a',64),2)
on conflict do nothing;

do $$
begin
  if (select count(*) from public.store_cost_revisions) <> 3
    or (select revision from public.store_cost_items where id='30000000-0000-4000-8000-000000000001')<>3 then
    raise exception 'reupload_not_idempotent';
  end if;
  begin
    insert into public.store_cost_items(company_id,store_account_id,product_key,product_name,unit,effective_on,cost_krw)
    values('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','양파|15kg|망','양파','망','2026-11-06',19000);
    raise exception 'duplicate_product_allowed';
  exception when unique_violation then null;
  end;
  begin
    insert into public.store_cost_revisions(company_id,store_account_id,store_cost_item_id,revision,effective_on,product_name,unit,cost_krw,change_kind,actor_member_id)
    values('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000001',2,'2026-11-06','양파','망',19000,'edit','20000000-0000-4000-8000-000000000002');
    raise exception 'cross_tenant_history_allowed';
  exception when foreign_key_violation then null;
  end;
  begin
    perform public.save_store_cost(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000003',
      '감자||kg','감자','','kg','2026-11-07',1000,null,null,'staff.xlsx',repeat('c',64),2
    );
    raise exception 'staff_write_allowed';
  exception when others then if sqlerrm <> 'store_cost_manager_required' then raise; end if; end;
  begin
    perform public.save_store_cost(
      '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
      '감자||kg','감자','','kg','2026-11-07',1000,'39999999-0000-4000-8000-000000000099',3,null,null,null
    );
    raise exception 'missing_item_edit_allowed';
  exception when others then if sqlerrm <> 'store_cost_item_not_found' then raise; end if; end;
end $$;

select public.save_store_cost(
  '00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001',
  '양파|15kg|망','과거 양파','15kg','망','2026-11-01',17000,null,null,'old.xlsx',repeat('d',64),4
);
do $$
begin
  if not exists(select 1 from public.store_cost_items where id='30000000-0000-4000-8000-000000000001'
      and product_name='양파' and effective_on='2026-11-07' and cost_krw=20000 and revision=4)
    or (select count(*) from public.store_cost_revisions where store_cost_item_id='30000000-0000-4000-8000-000000000001')<>4 then
    raise exception 'older_import_overwrote_current_cost';
  end if;
end $$;

do $$
begin
  if has_table_privilege('authenticated','public.store_cost_items','select')
    or has_table_privilege('authenticated','public.store_cost_revisions','select') then
    raise exception 'authenticated_role_can_read_private_costs';
  end if;
  if has_table_privilege('service_role','public.store_cost_revisions','update')
    or has_table_privilege('service_role','public.store_cost_revisions','delete') then
    raise exception 'revision_history_is_not_append_only';
  end if;
end $$;

-- Down refuses while data exists, then succeeds after explicit cleanup.
\set ON_ERROR_STOP off
\ir 20261105-store-cost-management.down.sql
\set ON_ERROR_STOP on
do $$ begin if to_regclass('public.store_cost_items') is null then raise exception 'unsafe_down_succeeded'; end if; end $$;
delete from public.companies where id='00000000-0000-4000-8000-000000000001';
do $$
begin
  if exists(select 1 from public.store_cost_items) or exists(select 1 from public.store_cost_revisions) then
    raise exception 'company_delete_did_not_cascade';
  end if;
end $$;
\ir 20261105-store-cost-management.down.sql
do $$ begin if to_regclass('public.store_cost_items') is not null then raise exception 'safe_down_failed'; end if; end $$;
