-- Turn STOREFRONT_PRICE_DIRECTION_ENABLED OFF before rollback. Explicit DB approval required.
begin;
set local lock_timeout = '5s';
drop function if exists public.set_storefront_price_direction_visibility(uuid,boolean);
alter table public.store_order_settings drop column if exists show_storefront_price_direction;
commit;
