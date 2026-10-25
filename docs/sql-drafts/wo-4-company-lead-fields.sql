-- REVIEW ONLY. 운영 적용 금지. WO-4 사용자 정의 리드 칸 1단계.
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

alter table public.business_permit_leads
  add column if not exists custom_values jsonb not null default '{}'::jsonb;

create index if not exists business_permit_leads_custom_values_gin
  on public.business_permit_leads using gin(custom_values);

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
revoke all on table public.company_lead_fields from public, anon, authenticated;
revoke all on table public.lead_field_value_changes from public, anon, authenticated;
grant all on table public.company_lead_fields to service_role;
grant all on table public.lead_field_value_changes to service_role;

commit;

-- 롤백(별도 승인 후):
-- begin;
-- drop table if exists public.lead_field_value_changes;
-- drop table if exists public.company_lead_fields;
-- drop index if exists public.business_permit_leads_custom_values_gin;
-- alter table public.business_permit_leads drop column if exists custom_values;
-- commit;
