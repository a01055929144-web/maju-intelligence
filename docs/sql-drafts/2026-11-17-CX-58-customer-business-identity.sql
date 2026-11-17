-- DRAFT ONLY. Separate operating DB approval required. No backfill or application change.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.normalized_customers') is null
    or to_regclass('public.company_profiles') is null
    or to_regclass('public.store_profiles') is null
    or to_regclass('public.business_number_exceptions') is null then
    raise exception 'cx58_customer_business_identity_prerequisites_required';
  end if;
end $$;

alter table public.normalized_customers
  add column business_name text,
  add column sub_business_number text,
  add column business_entity_type text,
  add column corporate_registration_number text,
  add constraint normalized_customers_sub_business_number_check
    check (sub_business_number is null or sub_business_number ~ '^[0-9]{4}$'),
  add constraint normalized_customers_business_entity_type_check
    check (business_entity_type is null or business_entity_type in ('individual', 'corporation')),
  add constraint normalized_customers_corporate_registration_number_check
    check (corporate_registration_number is null or corporate_registration_number ~ '^[0-9]{13}$');

alter table public.company_profiles
  add constraint company_profiles_sub_business_number_check
    check (sub_business_number is null or sub_business_number ~ '^[0-9]{4}$');

alter table public.store_profiles
  add column business_name text,
  add column sub_business_number text,
  add column business_entity_type text,
  add constraint store_profiles_sub_business_number_check
    check (sub_business_number is null or sub_business_number ~ '^[0-9]{4}$'),
  add constraint store_profiles_business_entity_type_check
    check (business_entity_type is null or business_entity_type in ('individual', 'corporation'));

create index normalized_customers_company_business_sub_number_idx
  on public.normalized_customers (company_id, business_registration_number, coalesce(sub_business_number, ''));

comment on column public.normalized_customers.business_name is 'Registered business name; customer_name remains the store display name.';
comment on column public.normalized_customers.sub_business_number is 'Four-digit sub-business number.';
comment on column public.normalized_customers.business_entity_type is 'Business entity: individual or corporation.';
comment on column public.normalized_customers.corporate_registration_number is 'Thirteen-digit corporate registration number.';
comment on column public.store_profiles.business_name is 'Registered business name; store name remains the display name.';
comment on column public.store_profiles.sub_business_number is 'Four-digit sub-business number.';
comment on column public.store_profiles.business_entity_type is 'Business entity: individual or corporation.';

commit;
