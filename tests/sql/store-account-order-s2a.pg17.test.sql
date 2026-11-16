\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'store_member_order_test' or current_setting('server_version_num')::int / 10000 <> 17
    then raise exception 's2a_disposable_pg17_required'; end if;
end $$;
-- Run after the existing S-2b fixture. Mirror the CC-36b schema in this disposable database.
alter table public.delivery_territories add column if not exists is_active boolean not null default true;
create function public.margin_template_price_v1(uuid, uuid, uuid) returns bigint
language sql stable as $$ select null::bigint $$;
\ir ../../supabase/migrations/20261114112600_cc36b_catalog_order.sql
\ir ../../docs/sql-drafts/20261117-S-2a-account-order.sql
\ir ../../docs/sql-drafts/20261117-S-2a-account-order.down.sql
\ir ../../docs/sql-drafts/20261117-S-2a-account-order.sql

do $$
declare
  company constant uuid := '00000000-0000-4000-8000-000000000001';
  account constant uuid := '30000000-0000-4000-8000-000000000001';
  other_account constant uuid := '30000000-0000-4000-8000-000000000002';
  owner_user constant uuid := '50000000-0000-4000-8000-000000000001';
  staff_user constant uuid := '50000000-0000-4000-8000-000000000002';
  product constant uuid := '60000000-0000-4000-8000-000000000001';
  customer constant uuid := '20000000-0000-4000-8000-000000000001';
  key constant uuid := gen_random_uuid();
  lines constant jsonb := jsonb_build_array(jsonb_build_object('productId',product,'quantity',2));
  placed jsonb;
  batch jsonb;
begin
  if has_function_privilege('authenticated', 'public.store_order_eligibility(uuid,uuid,uuid)', 'execute')
    or has_table_privilege('authenticated', 'public.store_order_cart', 'select')
    then raise exception 'unsafe privileges'; end if;
  if public.store_order_eligibility(company, account, owner_user) <> array['feature_disabled']
    then raise exception 'feature default'; end if;
  begin
    perform public.store_order_eligibility(company, other_account, owner_user);
    raise exception 'unrelated account permitted';
  exception when raise_exception then if sqlerrm <> 'Store member unavailable' then raise; end if; end;
  insert into public.store_order_settings(company_id, self_order_enabled) values (company, true)
    on conflict (company_id) do update set self_order_enabled = true;
  if not ('payment_terms_required' = any(public.store_order_eligibility(company, account, owner_user)))
    then raise exception 'missing payment term not blocked'; end if;
  update public.store_order_settings s set payment_due_rule = 'next_month_10th', auto_confirm_new_stores = true
    where s.company_id = company;
  update public.normalized_customers c set delivery_base_address = 'synthetic', delivery_territory_id = '10000000-0000-4000-8000-000000000001'
    where c.company_id = company and c.id = customer;
  if cardinality(public.store_order_eligibility(company, account, owner_user)) <> 0
    then raise exception 'fixture blocked: %', public.store_order_eligibility(company, account, owner_user); end if;
  perform set_config('role', 'service_role', true);
  perform public.save_store_order_cart_line(company, account, staff_user, product, null, 2);
  if (select quantity from public.store_order_cart_lines(company, account, owner_user)) is distinct from 2
    then raise exception 'cart is not shared'; end if;
  perform public.set_store_order_favorite(company, account, staff_user, product, true);
  if not exists (select 1 from public.store_member_order_catalog(account, owner_user, '2099-01-05')
    where product_id = product and favorite and price = 1200) then raise exception 'catalog price or favorite'; end if;
  begin
    perform public.place_store_account_order(company, current_date - 1, lines, gen_random_uuid(), null, null, '', account, owner_user);
    raise exception 'past cutoff accepted';
  exception when raise_exception then if sqlerrm <> 'Delivery date unavailable' then raise; end if; end;
  placed := public.place_store_account_order(company, '2099-01-05', lines, key, null, null, '', account, owner_user);
  if placed->>'knownTotal' <> '2400' or placed <> public.place_store_account_order(
    company, '2099-01-05', lines, key, null, null, '', account, owner_user) then raise exception 'total or replay'; end if;
  if (select count(*) from public.company_notifications n where n.company_id = company and n.notification_type = 'new_order'
    and n.order_id = (placed->>'id')::uuid and n.idempotency_key = key::text) <> 1 then raise exception 'new order notification'; end if;
  if exists (select 1 from public.store_order_cart_lines(company, account, owner_user)) then raise exception 'ordered cart lines remain'; end if;
  batch := public.place_store_account_orders(account, owner_user, jsonb_build_array(
    jsonb_build_object('companyId', company, 'storeAccountId', account, 'deliveryDate', '2099-01-05', 'lines', lines, 'idempotencyKey', key),
    jsonb_build_object('companyId', '00000000-0000-4000-8000-000000000002', 'storeAccountId', other_account, 'idempotencyKey', gen_random_uuid())
  ));
  if batch->0->'order' is distinct from placed or batch->1->>'error' is distinct from 'Store member unavailable'
    then raise exception 'batch partial result %', batch; end if;
  if public.cancel_store_account_order(company, account, owner_user, (placed->>'id')::uuid, 1, gen_random_uuid())->>'status' <> 'cancelled'
    then raise exception 'cancel before receipt'; end if;
end $$;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261117-S-2a-account-order.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if to_regclass('public.store_account_order_requests') is null
    or not exists (select 1 from public.store_orders where link_id is null and status = 'cancelled')
    then raise exception 'down removed account history'; end if;
end $$;
select 'store_account_order_pg17_pass';
