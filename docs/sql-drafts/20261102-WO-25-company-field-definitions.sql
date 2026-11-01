-- WO-25 company field definitions. REVIEW-ONLY DRAFT; 운영 DB 적용 금지.
-- 기존 excel_mapping_presets는 양식 저장에, import_rows.extra_attributes는 회사 칸 값 저장에 재사용한다.

begin;

create table if not exists public.company_field_definitions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  entity text not null,
  field_key text not null,
  label text not null,
  field_group text not null default '기타',
  required boolean not null default false,
  visible boolean not null default true,
  sort_order integer not null default 0,
  is_custom boolean not null default false,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(company_id, entity, field_key),
  check(entity in ('product', 'customer', 'supplier', 'customer_item', 'inventory')),
  check(field_key ~ '^[a-z][a-z0-9_]{0,62}$'),
  check(length(btrim(label)) between 1 and 100),
  check(length(btrim(field_group)) between 1 and 100),
  check(sort_order >= 0),
  check(not required or (visible and not is_custom)),
  check(
    entity <> 'product'
    or field_key not in ('erp_code', 'display_name', 'specification', 'unit', 'purchase_price')
    or (required and visible and not is_custom)
  )
);

create index if not exists company_field_definitions_company_entity_sort_idx
  on public.company_field_definitions(company_id, entity, sort_order, field_key);

create or replace function public.seed_company_product_field_definitions(p_company_id uuid)
returns void
language sql
security definer
set search_path = ''
as $$
  insert into public.company_field_definitions(
    company_id, entity, field_key, label, field_group, required, visible, sort_order, is_custom
  )
  select p_company_id, 'product', field_key, label, field_group, required, true, sort_order, false
  from (values
    ('erp_code', 'ERP 코드', '식별', true, 10),
    ('display_name', '노출명', '이름', true, 20),
    ('specification', '규격', '규격', true, 30),
    ('unit', '단위', '규격', true, 40),
    ('purchase_price', '매입가', '가격', true, 50),
    ('extra_1', '여분 칸 1', '추가 정보', false, 910),
    ('extra_2', '여분 칸 2', '추가 정보', false, 920),
    ('extra_3', '여분 칸 3', '추가 정보', false, 930),
    ('extra_4', '여분 칸 4', '추가 정보', false, 940),
    ('extra_5', '여분 칸 5', '추가 정보', false, 950)
  ) defaults(field_key, label, field_group, required, sort_order)
  on conflict(company_id, entity, field_key) do nothing;
$$;

create or replace function public.seed_company_product_field_definitions_on_company_insert()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  perform public.seed_company_product_field_definitions(new.id);
  return new;
end;
$$;

create or replace function public.protect_system_company_field_definitions()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  if old.is_custom = false then
    if tg_op = 'DELETE' then
      raise exception using message = 'system_field_definition_cannot_be_deleted';
    end if;
    if new.company_id <> old.company_id
       or new.entity <> old.entity
       or new.field_key <> old.field_key
       or new.is_custom then
      raise exception using message = 'system_field_identity_cannot_change';
    end if;
  end if;
  if old.entity = 'product'
     and old.field_key in ('erp_code', 'display_name', 'specification', 'unit', 'purchase_price')
     and (not new.required or not new.visible) then
    raise exception using message = 'required_product_field_cannot_be_hidden';
  end if;
  new.updated_at := clock_timestamp();
  return new;
end;
$$;

drop trigger if exists seed_company_product_field_definitions_after_company_insert on public.companies;
create trigger seed_company_product_field_definitions_after_company_insert
after insert on public.companies
for each row execute function public.seed_company_product_field_definitions_on_company_insert();

drop trigger if exists protect_system_company_field_definitions_before_write on public.company_field_definitions;
create trigger protect_system_company_field_definitions_before_write
before update or delete on public.company_field_definitions
for each row execute function public.protect_system_company_field_definitions();

select public.seed_company_product_field_definitions(company.id)
from public.companies company;

alter table public.company_field_definitions enable row level security;
revoke all on public.company_field_definitions from public, anon, authenticated;
grant select, insert, update, delete on public.company_field_definitions to service_role;
revoke all on function public.seed_company_product_field_definitions(uuid) from public, anon, authenticated;
revoke all on function public.seed_company_product_field_definitions_on_company_insert() from public, anon, authenticated;
revoke all on function public.protect_system_company_field_definitions() from public, anon, authenticated;

commit;
