-- 운영 적용 완료(2026-10-16). 재실행 금지.
-- 원본: erp-phase-1b-v2.sql
-- ERP 1-B v2: 발행 전표 자유 수정·삭제·거래처 이동 / 세금계산서(홈택스 엑셀) 발행분 잠금 / 매입·매출 겸업 거래처 연결
-- 선행: ERP 1단계(20261016190000_erp_phase_1_documents_ledger) 적용 완료.
-- Supabase SQL Editor에서 한 번 실행. 여러 번 실행해도 안전(멱등).

begin;

-- 1. 전표: 수정 이력·세금계산서 잠금
alter table public.business_documents
  add column if not exists revision integer not null default 0,
  add column if not exists last_revised_at timestamptz,
  add column if not exists last_revised_by_name text,
  add column if not exists tax_invoice_locked_at timestamptz;

-- 2. 매입처 ↔ 매출처 연결(같은 사업자가 양쪽인 경우, 1:1)
alter table public.product_suppliers
  add column if not exists linked_customer_id uuid;
do $$
begin
  if not exists (select 1 from pg_constraint where conname = 'product_suppliers_linked_customer_fk') then
    alter table public.product_suppliers
      add constraint product_suppliers_linked_customer_fk foreign key (company_id, linked_customer_id)
      references public.normalized_customers(company_id, id) on delete set null (linked_customer_id);
  end if;
end $$;
create unique index if not exists product_suppliers_linked_customer_uq
  on public.product_suppliers(company_id, linked_customer_id) where linked_customer_id is not null;

-- 3. 원장 결제수단에 상계(offset) 추가
alter table public.partner_ledger_entries
  drop constraint if exists partner_ledger_entries_payment_method_check;
alter table public.partner_ledger_entries
  add constraint partner_ledger_entries_payment_method_check
  check (payment_method is null or payment_method in ('bank', 'card', 'cash', 'other', 'offset'));

-- 4. 전표 변경 이력(수정·이동·삭제·세금계산서 잠금) — 추가만 가능
create table if not exists public.business_document_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null,
  event_type text not null check (event_type in ('revise', 'move', 'delete', 'tax_invoice_lock')),
  from_customer_id uuid,
  from_supplier_id uuid,
  from_partner_name text,
  to_customer_id uuid,
  to_supplier_id uuid,
  to_partner_name text,
  before_total bigint,
  after_total bigint,
  reason text,
  actor_user_id uuid,
  actor_name text not null,
  created_at timestamptz not null default now(),
  constraint business_document_events_document_fk foreign key (company_id, document_id)
    references public.business_documents(company_id, id) on delete restrict
);
create index if not exists business_document_events_document_idx
  on public.business_document_events(company_id, document_id, created_at);

drop trigger if exists business_document_events_append_only_trg on public.business_document_events;
create trigger business_document_events_append_only_trg
before update or delete on public.business_document_events
for each row execute function public.reject_append_only_mutation();

-- 5. 세금계산서(홈택스 엑셀 업로드용 묶음). 월합계처럼 여러 전표를 하나로 묶을 수 있음
create table if not exists public.tax_invoices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  direction text not null check (direction in ('sales', 'purchase')),
  invoice_kind text not null check (invoice_kind in ('tax', 'exempt')),  -- tax=세금계산서, exempt=계산서
  customer_id uuid,
  supplier_id uuid,
  partner_name_snapshot text not null,
  partner_business_number_snapshot text,
  write_date date not null,
  supply_amount bigint not null,
  tax_amount bigint not null,
  status text not null default 'draft' check (status in ('draft', 'issued')),
  approval_number text,
  issued_on date,
  exported_at timestamptz,
  issued_marked_at timestamptz,
  issued_marked_by_name text,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint tax_invoices_company_id_id_uq unique (company_id, id),
  constraint tax_invoices_partner_check check (
    (direction = 'sales' and customer_id is not null and supplier_id is null)
    or (direction = 'purchase' and supplier_id is not null and customer_id is null)
  ),
  constraint tax_invoices_exempt_tax_check check (invoice_kind = 'tax' or tax_amount = 0),
  constraint tax_invoices_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint tax_invoices_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict
);

create table if not exists public.tax_invoice_documents (
  company_id uuid not null,
  tax_invoice_id uuid not null,
  document_id uuid not null,
  invoice_kind text not null check (invoice_kind in ('tax', 'exempt')),
  primary key (company_id, tax_invoice_id, document_id),
  constraint tax_invoice_documents_invoice_fk foreign key (company_id, tax_invoice_id)
    references public.tax_invoices(company_id, id) on delete cascade,
  constraint tax_invoice_documents_document_fk foreign key (company_id, document_id)
    references public.business_documents(company_id, id) on delete restrict
);
-- 한 전표의 과세분/면세분은 각각 한 세금계산서에만 들어갈 수 있음
create unique index if not exists tax_invoice_documents_kind_uq
  on public.tax_invoice_documents(company_id, document_id, invoice_kind);

-- 6. 헤더 가드
create or replace function public.guard_business_document_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_flag text := coalesce(current_setting('app.erp_document_transition', true), '');
  v_revise_keys text[] := array['updated_at','document_date','memo','taxable_supply_amount','exempt_supply_amount',
    'tax_amount','total_amount','revision','last_revised_at','last_revised_by_name',
    'customer_id','supplier_id','partner_name_snapshot','partner_business_number_snapshot',
    'partner_representative_snapshot','partner_address_snapshot','partner_contact_snapshot'];
  v_cancel_keys text[] := array['updated_at','status','cancelled_by_user_id','cancelled_by_name','cancelled_at'];
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'finalized documents cannot be deleted';
    end if;
    return old;
  end if;

  if new.company_id <> old.company_id or new.document_type <> old.document_type then
    raise exception 'company and document type are immutable';
  end if;
  if old.tax_invoice_locked_at is not null then
    raise exception 'tax invoiced documents are immutable';
  end if;

  if old.status = 'draft' then
    if new.status is distinct from old.status
       and not (new.status = 'confirmed' and v_flag = 'confirm') then
      raise exception 'document status can only change through confirm_business_document or cancel_business_document';
    end if;
    if new.tax_invoice_locked_at is not null then
      raise exception 'only confirmed documents can be tax invoice locked';
    end if;
    return new;
  end if;

  if old.status = 'cancelled' then
    raise exception 'cancelled documents are immutable';
  end if;

  -- 확정(발행) 전표
  if v_flag = 'cancel' and new.status = 'cancelled' then
    if (to_jsonb(new) - v_cancel_keys) is distinct from (to_jsonb(old) - v_cancel_keys) then
      raise exception 'confirmed document contents are immutable';
    end if;
    return new;
  elsif v_flag = 'revise' and new.status = 'confirmed' then
    if (to_jsonb(new) - v_revise_keys) is distinct from (to_jsonb(old) - v_revise_keys) then
      raise exception 'confirmed document revision changed a protected field';
    end if;
    return new;
  elsif v_flag = 'tax_lock' and new.status = 'confirmed' then
    if (to_jsonb(new) - array['updated_at','tax_invoice_locked_at'])
       is distinct from (to_jsonb(old) - array['updated_at','tax_invoice_locked_at']) then
      raise exception 'tax invoice lock can only set the lock time';
    end if;
    return new;
  end if;

  raise exception 'confirmed documents can only change through revise, cancel or tax invoice functions';
end;
$$;

-- 7. 품목 가드
create or replace function public.validate_business_document_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document_type text;
  v_status text;
  v_locked_at timestamptz;
  v_company_id uuid;
  v_document_id uuid;
begin
  if tg_op = 'UPDATE' and (
    new.company_id <> old.company_id or new.document_id <> old.document_id
  ) then
    raise exception 'line company and document are immutable';
  end if;
  v_company_id := case when tg_op = 'DELETE' then old.company_id else new.company_id end;
  v_document_id := case when tg_op = 'DELETE' then old.document_id else new.document_id end;
  select document_type, status, tax_invoice_locked_at into v_document_type, v_status, v_locked_at
  from public.business_documents
  where company_id = v_company_id and id = v_document_id
  for update;
  if not found and tg_op = 'DELETE' then return old; end if;
  if v_locked_at is not null then
    raise exception 'tax invoiced document lines are immutable';
  end if;
  if not (
    v_status = 'draft'
    or (v_status = 'confirmed'
        and coalesce(current_setting('app.erp_document_transition', true), '') = 'revise')
  ) then
    raise exception 'finalized document lines are immutable';
  end if;
  if tg_op <> 'DELETE' and (
    (v_document_type in ('sale', 'sale_return') and new.supplier_product_id is not null)
    or (v_document_type in ('purchase', 'purchase_return') and new.product_catalog_id is not null)
  ) then raise exception 'product reference does not match document type'; end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$$;

-- 8. 저장(작성중·발행 공용): 거래처 이동 + 품목 일괄 교체, 단일 트랜잭션
create or replace function public.save_business_document(
  p_company_id uuid,
  p_document_id uuid,
  p_partner_id uuid,            -- 매출 계열이면 매출처 ID, 매입 계열이면 매입처 ID
  p_document_date date,
  p_memo text,
  p_lines jsonb,
  p_actor_user_id uuid,
  p_actor_name text,
  p_reason text default null
) returns public.business_documents
language plpgsql security invoker set search_path = '' as $$
declare
  v_old public.business_documents%rowtype;
  v_document public.business_documents%rowtype;
  v_original public.business_documents%rowtype;
  v_is_sale boolean;
  v_partner jsonb;
  v_partner_name text;
  v_moved boolean;
  v_taxable bigint; v_exempt bigint; v_tax bigint; v_total bigint;
  v_sign integer;
  v_other_returns bigint;
  v_delta bigint;
  v_old_net record;
begin
  select * into v_old from public.business_documents
  where company_id = p_company_id and id = p_document_id for update;
  if not found then raise exception 'document not found'; end if;
  if v_old.tax_invoice_locked_at is not null then raise exception 'tax invoiced documents are immutable'; end if;
  if v_old.status = 'cancelled' then raise exception 'cancelled documents are immutable'; end if;
  if exists (select 1 from public.tax_invoice_documents
             where company_id = p_company_id and document_id = p_document_id) then
    raise exception 'remove this document from its draft tax invoice first';
  end if;
  if jsonb_typeof(p_lines) <> 'array' or jsonb_array_length(p_lines) = 0 then
    raise exception 'document requires at least one line';
  end if;
  if jsonb_array_length(p_lines) > 500 then raise exception 'too many lines'; end if;
  if v_old.status = 'confirmed'
     and extract(year from p_document_date) <> extract(year from v_old.document_date) then
    raise exception 'confirmed document date cannot move to another year';
  end if;

  v_is_sale := v_old.document_type in ('sale', 'sale_return');
  v_moved := p_partner_id is distinct from (case when v_is_sale then v_old.customer_id else v_old.supplier_id end);

  -- 이동 대상 거래처 확인 및 스냅샷
  if v_is_sale then
    select to_jsonb(c) into v_partner from public.normalized_customers c
    where c.company_id = p_company_id and c.id = p_partner_id;
    if v_partner is null then raise exception 'target customer not found'; end if;
    v_partner_name := coalesce(v_partner->>'customer_name', v_partner->>'name');
  else
    select to_jsonb(s) into v_partner from public.product_suppliers s
    where s.company_id = p_company_id and s.id = p_partner_id;
    if v_partner is null then raise exception 'target supplier not found'; end if;
    v_partner_name := v_partner->>'name';
  end if;

  if v_moved then
    if v_old.document_type in ('sale_return', 'purchase_return') then
      raise exception 'return documents must stay with the partner of their original document';
    end if;
    if exists (select 1 from public.business_documents
               where company_id = p_company_id and original_document_id = p_document_id and status = 'confirmed') then
      raise exception 'delete the confirmed return documents before moving this document';
    end if;
  end if;

  if v_old.status = 'confirmed' then
    perform set_config('app.erp_document_transition', 'revise', true);
  end if;

  delete from public.business_document_lines
  where company_id = p_company_id and document_id = p_document_id;

  insert into public.business_document_lines(
    company_id, document_id, sort_order, product_catalog_id, supplier_product_id,
    product_code_snapshot, product_name_snapshot, specification_snapshot, unit_snapshot,
    tax_type_snapshot, quantity, unit_price, memo
  )
  select p_company_id, p_document_id, x.ord::integer,
         nullif(x.line->>'product_catalog_id', '')::uuid,
         nullif(x.line->>'supplier_product_id', '')::uuid,
         nullif(btrim(x.line->>'product_code'), ''),
         btrim(x.line->>'product_name'),
         nullif(btrim(x.line->>'specification'), ''),
         coalesce(nullif(btrim(x.line->>'unit'), ''), 'EA'),
         x.line->>'tax_type',
         (x.line->>'quantity')::numeric,
         round((x.line->>'unit_price')::numeric)::bigint,
         nullif(btrim(x.line->>'memo'), '')
  from jsonb_array_elements(p_lines) with ordinality as x(line, ord);

  select
    coalesce(sum(supply_amount) filter (where tax_type_snapshot = 'taxable'), 0),
    coalesce(sum(supply_amount) filter (where tax_type_snapshot = 'exempt'), 0),
    coalesce(sum(tax_amount), 0), coalesce(sum(total_amount), 0)
  into v_taxable, v_exempt, v_tax, v_total
  from public.business_document_lines
  where company_id = p_company_id and document_id = p_document_id;

  -- 반품 한도
  if v_old.status = 'confirmed' then
    if v_old.document_type in ('sale_return', 'purchase_return') then
      select * into v_original from public.business_documents
      where company_id = p_company_id and id = v_old.original_document_id for update;
      select coalesce(sum(total_amount), 0) into v_other_returns
      from public.business_documents
      where company_id = p_company_id and original_document_id = v_old.original_document_id
        and status = 'confirmed' and id <> p_document_id;
      if v_other_returns + v_total > v_original.total_amount then
        raise exception 'return total exceeds the remaining amount of the original document';
      end if;
    else
      select coalesce(sum(total_amount), 0) into v_other_returns
      from public.business_documents
      where company_id = p_company_id and original_document_id = p_document_id and status = 'confirmed';
      if v_total < v_other_returns then
        raise exception 'revised total is below the confirmed returns of this document';
      end if;
    end if;
  end if;

  update public.business_documents set
    customer_id = case when v_is_sale then p_partner_id end,
    supplier_id = case when v_is_sale then null else p_partner_id end,
    partner_name_snapshot = v_partner_name,
    partner_business_number_snapshot = coalesce(v_partner->>'business_registration_number', v_partner->>'business_number'),
    partner_representative_snapshot = v_partner->>'representative_name',
    partner_address_snapshot = v_partner->>'address',
    partner_contact_snapshot = coalesce(v_partner->>'phone', v_partner->>'contact_phone'),
    document_date = p_document_date, memo = nullif(btrim(p_memo), ''),
    taxable_supply_amount = v_taxable, exempt_supply_amount = v_exempt,
    tax_amount = v_tax, total_amount = v_total,
    revision = case when v_old.status = 'confirmed' then revision + 1 else revision end,
    last_revised_at = case when v_old.status = 'confirmed' then now() else last_revised_at end,
    last_revised_by_name = case when v_old.status = 'confirmed' then p_actor_name else last_revised_by_name end,
    updated_at = now()
  where company_id = p_company_id and id = p_document_id returning * into v_document;
  perform set_config('app.erp_document_transition', '', true);

  if v_old.status = 'draft' then
    return v_document;
  end if;

  -- 발행 전표: 원장 반영 (원장은 수정하지 않고 차액·이동분만 추가)
  v_sign := case when v_old.document_type in ('sale_return', 'purchase_return') then -1 else 1 end;
  if v_moved then
    -- 기존 거래처: 이 전표로 쌓인 순액 전부 되돌림
    for v_old_net in
      select partner_type, customer_id, supplier_id,
             sum(amount) as amount, sum(supply_amount) as supply_amount, sum(tax_amount) as tax_amount
      from public.partner_ledger_entries
      where company_id = p_company_id and source_document_id = p_document_id
      group by partner_type, customer_id, supplier_id
      having sum(amount) <> 0
    loop
      insert into public.partner_ledger_entries(
        company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
        amount, supply_amount, tax_amount, source_document_id, idempotency_key, memo,
        created_by_user_id, created_by_name
      ) values (
        p_company_id, v_old_net.partner_type, v_old_net.customer_id, v_old_net.supplier_id,
        v_document.document_date, 'adjustment',
        -v_old_net.amount, -v_old_net.supply_amount, -v_old_net.tax_amount, p_document_id,
        'document:' || p_document_id || ':rev:' || v_document.revision || ':out:'
          || coalesce(v_old_net.customer_id, v_old_net.supplier_id),
        '전표 이동: ' || v_old.partner_name_snapshot || ' → ' || v_partner_name
          || coalesce(' (' || nullif(btrim(p_reason), '') || ')', ''),
        p_actor_user_id, p_actor_name
      );
    end loop;
    -- 새 거래처: 수정 후 금액 전체
    insert into public.partner_ledger_entries(
      company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
      amount, supply_amount, tax_amount, source_document_id, idempotency_key, memo,
      created_by_user_id, created_by_name
    ) values (
      p_company_id, case when v_is_sale then 'customer' else 'supplier' end,
      v_document.customer_id, v_document.supplier_id, v_document.document_date, 'adjustment',
      v_sign * v_total, v_sign * (v_taxable + v_exempt), v_sign * v_tax, p_document_id,
      'document:' || p_document_id || ':rev:' || v_document.revision || ':in',
      '전표 이동: ' || v_old.partner_name_snapshot || ' → ' || v_partner_name
        || coalesce(' (' || nullif(btrim(p_reason), '') || ')', ''),
      p_actor_user_id, p_actor_name
    );
  else
    v_delta := v_sign * (v_total - v_old.total_amount);
    if v_delta <> 0 then
      insert into public.partner_ledger_entries(
        company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
        amount, supply_amount, tax_amount, source_document_id, idempotency_key, memo,
        created_by_user_id, created_by_name
      ) values (
        p_company_id, case when v_is_sale then 'customer' else 'supplier' end,
        v_document.customer_id, v_document.supplier_id, v_document.document_date, 'adjustment',
        v_delta,
        v_sign * ((v_taxable + v_exempt) - (v_old.taxable_supply_amount + v_old.exempt_supply_amount)),
        v_sign * (v_tax - v_old.tax_amount), p_document_id,
        'document:' || p_document_id || ':rev:' || v_document.revision,
        coalesce(nullif(btrim(p_reason), ''), '전표 수정 ' || v_document.revision || '차'),
        p_actor_user_id, p_actor_name
      );
    end if;
  end if;

  insert into public.business_document_events(
    company_id, document_id, event_type,
    from_customer_id, from_supplier_id, from_partner_name,
    to_customer_id, to_supplier_id, to_partner_name,
    before_total, after_total, reason, actor_user_id, actor_name
  ) values (
    p_company_id, p_document_id, case when v_moved then 'move' else 'revise' end,
    v_old.customer_id, v_old.supplier_id, v_old.partner_name_snapshot,
    v_document.customer_id, v_document.supplier_id, v_document.partner_name_snapshot,
    v_old.total_amount, v_document.total_amount, nullif(btrim(p_reason), ''), p_actor_user_id, p_actor_name
  );
  return v_document;
end;
$$;

-- 9. 삭제(발행 전표) = 취소 처리: 거래처별 순액을 반대로 기록
create or replace function public.cancel_business_document(
  p_company_id uuid, p_document_id uuid, p_actor_user_id uuid,
  p_actor_name text, p_reason text
) returns public.business_documents
language plpgsql security invoker set search_path = '' as $$
declare
  v_document public.business_documents%rowtype;
  v_confirm_entry_id uuid;
  v_net record;
begin
  select * into v_document from public.business_documents
  where company_id = p_company_id and id = p_document_id for update;
  if not found then raise exception 'document not found'; end if;
  if v_document.status = 'cancelled' then return v_document; end if;
  if v_document.status <> 'confirmed' then raise exception 'only confirmed documents can be cancelled'; end if;
  if v_document.tax_invoice_locked_at is not null then raise exception 'tax invoiced documents are immutable'; end if;
  if exists (
    select 1 from public.business_documents
    where company_id = p_company_id and original_document_id = p_document_id and status = 'confirmed'
  ) then
    raise exception 'cancel the confirmed return documents of this document first';
  end if;
  if exists (select 1 from public.tax_invoice_documents
             where company_id = p_company_id and document_id = p_document_id) then
    raise exception 'remove this document from its draft tax invoice first';
  end if;
  select id into v_confirm_entry_id from public.partner_ledger_entries
  where company_id = p_company_id and idempotency_key = 'document:' || p_document_id || ':confirm';

  perform set_config('app.erp_document_transition', 'cancel', true);
  update public.business_documents set
    status = 'cancelled', cancelled_by_user_id = p_actor_user_id,
    cancelled_by_name = p_actor_name, cancelled_at = now(), updated_at = now()
  where company_id = p_company_id and id = p_document_id returning * into v_document;
  perform set_config('app.erp_document_transition', '', true);

  for v_net in
    select partner_type, customer_id, supplier_id,
           sum(amount) as amount, sum(supply_amount) as supply_amount, sum(tax_amount) as tax_amount
    from public.partner_ledger_entries
    where company_id = p_company_id and source_document_id = p_document_id
    group by partner_type, customer_id, supplier_id
    having sum(amount) <> 0
  loop
    insert into public.partner_ledger_entries(
      company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
      amount, supply_amount, tax_amount, source_document_id, idempotency_key,
      reverses_entry_id, memo, created_by_user_id, created_by_name
    ) values (
      p_company_id, v_net.partner_type, v_net.customer_id, v_net.supplier_id,
      (now() at time zone 'Asia/Seoul')::date, 'reversal',
      -v_net.amount, -v_net.supply_amount, -v_net.tax_amount, p_document_id,
      'document:' || p_document_id || ':cancel:' || coalesce(v_net.customer_id, v_net.supplier_id),
      v_confirm_entry_id, coalesce(nullif(btrim(p_reason), ''), '전표 삭제'),
      p_actor_user_id, p_actor_name
    ) on conflict (company_id, idempotency_key) do nothing;
  end loop;

  insert into public.business_document_events(
    company_id, document_id, event_type, from_customer_id, from_supplier_id, from_partner_name,
    before_total, after_total, reason, actor_user_id, actor_name
  ) values (
    p_company_id, p_document_id, 'delete', v_document.customer_id, v_document.supplier_id,
    v_document.partner_name_snapshot, v_document.total_amount, 0, nullif(btrim(p_reason), ''),
    p_actor_user_id, p_actor_name
  );
  return v_document;
end;
$$;

-- 10. 세금계산서 묶음 만들기(초안, 엑셀 내보내기용). 전표는 아직 잠그지 않음
create or replace function public.create_tax_invoice(
  p_company_id uuid, p_invoice_kind text, p_write_date date,
  p_document_ids uuid[], p_actor_name text
) returns public.tax_invoices
language plpgsql security invoker set search_path = '' as $$
declare
  v_invoice public.tax_invoices%rowtype;
  v_count integer;
  v_partners integer;
  v_direction text;
  v_customer uuid; v_supplier uuid; v_name text; v_bizno text;
  v_supply bigint; v_tax bigint;
begin
  if p_invoice_kind not in ('tax', 'exempt') then raise exception 'invalid invoice kind'; end if;
  if coalesce(array_length(p_document_ids, 1), 0) = 0 then raise exception 'select at least one document'; end if;

  perform 1 from public.business_documents
  where company_id = p_company_id and id = any(p_document_ids) for update;

  select count(*),
         count(distinct coalesce(customer_id, supplier_id)),
         min(case when document_type in ('sale','sale_return') then 'sales' else 'purchase' end),
         max(case when document_type in ('sale','sale_return') then 'sales' else 'purchase' end)
    into v_count, v_partners, v_direction, v_name
  from public.business_documents
  where company_id = p_company_id and id = any(p_document_ids);
  if v_count <> array_length(p_document_ids, 1) then raise exception 'document not found'; end if;
  if v_partners <> 1 then raise exception 'a tax invoice must cover a single partner'; end if;
  if v_direction <> v_name then raise exception 'sales and purchase documents cannot be mixed'; end if;
  if exists (select 1 from public.business_documents
             where company_id = p_company_id and id = any(p_document_ids)
               and (status <> 'confirmed' or tax_invoice_locked_at is not null)) then
    raise exception 'only confirmed, unlocked documents can be invoiced';
  end if;
  if exists (select 1 from public.tax_invoice_documents
             where company_id = p_company_id and document_id = any(p_document_ids)
               and invoice_kind = p_invoice_kind) then
    raise exception 'a document is already included in another tax invoice of this kind';
  end if;

  select max(customer_id::text)::uuid, max(supplier_id::text)::uuid,
         max(partner_name_snapshot), max(partner_business_number_snapshot),
         sum(case when document_type in ('sale_return','purchase_return') then -1 else 1 end
             * case when p_invoice_kind = 'tax' then taxable_supply_amount else exempt_supply_amount end),
         sum(case when document_type in ('sale_return','purchase_return') then -1 else 1 end
             * case when p_invoice_kind = 'tax' then tax_amount else 0 end)
    into v_customer, v_supplier, v_name, v_bizno, v_supply, v_tax
  from public.business_documents
  where company_id = p_company_id and id = any(p_document_ids);
  if v_supply = 0 and v_tax = 0 then raise exception 'selected documents have no amount for this invoice kind'; end if;

  insert into public.tax_invoices(
    company_id, direction, invoice_kind, customer_id, supplier_id,
    partner_name_snapshot, partner_business_number_snapshot, write_date,
    supply_amount, tax_amount, created_by_name
  ) values (
    p_company_id, v_direction, p_invoice_kind, v_customer, v_supplier,
    v_name, v_bizno, p_write_date, v_supply, v_tax, p_actor_name
  ) returning * into v_invoice;

  insert into public.tax_invoice_documents(company_id, tax_invoice_id, document_id, invoice_kind)
  select p_company_id, v_invoice.id, d, p_invoice_kind from unnest(p_document_ids) d;
  return v_invoice;
end;
$$;

-- 11. 초안 세금계산서 삭제(발행 전만)
create or replace function public.delete_draft_tax_invoice(
  p_company_id uuid, p_tax_invoice_id uuid
) returns void
language plpgsql security invoker set search_path = '' as $$
begin
  delete from public.tax_invoices
  where company_id = p_company_id and id = p_tax_invoice_id and status = 'draft';
  if not found then raise exception 'only draft tax invoices can be deleted'; end if;
end;
$$;

-- 12. 홈택스 발행 완료 표시 → 포함 전표 전부 잠금(되돌리기 없음)
create or replace function public.mark_tax_invoice_issued(
  p_company_id uuid, p_tax_invoice_id uuid, p_approval_number text,
  p_issued_on date, p_actor_user_id uuid, p_actor_name text
) returns public.tax_invoices
language plpgsql security invoker set search_path = '' as $$
declare
  v_invoice public.tax_invoices%rowtype;
  v_doc record;
begin
  select * into v_invoice from public.tax_invoices
  where company_id = p_company_id and id = p_tax_invoice_id for update;
  if not found then raise exception 'tax invoice not found'; end if;
  if v_invoice.status = 'issued' then return v_invoice; end if;

  update public.tax_invoices set
    status = 'issued', approval_number = nullif(btrim(p_approval_number), ''),
    issued_on = coalesce(p_issued_on, (now() at time zone 'Asia/Seoul')::date),
    issued_marked_at = now(), issued_marked_by_name = p_actor_name, updated_at = now()
  where company_id = p_company_id and id = p_tax_invoice_id returning * into v_invoice;

  perform set_config('app.erp_document_transition', 'tax_lock', true);
  for v_doc in
    select d.id, d.total_amount from public.business_documents d
    join public.tax_invoice_documents l on l.company_id = d.company_id and l.document_id = d.id
    where l.company_id = p_company_id and l.tax_invoice_id = p_tax_invoice_id
      and d.tax_invoice_locked_at is null
    for update of d
  loop
    update public.business_documents set tax_invoice_locked_at = now(), updated_at = now()
    where company_id = p_company_id and id = v_doc.id;
    insert into public.business_document_events(
      company_id, document_id, event_type, before_total, after_total, reason, actor_user_id, actor_name
    ) values (
      p_company_id, v_doc.id, 'tax_invoice_lock', v_doc.total_amount, v_doc.total_amount,
      coalesce('승인번호 ' || nullif(btrim(p_approval_number), ''), '세금계산서 발행'), p_actor_user_id, p_actor_name
    );
  end loop;
  perform set_config('app.erp_document_transition', '', true);
  return v_invoice;
end;
$$;

-- 13. 겸업 거래처 상계: 매출처 미수금과 매입처 미지급금을 같은 금액만큼 동시에 차감
create or replace function public.offset_partner_balances(
  p_company_id uuid, p_supplier_id uuid, p_amount bigint, p_entry_date date,
  p_idempotency_key text, p_actor_user_id uuid, p_actor_name text, p_memo text default null
) returns void
language plpgsql security invoker set search_path = '' as $$
declare
  v_customer_id uuid;
begin
  if p_amount <= 0 then raise exception 'offset amount must be positive'; end if;
  select linked_customer_id into v_customer_id from public.product_suppliers
  where company_id = p_company_id and id = p_supplier_id;
  if v_customer_id is null then raise exception 'supplier is not linked to a customer'; end if;
  insert into public.partner_ledger_entries(
    company_id, partner_type, customer_id, entry_date, entry_type, amount, payment_method,
    idempotency_key, memo, created_by_user_id, created_by_name
  ) values (
    p_company_id, 'customer', v_customer_id, p_entry_date, 'receipt', -p_amount, 'offset',
    p_idempotency_key || ':customer', coalesce(p_memo, '매입·매출 상계'), p_actor_user_id, p_actor_name
  ) on conflict (company_id, idempotency_key) do nothing;
  insert into public.partner_ledger_entries(
    company_id, partner_type, supplier_id, entry_date, entry_type, amount, payment_method,
    idempotency_key, memo, created_by_user_id, created_by_name
  ) values (
    p_company_id, 'supplier', p_supplier_id, p_entry_date, 'payment', -p_amount, 'offset',
    p_idempotency_key || ':supplier', coalesce(p_memo, '매입·매출 상계'), p_actor_user_id, p_actor_name
  ) on conflict (company_id, idempotency_key) do nothing;
end;
$$;

-- 14. 권한
alter table public.business_document_events enable row level security;
alter table public.tax_invoices enable row level security;
alter table public.tax_invoice_documents enable row level security;
revoke all on table public.business_document_events from public, anon, authenticated;
revoke all on table public.tax_invoices from public, anon, authenticated;
revoke all on table public.tax_invoice_documents from public, anon, authenticated;
grant all on table public.business_document_events to service_role;
grant all on table public.tax_invoices to service_role;
grant all on table public.tax_invoice_documents to service_role;

revoke execute on function public.save_business_document(uuid,uuid,uuid,date,text,jsonb,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.cancel_business_document(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.create_tax_invoice(uuid,text,date,uuid[],text) from public, anon, authenticated;
revoke execute on function public.delete_draft_tax_invoice(uuid,uuid) from public, anon, authenticated;
revoke execute on function public.mark_tax_invoice_issued(uuid,uuid,text,date,uuid,text) from public, anon, authenticated;
revoke execute on function public.offset_partner_balances(uuid,uuid,bigint,date,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.save_business_document(uuid,uuid,uuid,date,text,jsonb,uuid,text,text) to service_role;
grant execute on function public.cancel_business_document(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.create_tax_invoice(uuid,text,date,uuid[],text) to service_role;
grant execute on function public.delete_draft_tax_invoice(uuid,uuid) to service_role;
grant execute on function public.mark_tax_invoice_issued(uuid,uuid,text,date,uuid,text) to service_role;
grant execute on function public.offset_partner_balances(uuid,uuid,bigint,date,text,uuid,text,text) to service_role;

commit;
