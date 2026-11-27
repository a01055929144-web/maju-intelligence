\set ON_ERROR_STOP on
create extension if not exists pgcrypto;
create role anon nologin;
create role authenticated nologin;
create role service_role nologin;
create table public.store_orders(
  id uuid primary key,
  company_id uuid not null,
  status text not null check (status in ('submitted','received','in_delivery','delivered','cancelled')),
  revision integer not null,
  updated_at timestamptz not null default now()
);
create table public.admin_audit_logs(
  id uuid primary key default gen_random_uuid(),
  actor_user_id uuid,
  company_id uuid,
  action text not null,
  target_type text,
  target_id uuid,
  metadata jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create table public.business_documents(id uuid primary key, company_id uuid, source_id uuid, status text);
create function public.remove_cancelled_order_sale_draft()
returns trigger language plpgsql as $$ begin
  delete from public.business_documents
    where company_id = new.company_id and source_id = new.id and status = 'draft';
  return new;
end $$;
create trigger remove_cancelled_order_sale_draft after update of status on public.store_orders
  for each row when (old.status = 'received' and new.status = 'cancelled')
  execute function public.remove_cancelled_order_sale_draft();

\ir 2026-11-27-CX-154-customer-order-cancel.sql

insert into public.store_orders(id, company_id, status, revision) values
  ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','submitted',1),
  ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','received',2),
  ('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','in_delivery',3),
  ('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','submitted',1);
insert into public.business_documents values
  ('20000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002','draft');

do $$
declare
  c constant uuid := '00000000-0000-4000-8000-000000000001';
  actor constant uuid := '30000000-0000-4000-8000-000000000001';
  r jsonb;
begin
  r := public.cancel_customer_store_order(c,'10000000-0000-4000-8000-000000000001',1,' 점주 요청 ',
    '40000000-0000-4000-8000-000000000001',actor,'합성 관리자');
  assert r = jsonb_build_object('id','10000000-0000-4000-8000-000000000001'::uuid,'status','cancelled','revision',2);
  assert public.cancel_customer_store_order(c,'10000000-0000-4000-8000-000000000001',1,'점주 요청',
    '40000000-0000-4000-8000-000000000001',actor,'합성 관리자') = r;
  assert (select count(*) from public.admin_audit_logs where action='customer_store_order_cancelled') = 1;

  r := public.cancel_customer_store_order(c,'10000000-0000-4000-8000-000000000002',2,'재고 없음',
    '40000000-0000-4000-8000-000000000002',actor,'합성 관리자');
  assert r->>'status' = 'cancelled' and (r->>'revision')::integer = 3;
  assert not exists(select 1 from public.business_documents where source_id='10000000-0000-4000-8000-000000000002');

  begin
    perform public.cancel_customer_store_order(c,'10000000-0000-4000-8000-000000000003',3,'늦음',
      '40000000-0000-4000-8000-000000000003',actor,'합성 관리자');
    raise exception 'in_delivery_cancelled';
  exception when raise_exception then assert sqlerrm = 'order_cancel_state_conflict'; end;
  begin
    perform public.cancel_customer_store_order(c,'10000000-0000-4000-8000-000000000004',1,'다른 회사',
      '40000000-0000-4000-8000-000000000004',actor,'합성 관리자');
    raise exception 'cross_company_cancelled';
  exception when raise_exception then assert sqlerrm = 'order_cancel_state_conflict'; end;
  begin
    perform public.cancel_customer_store_order(c,'10000000-0000-4000-8000-000000000003',3,'',
      '40000000-0000-4000-8000-000000000005',actor,'합성 관리자');
    raise exception 'empty_reason_accepted';
  exception when raise_exception then assert sqlerrm = 'order_cancel_invalid_request'; end;
  begin
    perform public.cancel_customer_store_order(c,'10000000-0000-4000-8000-000000000001',1,'다른 사유',
      '40000000-0000-4000-8000-000000000001',actor,'합성 관리자');
    raise exception 'idempotency_conflict_missed';
  exception when raise_exception then assert sqlerrm = 'order_cancel_idempotency_conflict'; end;
end $$;

do $$ begin
  assert has_function_privilege('service_role', 'public.cancel_customer_store_order(uuid,uuid,integer,text,uuid,uuid,text)', 'EXECUTE');
  assert not has_function_privilege('anon', 'public.cancel_customer_store_order(uuid,uuid,integer,text,uuid,uuid,text)', 'EXECUTE');
  assert not has_function_privilege('authenticated', 'public.cancel_customer_store_order(uuid,uuid,integer,text,uuid,uuid,text)', 'EXECUTE');
end $$;

\ir 2026-11-27-CX-154-customer-order-cancel.down.sql
do $$ begin
  assert to_regprocedure('public.cancel_customer_store_order(uuid,uuid,integer,text,uuid,uuid,text)') is null;
  assert (select count(*) from public.store_orders where status='cancelled') = 2;
end $$;
select 'CX-154 customer order cancellation PG17 checks passed' as result;
