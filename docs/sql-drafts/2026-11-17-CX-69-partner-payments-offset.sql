-- CX-69 입출금 · 연결 전표 · 역분개 · 겸업 상계 초안
-- 운영 DB 적용 금지: CX-64 business_document_payment_allocations 선행 적용과 별도 DB-APPROVED 필요.
begin;

alter table public.normalized_customers add column if not exists sub_business_number text;
alter table public.product_suppliers add column if not exists sub_business_number text;

create or replace function public.record_partner_payment_v2(
  p_company_id uuid, p_partner_type text, p_partner_id uuid, p_entry_date date,
  p_amount bigint, p_payment_method text, p_idempotency_key text,
  p_actor_user_id uuid, p_actor_name text, p_memo text default null,
  p_document_id uuid default null
) returns public.partner_ledger_entries
language plpgsql security invoker set search_path = '' as $$
declare v_entry public.partner_ledger_entries%rowtype; v_document public.business_documents%rowtype;
begin
  if p_partner_type not in ('customer','supplier') then raise exception 'invalid partner type'; end if;
  if p_amount <= 0 then raise exception 'payment amount must be positive'; end if;
  if p_payment_method not in ('cash','bank','card') then raise exception 'invalid payment method'; end if;
  if nullif(btrim(p_idempotency_key),'') is null then raise exception 'payment idempotency key required'; end if;
  if p_document_id is not null then
    select * into v_document from public.business_documents where company_id=p_company_id and id=p_document_id and status='confirmed';
    if not found then raise exception 'payment document not found'; end if;
    if (p_partner_type='customer' and v_document.customer_id is distinct from p_partner_id)
      or (p_partner_type='supplier' and v_document.supplier_id is distinct from p_partner_id) then
      raise exception 'payment document partner mismatch';
    end if;
  end if;
  select * into v_entry from public.partner_ledger_entries where company_id=p_company_id and idempotency_key=p_idempotency_key;
  if found then
    if v_entry.partner_type<>p_partner_type or coalesce(v_entry.customer_id,v_entry.supplier_id)<>p_partner_id
      or v_entry.entry_date<>p_entry_date or v_entry.amount<>-p_amount or v_entry.payment_method<>p_payment_method then
      raise exception 'payment idempotency conflict';
    end if;
    return v_entry;
  end if;
  insert into public.partner_ledger_entries(company_id,partner_type,customer_id,supplier_id,entry_date,entry_type,amount,payment_method,idempotency_key,memo,created_by_user_id,created_by_name)
  values(p_company_id,p_partner_type,case when p_partner_type='customer' then p_partner_id end,case when p_partner_type='supplier' then p_partner_id end,p_entry_date,case when p_partner_type='customer' then 'receipt' else 'payment' end,-p_amount,p_payment_method,p_idempotency_key,nullif(btrim(p_memo),''),p_actor_user_id,p_actor_name)
  returning * into v_entry;
  if p_document_id is not null then
    insert into public.business_document_payment_allocations(company_id,document_id,ledger_entry_id,allocated_amount,created_by_user_id,created_by_name)
    values(p_company_id,p_document_id,v_entry.id,p_amount,p_actor_user_id,p_actor_name);
  end if;
  return v_entry;
end;
$$;

create or replace function public.reverse_partner_payment_v1(
  p_company_id uuid,p_entry_id uuid,p_reason text,p_idempotency_key text,
  p_actor_user_id uuid,p_actor_name text
) returns public.partner_ledger_entries
language plpgsql security invoker set search_path = '' as $$
declare v_original public.partner_ledger_entries%rowtype; v_reversal public.partner_ledger_entries%rowtype;
begin
  select * into v_original from public.partner_ledger_entries where company_id=p_company_id and id=p_entry_id for update;
  if not found or v_original.entry_type not in ('receipt','payment') then raise exception 'payment entry not found'; end if;
  if nullif(btrim(p_reason),'') is null then raise exception 'payment reversal reason required'; end if;
  if exists(select 1 from public.partner_ledger_entries where company_id=p_company_id and reverses_entry_id=p_entry_id) then raise exception 'payment already reversed'; end if;
  insert into public.partner_ledger_entries(company_id,partner_type,customer_id,supplier_id,entry_date,entry_type,amount,payment_method,idempotency_key,reverses_entry_id,memo,created_by_user_id,created_by_name)
  values(p_company_id,v_original.partner_type,v_original.customer_id,v_original.supplier_id,(clock_timestamp() at time zone 'Asia/Seoul')::date,'reversal',-v_original.amount,v_original.payment_method,p_idempotency_key,p_entry_id,btrim(p_reason),p_actor_user_id,p_actor_name)
  returning * into v_reversal;
  delete from public.business_document_payment_allocations where company_id=p_company_id and ledger_entry_id=p_entry_id;
  return v_reversal;
end;
$$;

create or replace function public.offset_dual_partner_balance_v1(
  p_company_id uuid,p_customer_id uuid,p_supplier_id uuid,p_entry_date date,p_amount bigint,
  p_reason text,p_idempotency_key text,p_actor_user_id uuid,p_actor_name text
) returns setof public.partner_ledger_entries
language plpgsql security invoker set search_path = '' as $$
declare v_customer public.normalized_customers%rowtype; v_supplier public.product_suppliers%rowtype; v_row public.partner_ledger_entries%rowtype; v_receivable bigint; v_payable bigint;
begin
  if p_amount<=0 or nullif(btrim(p_reason),'') is null then raise exception 'offset amount and reason required'; end if;
  perform pg_advisory_xact_lock(hashtextextended(p_company_id::text||':'||p_idempotency_key,0));
  if exists(select 1 from public.partner_ledger_entries where company_id=p_company_id and idempotency_key=p_idempotency_key||':customer') then
    return query select * from public.partner_ledger_entries where company_id=p_company_id and idempotency_key in (p_idempotency_key||':customer',p_idempotency_key||':supplier') order by idempotency_key; return;
  end if;
  select * into v_customer from public.normalized_customers where company_id=p_company_id and id=p_customer_id;
  select * into v_supplier from public.product_suppliers where company_id=p_company_id and id=p_supplier_id;
  if v_customer.id is null or v_supplier.id is null or v_supplier.linked_customer_id is distinct from p_customer_id
    or regexp_replace(coalesce(v_customer.business_registration_number,''),'\D','','g')<>regexp_replace(coalesce(v_supplier.business_number,''),'\D','','g')
    or coalesce(v_customer.sub_business_number,'')<>coalesce(v_supplier.sub_business_number,'') then raise exception 'offset dual partner mismatch'; end if;
  select coalesce(sum(amount),0) into v_receivable from public.partner_ledger_entries where company_id=p_company_id and partner_type='customer' and customer_id=p_customer_id;
  select coalesce(sum(amount),0) into v_payable from public.partner_ledger_entries where company_id=p_company_id and partner_type='supplier' and supplier_id=p_supplier_id;
  if v_receivable<p_amount or v_payable<p_amount then raise exception 'offset exceeds partner balance'; end if;
  insert into public.partner_ledger_entries(company_id,partner_type,customer_id,entry_date,entry_type,amount,idempotency_key,memo,created_by_user_id,created_by_name)
  values(p_company_id,'customer',p_customer_id,p_entry_date,'adjustment',-p_amount,p_idempotency_key||':customer',btrim(p_reason),p_actor_user_id,p_actor_name) returning * into v_row; return next v_row;
  insert into public.partner_ledger_entries(company_id,partner_type,supplier_id,entry_date,entry_type,amount,idempotency_key,memo,created_by_user_id,created_by_name)
  values(p_company_id,'supplier',p_supplier_id,p_entry_date,'adjustment',-p_amount,p_idempotency_key||':supplier',btrim(p_reason),p_actor_user_id,p_actor_name) returning * into v_row; return next v_row;
end;
$$;

revoke execute on function public.record_partner_payment_v2(uuid,text,uuid,date,bigint,text,text,uuid,text,text,uuid) from public,anon,authenticated;
revoke execute on function public.reverse_partner_payment_v1(uuid,uuid,text,text,uuid,text) from public,anon,authenticated;
revoke execute on function public.offset_dual_partner_balance_v1(uuid,uuid,uuid,date,bigint,text,text,uuid,text) from public,anon,authenticated;
grant execute on function public.record_partner_payment_v2(uuid,text,uuid,date,bigint,text,text,uuid,text,text,uuid) to service_role;
grant execute on function public.reverse_partner_payment_v1(uuid,uuid,text,text,uuid,text) to service_role;
grant execute on function public.offset_dual_partner_balance_v1(uuid,uuid,uuid,date,bigint,text,text,uuid,text) to service_role;
commit;
