-- 운영 적용 완료(2026-10-26). 재실행 금지. WO-4 사용자 정의 리드 칸 1단계.
begin;

create table if not exists public.company_lead_fields (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  key text not null,
  label text not null,
  field_type text not null,
  options jsonb not null default '[]'::jsonb,
  show_in_list boolean not null default false,
  filterable boolean not null default false,
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint company_lead_fields_company_id_id_uq unique(company_id,id),
  constraint company_lead_fields_company_key_uq unique(company_id,key),
  constraint company_lead_fields_key_format check (key ~ '^[a-z][a-z0-9_]{0,62}$'),
  constraint company_lead_fields_label_length check (char_length(btrim(label)) between 1 and 60),
  constraint company_lead_fields_type_check check (field_type in ('text','number','date','select','multi_select','checkbox')),
  constraint company_lead_fields_options_array check (jsonb_typeof(options)='array')
);

create or replace function public.set_row_updated_at()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.set_row_updated_at() from public, anon, authenticated;
grant execute on function public.set_row_updated_at() to service_role;

drop trigger if exists company_lead_fields_set_updated_at on public.company_lead_fields;
create trigger company_lead_fields_set_updated_at
before update on public.company_lead_fields
for each row execute function public.set_row_updated_at();

alter table public.business_permit_leads
  add column if not exists custom_values jsonb not null default '{}'::jsonb,
  add column if not exists target_type text not null default 'restaurant',
  add column if not exists import_batch_id uuid;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.business_permit_leads'::regclass
      and conname='business_permit_leads_target_type_check'
  ) then
    alter table public.business_permit_leads
      add constraint business_permit_leads_target_type_check
      check (target_type in ('restaurant','distributor'));
  end if;
end $$;

create index if not exists business_permit_leads_custom_values_gin
  on public.business_permit_leads using gin(custom_values);
create index if not exists business_permit_leads_distributor_company_idx
  on public.business_permit_leads(company_id)
  where target_type='distributor' and merged_into_lead_id is null;

create table if not exists public.lead_import_batches (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  file_name text not null,
  sheet_name text,
  row_count integer not null default 0,
  result_summary jsonb not null default '{}'::jsonb,
  created_by_user_id uuid,
  created_by_name text,
  created_at timestamptz not null default now(),
  undone_at timestamptz,
  undone_by_user_id uuid,
  undone_by_name text,
  constraint lead_import_batches_company_id_id_uq unique(company_id,id),
  constraint lead_import_batches_file_name_length check (char_length(file_name) between 1 and 240),
  constraint lead_import_batches_row_count_check check (row_count between 0 and 100000)
);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid='public.business_permit_leads'::regclass
      and conname='business_permit_leads_import_batch_fk'
  ) then
    alter table public.business_permit_leads
      add constraint business_permit_leads_import_batch_fk
      foreign key(company_id,import_batch_id)
      references public.lead_import_batches(company_id,id)
      on delete restrict;
  end if;
end $$;

create index if not exists business_permit_leads_import_batch_idx
  on public.business_permit_leads(company_id,import_batch_id)
  where import_batch_id is not null;

create table if not exists public.lead_import_batch_items (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null,
  company_id uuid not null,
  lead_id uuid not null,
  action text not null,
  before jsonb not null default '{}'::jsonb,
  imported_values jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  constraint lead_import_batch_items_action_check check (action in ('created','updated')),
  constraint lead_import_batch_items_batch_fk foreign key(company_id,batch_id)
    references public.lead_import_batches(company_id,id) on delete cascade,
  constraint lead_import_batch_items_lead_fk foreign key(company_id,lead_id)
    references public.business_permit_leads(company_id,id) on delete restrict,
  constraint lead_import_batch_items_batch_lead_uq unique(company_id,batch_id,lead_id)
);

create index if not exists lead_import_batch_items_company_batch_idx
  on public.lead_import_batch_items(company_id,batch_id);

create table if not exists public.lead_field_value_changes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  field_id uuid not null,
  old_value jsonb,
  new_value jsonb,
  changed_by_user_id uuid,
  changed_by_name text,
  changed_at timestamptz not null default now(),
  constraint lead_field_value_changes_lead_fk foreign key(company_id,lead_id)
    references public.business_permit_leads(company_id,id) on delete cascade,
  constraint lead_field_value_changes_field_fk foreign key(company_id,field_id)
    references public.company_lead_fields(company_id,id) on delete restrict
);

create index if not exists company_lead_fields_company_order_idx
  on public.company_lead_fields(company_id, archived_at, sort_order, id);
create index if not exists lead_field_value_changes_lead_time_idx
  on public.lead_field_value_changes(company_id, lead_id, changed_at desc);

alter table public.company_lead_fields enable row level security;
alter table public.lead_field_value_changes enable row level security;
alter table public.lead_import_batches enable row level security;
alter table public.lead_import_batch_items enable row level security;
revoke all on table public.company_lead_fields from public, anon, authenticated;
revoke all on table public.lead_field_value_changes from public, anon, authenticated;
revoke all on table public.lead_import_batches from public, anon, authenticated;
revoke all on table public.lead_import_batch_items from public, anon, authenticated;
grant all on table public.company_lead_fields to service_role;
grant all on table public.lead_field_value_changes to service_role;
grant all on table public.lead_import_batches to service_role;
grant all on table public.lead_import_batch_items to service_role;

commit;

-- 되돌리기 유스케이스(앱/RPC 구현 승인 후):
-- 1) created_at + 7일이 지나거나 undone_at이 있으면 거부한다.
-- 2) created 항목은 삭제하지 않고 archived/excluded 상태로 보관한다.
-- 3) updated 항목은 before의 각 키를 복원하되, 현재 값이 imported_values와 다른 키는
--    가져오기 이후 사용자가 수정한 것으로 보고 건너뛴다. 복원/건너뜀 건수를 result_summary에 남긴다.

-- 롤백(별도 승인 후):
-- begin;
-- drop table if exists public.lead_field_value_changes;
-- drop table if exists public.lead_import_batch_items;
-- alter table public.business_permit_leads drop constraint if exists business_permit_leads_import_batch_fk;
-- drop table if exists public.lead_import_batches;
-- drop trigger if exists company_lead_fields_set_updated_at on public.company_lead_fields;
-- drop table if exists public.company_lead_fields;
-- drop function if exists public.set_row_updated_at();
-- drop index if exists public.business_permit_leads_import_batch_idx;
-- drop index if exists public.business_permit_leads_distributor_company_idx;
-- drop index if exists public.business_permit_leads_custom_values_gin;
-- alter table public.business_permit_leads
--   drop constraint if exists business_permit_leads_target_type_check,
--   drop column if exists import_batch_id,
--   drop column if exists target_type,
--   drop column if exists custom_values;
-- commit;
