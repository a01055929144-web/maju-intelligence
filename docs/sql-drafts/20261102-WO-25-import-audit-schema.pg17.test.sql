\set ON_ERROR_STOP on

create extension if not exists pgcrypto;
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

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

begin;
do $$
declare
  company_a uuid := gen_random_uuid();
  company_b uuid := gen_random_uuid();
  template_a uuid;
  job_a uuid;
begin
  insert into public.companies(id) values(company_a), (company_b);
  insert into public.excel_mapping_presets(company_id, upload_type, preset_name, mapping, source_config)
    values(company_a, 'product', '이카운트', '{"erpCode":"품목코드"}', '{"sheet":"상품","headerRow":2}')
    returning id into template_a;
  insert into public.import_jobs(company_id, target_type, template_id, file_name, idempotency_key, total_rows)
    values(company_a, 'product', template_a, 'products.xlsx', 'sha256:test', 1)
    returning id into job_a;
  insert into public.import_rows(
    company_id, job_id, source_row_number, raw_values, normalized_values,
    extra_attributes, match_method, action, status, previous_values
  ) values(
    company_a, job_a, 2, '{"품목코드":"ERP-001","담당자메모":"원본"}',
    '{"erpCode":"ERP-001"}', '{"담당자메모":"원본"}', 'erp_code', 'update', 'valid',
    '{"name":"이전 이름"}'
  );

  if (select extra_attributes->>'담당자메모' from public.import_rows where job_id = job_a) <> '원본' then
    raise exception 'extra attributes not preserved';
  end if;
  if (select previous_values->>'name' from public.import_rows where job_id = job_a) <> '이전 이름' then
    raise exception 'previous values not preserved';
  end if;

  begin
    insert into public.import_jobs(company_id, target_type, template_id, file_name, idempotency_key)
      values(company_b, 'product', template_a, 'cross.xlsx', 'cross');
    raise exception 'cross-company template accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.import_rows(company_id, job_id, source_row_number)
      values(company_b, job_a, 1);
    raise exception 'cross-company job accepted';
  exception when foreign_key_violation then null;
  end;

  begin
    insert into public.import_jobs(company_id, target_type, file_name, idempotency_key)
      values(company_a, 'product', 'duplicate.xlsx', 'sha256:test');
    raise exception 'duplicate idempotency key accepted';
  exception when unique_violation then null;
  end;

  begin
    insert into public.import_rows(company_id, job_id, source_row_number)
      values(company_a, job_a, 2);
    raise exception 'duplicate row number accepted';
  exception when unique_violation then null;
  end;

  if has_table_privilege('anon', 'public.import_jobs', 'select')
     or has_table_privilege('authenticated', 'public.import_rows', 'select') then
    raise exception 'import audit exposed to public roles';
  end if;
  if not has_table_privilege('service_role', 'public.import_jobs', 'select') then
    raise exception 'service role cannot read import jobs';
  end if;

  delete from public.import_jobs where company_id = company_a and id = job_a;
  if exists(select 1 from public.import_rows where company_id = company_a and job_id = job_a) then
    raise exception 'import rows did not cascade';
  end if;
end $$;
rollback;
