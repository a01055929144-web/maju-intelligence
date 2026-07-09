alter table public.normalized_customers
  add column if not exists delivery_manager text,
  add column if not exists delivery_zone text,
  add column if not exists loading_position text;

create table if not exists public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  note_type text not null default 'general',
  memo text not null,
  next_action text,
  created_by_name text,
  created_at timestamptz not null default now()
);

create table if not exists public.customer_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  attachment_type text not null,
  title text not null,
  file_url text,
  storage_path text,
  mime_type text,
  size_bytes bigint,
  created_by_name text,
  created_at timestamptz not null default now()
);

create index if not exists idx_customer_notes_customer_created on public.customer_notes(customer_id, created_at desc);
create index if not exists idx_customer_attachments_customer_created on public.customer_attachments(customer_id, created_at desc);

alter table public.customer_notes enable row level security;
alter table public.customer_attachments enable row level security;
