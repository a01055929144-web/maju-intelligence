-- Turn STORE_PURCHASE_COST_DIRECTION_ENABLED OFF before rollback. Explicit DB approval required.
begin;
set local lock_timeout = '5s';
set local statement_timeout = '120s';
drop function if exists public.storefront_cost_directions(uuid,uuid[]);
drop function if exists public.check_storefront_cost_source(uuid,uuid,jsonb,boolean,text,text);
drop function if exists public.set_storefront_cost_direction_visibility(uuid,boolean);
drop trigger if exists storefront_cost_source_revision on public.purchase_receipt_lines;
drop function if exists public.guard_storefront_cost_source_revision();
drop table if exists public.storefront_cost_source_checks;
drop index if exists public.purchase_receipt_lines_cost_direction_idx;
alter table public.store_order_settings drop column if exists show_purchase_cost_direction;
alter table public.purchase_receipt_lines drop column if exists storefront_cost_revision;
commit;
