-- CX-126 rollback. REVIEW ONLY. Refuses rollback after new values exist.
begin;
do $$ begin
  if exists(select 1 from public.normalized_customers where expected_opening_date is not null or tax_invoice_email is not null)
    or exists(select 1 from public.product_suppliers where business_status <> 'active' or address is not null or expected_opening_date is not null)
    or exists(select 1 from public.business_partner_registration_events) then
    raise exception 'cx126_data_exists';
  end if;
end $$;
drop table if exists public.business_partner_registration_events;
alter table public.product_suppliers drop constraint if exists product_suppliers_registration_pending_check,
  drop constraint if exists product_suppliers_business_entity_type_check,
  drop constraint if exists product_suppliers_business_status_check,
  drop column if exists expected_opening_date, drop column if exists business_license_file_url,
  drop column if exists tax_invoice_email, drop column if exists business_entity_type,
  drop column if exists business_status_checked_at, drop column if exists business_status,
  drop column if exists address_detail, drop column if exists address;
alter table public.normalized_customers drop constraint if exists normalized_customers_tax_invoice_email_check,
  drop column if exists tax_invoice_email,
  drop column if exists expected_opening_date;
commit;
