-- Stores reusable ERP/vendor Excel column mappings per company and upload type.

create table if not exists public.excel_mapping_presets (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  upload_type text not null,
  preset_name text not null,
  erp_name text,
  mapping jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create unique index if not exists idx_excel_mapping_presets_company_type_name
on public.excel_mapping_presets(company_id, upload_type, preset_name);

alter table public.excel_mapping_presets enable row level security;
