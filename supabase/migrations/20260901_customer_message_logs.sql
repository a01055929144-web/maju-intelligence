create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  role text not null default '담당자',
  name text not null,
  phone text,
  memo text,
  birth_date date,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_contacts_customer_idx
  on public.customer_contacts (customer_id, sort_order);

create index if not exists customer_contacts_company_idx
  on public.customer_contacts (company_id);

create table if not exists public.customer_message_logs (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  contact_id uuid references public.customer_contacts(id) on delete set null,
  note_id uuid references public.customer_notes(id) on delete set null,
  attachment_id uuid references public.customer_attachments(id) on delete set null,
  trigger_type text not null default 'manual',
  channel text not null default 'sms',
  recipient_name text,
  recipient_phone text,
  message_body text not null,
  status text not null default 'queued',
  provider text,
  provider_message_id text,
  error_message text,
  triggered_by_name text,
  sent_at timestamptz,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_message_logs_company_created
  on public.customer_message_logs(company_id, created_at desc);

create index if not exists idx_customer_message_logs_customer_created
  on public.customer_message_logs(customer_id, created_at desc);

alter table public.customer_message_logs enable row level security;
alter table public.customer_contacts enable row level security;
