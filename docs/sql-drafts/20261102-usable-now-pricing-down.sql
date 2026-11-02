-- REVIEW ONLY. Do not run on the operating database without separate approval.
-- Destructive rollback is only suitable before any price documents, links, or orders exist.
-- First disable the company feature flags and back up all pricing and store tables.
begin;
drop function if exists public.storefront_link_metrics;
drop function if exists public.store_recent_dispatch_prices;
drop function if exists public.record_storefront_view;
drop function if exists public.place_store_order;
drop function if exists public.issue_storefront_links;
drop table if exists public.store_product_preferences;
drop table if exists public.store_order_requests;
drop table if exists public.store_order_lines;
drop table if exists public.store_orders;
drop table if exists public.storefront_link_events;
drop table if exists public.storefront_links;
drop table if exists public.store_order_holidays;
drop table if exists public.store_order_customer_rules;
drop table if exists public.store_order_territory_rules;
drop table if exists public.store_order_settings;
drop index if exists public.pricing_document_versions_company_id_id_uq;
alter table if exists public.product_catalog drop column if exists order_pricing_mode;

drop function if exists public.pricing_p1;
drop function if exists public.pricing_p1_version;
drop function if exists public.pricing_p1_clean;
drop trigger if exists pricing_version_immutable on public.pricing_document_versions;
drop function if exists public.pricing_version_immutable;
drop table if exists public.pricing_print_profiles;
drop table if exists public.pricing_product_sets;
drop table if exists public.pricing_promotions;
drop table if exists public.pricing_document_versions;
drop table if exists public.pricing_documents;

drop function if exists public.pricing_p0_command;
drop function if exists public.pricing_p0_state;
drop view if exists public.pricing_p0_effective;
drop function if exists public.pricing_p0_price;
drop table if exists public.price_recalc_changes;
drop table if exists public.price_recalc_runs;
drop table if exists public.pricing_items;
drop table if exists public.pricing_settings;
drop table if exists public.margin_group_categories;
drop table if exists public.margin_groups;
commit;
