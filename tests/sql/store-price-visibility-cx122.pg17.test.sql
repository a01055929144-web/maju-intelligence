\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
do $$ begin create role anon nologin; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated nologin; exception when duplicate_object then null; end $$;
do $$ begin create role service_role nologin; exception when duplicate_object then null; end $$;

create table public.companies(id uuid primary key);
create table public.company_members(
  id uuid primary key,company_id uuid not null references public.companies(id),role text not null,
  permission_role text,status text not null,unique(company_id,id)
);
create table public.store_accounts(
  id uuid primary key,company_id uuid not null references public.companies(id),customer_id uuid not null,
  business_status text not null,status text not null,updated_at timestamptz not null default now(),unique(company_id,id)
);
grant usage on schema public to service_role;
grant select,update on public.store_accounts,public.company_members to service_role;

\ir ../../docs/sql-drafts/2026-11-18-CX-122-store-price-visibility.sql

insert into public.companies values
  ('10000000-0000-4000-8000-000000000001'),('20000000-0000-4000-8000-000000000002');
insert into public.company_members values
  ('11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','owner','owner','active'),
  ('12000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','manager','manager','active'),
  ('13000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','member','staff','active'),
  ('21000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','owner','owner','active');
insert into public.store_accounts(id,company_id,customer_id,business_status,status) values
  ('14000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','15000000-0000-4000-8000-000000000001','active','active'),
  ('16000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','17000000-0000-4000-8000-000000000001','active','active'),
  ('18000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','19000000-0000-4000-8000-000000000001','registration_pending','active'),
  ('24000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000002','25000000-0000-4000-8000-000000000002','active','active');

do $$ begin
  if public.store_price_visible_v1('10000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001')
    then raise exception 'cx122_automatic_visibility'; end if;
  if public.pending_store_price_visibility_count_v1('10000000-0000-4000-8000-000000000001','11000000-0000-4000-8000-000000000001')<>2
    then raise exception 'cx122_pending_count'; end if;
  perform public.set_store_price_visibility_v1(
    '10000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001',
    '11000000-0000-4000-8000-000000000001','confirm','수동 확인',
    '{"joinedFromCompanyLink":true,"ntsActiveBusiness":true,"foodPermitMatch":true}'::jsonb);
  if not public.store_price_visible_v1('10000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001')
    then raise exception 'cx122_manual_visibility_missing'; end if;
  if (select count(*) from public.store_price_visibility_events where event_type='confirmed')<>1
    then raise exception 'cx122_confirm_audit_missing'; end if;
  begin
    perform public.set_store_price_visibility_v1('10000000-0000-4000-8000-000000000001','16000000-0000-4000-8000-000000000001',
      '13000000-0000-4000-8000-000000000001','confirm',null,'{}');
    raise exception 'cx122_staff_confirmed';
  exception when raise_exception then
    if sqlerrm<>'store_price_visibility_forbidden' then raise; end if;
  end;
  begin
    perform public.set_store_price_visibility_v1('20000000-0000-4000-8000-000000000002','14000000-0000-4000-8000-000000000001',
      '21000000-0000-4000-8000-000000000002','confirm',null,'{}');
    raise exception 'cx122_cross_company_confirmed';
  exception when raise_exception then
    if sqlerrm<>'store_account_not_found' then raise; end if;
  end;
  begin
    perform public.set_store_price_visibility_v1('10000000-0000-4000-8000-000000000001','18000000-0000-4000-8000-000000000001',
      '11000000-0000-4000-8000-000000000001','confirm',null,'{}');
    raise exception 'cx122_preopening_confirmed';
  exception when raise_exception then
    if sqlerrm<>'store_price_visibility_preopening' then raise; end if;
  end;
  perform public.set_store_price_visibility_v1(
    '10000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001',
    '12000000-0000-4000-8000-000000000001','cancel','확인 취소','{}');
  if public.store_price_visible_v1('10000000-0000-4000-8000-000000000001','14000000-0000-4000-8000-000000000001')
    or (select count(*) from public.store_price_visibility_events)<>2
    then raise exception 'cx122_cancel_audit_or_hide_failed'; end if;
  if has_function_privilege('anon','public.set_store_price_visibility_v1(uuid,uuid,uuid,text,text,jsonb)','EXECUTE')
    or has_function_privilege('authenticated','public.store_price_visible_v1(uuid,uuid)','EXECUTE')
    or not has_function_privilege('service_role','public.pending_store_price_visibility_count_v1(uuid,uuid)','EXECUTE')
    then raise exception 'cx122_rpc_acl_failed'; end if;
end $$;

\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-18-CX-122-store-price-visibility.down.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin
  if not exists(select 1 from public.store_price_visibility_events) then raise exception 'cx122_down_guard_fixture'; end if;
end $$;
delete from public.store_price_visibility_events;
\ir ../../docs/sql-drafts/2026-11-18-CX-122-store-price-visibility.down.sql
\ir ../../docs/sql-drafts/2026-11-18-CX-122-store-price-visibility.sql
