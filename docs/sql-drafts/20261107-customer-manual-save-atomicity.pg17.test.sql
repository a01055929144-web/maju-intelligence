create schema extensions;
create extension if not exists pgcrypto with schema extensions;
do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'service_role') then create role service_role; end if;
  if not exists (select 1 from pg_roles where rolname = 'anon') then create role anon; end if;
  if not exists (select 1 from pg_roles where rolname = 'authenticated') then create role authenticated; end if;
end $$;

create table public.companies(id uuid primary key, name text not null);
create table public.uploaded_files(
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  original_filename text, status text not null, created_at timestamptz not null default now()
);
create table public.customer_imports(
  id uuid primary key, company_id uuid not null references public.companies(id),
  uploaded_file_id uuid references public.uploaded_files(id), source text not null, row_count integer not null,
  status text not null check (status in ('processing', 'completed', 'failed')),
  quality_score integer not null, duplicate_count integer not null, error_message text,
  created_at timestamptz not null default now(), completed_at timestamptz
);
create table public.normalized_customers(
  id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id),
  import_id uuid not null references public.customer_imports(id), customer_name text not null,
  business_registration_number text, representative_name text, opening_date date, region text, address text,
  phone text, email text, birth_date date, industry text, grade_override text,
  monthly_revenue numeric not null default 0, last_order_days integer not null default 0,
  visit_count integer not null default 0, delivery_km numeric not null default 0, delivery_minutes integer,
  delivery_manager text, delivery_zone text, loading_position text, access_method_type text, access_note text,
  access_password text, business_status text, business_status_checked_at timestamptz,
  business_license_file_url text, bank_account_file_url text, naver_place_url text, kakao_place_url text,
  google_map_url text, place_links_checked_at timestamptz, normalized_key text not null,
  duplicate_of uuid references public.normalized_customers(id), business_hours text, menu_summary text,
  delivery_vehicle text, review_summary text, review_keywords text[] not null default '{}', review_source text,
  reviews_updated_at timestamptz, relationship_status text, relationship_status_updated_at timestamptz,
  relationship_status_note text, assigned_staff_member_id uuid, delivery_vehicle_id uuid,
  delivery_territory_id uuid, created_at timestamptz not null default now(), unique(company_id, normalized_key)
);

\ir 20261107-customer-manual-save-atomicity.sql

insert into public.companies(id, name) values
  ('00000000-0000-4000-8000-000000000001', 'A'),
  ('00000000-0000-4000-8000-000000000002', 'B');

select * from public.save_customer_manual_atomic_draft(
  '00000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '{"customer_name":"첫 거래처","normalized_key":"first","address":"서울","assigned_staff_member_id":"30000000-0000-4000-8000-000000000001"}',
  null,
  null
);

do $$ begin
  if not exists (
    select 1 from public.customer_imports
    where id = '10000000-0000-4000-8000-000000000001' and company_id = '00000000-0000-4000-8000-000000000001'
      and status = 'completed' and completed_at is not null
  ) then raise exception 'manual history did not complete'; end if;
  if not exists (
    select 1 from public.normalized_customers
    where company_id = '00000000-0000-4000-8000-000000000001' and normalized_key = 'first'
      and address = '서울' and assigned_staff_member_id = '30000000-0000-4000-8000-000000000001'
      and updated_at is not null
  ) then raise exception 'manual customer write missing'; end if;
end $$;

do $$
declare
  v_customer_id uuid;
  v_first_updated_at timestamptz;
  v_second_updated_at timestamptz;
  v_conflict boolean;
begin
  select id, updated_at into v_customer_id, v_first_updated_at
  from public.normalized_customers
  where company_id = '00000000-0000-4000-8000-000000000001' and normalized_key = 'first';

  perform pg_sleep(0.01);
  perform * from public.save_customer_manual_atomic_draft(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000002',
    '{"customer_name":"첫 거래처","normalized_key":"first","address":"부산"}',
    v_customer_id,
    v_first_updated_at
  );
  select updated_at into v_second_updated_at from public.normalized_customers where id = v_customer_id;
  if v_second_updated_at <= v_first_updated_at then raise exception 'updated_at did not advance'; end if;

  select result.conflict into v_conflict
  from public.save_customer_manual_atomic_draft(
    '00000000-0000-4000-8000-000000000001',
    '10000000-0000-4000-8000-000000000003',
    '{"customer_name":"첫 거래처","normalized_key":"first","address":"대전"}',
    v_customer_id,
    v_first_updated_at
  ) result;
  if not v_conflict then raise exception 'stale update was not rejected'; end if;
  if (select address from public.normalized_customers where id = v_customer_id) <> '부산' then
    raise exception 'stale update changed customer';
  end if;

  perform * from public.save_customer_manual_atomic_draft(
    '00000000-0000-4000-8000-000000000002',
    '10000000-0000-4000-8000-000000000004',
    '{"customer_name":"침범","normalized_key":"first","address":"제주"}',
    v_customer_id,
    null
  );
  if (select address from public.normalized_customers where id = v_customer_id) <> '부산' then
    raise exception 'cross-company request changed customer';
  end if;
  if not exists (
    select 1 from public.customer_imports
    where id = '10000000-0000-4000-8000-000000000004'
      and company_id = '00000000-0000-4000-8000-000000000002' and status = 'failed'
  ) then raise exception 'cross-company request did not fail'; end if;
end $$;

do $$ begin
  if has_function_privilege('anon', 'public.save_customer_manual_atomic_draft(uuid,uuid,jsonb,uuid,timestamptz)', 'EXECUTE')
    or has_function_privilege('authenticated', 'public.save_customer_manual_atomic_draft(uuid,uuid,jsonb,uuid,timestamptz)', 'EXECUTE')
    or not has_function_privilege('service_role', 'public.save_customer_manual_atomic_draft(uuid,uuid,jsonb,uuid,timestamptz)', 'EXECUTE') then
    raise exception 'manual RPC grants are unsafe';
  end if;
end $$;

select 'customer_manual_save_atomicity_pg17_pass';
