\set ON_ERROR_STOP on

drop schema if exists public cascade;
create schema public;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table public.business_documents (
  id uuid not null,
  company_id uuid not null,
  status text not null,
  customer_id uuid,
  supplier_id uuid,
  original_document_id uuid,
  primary key (id),
  unique (company_id, id),
  foreign key (company_id, original_document_id) references public.business_documents(company_id, id)
);
create table public.partner_ledger_entries (
  id uuid not null,
  company_id uuid not null,
  entry_type text not null,
  customer_id uuid,
  supplier_id uuid,
  primary key (id),
  unique (company_id, id)
);

\ir 2026-11-17-CX-64-document-cancellation-guards.sql

insert into public.business_documents(id, company_id, status, customer_id) values
  ('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-0000000000c1', 'confirmed', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-0000000000c1', 'confirmed', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000003', '00000000-0000-0000-0000-0000000000c1', 'confirmed', '00000000-0000-0000-0000-0000000000a1');

insert into public.business_documents(id, company_id, status, customer_id, original_document_id) values
  ('00000000-0000-0000-0000-000000000011', '00000000-0000-0000-0000-0000000000c1', 'confirmed', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001'),
  ('00000000-0000-0000-0000-000000000012', '00000000-0000-0000-0000-0000000000c1', 'confirmed', '00000000-0000-0000-0000-0000000000a1', '00000000-0000-0000-0000-000000000001');

do $$
begin
  begin
    update public.business_documents set status = 'cancelled' where id = '00000000-0000-0000-0000-000000000001';
    raise exception 'expected return guard';
  exception when others then
    assert sqlerrm = 'business_document_return_linked:2', sqlerrm;
  end;
end;
$$;

insert into public.partner_ledger_entries(id, company_id, entry_type, customer_id) values
  ('00000000-0000-0000-0000-000000000021', '00000000-0000-0000-0000-0000000000c1', 'receipt', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000022', '00000000-0000-0000-0000-0000000000c1', 'sale', '00000000-0000-0000-0000-0000000000a1'),
  ('00000000-0000-0000-0000-000000000023', '00000000-0000-0000-0000-0000000000c1', 'receipt', '00000000-0000-0000-0000-0000000000a2');

do $$
begin
  begin
    insert into public.business_document_payment_allocations(company_id, document_id, ledger_entry_id, allocated_amount, created_by_name)
    values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000022', 1000, 'PG17');
    raise exception 'expected payment type guard';
  exception when others then
    assert sqlerrm = 'business_document_payment_entry_required', sqlerrm;
  end;
end;
$$;

do $$
begin
  begin
    insert into public.business_document_payment_allocations(company_id, document_id, ledger_entry_id, allocated_amount, created_by_name)
    values ('00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000023', 1000, 'PG17');
    raise exception 'expected payment partner guard';
  exception when others then
    assert sqlerrm = 'business_document_payment_partner_mismatch', sqlerrm;
  end;
end;
$$;
insert into public.business_document_payment_allocations(
  company_id, document_id, ledger_entry_id, allocated_amount, created_by_name
) values (
  '00000000-0000-0000-0000-0000000000c1', '00000000-0000-0000-0000-000000000002',
  '00000000-0000-0000-0000-000000000021', 1000, 'PG17'
);

do $$
begin
  begin
    update public.business_documents set status = 'cancelled' where id = '00000000-0000-0000-0000-000000000002';
    raise exception 'expected payment guard';
  exception when others then
    assert sqlerrm = 'business_document_payment_linked:1', sqlerrm;
  end;
end;
$$;

update public.business_documents set status = 'cancelled' where id = '00000000-0000-0000-0000-000000000003';
do $$ begin assert (select status from public.business_documents where id = '00000000-0000-0000-0000-000000000003') = 'cancelled'; end $$;

\set ON_ERROR_STOP off
\ir 2026-11-17-CX-64-document-cancellation-guards.down.sql
\set ON_ERROR_STOP on
do $$ begin assert to_regclass('public.business_document_payment_allocations') is not null, 'down must retain evidence'; end $$;

delete from public.business_document_payment_allocations;
\ir 2026-11-17-CX-64-document-cancellation-guards.down.sql
do $$ begin assert to_regclass('public.business_document_payment_allocations') is null, 'empty down must complete'; end $$;
