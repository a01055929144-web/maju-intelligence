-- Refuse a destructive rollback once the new order history or saved lists exist.
begin;
lock table public.store_order_settings, public.store_orders, public.store_account_order_requests,
  public.store_order_cart, public.store_order_favorites in access exclusive mode;
do $$ begin
  if exists (select 1 from public.store_orders where link_id is null)
    or exists (select 1 from public.store_account_order_requests)
    or exists (select 1 from public.store_order_cart)
    or exists (select 1 from public.store_order_favorites)
    or exists (select 1 from public.store_order_settings where self_order_enabled or auto_confirm_new_stores or payment_due_rule is not null or credit_limit is not null)
    or exists (select 1 from public.store_order_customer_rules where payment_due_rule is not null or credit_limit is not null)
  then raise exception 's2a_down_refused_preserve_order_data'; end if;
end $$;

drop function public.cancel_store_account_order(uuid, uuid, uuid, uuid, integer, uuid);
drop function public.place_store_account_orders(uuid, uuid, jsonb);
drop function public.set_store_order_favorite(uuid, uuid, uuid, uuid, boolean);
drop function public.save_store_order_cart_line(uuid, uuid, uuid, uuid, uuid, numeric);
drop function public.store_order_cart_lines(uuid, uuid, uuid);
drop function public.store_member_order_catalog(uuid, uuid, date);
drop function public.place_store_account_order(uuid, date, jsonb, uuid, uuid, integer, text, uuid, uuid);
drop function public.store_order_eligibility(uuid, uuid, uuid);
drop function public.self_order_price(uuid, uuid, uuid, date);
drop function public.self_order_member(uuid, uuid, uuid);
drop table public.store_order_favorites, public.store_order_cart, public.store_account_order_requests;
alter table public.store_orders drop constraint store_orders_account_origin_check, alter column link_id set not null;
alter table public.store_order_customer_rules drop column credit_limit, drop column payment_due_rule;
alter table public.store_order_settings drop column credit_limit, drop column payment_due_rule,
  drop column auto_confirm_new_stores, drop column self_order_enabled;
commit;
