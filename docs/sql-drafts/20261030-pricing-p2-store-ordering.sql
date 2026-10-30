-- REVIEW ONLY. 운영 적용 금지. P0/P1 pricing SQL 적용 및 별도 승인 후 실행.
-- P2: 매장 주문 설정, 매장별 링크, 후결제 주문. 기존 데이터 백필 없음.
begin;

-- P1 versions have a UUID primary key; tenant-safe FKs also need this pair.
create unique index if not exists pricing_document_versions_company_id_id_uq
  on public.pricing_document_versions(company_id, id);
alter table public.product_catalog add column if not exists order_pricing_mode text
  not null default 'fixed' check (order_pricing_mode in ('fixed','market'));

create table if not exists public.store_order_settings (
  company_id uuid primary key references public.companies(id) on delete cascade,
  cutoff_days_before smallint not null default 1 check (cutoff_days_before between 0 and 2),
  cutoff_time time without time zone not null default time '22:00',
  minimum_amount bigint not null default 0 check (minimum_amount between 0 and 1000000000000),
  minimum_policy text not null default 'notice' check (minimum_policy in ('block','fee','notice')),
  delivery_fee bigint not null default 0 check (delivery_fee between 0 and 1000000000000),
  payment_mode text not null default 'postpay' check (payment_mode = 'postpay'),
  market_price_notice text not null default '싯가·경매가에 따라 달라질 수 있습니다.' check (length(market_price_notice) between 1 and 300),
  notice text not null default '' check (length(notice) <= 500),
  updated_at timestamptz not null default now()
);

create table if not exists public.store_order_territory_rules (
  company_id uuid not null references public.companies(id) on delete cascade,
  territory_id uuid not null,
  delivery_weekdays smallint[] not null,
  cutoff_days_before smallint check (cutoff_days_before between 0 and 2),
  cutoff_time time without time zone,
  minimum_amount bigint check (minimum_amount between 0 and 1000000000000),
  minimum_policy text check (minimum_policy in ('block','fee','notice')),
  delivery_fee bigint check (delivery_fee between 0 and 1000000000000),
  primary key (company_id, territory_id),
  constraint store_order_territory_days_check check (
    cardinality(delivery_weekdays) between 1 and 7
    and delivery_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
  ),
  constraint store_order_territory_fk foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id) on delete cascade
);

create table if not exists public.store_order_customer_rules (
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  delivery_weekdays smallint[],
  cutoff_days_before smallint check (cutoff_days_before between 0 and 2),
  cutoff_time time without time zone,
  minimum_amount bigint check (minimum_amount between 0 and 1000000000000),
  minimum_policy text check (minimum_policy in ('block','fee','notice')),
  delivery_fee bigint check (delivery_fee between 0 and 1000000000000),
  payment_mode text not null default 'postpay' check (payment_mode = 'postpay'),
  primary key (company_id, customer_id),
  constraint store_order_customer_days_check check (
    delivery_weekdays is null or (
      cardinality(delivery_weekdays) between 1 and 7
      and delivery_weekdays <@ array[0,1,2,3,4,5,6]::smallint[]
    )
  ),
  constraint store_order_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete cascade
);

create table if not exists public.store_order_holidays (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  territory_id uuid,
  kind text not null check (kind in ('weekly','fixed','date')),
  weekday smallint check (weekday between 0 and 6),
  month smallint check (month between 1 and 12),
  day smallint check (day between 1 and 31),
  holiday_date date,
  source text not null default 'manual' check (source in ('manual','public_holiday','garak')),
  label text not null default '' check (length(label) <= 80),
  constraint store_order_holiday_shape_check check (
    (kind = 'weekly' and weekday is not null and month is null and day is null and holiday_date is null)
    or (kind = 'fixed' and weekday is null and month is not null and day is not null and holiday_date is null)
    or (kind = 'date' and weekday is null and month is null and day is null and holiday_date is not null)
  ),
  constraint store_order_holiday_territory_fk foreign key (company_id, territory_id)
    references public.delivery_territories(company_id, id) on delete cascade,
  constraint store_order_holiday_company_id_id_uq unique (company_id, id)
);
create index if not exists store_order_holidays_company_idx
  on public.store_order_holidays(company_id, territory_id, kind, holiday_date);

-- Only a SHA-256 hash is stored. The raw bearer token is returned once by the server.
create table if not exists public.storefront_links (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  document_version_id uuid not null,
  token_nonce text not null check (token_nonce ~ '^[0-9a-f]{32}$'),
  token_hash text not null check (token_hash ~ '^[0-9a-f]{64}$'),
  issued_by_user_id uuid,
  issued_at timestamptz not null default now(),
  expires_at timestamptz not null,
  revoked_at timestamptz,
  can_order boolean not null default true,
  first_viewed_at timestamptz,
  last_viewed_at timestamptz,
  view_count bigint not null default 0 check (view_count >= 0),
  constraint storefront_links_company_id_id_uq unique (company_id, id),
  constraint storefront_links_order_scope_uq unique (company_id, id, customer_id, document_version_id),
  constraint storefront_links_token_uq unique (token_hash),
  constraint storefront_links_dates_check check (expires_at > issued_at),
  constraint storefront_links_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete cascade,
  constraint storefront_links_version_fk foreign key (company_id, document_version_id)
    references public.pricing_document_versions(company_id, id)
    on delete no action deferrable initially deferred
);
create index if not exists storefront_links_customer_idx
  on public.storefront_links(company_id, customer_id, issued_at desc);
create unique index if not exists storefront_links_one_active_version_uq
  on public.storefront_links(company_id, customer_id, document_version_id)
  where revoked_at is null;

create table if not exists public.storefront_link_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  link_id uuid not null,
  event_type text not null check (event_type in ('view','cart','order','sent','reminder')),
  occurred_at timestamptz not null default now(),
  device_class text check (device_class in ('mobile','desktop','tablet','unknown')),
  actor_user_id uuid,
  actor_name text check (length(actor_name) <= 100),
  constraint storefront_link_events_link_fk foreign key (company_id, link_id)
    references public.storefront_links(company_id, id) on delete cascade
);
create index if not exists storefront_link_events_link_idx
  on public.storefront_link_events(company_id, link_id, occurred_at desc);

-- Serializes issuance per company. Retries return the existing active link, so a
-- company-wide run can resume at page 1 without sending duplicate links.
create or replace function public.issue_storefront_links(
  p_company uuid, p_document_version uuid, p_links jsonb,
  p_expires_at timestamptz, p_actor_user_id uuid default null
) returns table(issued_customer_id uuid, issued_link_id uuid,
  issued_token_nonce text, issued_token_hash text, was_created boolean)
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_item jsonb;
  v_customer uuid;
  v_id uuid;
  v_nonce text;
  v_hash text;
  v_existing_id uuid;
  v_existing_nonce text;
  v_existing_hash text;
  v_seen uuid[] := '{}';
begin
  if p_company is null or p_document_version is null or p_expires_at is null
    or p_expires_at <= now() or p_expires_at > now() + interval '370 days'
    or jsonb_typeof(p_links) is distinct from 'array'
    or jsonb_array_length(p_links) not between 1 and 100 then
    raise exception 'Invalid link issue request';
  end if;
  perform 1 from public.companies c where c.id = p_company for update;
  if not found or not exists(select 1 from public.pricing_document_versions v
    where v.company_id = p_company and v.id = p_document_version) then
    raise exception 'Company or published version unavailable';
  end if;
  for v_item in select value from jsonb_array_elements(p_links) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item->>'customerId','') !~* '^[0-9a-f-]{36}$'
      or coalesce(v_item->>'id','') !~* '^[0-9a-f-]{36}$'
      or coalesce(v_item->>'nonce','') !~ '^[0-9a-f]{32}$'
      or coalesce(v_item->>'hash','') !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid link issue row';
    end if;
    v_customer := (v_item->>'customerId')::uuid;
    v_id := (v_item->>'id')::uuid;
    v_nonce := v_item->>'nonce';
    v_hash := v_item->>'hash';
    if v_customer = any(v_seen) or not exists(select 1 from public.normalized_customers c
      where c.company_id = p_company and c.id = v_customer) then
      raise exception 'Duplicate or cross-company customer';
    end if;
    v_seen := array_append(v_seen,v_customer);
    select l.id,l.token_nonce,l.token_hash into v_existing_id,v_existing_nonce,v_existing_hash
      from public.storefront_links l
      where l.company_id = p_company and l.customer_id = v_customer
        and l.document_version_id = p_document_version
        and l.revoked_at is null and l.expires_at > now();
    if found then
      return query select v_customer,v_existing_id,v_existing_nonce,v_existing_hash,false;
    else
      update public.storefront_links l set revoked_at = now(),can_order = false
        where l.company_id = p_company and l.customer_id = v_customer
          and l.document_version_id = p_document_version
          and l.revoked_at is null and l.expires_at <= now();
      insert into public.storefront_links(id,company_id,customer_id,document_version_id,
        token_nonce,token_hash,expires_at,issued_by_user_id)
        values(v_id,p_company,v_customer,p_document_version,v_nonce,v_hash,
          p_expires_at,p_actor_user_id);
      return query select v_customer,v_id,v_nonce,v_hash,true;
    end if;
  end loop;
end $$;
revoke all on function public.issue_storefront_links(uuid,uuid,jsonb,timestamptz,uuid)
  from public, anon, authenticated, service_role;
grant execute on function public.issue_storefront_links(uuid,uuid,jsonb,timestamptz,uuid)
  to service_role;

create table if not exists public.store_orders (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  link_id uuid not null,
  document_version_id uuid not null,
  delivery_date date not null,
  status text not null default 'submitted' check (status in ('submitted','received','in_delivery','delivered','cancelled')),
  payment_mode text not null default 'postpay' check (payment_mode = 'postpay'),
  idempotency_key uuid not null,
  taxable_supply bigint not null default 0 check (taxable_supply >= 0),
  exempt_supply bigint not null default 0 check (exempt_supply >= 0),
  tax_amount bigint not null default 0 check (tax_amount >= 0),
  delivery_fee bigint not null default 0 check (delivery_fee >= 0),
  known_total bigint not null default 0 check (known_total >= 0),
  has_market_price boolean not null default false,
  request_memo text not null default '' check (length(request_memo) <= 500),
  submitted_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  revision integer not null default 1 check (revision > 0),
  constraint store_orders_company_id_id_uq unique (company_id, id),
  constraint store_orders_idempotency_uq unique (company_id, link_id, idempotency_key),
  constraint store_orders_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id)
    on delete no action deferrable initially deferred,
  constraint store_orders_link_scope_fk foreign key (company_id, link_id, customer_id, document_version_id)
    references public.storefront_links(company_id, id, customer_id, document_version_id)
    on delete no action deferrable initially deferred,
  constraint store_orders_version_fk foreign key (company_id, document_version_id)
    references public.pricing_document_versions(company_id, id)
    on delete no action deferrable initially deferred
);
create index if not exists store_orders_customer_date_idx
  on public.store_orders(company_id, customer_id, submitted_at desc, id desc);
create index if not exists store_orders_delivery_idx
  on public.store_orders(company_id, delivery_date, status);

create table if not exists public.store_order_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  order_id uuid not null,
  product_id uuid not null,
  promotion_id uuid,
  product_name text not null check (length(product_name) between 1 and 120),
  specification text not null default '',
  sales_unit text not null default '',
  quantity numeric(14,3) not null check (quantity > 0 and quantity <= 100000),
  unit_price bigint check (unit_price between 0 and 1000000000000),
  tax_type text not null check (tax_type in ('taxable','exempt')),
  price_includes_tax boolean not null default false,
  supply_amount bigint generated always as (case
    when unit_price is null then null
    when price_includes_tax and tax_type = 'taxable' then round(round(unit_price * quantity) / 1.1)::bigint
    else round(unit_price * quantity)::bigint end) stored,
  tax_amount bigint generated always as (case
    when unit_price is null then null
    when tax_type = 'exempt' then 0
    when price_includes_tax then (round(unit_price * quantity) - round(round(unit_price * quantity) / 1.1))::bigint
    else round(round(unit_price * quantity) * 0.1)::bigint end) stored,
  total_amount bigint generated always as (case
    when unit_price is null then null
    when price_includes_tax then round(unit_price * quantity)::bigint
    else (round(unit_price * quantity) + case when tax_type = 'taxable' then round(round(unit_price * quantity) * 0.1) else 0 end)::bigint end) stored,
  is_market_price boolean not null default false,
  constraint store_order_lines_market_check check (
    (is_market_price and unit_price is null)
    or (not is_market_price and unit_price is not null)
  ),
  constraint store_order_lines_order_fk foreign key (company_id, order_id)
    references public.store_orders(company_id, id) on delete cascade,
  constraint store_order_lines_product_fk foreign key (company_id, product_id)
    references public.product_catalog(company_id, id)
    on delete no action deferrable initially deferred,
  constraint store_order_lines_promotion_fk foreign key (company_id, promotion_id)
    references public.pricing_promotions(company_id, id)
    on delete set null (promotion_id)
);
create index if not exists store_order_lines_order_idx
  on public.store_order_lines(company_id, order_id);

create table if not exists public.store_product_preferences (
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null,
  product_id uuid not null,
  is_favorite boolean not null default false,
  is_hidden boolean not null default false,
  will_not_order boolean not null default false,
  sort_order integer,
  updated_at timestamptz not null default now(),
  primary key (company_id, customer_id, product_id),
  constraint store_product_preferences_customer_fk foreign key (company_id, customer_id)
    references public.normalized_customers(company_id, id) on delete cascade,
  constraint store_product_preferences_product_fk foreign key (company_id, product_id)
    references public.product_catalog(company_id, id) on delete cascade
);

create table if not exists public.store_order_requests (
  company_id uuid not null references public.companies(id) on delete cascade,
  link_id uuid not null,
  idempotency_key uuid not null,
  order_id uuid not null,
  request_fingerprint text not null check (request_fingerprint ~ '^[0-9a-f]{32}$'),
  result jsonb not null,
  created_at timestamptz not null default now(),
  primary key (company_id, link_id, idempotency_key),
  constraint store_order_requests_link_fk foreign key (company_id, link_id)
    references public.storefront_links(company_id, id) on delete cascade,
  constraint store_order_requests_order_fk foreign key (company_id, order_id)
    references public.store_orders(company_id, id) on delete cascade
);

-- One service-role RPC for create/edit: lock link, validate KST schedule and live prices,
-- replace lines, calculate totals, and persist the idempotency result atomically.
create or replace function public.place_store_order(
  p_token_hash text, p_delivery_date date, p_lines jsonb,
  p_idempotency_key uuid, p_order_id uuid default null,
  p_expected_revision integer default null, p_memo text default ''
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
  v_day date := (now() at time zone 'Asia/Seoul')::date;
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
  v_fingerprint := md5(p_delivery_date::text || ':' || p_memo || ':' || p_lines::text || ':' || coalesce(p_order_id::text,''));
  select * into v_request from public.store_order_requests
    where company_id = v_link.company_id and link_id = v_link.id
      and idempotency_key = p_idempotency_key;
  if found then
    if v_request.request_fingerprint <> v_fingerprint then raise exception 'Idempotency conflict'; end if;
    return v_request.result;
  end if;
  if v_link.revoked_at is not null or v_link.expires_at <= now()
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
    or (now() at time zone 'Asia/Seoul') >= (p_delivery_date - v_days)::timestamp + v_time
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
      delivery_date,idempotency_key,request_memo)
      values(v_link.company_id,v_link.customer_id,v_link.id,v_link.document_version_id,
        p_delivery_date,p_idempotency_key,p_memo) returning * into v_order;
  else
    select * into v_order from public.store_orders
      where company_id = v_link.company_id and id = p_order_id
        and customer_id = v_link.customer_id and link_id = v_link.id for update;
    if not found or v_order.status <> 'submitted' or p_expected_revision is null
      or v_order.revision is distinct from p_expected_revision
      then raise exception 'Order cannot be edited'; end if;
    delete from public.store_order_lines
      where company_id = v_link.company_id and order_id = v_order.id;
  end if;
  -- Lock all promotional rows in a stable order before checking pending reservations.
  perform 1 from public.pricing_promotions p
    where p.company_id = v_link.company_id
      and p.id in (select (value->>'promotionId')::uuid
        from jsonb_array_elements(p_lines) where value->>'promotionId' is not null)
    order by p.id for update;
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
        and a.sales_unit = v_print_line->>'unit' limit 1;
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
revoke all on function public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)
  from public, anon, authenticated, service_role;
grant execute on function public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)
  to service_role;

create or replace function public.record_storefront_view(
  p_token_hash text, p_device_class text default 'unknown'
) returns boolean language plpgsql security invoker
set search_path = public, pg_temp as $$
declare v_link public.storefront_links%rowtype;
begin
  if p_device_class not in ('mobile','desktop','tablet','unknown') then
    raise exception 'Invalid device class';
  end if;
  update public.storefront_links set
    first_viewed_at = coalesce(first_viewed_at, now()),
    last_viewed_at = now(), view_count = view_count + 1
    where token_hash = p_token_hash and revoked_at is null and expires_at > now()
      and (last_viewed_at is null or last_viewed_at <= now() - interval '30 seconds')
    returning * into v_link;
  if not found then return false; end if;
  insert into public.storefront_link_events(company_id, link_id, event_type, device_class)
    values(v_link.company_id, v_link.id, 'view', p_device_class);
  return true;
end $$;
revoke all on function public.record_storefront_view(text,text)
  from public, anon, authenticated, service_role;
grant execute on function public.record_storefront_view(text,text) to service_role;

create or replace function public.store_recent_dispatch_prices(
  p_company uuid, p_customer uuid, p_products uuid[]
) returns table(product_id uuid, unit_price bigint, document_date date)
language sql stable security invoker set search_path = public, pg_temp as $$
  select distinct on (l.product_catalog_id)
    l.product_catalog_id, l.unit_price, d.document_date
  from public.business_documents d
  join public.business_document_lines l
    on l.company_id = d.company_id and l.document_id = d.id
  where d.company_id = p_company and d.customer_id = p_customer
    and d.document_type = 'sale' and d.status = 'confirmed'
    and l.product_catalog_id = any(p_products)
  order by l.product_catalog_id, d.document_date desc, d.id desc, l.id desc;
$$;
revoke all on function public.store_recent_dispatch_prices(uuid,uuid,uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.store_recent_dispatch_prices(uuid,uuid,uuid[])
  to service_role;

create or replace function public.storefront_link_metrics(
  p_company uuid, p_links uuid[]
) returns table(link_id uuid, order_count bigint, recent_views bigint, last_order_at timestamptz)
language sql stable security invoker set search_path = public, pg_temp as $$
  select l.id,
    (select count(*) from public.store_orders o
      where o.company_id = p_company and o.link_id = l.id),
    (select count(*) from public.storefront_link_events e
      where e.company_id = p_company and e.link_id = l.id
        and e.event_type = 'view' and e.occurred_at >= now() - interval '7 days'),
    (select max(o.submitted_at) from public.store_orders o
      where o.company_id = p_company and o.link_id = l.id)
  from public.storefront_links l
  where l.company_id = p_company and l.id = any(p_links);
$$;
revoke all on function public.storefront_link_metrics(uuid,uuid[])
  from public, anon, authenticated, service_role;
grant execute on function public.storefront_link_metrics(uuid,uuid[])
  to service_role;

alter table public.store_order_settings enable row level security;
alter table public.store_order_territory_rules enable row level security;
alter table public.store_order_customer_rules enable row level security;
alter table public.store_order_holidays enable row level security;
alter table public.storefront_links enable row level security;
alter table public.storefront_link_events enable row level security;
alter table public.store_orders enable row level security;
alter table public.store_order_lines enable row level security;
alter table public.store_product_preferences enable row level security;
alter table public.store_order_requests enable row level security;
revoke all on public.store_order_settings, public.store_order_territory_rules,
  public.store_order_customer_rules, public.store_order_holidays,
  public.storefront_links, public.storefront_link_events,
  public.store_orders, public.store_order_lines, public.store_product_preferences,
  public.store_order_requests
  from public, anon, authenticated, service_role;
grant select, insert, update, delete on public.store_order_settings,
  public.store_order_territory_rules, public.store_order_customer_rules,
  public.store_order_holidays, public.storefront_links,
  public.store_orders, public.store_order_lines, public.store_product_preferences,
  public.store_order_requests
  to service_role;
grant select, insert on public.storefront_link_events to service_role;

commit;

-- Rollback, only before real orders exist and after explicit approval:
-- begin;
-- drop table if exists public.store_product_preferences;
-- drop function if exists public.place_store_order(text,date,jsonb,uuid,uuid,integer,text);
-- drop function if exists public.issue_storefront_links(uuid,uuid,jsonb,timestamptz,uuid);
-- drop function if exists public.record_storefront_view(text,text);
-- drop function if exists public.store_recent_dispatch_prices(uuid,uuid,uuid[]);
-- drop function if exists public.storefront_link_metrics(uuid,uuid[]);
-- drop table if exists public.store_order_requests;
-- drop table if exists public.store_order_lines;
-- drop table if exists public.store_orders;
-- drop table if exists public.storefront_link_events;
-- drop table if exists public.storefront_links;
-- drop table if exists public.store_order_holidays;
-- drop table if exists public.store_order_customer_rules;
-- drop table if exists public.store_order_territory_rules;
-- drop table if exists public.store_order_settings;
-- commit;
