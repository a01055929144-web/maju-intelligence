-- WO-25 엑셀 가져오기 감사 구조 SQL 초안. 운영 DB 적용 금지.
-- 기존 excel_mapping_presets를 가져오기 양식으로 재사용한다.
-- raw_values에는 거래처 전화·주소 익명화 규칙을 적용한 값만 저장한다.

begin;

alter table public.excel_mapping_presets
  add column if not exists source_config jsonb not null default '{}'::jsonb,
  add column if not exists value_transforms jsonb not null default '{}'::jsonb,
  add column if not exists extra_field_mapping jsonb not null default '{}'::jsonb;

do $$ begin
  alter table public.excel_mapping_presets
    add constraint excel_mapping_presets_company_id_id_uq unique(company_id, id);
exception when duplicate_object then null;
end $$;

create table if not exists public.import_jobs (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null references public.companies(id) on delete cascade,
  target_type text not null,
  template_id uuid,
  file_name text not null,
  sheet_name text,
  header_row integer not null default 1,
  idempotency_key text not null,
  status text not null default 'uploaded',
  total_rows integer not null default 0,
  valid_rows integer not null default 0,
  applied_rows integer not null default 0,
  skipped_rows integer not null default 0,
  error_rows integer not null default 0,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  completed_at timestamptz,
  error_message text,
  unique(company_id, id),
  unique(company_id, idempotency_key),
  foreign key(company_id, template_id)
    references public.excel_mapping_presets(company_id, id) on delete set null (template_id),
  check(target_type in ('product', 'customer', 'supplier', 'price_sheet', 'document')),
  check(status in ('uploaded', 'mapped', 'validated', 'applying', 'completed', 'failed', 'cancelled')),
  check(length(btrim(file_name)) between 1 and 255),
  check(length(btrim(idempotency_key)) between 1 and 160),
  check(header_row between 1 and 1000),
  check(total_rows >= 0 and valid_rows >= 0 and applied_rows >= 0 and skipped_rows >= 0 and error_rows >= 0),
  check(valid_rows <= total_rows and applied_rows + skipped_rows + error_rows <= total_rows)
);

create table if not exists public.import_rows (
  id uuid default gen_random_uuid() primary key,
  company_id uuid not null,
  job_id uuid not null,
  source_row_number integer not null,
  raw_values jsonb not null default '{}'::jsonb,
  normalized_values jsonb not null default '{}'::jsonb,
  extra_attributes jsonb not null default '{}'::jsonb,
  match_key text,
  match_method text,
  action text,
  status text not null default 'pending',
  target_record_id uuid,
  previous_values jsonb,
  warnings jsonb not null default '[]'::jsonb,
  errors jsonb not null default '[]'::jsonb,
  applied_at timestamptz,
  unique(company_id, job_id, source_row_number),
  foreign key(company_id, job_id)
    references public.import_jobs(company_id, id) on delete cascade,
  check(source_row_number >= 1),
  check(match_method is null or match_method in ('erp_code', 'barcode', 'supplier_code', 'name_spec_unit', 'manual')),
  check(action is null or action in ('insert', 'update', 'skip')),
  check(status in ('pending', 'valid', 'error', 'applied')),
  check(jsonb_typeof(raw_values) = 'object'),
  check(jsonb_typeof(normalized_values) = 'object'),
  check(jsonb_typeof(extra_attributes) = 'object'),
  check(jsonb_typeof(warnings) = 'array'),
  check(jsonb_typeof(errors) = 'array')
);

create index if not exists import_jobs_company_status_idx
  on public.import_jobs(company_id, status, created_at desc);
create index if not exists import_rows_job_status_idx
  on public.import_rows(company_id, job_id, status, source_row_number);
create index if not exists import_rows_target_idx
  on public.import_rows(company_id, target_record_id) where target_record_id is not null;

alter table public.import_jobs enable row level security;
alter table public.import_rows enable row level security;
revoke all on public.import_jobs, public.import_rows from public, anon, authenticated;
grant select, insert, update, delete on public.import_jobs, public.import_rows to service_role;

commit;
