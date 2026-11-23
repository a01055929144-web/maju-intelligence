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
  linked jsonb;
  link_key uuid := gen_random_uuid();
  owner_member constant uuid := '40000000-0000-4000-8000-000000000001';
  link_token constant text := repeat('a', 64);
  batch jsonb;
  max_lines jsonb;
  rejected_lines jsonb;
  rejected_key uuid;
  max_order jsonb;
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
  with products as (
    insert into public.product_catalog(id, company_id, purchase_product_name, purchase_price, sales_unit, tax_type, order_pricing_mode)
    select gen_random_uuid(), company, 'S-2a limit fixture ' || n, 800, 'BOX', 'exempt', 'market'
    from generate_series(1, 99) n returning id
  )
  select jsonb_build_array(jsonb_build_object('productId', product, 'quantity', 1)) || jsonb_agg(jsonb_build_object('productId', id, 'quantity', 1) order by id)
    into max_lines from products;
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
  begin
    perform public.place_store_member_order(link_token, current_date - 1, lines, gen_random_uuid(),
      null, null, '', account, owner_member, owner_user);
    raise exception 'link path accepted past cutoff';
  exception when raise_exception then if sqlerrm <> 'Delivery date unavailable' then raise; end if; end;
  for rejected_lines in select payload from (values ('[]'::jsonb), (max_lines || lines)) as rejected(payload) loop
    rejected_key := gen_random_uuid();
    begin
      perform public.place_store_account_order(company, '2099-01-05', rejected_lines, rejected_key, null, null, '', account, owner_user);
      raise exception 'out-of-range line count accepted';
    exception when raise_exception then if sqlerrm <> 'Invalid order request' then raise; end if; end;
    begin
      perform public.place_store_member_order(link_token, '2099-01-05', rejected_lines, rejected_key,
        null, null, '', account, owner_member, owner_user);
      raise exception 'link path accepted out-of-range line count';
    exception when raise_exception then if sqlerrm <> 'Invalid order request' then raise; end if; end;
    if exists (select 1 from public.store_orders o where o.company_id = company and o.idempotency_key = rejected_key)
      or exists (select 1 from public.company_notifications n where n.company_id = company and n.idempotency_key = rejected_key::text)
      then raise exception 'rejected line count wrote order or notification'; end if;
  end loop;
  max_order := public.place_store_account_order(company, '2099-01-05', max_lines, gen_random_uuid(), null, null, '', account, owner_user);
  if (select count(*) from public.store_order_lines l where l.company_id = company and l.order_id = (max_order->>'id')::uuid) <> 100
    then raise exception '100-line order did not save every line'; end if;
  placed := public.place_store_account_order(company, '2099-01-05', lines, key, null, null, '', account, owner_user);
  if placed->>'knownTotal' <> '2400' or placed <> public.place_store_account_order(
    company, '2099-01-05', lines, key, null, null, '', account, owner_user) then raise exception 'total or replay'; end if;
  linked := public.place_store_member_order(link_token, '2099-01-05', lines, link_key,
    null, null, '', account, owner_member, owner_user);
  if linked->'knownTotal' is distinct from placed->'knownTotal'
    or linked is distinct from public.place_store_member_order(link_token, '2099-01-05', lines, link_key,
      null, null, '', account, owner_member, owner_user)
  then raise exception 'link and account total or replay mismatch'; end if;
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
