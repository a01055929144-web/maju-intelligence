-- CX-64 초안 — 운영 DB 적용 금지. 대표 승인 뒤 컨트롤타워 적용 잠금이 있을 때만 별도 적용한다.
-- 수금·지급은 현재 거래처 원장 단위라 전표별 연결이 없다. 이 표는 그 연결만 기록하고,
-- 확정 반품 또는 수금·지급 배정이 남은 전표가 취소 상태로 바뀌는 것을 DB에서 막는다.

create table if not exists public.business_document_payment_allocations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  document_id uuid not null,
  ledger_entry_id uuid not null,
  allocated_amount bigint not null check (allocated_amount > 0),
  created_at timestamptz not null default now(),
  created_by_user_id uuid,
  created_by_name text not null,
  constraint business_document_payment_allocations_document_fk
    foreign key (company_id, document_id) references public.business_documents(company_id, id) on delete restrict,
  constraint business_document_payment_allocations_ledger_fk
    foreign key (company_id, ledger_entry_id) references public.partner_ledger_entries(company_id, id) on delete restrict,
  constraint business_document_payment_allocations_uq unique (company_id, document_id, ledger_entry_id)
);

create index if not exists business_document_payment_allocations_document_idx
  on public.business_document_payment_allocations(company_id, document_id);

alter table public.business_document_payment_allocations enable row level security;
revoke all on public.business_document_payment_allocations from public, anon, authenticated;
grant select, insert, update, delete on public.business_document_payment_allocations to service_role;

create or replace function public.guard_business_document_payment_allocation_cx64()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document public.business_documents%rowtype;
  v_entry public.partner_ledger_entries%rowtype;
begin
  select * into v_document from public.business_documents
  where company_id = new.company_id and id = new.document_id;
  select * into v_entry from public.partner_ledger_entries
  where company_id = new.company_id and id = new.ledger_entry_id;
  if not found or v_entry.entry_type not in ('receipt', 'payment') then
    raise exception 'business_document_payment_entry_required';
  end if;
  if v_document.customer_id is distinct from v_entry.customer_id
     or v_document.supplier_id is distinct from v_entry.supplier_id then
    raise exception 'business_document_payment_partner_mismatch';
  end if;
  return new;
end;
$$;

drop trigger if exists guard_business_document_payment_allocation_cx64 on public.business_document_payment_allocations;
create trigger guard_business_document_payment_allocation_cx64
before insert or update on public.business_document_payment_allocations
for each row execute function public.guard_business_document_payment_allocation_cx64();

create or replace function public.guard_business_document_cancellation_cx64()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_returns integer;
  v_payments integer;
begin
  if old.status <> 'confirmed' or new.status <> 'cancelled' then
    return new;
  end if;

  select count(*) into v_returns
  from public.business_documents
  where company_id = old.company_id
    and original_document_id = old.id
    and status = 'confirmed';
  if v_returns > 0 then
    raise exception 'business_document_return_linked:%', v_returns;
  end if;

  select count(distinct ledger_entry_id) into v_payments
  from public.business_document_payment_allocations
  where company_id = old.company_id and document_id = old.id;
  if v_payments > 0 then
    raise exception 'business_document_payment_linked:%', v_payments;
  end if;

  return new;
end;
$$;

drop trigger if exists guard_business_document_cancellation_cx64 on public.business_documents;
create trigger guard_business_document_cancellation_cx64
before update of status on public.business_documents
for each row execute function public.guard_business_document_cancellation_cx64();

revoke all on function public.guard_business_document_cancellation_cx64() from public, anon, authenticated;
grant execute on function public.guard_business_document_cancellation_cx64() to service_role;
revoke all on function public.guard_business_document_payment_allocation_cx64() from public, anon, authenticated;
grant execute on function public.guard_business_document_payment_allocation_cx64() to service_role;
