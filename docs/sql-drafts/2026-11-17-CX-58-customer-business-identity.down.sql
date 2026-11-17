-- DRAFT ONLY. Separate operating DB rollback approval required.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if exists (
    select 1 from public.normalized_customers
    where num_nonnulls(business_name, sub_business_number, business_entity_type, corporate_registration_number) > 0
  ) or exists (
    select 1 from public.store_profiles
    where num_nonnulls(business_name, sub_business_number, business_entity_type) > 0
  ) then
    raise exception 'cx58_customer_business_identity_down_refused_data_exists';
  end if;
end $$;

drop index public.normalized_customers_company_business_sub_number_idx;

alter table public.store_profiles
  drop constraint store_profiles_business_entity_type_check,
  drop constraint store_profiles_sub_business_number_check,
  drop column business_entity_type,
  drop column sub_business_number,
  drop column business_name;

alter table public.company_profiles
  drop constraint company_profiles_sub_business_number_check;

alter table public.normalized_customers
  drop constraint normalized_customers_corporate_registration_number_check,
  drop constraint normalized_customers_business_entity_type_check,
  drop constraint normalized_customers_sub_business_number_check,
  drop column corporate_registration_number,
  drop column business_entity_type,
  drop column sub_business_number,
  drop column business_name;

commit;
