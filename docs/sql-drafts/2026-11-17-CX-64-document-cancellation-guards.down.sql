-- CX-64 안전 down. 배정 증거가 있으면 삭제하지 않는다.
begin;

do $$
begin
  if to_regclass('public.business_document_payment_allocations') is not null
     and exists (select 1 from public.business_document_payment_allocations) then
    raise exception 'CX-64 down refused: business_document_payment_allocations contains evidence';
  end if;
end;
$$;

drop trigger if exists guard_business_document_cancellation_cx64 on public.business_documents;
drop trigger if exists guard_business_document_payment_allocation_cx64 on public.business_document_payment_allocations;
drop function if exists public.guard_business_document_cancellation_cx64();
drop function if exists public.guard_business_document_payment_allocation_cx64();
drop table if exists public.business_document_payment_allocations;

commit;
