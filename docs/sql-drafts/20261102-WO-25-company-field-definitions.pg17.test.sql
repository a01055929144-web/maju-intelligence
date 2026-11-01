\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

drop table if exists public.company_field_definitions cascade;
drop table if exists public.import_rows cascade;
drop table if exists public.import_jobs cascade;
drop table if exists public.excel_mapping_presets cascade;
drop table if exists public.companies cascade;
create table public.companies(id uuid primary key);
create table public.excel_mapping_presets(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  upload_type text not null,
  preset_name text not null,
  mapping jsonb not null default '{}'::jsonb,
  unique(company_id, upload_type, preset_name)
);

\ir 20261102-WO-25-import-audit-schema.sql
\ir 20261102-WO-25-company-field-definitions.sql

do $$
declare
  company_a uuid := gen_random_uuid();
  company_b uuid := gen_random_uuid();
  job_a uuid;
begin
  insert into public.companies(id) values(company_a);

  if (select count(*) from public.company_field_definitions where company_id = company_a and entity = 'product') <> 10 then
    raise exception 'default product fields were not seeded';
  end if;
  if (select count(*) from public.company_field_definitions where company_id = company_a and required) <> 5 then
    raise exception 'required product field count changed';
  end if;
  if (select count(*) from public.company_field_definitions where company_id = company_a and field_key like 'extra_%') <> 5 then
    raise exception 'five extra fields were not seeded';
  end if;

  update public.company_field_definitions
  set label = '회사 상품 코드', sort_order = 5
  where company_id = company_a and entity = 'product' and field_key = 'erp_code';

  begin
    update public.company_field_definitions
    set visible = false
    where company_id = company_a and entity = 'product' and field_key = 'erp_code';
    raise exception 'required field was hidden';
  exception when raise_exception then
    if sqlerrm <> 'required_product_field_cannot_be_hidden' then raise; end if;
  end;

  begin
    delete from public.company_field_definitions
    where company_id = company_a and entity = 'product' and field_key = 'erp_code';
    raise exception 'system field was deleted';
  exception when raise_exception then
    if sqlerrm <> 'system_field_definition_cannot_be_deleted' then raise; end if;
  end;

  update public.company_field_definitions
  set label = '매장 메모', visible = true
  where company_id = company_a and entity = 'product' and field_key = 'extra_1';

  insert into public.company_field_definitions(
    company_id, entity, field_key, label, field_group, visible, sort_order, is_custom
  ) values(company_a, 'product', 'custom_storage_note', '보관 메모', '추가 정보', true, 960, true);

  insert into public.companies(id) values(company_b);
  if (select count(*) from public.company_field_definitions where company_id = company_b and entity = 'product') <> 10 then
    raise exception 'new company defaults were not seeded';
  end if;

  insert into public.import_jobs(company_id, target_type, file_name, idempotency_key, total_rows)
  values(company_a, 'product', 'products.xlsx', 'field-definitions:test', 1)
  returning id into job_a;
  insert into public.import_rows(
    company_id, job_id, source_row_number, normalized_values, extra_attributes, status
  ) values(
    company_a, job_a, 2, '{"erp_code":"ERP-001"}',
    '{"extra_1":"냉장","extra_2":"오전 입고","custom_storage_note":"문 앞"}', 'valid'
  );
  if (select extra_attributes->>'extra_1' from public.import_rows where job_id = job_a) <> '냉장'
     or (select extra_attributes->>'custom_storage_note' from public.import_rows where job_id = job_a) <> '문 앞' then
    raise exception 'extra attributes were not preserved';
  end if;

  if has_table_privilege('anon', 'public.company_field_definitions', 'select')
     or has_table_privilege('authenticated', 'public.company_field_definitions', 'select') then
    raise exception 'field definitions exposed to public roles';
  end if;
  if not has_table_privilege('service_role', 'public.company_field_definitions', 'select') then
    raise exception 'service role cannot read field definitions';
  end if;
end $$;

\ir 20261102-WO-25-company-field-definitions.down.sql

do $$
begin
  if to_regclass('public.company_field_definitions') is not null then
    raise exception 'company field definitions rollback failed';
  end if;
  if to_regclass('public.excel_mapping_presets') is null
     or to_regclass('public.import_jobs') is null
     or to_regclass('public.import_rows') is null then
    raise exception 'rollback removed reused import structures';
  end if;
end $$;

select 'WO-25 company field definitions PG17 assertions passed' as result;
