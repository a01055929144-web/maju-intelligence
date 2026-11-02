-- REVIEW-ONLY DRAFT. 신규 운영 이력이 있으면 파괴적 down을 거부한다.
begin;
do $$ begin
  if exists(select from public.pricing_document_sends limit 1)
    or exists(select from public.pricing_document_acceptance_requests limit 1)
    or exists(select from public.pricing_public_request_audit limit 1)
    or exists(select from public.customer_pricing_document_links limit 1)
    or exists(select from public.store_accounts limit 1)
    or exists(select from public.store_account_members limit 1)
    or exists(select from public.store_account_member_events limit 1)
    or exists(select from public.store_orders where store_account_id is not null or ordered_by_member_id is not null limit 1)
    or exists(select from public.customer_price_agreements where source_pricing_document_version_id is not null limit 1)
    or exists(select from public.normalized_customers where delivery_recipient_name is not null or delivery_contact_phone is not null or preferred_delivery_time is not null or delivery_drop_location is not null limit 1) then
    raise exception 'S2_down_refused_data_exists';
  end if;
end $$;
drop trigger if exists pricing_s2_validate_published_version on public.pricing_document_versions;
drop function if exists public.pricing_s2_validate_published_version();
drop function if exists public.pricing_s2_public_request_guard(uuid,text,text,jsonb,integer);
drop function if exists public.record_pricing_document_acceptance(uuid,uuid,uuid,uuid,text,text,uuid,uuid,uuid,boolean,text,uuid,jsonb);
drop index if exists public.storefront_links_acceptance_request_uq;
alter table public.storefront_links drop constraint if exists storefront_links_acceptance_request_fk, drop column if exists acceptance_request_id;
alter table public.store_orders drop constraint if exists store_orders_actor_pair_check, drop constraint if exists store_orders_actor_fk, drop constraint if exists store_orders_account_fk, drop column if exists ordered_by_member_id, drop column if exists store_account_id;
drop table public.store_account_member_events, public.store_account_members, public.store_accounts, public.customer_pricing_document_links, public.pricing_public_request_audit, public.pricing_document_acceptance_requests, public.pricing_document_sends;
alter table public.customer_price_agreements drop constraint if exists customer_price_agreements_pricing_version_fk, drop column if exists source_pricing_document_version_id;
alter table public.pricing_document_versions drop constraint if exists pricing_document_versions_company_document_id_key;
alter table public.normalized_customers drop column if exists delivery_drop_location, drop column if exists preferred_delivery_time, drop column if exists delivery_contact_phone, drop column if exists delivery_recipient_name;
commit;
