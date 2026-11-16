-- S-2a review draft. Apply only through the DB approval process.
begin;

alter table public.store_order_settings
  add column self_order_enabled boolean not null default false,
  add column auto_confirm_new_stores boolean not null default false,
  add column payment_due_rule text check (length(btrim(payment_due_rule)) between 1 and 120),
  add column credit_limit bigint check (credit_limit >= 0);
alter table public.store_order_customer_rules
  add column payment_due_rule text check (length(btrim(payment_due_rule)) between 1 and 120),
  add column credit_limit bigint check (credit_limit >= 0);

alter table public.store_orders alter column link_id drop not null;
alter table public.store_orders add constraint store_orders_account_origin_check
  check (link_id is not null or (store_account_id is not null and ordered_by_member_id is not null));

create table public.store_account_order_requests (
  company_id uuid not null,
  idempotency_key uuid not null,
  order_id uuid not null,
  request_payload jsonb not null,
  result jsonb not null,
  primary key (company_id, idempotency_key),
  foreign key (company_id, order_id) references public.store_orders(company_id, id)
);
create table public.store_order_cart (
  company_id uuid not null,
  store_account_id uuid not null,
  product_id uuid not null references public.product_catalog(id),
  promotion_id uuid references public.pricing_promotions(id),
  quantity numeric not null check (quantity > 0 and quantity <= 100000 and scale(quantity) <= 3),
  updated_by_member_id uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  unique nulls not distinct (company_id, store_account_id, product_id, promotion_id),
  foreign key (company_id, store_account_id) references public.store_accounts(company_id, id)
);
create table public.store_order_favorites (
  company_id uuid not null,
  store_account_id uuid not null,
  product_id uuid not null references public.product_catalog(id),
  added_by_member_id uuid not null,
  created_at timestamptz not null default clock_timestamp(),
  primary key (company_id, store_account_id, product_id),
  foreign key (company_id, store_account_id) references public.store_accounts(company_id, id)
);
alter table public.store_account_order_requests enable row level security;
alter table public.store_order_cart enable row level security;
alter table public.store_order_favorites enable row level security;
revoke all on public.store_account_order_requests, public.store_order_cart, public.store_order_favorites from public, anon, authenticated;
grant select, insert on public.store_account_order_requests to service_role;
grant select, insert, update, delete on public.store_order_cart, public.store_order_favorites to service_role;

-- The server supplies the verified session user. Browser roles have no execute grant.
create function public.self_order_member(p_company uuid, p_account uuid, p_user uuid)
returns uuid language sql stable set search_path = public, pg_temp as $$
  select m.id from public.store_account_members m
  join public.app_users u on u.id = m.auth_user_id
  join public.store_accounts a on a.company_id = m.company_id and a.id = m.store_account_id
  where m.company_id = p_company and m.store_account_id = p_account
    and m.auth_user_id = p_user and m.status = 'active' and u.status = 'active' and a.status = 'active'
$$;

create function public.self_order_price(p_company uuid, p_customer uuid, p_product uuid, p_date date)
returns table (price bigint, tax_type text, includes_tax boolean, market boolean)
language sql stable set search_path = public, pg_temp as $$
  with latest as (
    select v.content
    from public.storefront_links l
    join public.pricing_document_versions v on v.company_id = l.company_id and v.id = l.document_version_id
    where l.company_id = p_company and l.customer_id = p_customer
      and l.revoked_at is null and l.expires_at > statement_timestamp()
      and v.published_at is not null and (v.content->>'showPrice')::boolean
      and (v.content->>'validUntil')::date >= greatest(p_date, (statement_timestamp() at time zone 'Asia/Seoul')::date)
    order by v.published_at desc, l.issued_at desc, l.id desc limit 1
  )
  select case when p.order_pricing_mode = 'market' then null
              else coalesce(d.price, public.margin_template_price_v1(p_company, p_customer, p_product), e.price) end,
    coalesce(d.tax_type, p.tax_type), coalesce(d.includes_tax, false), p.order_pricing_mode = 'market'
  from public.product_catalog p
  left join lateral (
    select case when j->>'taxType' = 'taxable' and (latest.content#>>'{display,priceIncludesTax}')::boolean then round((j->>'price')::numeric * 1.1)::bigint else (j->>'price')::bigint end as price, j->>'taxType' as tax_type,
      coalesce((latest.content#>>'{display,priceIncludesTax}')::boolean, false) as includes_tax
    from latest cross join lateral jsonb_array_elements(latest.content->'lines') as j
    where j->>'productId' = p.id::text and j->>'unit' = p.sales_unit
      and (j->>'visible')::boolean and nullif(j->>'promotionId', '') is null
      and (j->>'price')::bigint > 0 limit 1
  ) d on true
  left join public.pricing_p0_effective e on e.company_id = p.company_id and e.product_id = p.id
  where p.company_id = p_company and p.id = p_product and p.is_active
$$;

create function public.store_order_eligibility(p_company uuid, p_account uuid, p_user uuid)
returns text[] language plpgsql stable set search_path = public, pg_temp as $$
declare
  a public.store_accounts%rowtype;
  s public.store_order_settings%rowtype;
  c public.normalized_customers%rowtype;
  r public.store_order_customer_rules%rowtype;
  t public.store_order_territory_rules%rowtype;
  blockers text[] := '{}';
begin
  if public.self_order_member(p_company, p_account, p_user) is null then
    raise exception 'Store member unavailable';
  end if;
  select * into s from public.store_order_settings where company_id = p_company;
  if not coalesce(s.self_order_enabled, false) then return array['feature_disabled']; end if;
  select * into a from public.store_accounts where company_id = p_company and id = p_account;
  select * into c from public.normalized_customers where company_id = p_company and id = a.customer_id;
  select * into r from public.store_order_customer_rules where company_id = p_company and customer_id = a.customer_id;
  select * into t from public.store_order_territory_rules where company_id = p_company and territory_id = c.delivery_territory_id;
  if a.business_status <> 'active' or a.business_status_verified_at is null
    or a.terms_accepted_at is null or nullif(btrim(a.terms_version), '') is null then
    blockers := array_append(blockers, 'business_verification_required');
  end if;
  if c.id is null or (a.customer_review_status <> 'confirmed' and not s.auto_confirm_new_stores) then
    blockers := array_append(blockers, 'customer_confirmation_required');
  end if;
  if nullif(btrim(c.delivery_base_address), '') is null
    or coalesce(cardinality(coalesce(r.delivery_weekdays, t.delivery_weekdays)), 0) = 0
    or not exists (select 1 from public.delivery_territories
                   where company_id = p_company and id = c.delivery_territory_id and is_active) then
    blockers := array_append(blockers, 'delivery_unavailable');
  end if;
  if coalesce(r.payment_mode, s.payment_mode) is distinct from 'postpay' then
    blockers := array_append(blockers, 'payment_method_required');
  end if;
  if coalesce(r.payment_due_rule, s.payment_due_rule) is null then
    blockers := array_append(blockers, 'payment_terms_required');
  end if;
  if not exists (
    select 1 from public.product_catalog p
    cross join lateral public.self_order_price(p_company, a.customer_id, p.id,
      (statement_timestamp() at time zone 'Asia/Seoul')::date) priced
    where p.company_id = p_company and p.is_active and (priced.market or priced.price > 0)
  ) then
    blockers := array_append(blockers, 'price_unavailable');
  end if;
  return blockers;
end $$;

revoke all on function public.self_order_member(uuid, uuid, uuid),
  public.self_order_price(uuid, uuid, uuid, date),
  public.store_order_eligibility(uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.self_order_member(uuid, uuid, uuid),
  public.self_order_price(uuid, uuid, uuid, date),
  public.store_order_eligibility(uuid, uuid, uuid) to service_role;

create function public.place_store_account_order(
  p_company uuid, p_delivery_date date, p_lines jsonb, p_idempotency_key uuid, p_order_id uuid, p_expected_revision integer, p_memo text,
  p_store_account_id uuid, p_auth_user_id uuid)
returns jsonb language plpgsql set search_path to 'public', 'pg_temp' as $$
declare
  v_account public.store_accounts%rowtype; v_order public.store_orders%rowtype; v_request public.store_account_order_requests%rowtype;
  v_customer_territory uuid; v_company public.store_order_settings%rowtype; v_territory public.store_order_territory_rules%rowtype; v_customer_rule public.store_order_customer_rules%rowtype;
  v_weekdays smallint[]; v_days integer; v_time time; v_minimum bigint; v_policy text; v_fee bigint; v_day date; v_payload jsonb; v_result jsonb; p_member_id uuid;
  v_line jsonb; v_product public.product_catalog%rowtype; v_promotion public.pricing_promotions%rowtype;
  v_product_id uuid; v_promo_id uuid; v_line_key text; v_qty_raw numeric; v_quantity numeric(14,3); v_price bigint; v_tax_type text; v_includes_tax boolean; v_market boolean;
  v_memo jsonb; v_memo_text text; v_memo_kind text; v_memo_tags text[]; v_applies boolean;
  v_saved public.store_order_lines%rowtype; v_taxable bigint := 0; v_exempt bigint := 0; v_tax bigint := 0; v_market_count integer := 0;
  v_reserved numeric := 0; v_store_reserved numeric := 0; v_seen text[] := '{}'; v_not_applied integer := 0;
begin
  p_memo := coalesce(p_memo, ''); -- null 이면 멱등 지문(md5)이 통째로 null 이 되므로 빈 글로 다룬다
  if p_company is null or p_delivery_date is null or p_idempotency_key is null
    or length(p_memo) > 500 or jsonb_typeof(p_lines) is distinct from 'array' then
    raise exception 'Invalid order request';
  end if;
  -- Match the existing link order limit before locks, writes or line processing.
  if jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Invalid order request';
  end if;
  select * into v_account from public.store_accounts
    where company_id = p_company and id = p_store_account_id for update;
  p_member_id := public.self_order_member(p_company, p_store_account_id, p_auth_user_id);
  if p_member_id is null then raise exception 'Store member unavailable'; end if;
  v_payload := jsonb_build_array(p_store_account_id, p_member_id, p_delivery_date,
    p_lines, p_order_id, p_expected_revision, p_memo);
  if not exists (select 1 from public.store_order_settings where company_id = p_company and self_order_enabled)
    then raise exception 'Self order disabled'; end if;
  select * into v_request from public.store_account_order_requests
    where company_id = p_company and idempotency_key = p_idempotency_key;
  if found then
    if v_request.request_payload <> v_payload then raise exception 'Idempotency conflict'; end if;
    return v_request.result;
  end if;
  if cardinality(public.store_order_eligibility(p_company, p_store_account_id, p_auth_user_id)) > 0
    then raise exception 'Store cannot order'; end if;
  if v_account.customer_review_status = 'needs_review' then
    perform public.confirm_store_customer_v1(p_company, p_store_account_id, null, 'S-2a auto-confirm');
  end if;
  select delivery_territory_id into v_customer_territory from public.normalized_customers where company_id = p_company and id = v_account.customer_id;
  if not found then raise exception 'Store unavailable'; end if;
  select * into v_company from public.store_order_settings where company_id = p_company;
  if not found then
    v_company.cutoff_days_before := 1; v_company.cutoff_time := time '22:00'; v_company.minimum_amount := 0; v_company.minimum_policy := 'notice'; v_company.delivery_fee := 0;
  end if;
  select * into v_territory from public.store_order_territory_rules where company_id = p_company and territory_id = v_customer_territory;
  select * into v_customer_rule from public.store_order_customer_rules where company_id = p_company and customer_id = v_account.customer_id;
  v_weekdays := coalesce(v_customer_rule.delivery_weekdays, v_territory.delivery_weekdays);
  v_days := coalesce(v_customer_rule.cutoff_days_before, v_territory.cutoff_days_before, v_company.cutoff_days_before);
  v_time := coalesce(v_customer_rule.cutoff_time, v_territory.cutoff_time, v_company.cutoff_time);
  v_minimum := coalesce(v_customer_rule.minimum_amount, v_territory.minimum_amount, v_company.minimum_amount);
  v_policy := coalesce(v_customer_rule.minimum_policy, v_territory.minimum_policy, v_company.minimum_policy);
  v_fee := coalesce(v_customer_rule.delivery_fee, v_territory.delivery_fee, v_company.delivery_fee);
  if v_weekdays is null or not extract(dow from p_delivery_date)::smallint = any(v_weekdays)
    or (clock_timestamp() at time zone 'Asia/Seoul') >= (p_delivery_date - v_days)::timestamp + v_time
    or exists(select 1 from public.store_order_holidays h
      where h.company_id = p_company and (h.territory_id is null or h.territory_id = v_customer_territory)
        and ((h.kind = 'weekly' and h.weekday = extract(dow from p_delivery_date)::smallint)
          or (h.kind = 'fixed' and h.month = extract(month from p_delivery_date)::smallint and h.day = extract(day from p_delivery_date)::smallint)
          or (h.kind = 'date' and h.holiday_date = p_delivery_date))) then
    raise exception 'Delivery date unavailable';
  end if;
  if p_order_id is null then
    insert into public.store_orders(company_id, customer_id, link_id, document_version_id, delivery_date, idempotency_key, request_memo, store_account_id, ordered_by_member_id)
      values (p_company, v_account.customer_id, null, null, p_delivery_date, p_idempotency_key, p_memo, p_store_account_id, p_member_id) returning * into v_order;
  else
    select * into v_order from public.store_orders
      where company_id = p_company and id = p_order_id and customer_id = v_account.customer_id and link_id is null for update;
    if not found or v_order.status <> 'submitted' or p_expected_revision is null or v_order.revision is distinct from p_expected_revision
      or v_order.store_account_id is distinct from p_store_account_id then
      raise exception 'Order cannot be edited';
    end if;
    if (clock_timestamp() at time zone 'Asia/Seoul') >= (v_order.delivery_date - v_days)::timestamp + v_time then raise exception 'Order cannot be edited'; end if;
    delete from public.store_order_lines where company_id = p_company and order_id = v_order.id;
  end if;
  perform 1 from public.pricing_promotions p where p.company_id = p_company
    and p.id in (select (value->>'promotionId')::uuid from jsonb_array_elements(p_lines) where nullif(value->>'promotionId', '') is not null) order by p.id for update;
  v_day := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  if (clock_timestamp() at time zone 'Asia/Seoul') >= (p_delivery_date - v_days)::timestamp + v_time
    or (p_order_id is not null and (clock_timestamp() at time zone 'Asia/Seoul') >= (v_order.delivery_date - v_days)::timestamp + v_time) then
    raise exception 'Delivery date unavailable';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_product_id := (v_line->>'productId')::uuid;
    v_promo_id := nullif(v_line->>'promotionId', '')::uuid;
    v_qty_raw := (v_line->>'quantity')::numeric;
    v_line_key := v_product_id::text || ':' || coalesce(v_promo_id::text, '');
    if v_product_id is null or v_qty_raw is null or v_line_key = any(v_seen) or v_qty_raw <= 0 or v_qty_raw > 100000 or scale(v_qty_raw) > 3 then raise exception 'Invalid order line'; end if;
    v_quantity := v_qty_raw; v_seen := array_append(v_seen, v_line_key);
    -- 품목 메모(CC-37): 없으면 NULL. 있으면 글 1~50자 · 종류 4가지 · 칩 키 5개 이하(각 20자 이하).
    v_memo := v_line->'memo'; v_memo_text := null; v_memo_kind := null; v_memo_tags := null;
    if v_memo is not null and jsonb_typeof(v_memo) <> 'null' then
      if jsonb_typeof(v_memo) <> 'object' then raise exception 'Invalid line memo'; end if;
      v_memo_text := btrim(v_memo->>'text'); v_memo_kind := v_memo->>'kind';
      if v_memo_text is null or char_length(v_memo_text) not between 1 and 50 or v_memo_kind is null or v_memo_kind not in ('product', 'packing', 'delivery', 'complaint') then raise exception 'Invalid line memo'; end if;
      if v_memo->'tags' is not null and jsonb_typeof(v_memo->'tags') <> 'null' then
        if jsonb_typeof(v_memo->'tags') <> 'array' or jsonb_array_length(v_memo->'tags') > 5
          or exists(select 1 from jsonb_array_elements(v_memo->'tags') t where jsonb_typeof(t) <> 'string' or char_length(t #>> '{}') not between 1 and 20) then
          raise exception 'Invalid line memo';
        end if;
        select array_agg(t #>> '{}') into v_memo_tags from jsonb_array_elements(v_memo->'tags') t;
      end if;
    end if;
    select * into v_product from public.product_catalog where company_id = p_company and id = v_product_id and is_active;
    if not found then raise exception 'Product unavailable'; end if;
    v_market := coalesce(v_product.order_pricing_mode = 'market', false);
    v_tax_type := v_product.tax_type; v_price := null; v_includes_tax := false; v_applies := false;
    if v_promo_id is not null then
      select * into v_promotion from public.pricing_promotions p
        where p.company_id = p_company and p.id = v_promo_id and p.product_id = v_product_id and p.starts_on <= v_day and p.ends_on >= v_day and p.stock is distinct from 0;
      if not found then raise exception 'Promotion unavailable'; end if;
      v_applies := public.promotion_applies_to(p_company, v_promo_id, v_account.customer_id);
      if v_applies then
        select coalesce(sum(sl.quantity), 0), coalesce(sum(sl.quantity) filter (where so.customer_id = v_account.customer_id), 0) into v_reserved, v_store_reserved
          from public.store_order_lines sl join public.store_orders so on so.company_id = sl.company_id and so.id = sl.order_id
          where sl.company_id = p_company and sl.promotion_id = v_promotion.id and so.status <> 'cancelled' and so.id <> v_order.id;
        if (v_promotion.per_store_limit is not null and v_quantity + v_store_reserved > v_promotion.per_store_limit)
          or (v_promotion.stock is not null and v_quantity + v_reserved > v_promotion.stock) then
          raise exception 'Promotion unavailable';
        end if;
        v_price := v_promotion.price; v_tax_type := v_promotion.tax_type;
      else
        v_promo_id := null; v_not_applied := v_not_applied + 1; -- 대상이 아니면 행사가·재고를 쓰지 않고 일반 가격으로
      end if;
    end if;
    if not v_market and v_price is null then
      select p.price, p.tax_type, p.includes_tax into v_price, v_tax_type, v_includes_tax
        from public.self_order_price(p_company, v_account.customer_id, v_product_id, p_delivery_date) p;
      if v_price is null or v_price <= 0 then raise exception 'Price unavailable'; end if;
    end if;
    if v_tax_type not in ('taxable', 'exempt') then raise exception 'Tax type unavailable'; end if;
    if not v_market and v_price * v_quantity > 9007199254740991 then raise exception 'Order amount too large'; end if;
    insert into public.store_order_lines(company_id, order_id, product_id, promotion_id, product_name, specification, sales_unit, quantity, unit_price, tax_type, price_includes_tax, is_market_price,
        line_memo, memo_kind, memo_tags)
      values (p_company, v_order.id, v_product_id, v_promo_id,
        coalesce(nullif(btrim(v_product.sales_product_name), ''), nullif(btrim(v_product.canonical_name), ''), v_product.purchase_product_name, ''),
        coalesce(v_product.sales_spec, ''), coalesce(v_product.sales_unit, ''), v_quantity, case when v_market then null else v_price end, v_tax_type, v_includes_tax, v_market,
        v_memo_text, v_memo_kind, v_memo_tags) returning * into v_saved;
    if v_market then v_market_count := v_market_count + 1;
    elsif v_tax_type = 'taxable' then v_taxable := v_taxable + v_saved.supply_amount; v_tax := v_tax + v_saved.tax_amount;
    else v_exempt := v_exempt + v_saved.supply_amount; end if;
  end loop;
  if v_policy = 'block' and v_taxable + v_exempt + v_tax < v_minimum and v_market_count = 0 then raise exception 'Minimum order not met'; end if;
  if v_policy <> 'fee' or v_taxable + v_exempt + v_tax >= v_minimum then v_fee := 0; end if;
  if v_taxable + v_exempt + v_tax + v_fee > 9007199254740991 then raise exception 'Order amount too large'; end if;
  update public.store_orders set delivery_date = p_delivery_date, request_memo = p_memo, taxable_supply = v_taxable, exempt_supply = v_exempt, tax_amount = v_tax,
      delivery_fee = v_fee, known_total = v_taxable + v_exempt + v_tax + v_fee, has_market_price = v_market_count > 0,
      revision = case when p_order_id is null then 1 else revision + 1 end, updated_at = now()
    where company_id = p_company and id = v_order.id returning * into v_order;
  v_result := jsonb_build_object('id', v_order.id, 'revision', v_order.revision,
    'knownTotal', v_order.known_total, 'marketPricePending', v_order.has_market_price,
    'promotionNotApplied', v_not_applied);
  insert into public.store_account_order_requests(company_id, idempotency_key, order_id, request_payload, result)
    values (p_company, p_idempotency_key, v_order.id, v_payload, v_result);
  if p_order_id is null then
    insert into public.company_notifications(company_id, notification_type, store_account_id,
        order_id, customer_id, idempotency_key)
      values (p_company, 'new_order', p_store_account_id, v_order.id, v_account.customer_id, p_idempotency_key::text);
    -- Only clear the submitted lines that still have the submitted quantity.
    delete from public.store_order_cart c
      using jsonb_array_elements(p_lines) line
      where c.company_id = p_company and c.store_account_id = p_store_account_id
        and c.product_id = (line->>'productId')::uuid
        and c.promotion_id is not distinct from nullif(line->>'promotionId', '')::uuid
        and c.quantity = (line->>'quantity')::numeric;
  end if;
  return v_result;
end $$;

revoke all on function public.place_store_account_order(uuid, date, jsonb, uuid, uuid, integer, text, uuid, uuid) from public, anon, authenticated;
grant execute on function public.place_store_account_order(uuid, date, jsonb, uuid, uuid, integer, text, uuid, uuid) to service_role;

create function public.store_member_order_catalog(p_account uuid, p_user uuid, p_date date)
returns table(company_id uuid, store_account_id uuid, blockers text[], product_id uuid,
  product_name text, sales_unit text, price bigint, market boolean, favorite boolean)
language sql stable set search_path = public, pg_temp as $$
  with anchor as (
    select a.store_profile_id, a.id from public.store_accounts a
    where a.id = p_account and public.self_order_member(a.company_id, a.id, p_user) is not null
  ), scopes as materialized (
    select a.company_id, a.id, a.customer_id,
      public.store_order_eligibility(a.company_id, a.id, p_user) as blockers
    from anchor x join public.store_accounts a on a.store_profile_id = x.store_profile_id or a.id = x.id
    join public.store_order_settings s on s.company_id = a.company_id and s.self_order_enabled
    where public.self_order_member(a.company_id, a.id, p_user) is not null
  )
  select s.company_id, s.id, s.blockers, l.id, l.name, l.sales_unit,
    l.price, l.market, l.favorite
  from scopes s left join lateral (
    select p.id, coalesce(nullif(btrim(p.sales_product_name), ''), p.canonical_name) as name,
      p.sales_unit, priced.price, priced.market, f.product_id is not null as favorite
    from public.product_catalog p
    cross join lateral public.self_order_price(s.company_id, s.customer_id, p.id, p_date) priced
    left join public.store_order_favorites f
      on f.company_id = s.company_id and f.store_account_id = s.id and f.product_id = p.id
    where p.company_id = s.company_id and cardinality(s.blockers) = 0
      and (priced.market or priced.price > 0 or f.product_id is not null)
  ) l on true
$$;

create function public.store_order_cart_lines(p_company uuid, p_account uuid, p_user uuid)
returns setof public.store_order_cart language sql stable set search_path = public, pg_temp as $$
  select c.* from public.store_order_cart c
  join public.store_order_settings s on s.company_id = c.company_id and s.self_order_enabled
  where c.company_id = p_company and c.store_account_id = p_account
    and public.self_order_member(p_company, p_account, p_user) is not null
  order by c.updated_at desc, c.product_id, c.promotion_id
$$;

create function public.save_store_order_cart_line(
  p_company uuid, p_account uuid, p_user uuid, p_product uuid, p_promotion uuid, p_quantity numeric)
returns void language plpgsql set search_path = public, pg_temp as $$
declare member_id uuid;
begin
  perform 1 from public.store_accounts where company_id = p_company and id = p_account for update;
  member_id := public.self_order_member(p_company, p_account, p_user);
  if member_id is null or not exists (
    select 1 from public.store_order_settings where company_id = p_company and self_order_enabled
  ) then raise exception 'Store member unavailable'; end if;
  if p_quantity = 0 then
    delete from public.store_order_cart where company_id = p_company and store_account_id = p_account
      and product_id = p_product and promotion_id is not distinct from p_promotion;
    return;
  end if;
  if not exists (select 1 from public.product_catalog where company_id = p_company and id = p_product and is_active)
    or (p_promotion is not null and not exists (
      select 1 from public.pricing_promotions where company_id = p_company and id = p_promotion and product_id = p_product
    )) then raise exception 'Product unavailable'; end if;
  insert into public.store_order_cart(company_id, store_account_id, product_id, promotion_id, quantity, updated_by_member_id)
    values (p_company, p_account, p_product, p_promotion, p_quantity, member_id)
  on conflict (company_id, store_account_id, product_id, promotion_id) do update
    set quantity = excluded.quantity, updated_by_member_id = excluded.updated_by_member_id, updated_at = clock_timestamp();
end $$;

create function public.set_store_order_favorite(p_company uuid, p_account uuid, p_user uuid, p_product uuid, p_saved boolean)
returns void language plpgsql set search_path = public, pg_temp as $$
declare member_id uuid;
begin
  perform 1 from public.store_accounts where company_id = p_company and id = p_account for update;
  member_id := public.self_order_member(p_company, p_account, p_user);
  if member_id is null or not exists (
    select 1 from public.store_order_settings where company_id = p_company and self_order_enabled
  ) then raise exception 'Store member unavailable'; end if;
  if p_saved then
    if not exists (select 1 from public.product_catalog where company_id = p_company and id = p_product and is_active)
      then raise exception 'Product unavailable'; end if;
    insert into public.store_order_favorites(company_id, store_account_id, product_id, added_by_member_id)
      values (p_company, p_account, p_product, member_id) on conflict do nothing;
  else
    delete from public.store_order_favorites where company_id = p_company and store_account_id = p_account and product_id = p_product;
  end if;
end $$;

create function public.place_store_account_orders(p_account uuid, p_user uuid, p_orders jsonb)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  anchor public.store_accounts%rowtype;
  entry record;
  result jsonb := '[]';
  placed jsonb;
begin
  select * into anchor from public.store_accounts a
    where a.id = p_account and public.self_order_member(a.company_id, a.id, p_user) is not null;
  if not found then raise exception 'Store member unavailable'; end if;
  if jsonb_typeof(p_orders) is distinct from 'array' then raise exception 'Invalid order batch'; end if;
  if jsonb_array_length(p_orders) not between 1 and 10 then raise exception 'Invalid order batch'; end if;
  if exists (select 1 from jsonb_array_elements(p_orders) x
    group by lower(x->>'companyId') having count(*) > 1) then raise exception 'Duplicate company'; end if;
  if exists (select 1 from jsonb_array_elements(p_orders) x
    group by lower(x->>'idempotencyKey') having count(*) > 1) then raise exception 'Duplicate idempotency key'; end if;
  for entry in select value, ordinality from jsonb_array_elements(p_orders) with ordinality
    order by lower(value->>'companyId')
  loop
    begin
      if not exists (
        select 1 from public.store_accounts a
        where a.company_id = (entry.value->>'companyId')::uuid and a.id = (entry.value->>'storeAccountId')::uuid
          and (a.id = anchor.id or a.store_profile_id = anchor.store_profile_id)
      ) then raise exception 'Store member unavailable'; end if;
      placed := public.place_store_account_order(
        (entry.value->>'companyId')::uuid, (entry.value->>'deliveryDate')::date,
        entry.value->'lines', (entry.value->>'idempotencyKey')::uuid,
        null, null, entry.value->>'memo', (entry.value->>'storeAccountId')::uuid, p_user);
      result := result || jsonb_build_array(jsonb_build_object('index', entry.ordinality, 'order', placed));
    exception
      when raise_exception or data_exception or unique_violation or check_violation then
        result := result || jsonb_build_array(jsonb_build_object('index', entry.ordinality, 'error',
          case when sqlerrm in ('Store member unavailable', 'Self order disabled', 'Store cannot order',
            'Delivery date unavailable', 'Price unavailable', 'Minimum order not met', 'Promotion unavailable',
            'Idempotency conflict', 'Product unavailable') then sqlerrm else 'Order request rejected' end));
    end;
  end loop;
  return result;
end $$;

revoke all on function public.store_member_order_catalog(uuid, uuid, date),
  public.store_order_cart_lines(uuid, uuid, uuid),
  public.save_store_order_cart_line(uuid, uuid, uuid, uuid, uuid, numeric),
  public.set_store_order_favorite(uuid, uuid, uuid, uuid, boolean),
  public.place_store_account_orders(uuid, uuid, jsonb) from public, anon, authenticated;
grant execute on function public.store_member_order_catalog(uuid, uuid, date),
  public.store_order_cart_lines(uuid, uuid, uuid),
  public.save_store_order_cart_line(uuid, uuid, uuid, uuid, uuid, numeric),
  public.set_store_order_favorite(uuid, uuid, uuid, uuid, boolean),
  public.place_store_account_orders(uuid, uuid, jsonb) to service_role;

create function public.cancel_store_account_order(p_company uuid, p_account uuid, p_user uuid,
  p_order uuid, p_revision integer, p_key uuid)
returns jsonb language plpgsql set search_path = public, pg_temp as $$
declare
  member_id uuid;
  o public.store_orders%rowtype;
  request public.store_account_order_requests%rowtype;
  payload jsonb;
  result jsonb;
  cutoff timestamp;
begin
  perform 1 from public.store_accounts where company_id = p_company and id = p_account for update;
  member_id := public.self_order_member(p_company, p_account, p_user);
  if member_id is null or not exists (
    select 1 from public.store_order_settings where company_id = p_company and self_order_enabled
  ) then raise exception 'Store member unavailable'; end if;
  if p_key is null or p_revision is null then raise exception 'Invalid order request'; end if;
  payload := jsonb_build_array('cancel', p_account, member_id, p_order, p_revision);
  select * into request from public.store_account_order_requests where company_id = p_company and idempotency_key = p_key;
  if found then
    if request.request_payload <> payload then raise exception 'Idempotency conflict'; end if;
    return request.result;
  end if;
  select * into o from public.store_orders where company_id = p_company and id = p_order
    and link_id is null and store_account_id = p_account for update;
  if not found or o.status <> 'submitted' or o.revision <> p_revision then raise exception 'Order cannot be cancelled'; end if;
  select (o.delivery_date - coalesce(r.cutoff_days_before, t.cutoff_days_before, s.cutoff_days_before))::timestamp
      + coalesce(r.cutoff_time, t.cutoff_time, s.cutoff_time)
    into cutoff
    from public.store_order_settings s
    join public.normalized_customers c on c.company_id = s.company_id and c.id = o.customer_id
    left join public.store_order_customer_rules r on r.company_id = s.company_id and r.customer_id = c.id
    left join public.store_order_territory_rules t on t.company_id = s.company_id and t.territory_id = c.delivery_territory_id
    where s.company_id = p_company;
  if cutoff is null or (clock_timestamp() at time zone 'Asia/Seoul') >= cutoff then raise exception 'Order cannot be cancelled'; end if;
  update public.store_orders set status = 'cancelled', revision = revision + 1, updated_at = now()
    where company_id = p_company and id = p_order returning * into o;
  result := jsonb_build_object('id', o.id, 'revision', o.revision, 'status', o.status);
  insert into public.store_account_order_requests(company_id, idempotency_key, order_id, request_payload, result)
    values (p_company, p_key, o.id, payload, result);
  return result;
end $$;

revoke all on function public.cancel_store_account_order(uuid, uuid, uuid, uuid, integer, uuid) from public, anon, authenticated;
grant execute on function public.cancel_store_account_order(uuid, uuid, uuid, uuid, integer, uuid) to service_role;
commit;
