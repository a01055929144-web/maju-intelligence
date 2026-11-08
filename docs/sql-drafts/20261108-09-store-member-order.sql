-- REVIEW ONLY: explicit DB approval required. Keep ordering OFF until 07 auth + RPC + E2E are verified.
-- Prerequisites: actual P0/P1/P2/S2 migrations, manager-role migration, app_users(id,status).
-- Existing orders are not backfilled. No new tables, policies, or SECURITY DEFINER.
begin;
drop function public.place_store_order(text,date,jsonb,uuid,uuid,integer,text);
create or replace function public.place_store_order(
  p_token_hash text, p_delivery_date date, p_lines jsonb,
  p_idempotency_key uuid, p_order_id uuid default null,
  p_expected_revision integer default null, p_memo text default '',
  p_store_account_id uuid default null, p_member_id uuid default null, p_auth_user_id uuid default null
) returns jsonb language plpgsql security invoker
set search_path = public, pg_temp as $$
declare
  v_link public.storefront_links%rowtype;
  v_version public.pricing_document_versions%rowtype;
  v_order public.store_orders%rowtype;
  v_request public.store_order_requests%rowtype;
  v_customer_territory uuid;
  v_company public.store_order_settings%rowtype;
  v_territory public.store_order_territory_rules%rowtype;
  v_customer_rule public.store_order_customer_rules%rowtype;
  v_weekdays smallint[];
  v_days integer;
  v_time time;
  v_minimum bigint;
  v_policy text;
  v_fee bigint;
  v_day date;
  v_fingerprint text;
  v_line jsonb;
  v_print_line jsonb;
  v_product public.product_catalog%rowtype;
  v_agreement public.customer_price_agreements%rowtype;
  v_promotion public.pricing_promotions%rowtype;
  v_product_id uuid;
  v_line_key text;
  v_qty_raw numeric;
  v_quantity numeric(14,3);
  v_price bigint;
  v_tax_type text;
  v_includes_tax boolean;
  v_market boolean;
  v_saved public.store_order_lines%rowtype;
  v_taxable bigint := 0;
  v_exempt bigint := 0;
  v_tax bigint := 0;
  v_market_count integer := 0;
  v_reserved numeric := 0;
  v_store_reserved numeric := 0;
  v_seen text[] := '{}';
begin
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$'
    or p_delivery_date is null or p_idempotency_key is null
    or p_memo is null or length(p_memo) > 500 or jsonb_typeof(p_lines) is distinct from 'array'
    or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Invalid order request';
  end if;
  select * into v_link from public.storefront_links
    where token_hash = p_token_hash for update;
  if not found then raise exception 'Link unavailable'; end if;
  -- Lock mutable authorization rows before idempotent replay or any order write.
  -- FOR SHARE conflicts with status/identity updates, not only row deletion.
  if p_store_account_id is null or p_member_id is null or p_auth_user_id is null then
    raise exception 'Store member unavailable';
  end if;
  perform 1 from public.store_accounts a
    where a.company_id=v_link.company_id and a.id=p_store_account_id
      and a.customer_id=v_link.customer_id and a.status='active' and a.business_status='active'
    for share;
  if not found then raise exception 'Store member unavailable'; end if;
  perform 1 from public.store_account_members m join public.app_users u on u.id=m.auth_user_id
    where m.company_id=v_link.company_id and m.store_account_id=p_store_account_id
      and m.id=p_member_id and m.auth_user_id=p_auth_user_id
      and m.status='active' and m.role in ('owner','manager','staff') and u.status='active'
    for share of m,u;
  if not found then raise exception 'Store member unavailable'; end if;

  v_day := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_fingerprint := md5(p_delivery_date::text || ':' || p_memo || ':' || p_lines::text || ':' || coalesce(p_order_id::text,'') || ':' || p_store_account_id::text || ':' || p_member_id::text || ':' || p_auth_user_id::text);
  select * into v_request from public.store_order_requests
    where company_id = v_link.company_id and link_id = v_link.id
      and idempotency_key = p_idempotency_key;
  if found then
    if v_request.request_fingerprint <> v_fingerprint then raise exception 'Idempotency conflict'; end if;
    return v_request.result;
  end if;
  if v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp()
    or not v_link.can_order then raise exception 'Link unavailable'; end if;
  select * into v_version from public.pricing_document_versions
    where company_id = v_link.company_id and id = v_link.document_version_id;
  if not found or not (v_version.content->>'showPrice')::boolean
    or (v_version.content->>'validUntil')::date < v_day then
    raise exception 'Document prices expired';
  end if;
  select delivery_territory_id into v_customer_territory
    from public.normalized_customers
    where company_id = v_link.company_id and id = v_link.customer_id;
  if not found then raise exception 'Store unavailable'; end if;
  select * into v_company from public.store_order_settings
    where company_id = v_link.company_id;
  if not found then raise exception 'Order settings missing'; end if;
  select * into v_territory from public.store_order_territory_rules
    where company_id = v_link.company_id and territory_id = v_customer_territory;
  select * into v_customer_rule from public.store_order_customer_rules
    where company_id = v_link.company_id and customer_id = v_link.customer_id;
  v_weekdays := coalesce(v_customer_rule.delivery_weekdays, v_territory.delivery_weekdays);
  v_days := coalesce(v_customer_rule.cutoff_days_before,v_territory.cutoff_days_before,v_company.cutoff_days_before);
  v_time := coalesce(v_customer_rule.cutoff_time,v_territory.cutoff_time,v_company.cutoff_time);
  v_minimum := coalesce(v_customer_rule.minimum_amount,v_territory.minimum_amount,v_company.minimum_amount);
  v_policy := coalesce(v_customer_rule.minimum_policy,v_territory.minimum_policy,v_company.minimum_policy);
  v_fee := coalesce(v_customer_rule.delivery_fee,v_territory.delivery_fee,v_company.delivery_fee);
  if v_weekdays is null or not extract(dow from p_delivery_date)::smallint = any(v_weekdays)
    or (clock_timestamp() at time zone 'Asia/Seoul') >= (p_delivery_date - v_days)::timestamp + v_time
    or exists(select 1 from public.store_order_holidays h
      where h.company_id = v_link.company_id
        and (h.territory_id is null or h.territory_id = v_customer_territory)
        and ((h.kind = 'weekly' and h.weekday = extract(dow from p_delivery_date)::smallint)
          or (h.kind = 'fixed' and h.month = extract(month from p_delivery_date)::smallint
            and h.day = extract(day from p_delivery_date)::smallint)
          or (h.kind = 'date' and h.holiday_date = p_delivery_date))) then
    raise exception 'Delivery date unavailable';
  end if;
  if p_order_id is null then
    insert into public.store_orders(company_id,customer_id,link_id,document_version_id,
      delivery_date,idempotency_key,request_memo,store_account_id,ordered_by_member_id)
      values(v_link.company_id,v_link.customer_id,v_link.id,v_link.document_version_id,
        p_delivery_date,p_idempotency_key,p_memo,p_store_account_id,p_member_id) returning * into v_order;
  else
    select * into v_order from public.store_orders
      where company_id = v_link.company_id and id = p_order_id
        and customer_id = v_link.customer_id and link_id = v_link.id for update;
    if not found or v_order.store_account_id is distinct from p_store_account_id
      or v_order.ordered_by_member_id is null
      or v_order.status <> 'submitted' or p_expected_revision is null
      or v_order.revision is distinct from p_expected_revision
      then raise exception 'Order cannot be edited'; end if;
    if (clock_timestamp() at time zone 'Asia/Seoul') >=
      (v_order.delivery_date - v_days)::timestamp + v_time then
      raise exception 'Order cannot be edited';
    end if;
    delete from public.store_order_lines
      where company_id = v_link.company_id and order_id = v_order.id;
  end if;
  -- Lock all promotional rows in a stable order before checking pending reservations.
  perform 1 from public.pricing_promotions p
    where p.company_id = v_link.company_id
      and p.id in (select (value->>'promotionId')::uuid
        from jsonb_array_elements(p_lines) where value->>'promotionId' is not null)
    order by p.id for update;
  -- A promotional row lock can wait past a link expiry or order cutoff.
  v_day := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  if v_link.expires_at <= clock_timestamp() then raise exception 'Link unavailable'; end if;
  if (v_version.content->>'validUntil')::date < v_day then raise exception 'Document prices expired'; end if;
  if (clock_timestamp() at time zone 'Asia/Seoul') >= (p_delivery_date-v_days)::timestamp+v_time
    or (p_order_id is not null and (clock_timestamp() at time zone 'Asia/Seoul') >=
      (v_order.delivery_date-v_days)::timestamp+v_time) then
    raise exception 'Delivery date unavailable';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_product_id := (v_line->>'productId')::uuid;
    v_qty_raw := (v_line->>'quantity')::numeric;
    v_line_key := v_product_id::text || ':' || coalesce(v_line->>'promotionId','');
    if v_line_key = any(v_seen) or v_qty_raw <= 0 or v_qty_raw > 100000
      or scale(v_qty_raw) > 3 then raise exception 'Invalid order line'; end if;
    v_quantity := v_qty_raw;
    v_seen := array_append(v_seen,v_line_key);
    select value into v_print_line
      from jsonb_array_elements(v_version.content->'lines')
      where value->>'productId' = v_product_id::text
        and coalesce(value->>'promotionId','') = coalesce(v_line->>'promotionId','')
        and (value->>'visible')::boolean limit 1;
    if not found then raise exception 'Product unavailable in document'; end if;
    select * into v_product from public.product_catalog
      where company_id = v_link.company_id and id = v_product_id and is_active;
    if not found then raise exception 'Product unavailable'; end if;
    v_market := v_product.order_pricing_mode = 'market';
    v_tax_type := v_print_line->>'taxType';
    v_price := (v_print_line->>'price')::bigint;
    v_includes_tax := false;
    select * into v_agreement from public.customer_price_agreements a
      where a.company_id = v_link.company_id and a.customer_id = v_link.customer_id
        and a.product_catalog_id = v_product_id and a.status = 'active'
        and a.effective_from <= p_delivery_date
        and (a.effective_until is null or a.effective_until >= p_delivery_date)
        and a.sales_unit = v_print_line->>'unit'
        order by a.effective_from desc,a.id desc limit 1;
    if found then
      v_price := v_agreement.unit_price;
      v_tax_type := v_agreement.tax_type;
      v_includes_tax := v_agreement.price_includes_tax;
    end if;
    if v_print_line->>'promotionId' is not null then
      select * into v_promotion from public.pricing_promotions p
        where p.company_id = v_link.company_id and p.id = (v_print_line->>'promotionId')::uuid
          and p.product_id = v_product_id and p.starts_on <= v_day
          and p.ends_on >= v_day and p.stock is distinct from 0;
      select coalesce(sum(sl.quantity),0),
        coalesce(sum(sl.quantity) filter (where so.customer_id = v_link.customer_id),0)
        into v_reserved, v_store_reserved
        from public.store_order_lines sl
        join public.store_orders so on so.company_id = sl.company_id and so.id = sl.order_id
        where sl.company_id = v_link.company_id and sl.promotion_id = v_promotion.id
          and so.status = 'submitted' and so.id <> v_order.id;
      if v_promotion.id is null or (v_promotion.per_store_limit is not null
        and v_quantity + v_store_reserved > v_promotion.per_store_limit)
        or (v_promotion.stock is not null and v_quantity + v_reserved > v_promotion.stock) then
        raise exception 'Promotion unavailable';
      end if;
      -- The customer saw the published document snapshot. A later promotion edit
      -- may change stock/availability, but must not silently change its price or tax.
    end if;
    if not v_market and v_price * v_quantity > 9007199254740991 then
      raise exception 'Order amount too large';
    end if;
    insert into public.store_order_lines(company_id,order_id,product_id,promotion_id,
      product_name,specification,sales_unit,quantity,unit_price,tax_type,
      price_includes_tax,is_market_price)
      values(v_link.company_id,v_order.id,v_product_id,(v_print_line->>'promotionId')::uuid,
        v_print_line->>'displayName',coalesce(v_print_line->>'spec',''),
        coalesce(v_print_line->>'unit',''),v_quantity,
        case when v_market then null else v_price end,v_tax_type,
        v_includes_tax,v_market) returning * into v_saved;
    if v_market then v_market_count := v_market_count + 1;
    elsif v_tax_type = 'taxable' then
      v_taxable := v_taxable + v_saved.supply_amount;
      v_tax := v_tax + v_saved.tax_amount;
    else v_exempt := v_exempt + v_saved.supply_amount; end if;
  end loop;
  if v_policy = 'block' and v_taxable + v_exempt + v_tax < v_minimum
    and v_market_count = 0 then raise exception 'Minimum order not met'; end if;
  if v_policy <> 'fee' or v_taxable + v_exempt + v_tax >= v_minimum then
    v_fee := 0;
  end if;
  if v_taxable + v_exempt + v_tax + v_fee > 9007199254740991 then
    raise exception 'Order amount too large';
  end if;
  update public.store_orders set
    delivery_date = p_delivery_date, request_memo = p_memo,
    taxable_supply = v_taxable, exempt_supply = v_exempt, tax_amount = v_tax,
    delivery_fee = v_fee, known_total = v_taxable + v_exempt + v_tax + v_fee,
    has_market_price = v_market_count > 0, revision = case when p_order_id is null then 1 else revision + 1 end,
    updated_at = now()
    where company_id = v_link.company_id and id = v_order.id returning * into v_order;
  insert into public.store_order_requests(company_id,link_id,idempotency_key,order_id,request_fingerprint,result)
    values(v_link.company_id,v_link.id,p_idempotency_key,v_order.id,v_fingerprint,
      jsonb_build_object('id',v_order.id,'revision',v_order.revision,
        'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price));
  return jsonb_build_object('id',v_order.id,'revision',v_order.revision,
    'knownTotal',v_order.known_total,'marketPricePending',v_order.has_market_price);
end $$;
revoke all on function public.place_store_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.place_store_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)
  to service_role;

commit;
