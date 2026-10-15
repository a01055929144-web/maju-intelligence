-- REVIEW ONLY. 운영 DB 실행 금지.
-- 실행 승인 후 사용할 수 있도록 begin...commit 형태로 작성한 1단계 초안입니다.

begin;

create table if not exists public.erp_number_counters (
  company_id uuid not null references public.companies(id) on delete restrict,
  sequence_kind text not null
    check (sequence_kind in ('sale', 'purchase', 'sale_return', 'purchase_return')),
  fiscal_year integer not null check (fiscal_year between 2000 and 9999),
  last_value bigint not null default 0 check (last_value >= 0),
  primary key (company_id, sequence_kind, fiscal_year)
);

create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_type text not null
    check (document_type in ('sale', 'purchase', 'sale_return', 'purchase_return')),
  document_number text not null,
  document_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  customer_id uuid,
  supplier_id uuid,
  original_document_id uuid,
  partner_name_snapshot text not null,
  partner_business_number_snapshot text,
  partner_representative_snapshot text,
  partner_address_snapshot text,
  partner_contact_snapshot text,
  source_type text not null default 'manual'
    check (source_type in ('manual', 'order', 'quote', 'upload', 'legacy_import')),
  source_id uuid,
  source_key text,
  assigned_staff_member_id uuid,
  assigned_staff_name_snapshot text,
  territory_id uuid,
  territory_name_snapshot text,
  taxable_supply_amount bigint not null default 0 check (taxable_supply_amount >= 0),
  exempt_supply_amount bigint not null default 0 check (exempt_supply_amount >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  total_amount bigint not null default 0 check (total_amount >= 0),
  memo text,
  created_by_user_id uuid,
  created_by_name text not null,
  confirmed_by_user_id uuid,
  confirmed_by_name text,
  confirmed_at timestamptz,
  cancelled_by_user_id uuid,
  cancelled_by_name text,
  cancelled_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_documents_company_id_id_uq unique (company_id, id),
  constraint business_documents_number_uq unique (company_id, document_number),
  constraint business_documents_partner_check check (
    (document_type in ('sale', 'sale_return') and customer_id is not null and supplier_id is null)
    or (document_type in ('purchase', 'purchase_return') and supplier_id is not null and customer_id is null)
  ),
  constraint business_documents_return_origin_check check (
    document_type in ('sale_return', 'purchase_return') or original_document_id is null
  ),
  constraint business_documents_total_check check (
    total_amount = taxable_supply_amount + exempt_supply_amount + tax_amount
  ),
  constraint business_documents_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint business_documents_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict,
  constraint business_documents_original_fk foreign key (company_id, original_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint business_documents_staff_fk foreign key (company_id, assigned_staff_member_id)
    references public.company_members(company_id, id) on delete set null (assigned_staff_member_id),
  constraint business_documents_territory_fk foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id) on delete set null (territory_id)
);

create unique index if not exists business_documents_source_key_uq
  on public.business_documents(company_id, source_type, source_key)
  where source_key is not null;

create table if not exists public.business_document_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  document_id uuid not null,
  sort_order integer not null default 0 check (sort_order >= 0),
  product_catalog_id uuid,
  supplier_product_id uuid,
  product_code_snapshot text,
  product_name_snapshot text not null,
  specification_snapshot text,
  unit_snapshot text not null,
  tax_type_snapshot text not null check (tax_type_snapshot in ('taxable', 'exempt')),
  quantity numeric(14,3) not null check (quantity > 0),
  unit_price bigint not null check (unit_price >= 0),
  supply_amount bigint generated always as (round(quantity * unit_price)::bigint) stored,
  tax_amount bigint generated always as (
    case when tax_type_snapshot = 'taxable'
      then round(round(quantity * unit_price) * 0.1)::bigint else 0 end
  ) stored,
  total_amount bigint generated always as (
    round(quantity * unit_price)::bigint
    + case when tax_type_snapshot = 'taxable'
      then round(round(quantity * unit_price) * 0.1)::bigint else 0 end
  ) stored,
  memo text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_document_lines_company_id_id_uq unique (company_id, id),
  constraint business_document_lines_document_fk foreign key (company_id, document_id)
    references public.business_documents(company_id, id) on delete cascade,
  constraint business_document_lines_product_fk foreign key (company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete set null (product_catalog_id),
  constraint business_document_lines_supplier_product_fk foreign key (company_id, supplier_product_id)
    references public.supplier_products(company_id, id) on delete set null (supplier_product_id)
);

create table if not exists public.partner_ledger_entries (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete restrict,
  partner_type text not null check (partner_type in ('customer', 'supplier')),
  customer_id uuid,
  supplier_id uuid,
  entry_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  entry_type text not null check (entry_type in (
    'sale', 'purchase', 'sale_return', 'purchase_return',
    'receipt', 'payment', 'adjustment', 'reversal'
  )),
  amount bigint not null,
  supply_amount bigint not null default 0,
  tax_amount bigint not null default 0,
  source_document_id uuid,
  payment_method text check (payment_method is null or payment_method in ('bank', 'card', 'cash', 'other')),
  idempotency_key text not null,
  reverses_entry_id uuid,
  memo text,
  created_by_user_id uuid,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  constraint partner_ledger_entries_company_id_id_uq unique (company_id, id),
  constraint partner_ledger_entries_idempotency_uq unique (company_id, idempotency_key),
  constraint partner_ledger_entries_partner_check check (
    (partner_type = 'customer' and customer_id is not null and supplier_id is null)
    or (partner_type = 'supplier' and supplier_id is not null and customer_id is null)
  ),
  constraint partner_ledger_entries_amount_sign_check check (
    (entry_type in ('sale', 'purchase') and amount > 0)
    or (entry_type in ('receipt', 'payment', 'sale_return', 'purchase_return') and amount < 0)
    or (entry_type in ('adjustment', 'reversal') and amount <> 0)
  ),
  constraint partner_ledger_entries_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint partner_ledger_entries_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict,
  constraint partner_ledger_entries_document_fk foreign key (company_id, source_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint partner_ledger_entries_reversal_fk foreign key (company_id, reverses_entry_id)
    references public.partner_ledger_entries(company_id, id) on delete restrict
);

create index if not exists business_documents_company_date_idx
  on public.business_documents(company_id, document_date desc, id);
create index if not exists business_documents_customer_date_idx
  on public.business_documents(company_id, customer_id, document_date desc, id)
  where customer_id is not null;
create index if not exists business_documents_supplier_date_idx
  on public.business_documents(company_id, supplier_id, document_date desc, id)
  where supplier_id is not null;
create index if not exists business_documents_status_date_idx
  on public.business_documents(company_id, status, document_date desc, id);
create index if not exists business_document_lines_document_idx
  on public.business_document_lines(company_id, document_id, sort_order, id);
create index if not exists business_document_lines_product_idx
  on public.business_document_lines(company_id, product_catalog_id, document_id)
  where product_catalog_id is not null;
create index if not exists partner_ledger_customer_date_idx
  on public.partner_ledger_entries(company_id, customer_id, entry_date, id)
  where customer_id is not null;
create index if not exists partner_ledger_supplier_date_idx
  on public.partner_ledger_entries(company_id, supplier_id, entry_date, id)
  where supplier_id is not null;

create or replace function public.next_erp_number(
  p_company_id uuid,
  p_sequence_kind text,
  p_business_date date default ((now() at time zone 'Asia/Seoul')::date)
) returns text
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_value bigint;
  v_prefix text;
begin
  if p_sequence_kind not in ('sale', 'purchase', 'sale_return', 'purchase_return') then
    raise exception 'unsupported sequence kind';
  end if;
  v_prefix := case p_sequence_kind
    when 'sale' then 'S'
    when 'purchase' then 'P'
    when 'sale_return' then 'SR'
    else 'PR'
  end;
  insert into public.erp_number_counters(company_id, sequence_kind, fiscal_year, last_value)
  values (p_company_id, p_sequence_kind, extract(year from p_business_date)::integer, 1)
  on conflict (company_id, sequence_kind, fiscal_year)
  do update set last_value = public.erp_number_counters.last_value + 1
  returning last_value into v_value;
  return v_prefix || '-' || to_char(p_business_date, 'YYYY') || '-' || lpad(v_value::text, 6, '0');
end;
$$;

create or replace function public.guard_business_document_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  if tg_op = 'DELETE' then
    if old.status <> 'draft' then
      raise exception 'finalized documents cannot be deleted';
    end if;
    return old;
  end if;

  if new.company_id <> old.company_id
     or new.document_type <> old.document_type
     or new.document_number <> old.document_number then
    raise exception 'company, document type, and document number are immutable';
  end if;

  if old.status = 'confirmed' then
    if new.status <> 'cancelled' then
      raise exception 'confirmed documents can only be cancelled';
    end if;
    if (to_jsonb(new) - array['status','cancelled_by_user_id','cancelled_by_name','cancelled_at','updated_at'])
       is distinct from
       (to_jsonb(old) - array['status','cancelled_by_user_id','cancelled_by_name','cancelled_at','updated_at']) then
      raise exception 'confirmed document contents are immutable';
    end if;
  elsif old.status = 'cancelled' then
    raise exception 'cancelled documents are immutable';
  end if;
  return new;
end;
$$;

drop trigger if exists business_documents_guard_trg on public.business_documents;
create trigger business_documents_guard_trg
before update or delete on public.business_documents
for each row execute function public.guard_business_document_mutation();

create or replace function public.validate_business_document_line()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document_type text;
  v_status text;
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
  select document_type, status into v_document_type, v_status
  from public.business_documents
  where company_id = v_company_id and id = v_document_id
  for update;
  if not found and tg_op = 'DELETE' then return old; end if;
  if v_status <> 'draft' then raise exception 'finalized document lines are immutable'; end if;
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

drop trigger if exists business_document_lines_guard_trg on public.business_document_lines;
create trigger business_document_lines_guard_trg
before insert or update or delete on public.business_document_lines
for each row execute function public.validate_business_document_line();

create or replace function public.reject_append_only_mutation()
returns trigger language plpgsql security invoker set search_path = '' as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

drop trigger if exists partner_ledger_entries_append_only_trg on public.partner_ledger_entries;
create trigger partner_ledger_entries_append_only_trg
before update or delete on public.partner_ledger_entries
for each row execute function public.reject_append_only_mutation();

create or replace function public.confirm_business_document(
  p_company_id uuid, p_document_id uuid, p_actor_user_id uuid, p_actor_name text
) returns public.business_documents
language plpgsql security invoker set search_path = '' as $$
declare
  v_document public.business_documents%rowtype;
  v_taxable bigint; v_exempt bigint; v_tax bigint; v_total bigint; v_signed_total bigint;
begin
  select * into v_document from public.business_documents
  where company_id = p_company_id and id = p_document_id for update;
  if not found then raise exception 'document not found'; end if;
  if v_document.status <> 'draft' then raise exception 'only draft documents can be confirmed'; end if;
  if v_document.document_number !~ '^[A-Z]+-[0-9]{4}-[0-9]{6}$'
     or substring(v_document.document_number from '^[A-Z]+-([0-9]{4})-')::integer
       <> extract(year from v_document.document_date)::integer then
    raise exception 'document number year does not match document date';
  end if;
  if v_document.document_type in ('sale_return', 'purchase_return') then
    if v_document.original_document_id is null then
      raise exception 'return document requires an original document';
    end if;
    if not exists (
      select 1 from public.business_documents original
      where original.company_id = p_company_id
        and original.id = v_document.original_document_id
        and original.status in ('confirmed', 'cancelled')
        and (
          (v_document.document_type = 'sale_return' and original.document_type = 'sale')
          or (v_document.document_type = 'purchase_return' and original.document_type = 'purchase')
        )
    ) then
      raise exception 'return document origin does not match its type';
    end if;
  end if;
  select
    coalesce(sum(supply_amount) filter (where tax_type_snapshot = 'taxable'), 0),
    coalesce(sum(supply_amount) filter (where tax_type_snapshot = 'exempt'), 0),
    coalesce(sum(tax_amount), 0), coalesce(sum(total_amount), 0)
  into v_taxable, v_exempt, v_tax, v_total
  from public.business_document_lines
  where company_id = p_company_id and document_id = p_document_id;
  if not exists (select 1 from public.business_document_lines
    where company_id = p_company_id and document_id = p_document_id) then
    raise exception 'document requires at least one line';
  end if;
  update public.business_documents set
    taxable_supply_amount = v_taxable, exempt_supply_amount = v_exempt,
    tax_amount = v_tax, total_amount = v_total, status = 'confirmed',
    confirmed_by_user_id = p_actor_user_id, confirmed_by_name = p_actor_name,
    confirmed_at = now(), updated_at = now()
  where company_id = p_company_id and id = p_document_id returning * into v_document;
  v_signed_total := case when v_document.document_type in ('sale_return','purchase_return')
    then -v_total else v_total end;
  insert into public.partner_ledger_entries(
    company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
    amount, supply_amount, tax_amount, source_document_id, idempotency_key,
    created_by_user_id, created_by_name
  ) values (
    p_company_id,
    case when v_document.document_type in ('sale','sale_return') then 'customer' else 'supplier' end,
    v_document.customer_id, v_document.supplier_id, v_document.document_date,
    v_document.document_type, v_signed_total,
    case when v_signed_total < 0 then -(v_taxable + v_exempt) else v_taxable + v_exempt end,
    case when v_signed_total < 0 then -v_tax else v_tax end,
    p_document_id, 'document:' || p_document_id || ':confirm', p_actor_user_id, p_actor_name
  ) on conflict (company_id, idempotency_key) do nothing;
  return v_document;
end;
$$;

create or replace function public.cancel_business_document(
  p_company_id uuid, p_document_id uuid, p_actor_user_id uuid,
  p_actor_name text, p_reason text
) returns public.business_documents
language plpgsql security invoker set search_path = '' as $$
declare
  v_document public.business_documents%rowtype;
  v_entry public.partner_ledger_entries%rowtype;
begin
  select * into v_document from public.business_documents
  where company_id = p_company_id and id = p_document_id for update;
  if not found then raise exception 'document not found'; end if;
  if v_document.status = 'cancelled' then return v_document; end if;
  if v_document.status <> 'confirmed' then raise exception 'only confirmed documents can be cancelled'; end if;
  select * into v_entry from public.partner_ledger_entries
  where company_id = p_company_id
    and idempotency_key = 'document:' || p_document_id || ':confirm';
  if not found then raise exception 'confirmed ledger entry not found'; end if;
  update public.business_documents set
    status = 'cancelled', cancelled_by_user_id = p_actor_user_id,
    cancelled_by_name = p_actor_name, cancelled_at = now(), updated_at = now()
  where company_id = p_company_id and id = p_document_id returning * into v_document;
  insert into public.partner_ledger_entries(
    company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
    amount, supply_amount, tax_amount, source_document_id, idempotency_key,
    reverses_entry_id, memo, created_by_user_id, created_by_name
  ) values (
    p_company_id, v_entry.partner_type, v_entry.customer_id, v_entry.supplier_id,
    (now() at time zone 'Asia/Seoul')::date, 'reversal', -v_entry.amount,
    -v_entry.supply_amount, -v_entry.tax_amount, p_document_id,
    'document:' || p_document_id || ':cancel', v_entry.id, p_reason,
    p_actor_user_id, p_actor_name
  ) on conflict (company_id, idempotency_key) do nothing;
  return v_document;
end;
$$;

create or replace function public.record_partner_payment(
  p_company_id uuid, p_partner_type text, p_partner_id uuid, p_entry_date date,
  p_amount bigint, p_payment_method text, p_idempotency_key text,
  p_actor_user_id uuid, p_actor_name text, p_memo text default null
) returns public.partner_ledger_entries
language plpgsql security invoker set search_path = '' as $$
declare v_entry public.partner_ledger_entries%rowtype;
begin
  if p_partner_type not in ('customer','supplier') then raise exception 'invalid partner type'; end if;
  if p_amount <= 0 then raise exception 'payment amount must be positive'; end if;
  insert into public.partner_ledger_entries(
    company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
    amount, payment_method, idempotency_key, memo, created_by_user_id, created_by_name
  ) values (
    p_company_id, p_partner_type,
    case when p_partner_type = 'customer' then p_partner_id end,
    case when p_partner_type = 'supplier' then p_partner_id end,
    p_entry_date, case when p_partner_type = 'customer' then 'receipt' else 'payment' end,
    -p_amount, p_payment_method, p_idempotency_key, p_memo, p_actor_user_id, p_actor_name
  ) on conflict (company_id, idempotency_key) do nothing returning * into v_entry;
  if v_entry.id is null then
    select * into v_entry from public.partner_ledger_entries
    where company_id = p_company_id and idempotency_key = p_idempotency_key;
  end if;
  return v_entry;
end;
$$;

alter table public.erp_number_counters enable row level security;
alter table public.business_documents enable row level security;
alter table public.business_document_lines enable row level security;
alter table public.partner_ledger_entries enable row level security;

revoke all on table public.erp_number_counters from public, anon, authenticated;
revoke all on table public.business_documents from public, anon, authenticated;
revoke all on table public.business_document_lines from public, anon, authenticated;
revoke all on table public.partner_ledger_entries from public, anon, authenticated;
grant all on table public.erp_number_counters to service_role;
grant all on table public.business_documents to service_role;
grant all on table public.business_document_lines to service_role;
grant all on table public.partner_ledger_entries to service_role;

revoke execute on function public.next_erp_number(uuid,text,date) from public, anon, authenticated;
revoke execute on function public.confirm_business_document(uuid,uuid,uuid,text) from public, anon, authenticated;
revoke execute on function public.cancel_business_document(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke execute on function public.record_partner_payment(uuid,text,uuid,date,bigint,text,text,uuid,text,text) from public, anon, authenticated;
grant execute on function public.next_erp_number(uuid,text,date) to service_role;
grant execute on function public.confirm_business_document(uuid,uuid,uuid,text) to service_role;
grant execute on function public.cancel_business_document(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.record_partner_payment(uuid,text,uuid,date,bigint,text,text,uuid,text,text) to service_role;

commit;

-- 롤백 블록(운영 적용 전 별도 검토 후 사용):
-- begin;
-- drop function if exists public.record_partner_payment(uuid,text,uuid,date,bigint,text,text,uuid,text,text);
-- drop function if exists public.cancel_business_document(uuid,uuid,uuid,text,text);
-- drop function if exists public.confirm_business_document(uuid,uuid,uuid,text);
-- drop function if exists public.next_erp_number(uuid,text,date);
-- drop function if exists public.reject_append_only_mutation();
-- drop function if exists public.validate_business_document_line();
-- drop function if exists public.guard_business_document_mutation();
-- drop table if exists public.partner_ledger_entries;
-- drop table if exists public.business_document_lines;
-- drop table if exists public.business_documents;
-- drop table if exists public.erp_number_counters;
-- commit;
