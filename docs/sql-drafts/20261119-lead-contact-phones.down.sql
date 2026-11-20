-- DRAFT rollback. Review separately before any operating DB use.
begin;

drop function if exists public.update_lead_contact_phones_v1(uuid, uuid, uuid, jsonb);

alter table public.business_permit_leads
  drop constraint if exists business_permit_leads_owner_mobile_phone_check,
  drop constraint if exists business_permit_leads_store_phone_check,
  drop column if exists owner_mobile_phone,
  drop column if exists store_phone;

commit;
