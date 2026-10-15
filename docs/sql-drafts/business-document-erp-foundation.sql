-- REVIEW ONLY / DO NOT EXECUTE.
-- ERP document foundation design draft, 2026-10-16.
-- Split into phase migrations and verify production constraint names before use.

begin;

create table if not exists public.erp_number_counters (
  company_id uuid not null references public.companies(id) on delete cascade,
  sequence_kind text not null check (sequence_kind in ('sale', 'purchase', 'ledger_issue', 'statement_issue')),
  fiscal_year integer not null check (fiscal_year between 2000 and 9999),
  last_value bigint not null default 0 check (last_value >= 0),
  primary key (company_id, sequence_kind, fiscal_year)
);

create table if not exists public.business_documents (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_type text not null check (document_type in ('sale', 'purchase')),
  document_number text not null,
  document_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  status text not null default 'draft' check (status in ('draft', 'confirmed', 'cancelled')),
  customer_id uuid,
  supplier_id uuid,
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
  reverses_document_id uuid,
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
    (document_type = 'sale' and customer_id is not null and supplier_id is null)
    or (document_type = 'purchase' and supplier_id is not null and customer_id is null)
  ),
  constraint business_documents_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint business_documents_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict,
  constraint business_documents_staff_fk foreign key (company_id, assigned_staff_member_id)
    references public.company_members(company_id, id) on delete set null (assigned_staff_member_id),
  constraint business_documents_territory_fk foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id) on delete set null (territory_id),
  constraint business_documents_reversal_fk foreign key (company_id, reverses_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint business_documents_total_check check (
    total_amount = taxable_supply_amount + exempt_supply_amount + tax_amount
  )
);

create table if not exists public.business_document_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
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
  company_id uuid not null references public.companies(id) on delete cascade,
  partner_type text not null check (partner_type in ('customer', 'supplier')),
  customer_id uuid,
  supplier_id uuid,
  entry_date date not null default ((now() at time zone 'Asia/Seoul')::date),
  entry_type text not null
    check (entry_type in ('sale', 'receipt', 'purchase', 'payment', 'adjustment', 'reversal')),
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
  constraint partner_ledger_entries_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint partner_ledger_entries_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict,
  constraint partner_ledger_entries_document_fk foreign key (company_id, source_document_id)
    references public.business_documents(company_id, id) on delete restrict,
  constraint partner_ledger_entries_reversal_fk foreign key (company_id, reverses_entry_id)
    references public.partner_ledger_entries(company_id, id) on delete restrict
);

create table if not exists public.partner_ledger_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  issue_number text not null,
  partner_type text not null check (partner_type in ('customer', 'supplier')),
  customer_id uuid,
  supplier_id uuid,
  period_from date not null,
  period_to date not null,
  opening_balance bigint not null,
  closing_balance bigint not null,
  company_snapshot jsonb not null,
  partner_snapshot jsonb not null,
  entries_snapshot jsonb not null,
  content_hash text not null,
  issued_by_user_id uuid,
  issued_by_name text not null,
  issued_at timestamptz not null default now(),
  constraint partner_ledger_issues_company_id_id_uq unique (company_id, id),
  constraint partner_ledger_issues_number_uq unique (company_id, issue_number),
  constraint partner_ledger_issues_period_check check (period_to >= period_from),
  constraint partner_ledger_issues_partner_check check (
    (partner_type = 'customer' and customer_id is not null and supplier_id is null)
    or (partner_type = 'supplier' and supplier_id is not null and customer_id is null)
  ),
  constraint partner_ledger_issues_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete restrict,
  constraint partner_ledger_issues_supplier_fk foreign key (company_id, supplier_id)
    references public.product_suppliers(company_id, id) on delete restrict
);

create table if not exists public.document_issues (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_id uuid not null,
  issue_number text not null,
  template_version text not null,
  document_snapshot jsonb not null,
  content_hash text not null,
  pdf_storage_path text,
  image_storage_paths text[] not null default '{}',
  issued_by_user_id uuid,
  issued_by_name text not null,
  issued_at timestamptz not null default now(),
  constraint document_issues_company_id_id_uq unique (company_id, id),
  constraint document_issues_number_uq unique (company_id, issue_number),
  constraint document_issues_document_fk foreign key (company_id, document_id)
    references public.business_documents(company_id, id) on delete restrict
);

create table if not exists public.document_public_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_issue_id uuid not null,
  token_hash text not null unique,
  expires_at timestamptz not null,
  revoked_at timestamptz,
  max_views integer check (max_views is null or max_views > 0),
  view_count integer not null default 0 check (view_count >= 0),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  constraint document_public_links_issue_fk foreign key (company_id, document_issue_id)
    references public.document_issues(company_id, id) on delete cascade
);

create table if not exists public.outbound_message_jobs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  document_issue_id uuid,
  recipient text not null,
  preferred_channel text not null check (preferred_channel in ('kakao_image', 'mms')),
  fallback_channel text check (fallback_channel is null or fallback_channel = 'mms'),
  consent_basis text,
  status text not null default 'pending'
    check (status in ('pending', 'sending', 'sent', 'failed', 'cancelled')),
  idempotency_key text not null,
  last_error text,
  created_by_user_id uuid,
  created_by_name text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint outbound_message_jobs_company_id_id_uq unique (company_id, id),
  constraint outbound_message_jobs_idempotency_uq unique (company_id, idempotency_key),
  constraint outbound_message_jobs_issue_fk foreign key (company_id, document_issue_id)
    references public.document_issues(company_id, id) on delete restrict
);

create table if not exists public.outbound_message_attempts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  job_id uuid not null,
  channel text not null check (channel in ('kakao_image', 'mms')),
  provider text not null,
  provider_message_id text,
  status text not null check (status in ('sending', 'sent', 'failed')),
  error_code text,
  error_message text,
  attempted_at timestamptz not null default now(),
  constraint outbound_message_attempts_job_fk foreign key (company_id, job_id)
    references public.outbound_message_jobs(company_id, id) on delete cascade
);

create table if not exists public.business_document_saved_views (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  owner_user_id uuid,
  name text not null,
  schema_version integer not null default 1,
  filters jsonb not null default '{}',
  visible_columns text[] not null default '{}',
  sort_spec jsonb not null default '{}',
  is_shared boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint business_document_saved_views_name_uq unique (company_id, owner_user_id, name)
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
create index if not exists business_documents_staff_date_idx
  on public.business_documents(company_id, assigned_staff_member_id, document_date desc)
  where assigned_staff_member_id is not null;
create index if not exists business_documents_territory_date_idx
  on public.business_documents(company_id, territory_id, document_date desc)
  where territory_id is not null;
create index if not exists business_document_lines_document_idx
  on public.business_document_lines(company_id, document_id, sort_order, id);
create index if not exists business_document_lines_product_idx
  on public.business_document_lines(company_id, product_catalog_id, document_id)
  where product_catalog_id is not null;
create index if not exists business_document_lines_supplier_product_idx
  on public.business_document_lines(company_id, supplier_product_id, document_id)
  where supplier_product_id is not null;
create index if not exists partner_ledger_customer_date_idx
  on public.partner_ledger_entries(company_id, customer_id, entry_date, id)
  where customer_id is not null;
create index if not exists partner_ledger_supplier_date_idx
  on public.partner_ledger_entries(company_id, supplier_id, entry_date, id)
  where supplier_id is not null;
create index if not exists document_public_links_active_idx
  on public.document_public_links(token_hash, expires_at)
  where revoked_at is null;
create index if not exists outbound_message_jobs_pending_idx
  on public.outbound_message_jobs(company_id, status, created_at)
  where status in ('pending', 'sending');

create unique index if not exists business_documents_source_id_uq
  on public.business_documents(company_id, source_type, source_id)
  where source_id is not null;
create unique index if not exists business_documents_source_key_uq
  on public.business_documents(company_id, source_type, source_key)
  where source_key is not null;

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
  if p_sequence_kind not in ('sale', 'purchase', 'ledger_issue', 'statement_issue') then
    raise exception 'unsupported sequence kind';
  end if;
  v_prefix := case p_sequence_kind
    when 'sale' then 'S'
    when 'purchase' then 'P'
    when 'ledger_issue' then 'L'
    else 'D'
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
      raise exception 'confirmed or cancelled documents cannot be deleted';
    end if;
    return old;
  end if;
  if new.document_number <> old.document_number then
    raise exception 'document number is immutable';
  end if;
  if old.status <> 'draft' then
    raise exception 'finalized documents can only change through approved RPCs';
  end if;
  return new;
end;
$$;

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
  v_type text;
  v_status text;
  v_company_id uuid;
  v_document_id uuid;
begin
  if tg_op = 'DELETE' then
    v_company_id := old.company_id;
    v_document_id := old.document_id;
  else
    v_company_id := new.company_id;
    v_document_id := new.document_id;
  end if;
  select document_type, status into v_type, v_status
  from public.business_documents
  where company_id = v_company_id and id = v_document_id
  for update;
  if not found and tg_op = 'DELETE' then return old; end if;
  if v_status is distinct from 'draft' then
    raise exception 'lines of a finalized document are immutable';
  end if;
  if tg_op <> 'DELETE' and (
    (v_type = 'sale' and new.supplier_product_id is not null)
    or (v_type = 'purchase' and new.product_catalog_id is not null)
  ) then
    raise exception 'product reference does not match document type';
  end if;
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

create trigger business_document_lines_guard_trg
before insert or update or delete on public.business_document_lines
for each row execute function public.validate_business_document_line();

create or replace function public.reject_append_only_mutation()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
begin
  raise exception '% is append-only', tg_table_name;
end;
$$;

create trigger partner_ledger_entries_append_only_trg
before update or delete on public.partner_ledger_entries
for each row execute function public.reject_append_only_mutation();
create trigger partner_ledger_issues_append_only_trg
before update or delete on public.partner_ledger_issues
for each row execute function public.reject_append_only_mutation();
create trigger document_issues_append_only_trg
before update or delete on public.document_issues
for each row execute function public.reject_append_only_mutation();

create or replace function public.confirm_business_document(
  p_company_id uuid,
  p_document_id uuid,
  p_actor_user_id uuid,
  p_actor_name text
) returns public.business_documents
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_document public.business_documents%rowtype;
  v_taxable bigint;
  v_exempt bigint;
  v_tax bigint;
  v_total bigint;
begin
  select * into v_document from public.business_documents
  where company_id = p_company_id and id = p_document_id
  for update;
  if not found then raise exception 'document not found'; end if;
  if v_document.status <> 'draft' then raise exception 'only draft documents can be confirmed'; end if;

  select
    coalesce(sum(supply_amount) filter (where tax_type_snapshot = 'taxable'), 0),
    coalesce(sum(supply_amount) filter (where tax_type_snapshot = 'exempt'), 0),
    coalesce(sum(tax_amount), 0),
    coalesce(sum(total_amount), 0)
  into v_taxable, v_exempt, v_tax, v_total
  from public.business_document_lines
  where company_id = p_company_id and document_id = p_document_id;
  if not exists (
    select 1 from public.business_document_lines
    where company_id = p_company_id and document_id = p_document_id
  ) then raise exception 'document requires at least one line'; end if;

  update public.business_documents set
    taxable_supply_amount = v_taxable,
    exempt_supply_amount = v_exempt,
    tax_amount = v_tax,
    total_amount = v_total,
    status = 'confirmed',
    confirmed_by_user_id = p_actor_user_id,
    confirmed_by_name = p_actor_name,
    confirmed_at = now(),
    updated_at = now()
  where company_id = p_company_id and id = p_document_id
  returning * into v_document;

  insert into public.partner_ledger_entries(
    company_id, partner_type, customer_id, supplier_id, entry_date, entry_type,
    amount, supply_amount, tax_amount, source_document_id, idempotency_key,
    created_by_user_id, created_by_name
  ) values (
    p_company_id,
    case when v_document.document_type = 'sale' then 'customer' else 'supplier' end,
    v_document.customer_id,
    v_document.supplier_id,
    v_document.document_date,
    v_document.document_type,
    v_total,
    v_taxable + v_exempt,
    v_tax,
    p_document_id,
    'document:' || p_document_id::text || ':confirm',
    p_actor_user_id,
    p_actor_name
  ) on conflict (company_id, idempotency_key) do nothing;
  return v_document;
end;
$$;

-- Remaining draft function bodies must be implemented in their phase migrations as
-- SECURITY INVOKER, company-scoped functions executable only by service_role:
-- cancel_business_document(company_id, document_id, actor_user_id, actor_name, reason)
-- issue_partner_ledger(company_id, partner_type, partner_id, period_from, period_to, actor...)

-- Immutability triggers required in the phase migration:
-- 1. document_number cannot change.
-- 2. confirmed/cancelled document fields and lines cannot UPDATE/DELETE.
-- 3. partner_ledger_entries and issued snapshots cannot UPDATE/DELETE.

alter table public.erp_number_counters enable row level security;
alter table public.business_documents enable row level security;
alter table public.business_document_lines enable row level security;
alter table public.partner_ledger_entries enable row level security;
alter table public.partner_ledger_issues enable row level security;
alter table public.document_issues enable row level security;
alter table public.document_public_links enable row level security;
alter table public.outbound_message_jobs enable row level security;
alter table public.outbound_message_attempts enable row level security;
alter table public.business_document_saved_views enable row level security;

revoke all on public.erp_number_counters from public, anon, authenticated;
revoke all on public.business_documents from public, anon, authenticated;
revoke all on public.business_document_lines from public, anon, authenticated;
revoke all on public.partner_ledger_entries from public, anon, authenticated;
revoke all on public.partner_ledger_issues from public, anon, authenticated;
revoke all on public.document_issues from public, anon, authenticated;
revoke all on public.document_public_links from public, anon, authenticated;
revoke all on public.outbound_message_jobs from public, anon, authenticated;
revoke all on public.outbound_message_attempts from public, anon, authenticated;
revoke all on public.business_document_saved_views from public, anon, authenticated;

grant all on public.erp_number_counters to service_role;
grant all on public.business_documents to service_role;
grant all on public.business_document_lines to service_role;
grant all on public.partner_ledger_entries to service_role;
grant all on public.partner_ledger_issues to service_role;
grant all on public.document_issues to service_role;
grant all on public.document_public_links to service_role;
grant all on public.outbound_message_jobs to service_role;
grant all on public.outbound_message_attempts to service_role;
grant all on public.business_document_saved_views to service_role;

revoke execute on function public.next_erp_number(uuid, text, date) from public, anon, authenticated;
revoke execute on function public.confirm_business_document(uuid, uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.next_erp_number(uuid, text, date) to service_role;
grant execute on function public.confirm_business_document(uuid, uuid, uuid, text) to service_role;

rollback;
