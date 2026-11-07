create schema extensions;
create extension if not exists pgcrypto with schema extensions;
create extension if not exists dblink;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
end $$;

create table public.companies(
  id uuid primary key,
  name text not null
);
create table public.uploaded_files(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  original_filename text,
  status text not null,
  created_at timestamptz not null default now()
);
create table public.customer_imports(
  id uuid primary key,
  company_id uuid not null references public.companies(id),
  uploaded_file_id uuid references public.uploaded_files(id),
  source text not null,
  row_count integer not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  quality_score integer not null,
  duplicate_count integer not null,
  error_message text,
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create table public.raw_customer_rows(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  import_id uuid not null references public.customer_imports(id),
  row_index integer not null,
  raw_data jsonb not null,
  created_at timestamptz not null default now()
);
create table public.column_mappings(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  import_id uuid not null references public.customer_imports(id),
  source_header text not null,
  target_field text not null,
  confidence integer not null,
  created_at timestamptz not null default now()
);
create table public.normalized_customers(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id),
  import_id uuid not null references public.customer_imports(id),
  customer_name text not null,
  business_registration_number text,
  representative_name text,
  opening_date date,
  region text,
  address text,
  phone text,
  email text,
  birth_date date,
  industry text,
  grade_override text check (grade_override is null or grade_override in ('A', 'B', 'C')),
  monthly_revenue numeric not null default 0,
  last_order_days integer not null default 0,
  visit_count integer not null default 0,
  delivery_km numeric not null default 0,
  delivery_minutes integer,
  delivery_manager text,
  delivery_zone text,
  loading_position text,
  access_method_type text,
  access_note text,
  access_password text,
  business_status text,
  business_status_checked_at timestamptz,
  business_license_file_url text,
  bank_account_file_url text,
  naver_place_url text,
  kakao_place_url text,
  google_map_url text,
  place_links_checked_at timestamptz,
  normalized_key text not null,
  duplicate_of uuid references public.normalized_customers(id),
  business_hours text,
  menu_summary text,
  delivery_vehicle text,
  review_summary text,
  review_keywords text[] not null default '{}',
  review_source text,
  reviews_updated_at timestamptz,
  relationship_status text,
  relationship_status_updated_at timestamptz,
  relationship_status_note text,
  assigned_staff_member_id uuid,
  delivery_vehicle_id uuid,
  delivery_territory_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, normalized_key)
);

\ir 20261107-customer-import-atomicity.sql

insert into public.companies(id, name) values
  ('00000000-0000-4000-8000-000000000001', 'A'),
  ('00000000-0000-4000-8000-000000000002', 'B');

select * from public.save_customer_import_atomic_draft(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'manual-customer-master',
  'manual-customer-master',
  100,
  0,
  '[{"customer_name":"첫 거래처","normalized_key":"first","address":"서울"}]',
  '[{"상호명":"첫 거래처"}]',
  '[]'
);

do $$
begin
  if not exists (
    select 1 from public.customer_imports
    where id = '10000000-0000-4000-8000-000000000001'
      and status = 'completed' and completed_at is not null
  ) then raise exception 'successful import did not complete'; end if;
  if not exists (
    select 1 from public.normalized_customers
    where company_id = '00000000-0000-4000-8000-000000000001'
      and normalized_key = 'first' and address = '서울'
      and import_id = '10000000-0000-4000-8000-000000000001'
  ) then raise exception 'successful customer write missing'; end if;
end $$;

-- The same request ID and payload are a read-only replay.
select * from public.save_customer_import_atomic_draft(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  'manual-customer-master',
  'manual-customer-master', 100, 0,
  '[{"customer_name":"첫 거래처","normalized_key":"first","address":"서울"}]',
  '[{"상호명":"첫 거래처"}]',
  '[]'
);
do $$ begin
  if (select address from public.normalized_customers where normalized_key = 'first') <> '서울'
  then raise exception 'idempotent replay changed customer'; end if;
end $$;

-- Reusing an import ID for different request content is rejected.
do $$
begin
  perform * from public.save_customer_import_atomic_draft(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000001',
    'manual-customer-master', 'manual-customer-master', 100, 0,
    '[{"customer_name":"다른 요청","normalized_key":"first"}]'
  );
  raise exception 'digest mismatch was accepted';
exception when others then
  if sqlerrm = 'digest mismatch was accepted' then raise; end if;
  if sqlerrm <> 'import_request_digest_mismatch' then raise; end if;
end $$;

-- An optimistic update succeeds and moves the customer to the new import.
select * from public.save_customer_import_atomic_draft(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000002',
  'manual-customer-master',
  'manual-customer-master', 100, 0,
  jsonb_build_array(jsonb_build_object(
    'customer_name', '첫 거래처', 'normalized_key', 'first', 'address', '인천',
    'expected_updated_at', (select updated_at from public.normalized_customers where normalized_key = 'first')
  ))
);
do $$ begin
  if not exists (
    select 1 from public.normalized_customers
    where normalized_key = 'first' and address = '인천'
      and import_id = '10000000-0000-4000-8000-000000000002'
  ) then raise exception 'optimistic update missing'; end if;
end $$;

-- A later row failure rolls back every customer mutation but leaves one failed import.
select * from public.save_customer_import_atomic_draft(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000003',
  'customer-master',
  'customers.xlsx', 90, 0,
  '[
    {"customer_name":"첫 거래처","normalized_key":"first","address":"대전"},
    {"customer_name":"실패 거래처","normalized_key":"bad","grade_override":"Z"}
  ]',
  '[{"상호명":"첫 거래처"},{"상호명":"실패 거래처"}]',
  '[{"source_header":"상호명","target_field":"customerName","confidence":100}]'
);
do $$
begin
  if (select address from public.normalized_customers where normalized_key = 'first') <> '인천'
  then raise exception 'failed batch kept a partial update'; end if;
  if exists (select 1 from public.normalized_customers where normalized_key = 'bad')
  then raise exception 'failed batch kept a partial insert'; end if;
  if not exists (
    select 1 from public.customer_imports
    where id = '10000000-0000-4000-8000-000000000003'
      and status = 'failed' and completed_at is not null and error_message is not null
  ) then raise exception 'failed import history missing'; end if;
  if exists (select 1 from public.raw_customer_rows where import_id = '10000000-0000-4000-8000-000000000003')
  then raise exception 'failed import kept partial raw rows'; end if;
end $$;

-- The same normalized key remains isolated by company.
select * from public.save_customer_import_atomic_draft(
  '00000000-0000-4000-8000-000000000002',
  '20000000-0000-4000-8000-000000000001',
  'customer-master',
  'customers.xlsx', 100, 0,
  '[{"customer_name":"B 거래처","normalized_key":"first","address":"제주"}]'
);
do $$ begin
  if (select count(*) from public.normalized_customers where normalized_key = 'first') <> 2
  then raise exception 'company isolation failed'; end if;
end $$;

-- Concurrent first requests with the same ID serialize and produce one import/customer.
create function public.test_slow_customer_import() returns trigger language plpgsql as $$
begin
  if new.import_id = '30000000-0000-4000-8000-000000000001' then
    perform pg_sleep(2);
  end if;
  return new;
end $$;
create trigger test_slow_customer_import before insert on public.normalized_customers
for each row execute function public.test_slow_customer_import();

select dblink_connect(
  'concurrent_import',
  'host=127.0.0.1 dbname=' || current_database() || ' user=postgres password=postgres'
);
select dblink_send_query('concurrent_import', $query$
  select * from public.save_customer_import_atomic_draft(
    '00000000-0000-4000-8000-000000000001',
    '30000000-0000-4000-8000-000000000001',
    'customer-master', 'concurrent.xlsx', 100, 0,
    '[{"customer_name":"동시 거래처","normalized_key":"concurrent"}]'
  )
$query$);
select pg_sleep(0.25);
select * from public.save_customer_import_atomic_draft(
  '00000000-0000-4000-8000-000000000001',
  '30000000-0000-4000-8000-000000000001',
  'customer-master', 'concurrent.xlsx', 100, 0,
  '[{"customer_name":"동시 거래처","normalized_key":"concurrent"}]'
);
select * from dblink_get_result('concurrent_import') as result(
  import_id uuid, status text, row_count integer, error_message text
);
select dblink_disconnect('concurrent_import');
drop trigger test_slow_customer_import on public.normalized_customers;
drop function public.test_slow_customer_import();

do $$ begin
  if (select count(*) from public.customer_imports where id = '30000000-0000-4000-8000-000000000001') <> 1
  then raise exception 'concurrent retry created duplicate imports'; end if;
  if (select count(*) from public.normalized_customers where normalized_key = 'concurrent') <> 1
  then raise exception 'concurrent retry created duplicate customers'; end if;
  if (select status from public.customer_imports where id = '30000000-0000-4000-8000-000000000001') <> 'completed'
  then raise exception 'concurrent retry did not complete'; end if;
end $$;

-- Reusing another company's request ID is rejected.
do $$
begin
  perform * from public.save_customer_import_atomic_draft(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000001',
    'customer-master', 'customers.xlsx', 100, 0,
    '[{"customer_name":"침범","normalized_key":"cross"}]'
  );
  raise exception 'cross-company import ID was accepted';
exception when others then
  if sqlerrm = 'cross-company import ID was accepted' then raise; end if;
end $$;

do $$
begin
  perform * from public.save_customer_import_atomic_draft(
    '00000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000001',
    'customer-master', 'too-many-raw-rows.xlsx', 100, 0,
    '[{"customer_name":"상한 확인","normalized_key":"limit-raw"}]',
    (select jsonb_agg(jsonb_build_object('row', number)) from generate_series(1, 5001) number),
    '[]'
  );
  raise exception 'raw row limit was accepted';
exception when others then
  if sqlerrm = 'raw row limit was accepted' then raise; end if;
  if sqlerrm <> 'raw_rows_or_column_mappings_limit_exceeded' then raise; end if;
end $$;

do $$
begin
  perform * from public.save_customer_import_atomic_draft(
    '00000000-0000-4000-8000-000000000001',
    '40000000-0000-4000-8000-000000000002',
    'customer-master', 'too-many-mappings.xlsx', 100, 0,
    '[{"customer_name":"상한 확인","normalized_key":"limit-map"}]',
    '[]',
    (select jsonb_agg(jsonb_build_object(
      'source_header', 'source-' || number, 'target_field', 'target-' || number
    )) from generate_series(1, 201) number)
  );
  raise exception 'mapping limit was accepted';
exception when others then
  if sqlerrm = 'mapping limit was accepted' then raise; end if;
  if sqlerrm <> 'raw_rows_or_column_mappings_limit_exceeded' then raise; end if;
end $$;

do $$
begin
  if has_function_privilege('anon', 'public.save_customer_import_atomic_draft(uuid,uuid,text,text,integer,integer,jsonb,jsonb,jsonb)', 'EXECUTE')
  then raise exception 'anon can execute draft RPC'; end if;
  if not has_function_privilege('service_role', 'public.save_customer_import_atomic_draft(uuid,uuid,text,text,integer,integer,jsonb,jsonb,jsonb)', 'EXECUTE')
  then raise exception 'service_role cannot execute draft RPC'; end if;
end $$;

select 'customer import atomicity PG17 checks passed' as result;
