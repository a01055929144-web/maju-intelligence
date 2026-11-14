-- CC-36b DRAFT. 운영 적용 금지: 컨트롤타워 검토 + 대표의 명시 승인 문구(DB-APPROVED) 전에는 supabase/migrations 로 옮기지 않는다.
-- 매장 링크 "전체 상품"(카탈로그 가격) 주문 + CC-37 품목 메모 열. 기존 문서 주문 RPC(place_store_order·place_store_member_order·issue_storefront_links)는 한 줄도 바꾸지 않는다.
-- 운영 읽기 확인(2026-11-13): storefront_links.document_version_id·store_orders.document_version_id 둘 다 NOT NULL, store_orders_link_scope_fk /
-- store_orders_version_fk 는 (… document_version_id) 복합 FK(NULL이면 검사 안 함), pricing_promotions 에 price·tax_type 열 있음, margin_template_price_v1(company, customer, product) → bigint.
begin;

-- A. 링크 종류: 문서 링크(기존) / 전체 상품 링크. 전체 상품 링크는 문서 버전이 없다.
alter table public.storefront_links add column source text not null default 'document';
alter table public.storefront_links add constraint storefront_links_source_check check (source in ('document', 'catalog'));
alter table public.storefront_links alter column document_version_id drop not null;
alter table public.storefront_links add constraint storefront_links_source_version_check check ((source = 'document') = (document_version_id is not null));

-- B. 전체 상품 주문은 문서 버전이 없다(문서 주문은 기존 함수가 계속 채움).
alter table public.store_orders alter column document_version_id drop not null;

-- C. CC-37 품목 메모(품목당 50자 · 종류 4가지 · 칩 키 · 고객사 수정 기록). 값이 없으면 NULL.
alter table public.store_order_lines
  add column line_memo text,
  add column memo_kind text,
  add column memo_tags text[],
  add column memo_edited_by_user_id uuid references public.app_users(id) on delete set null,
  add column memo_edited_at timestamptz,
  add column memo_original text;
alter table public.store_order_lines
  add constraint store_order_lines_memo_len_check check (line_memo is null or char_length(line_memo) between 1 and 50),
  add constraint store_order_lines_memo_kind_check check (memo_kind is null or memo_kind in ('product', 'packing', 'delivery', 'complaint')),
  add constraint store_order_lines_memo_pair_check check ((line_memo is null) = (memo_kind is null)),
  add constraint store_order_lines_memo_tags_check check (memo_tags is null or cardinality(memo_tags) <= 5),
  add constraint store_order_lines_memo_original_check check (memo_original is null or char_length(memo_original) <= 50);

-- D. 전체 상품 링크 발급(문서 링크 발급 issue_storefront_links 와 같은 모양, 문서 버전 없음). 감사 기록을 같은 트랜잭션에 남긴다.
create or replace function public.issue_catalog_storefront_links_v1(p_company uuid, p_links jsonb, p_expires_at timestamptz, p_actor_user_id uuid default null)
returns table(issued_customer_id uuid, issued_link_id uuid, issued_token_nonce text, issued_token_hash text, was_created boolean)
language plpgsql set search_path to 'public', 'pg_temp' as $$
declare v_item jsonb; v_customer uuid; v_id uuid; v_nonce text; v_hash text; v_existing public.storefront_links%rowtype; v_seen uuid[] := '{}';
begin
  if p_company is null or p_expires_at is null or p_expires_at <= now() or p_expires_at > now() + interval '370 days'
    or jsonb_typeof(p_links) is distinct from 'array' or jsonb_array_length(p_links) not between 1 and 100 then
    raise exception 'Invalid link issue request';
  end if;
  perform 1 from public.companies c where c.id = p_company for update;
  if not found then raise exception 'Company unavailable'; end if;
  for v_item in select value from jsonb_array_elements(p_links) loop
    if jsonb_typeof(v_item) is distinct from 'object'
      or coalesce(v_item->>'customerId', '') !~* '^[0-9a-f-]{36}$' or coalesce(v_item->>'id', '') !~* '^[0-9a-f-]{36}$'
      or coalesce(v_item->>'nonce', '') !~ '^[0-9a-f]{32}$' or coalesce(v_item->>'hash', '') !~ '^[0-9a-f]{64}$' then
      raise exception 'Invalid link issue row';
    end if;
    v_customer := (v_item->>'customerId')::uuid; v_id := (v_item->>'id')::uuid; v_nonce := v_item->>'nonce'; v_hash := v_item->>'hash';
    if v_customer = any(v_seen) or not exists(select 1 from public.normalized_customers c where c.company_id = p_company and c.id = v_customer) then
      raise exception 'Duplicate or cross-company customer';
    end if;
    v_seen := array_append(v_seen, v_customer);
    select * into v_existing from public.storefront_links l
      where l.company_id = p_company and l.customer_id = v_customer and l.source = 'catalog' and l.revoked_at is null and l.expires_at > now();
    if found then
      return query select v_customer, v_existing.id, v_existing.token_nonce, v_existing.token_hash, false;
    else
      update public.storefront_links l set revoked_at = now(), can_order = false
        where l.company_id = p_company and l.customer_id = v_customer and l.source = 'catalog' and l.revoked_at is null and l.expires_at <= now();
      insert into public.storefront_links(id, company_id, customer_id, document_version_id, source, token_nonce, token_hash, expires_at, issued_by_user_id)
        values (v_id, p_company, v_customer, null, 'catalog', v_nonce, v_hash, p_expires_at, p_actor_user_id);
      insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
        values (p_actor_user_id, p_company, 'storefront_link_issued', 'storefront_link', v_id, jsonb_build_object('source', 'catalog', 'customer_id', v_customer));
      return query select v_customer, v_id, v_nonce, v_hash, true;
    end if;
  end loop;
end $$;

-- E. 전체 상품 주문 공용 본문. 문서 주문 함수와 같은 배송일·마감·휴일·최소금액·멱등·수정(revision) 규칙을 따르되(대표 11/13: 복사 허용 — PG17에서 같은 입력의 거부 결과를 비교 케이스로 고정), 줄 가격은 요청값을 무시하고 서버에서 정한다:
--    행사(대상 매장·진행 중) → 매장 개별·견적 수락 가격 → margin_template_price_v1 → 가격 관리 판매가. 판매 중 상품만, 시세 품목 단가 null.
--    ※ 기존 두 주문 함수에서 검증을 뽑아 공유하지 않고 여기에 같은 규칙을 둔다(기존 함수 무변경 조건). 후속에서 기존 쪽을 이 공용 본문 방식으로 합치는 것은 별도 승인 건.
create or replace function public.place_store_catalog_order_core_v1(
  p_token_hash text, p_delivery_date date, p_lines jsonb, p_idempotency_key uuid, p_order_id uuid, p_expected_revision integer, p_memo text,
  p_store_account_id uuid, p_member_id uuid, p_auth_user_id uuid)
returns jsonb language plpgsql set search_path to 'public', 'pg_temp' as $$
declare
  v_link public.storefront_links%rowtype; v_order public.store_orders%rowtype; v_request public.store_order_requests%rowtype;
  v_customer_territory uuid; v_company public.store_order_settings%rowtype; v_territory public.store_order_territory_rules%rowtype; v_customer_rule public.store_order_customer_rules%rowtype;
  v_weekdays smallint[]; v_days integer; v_time time; v_minimum bigint; v_policy text; v_fee bigint; v_day date; v_fingerprint text;
  v_line jsonb; v_product public.product_catalog%rowtype; v_agreement public.customer_price_agreements%rowtype; v_promotion public.pricing_promotions%rowtype;
  v_product_id uuid; v_promo_id uuid; v_line_key text; v_qty_raw numeric; v_quantity numeric(14,3); v_price bigint; v_tax_type text; v_includes_tax boolean; v_market boolean;
  v_memo jsonb; v_memo_text text; v_memo_kind text; v_memo_tags text[]; v_applies boolean;
  v_saved public.store_order_lines%rowtype; v_taxable bigint := 0; v_exempt bigint := 0; v_tax bigint := 0; v_market_count integer := 0;
  v_reserved numeric := 0; v_store_reserved numeric := 0; v_seen text[] := '{}'; v_not_applied integer := 0; v_is_member boolean;
begin
  v_is_member := p_store_account_id is not null or p_member_id is not null or p_auth_user_id is not null;
  p_memo := coalesce(p_memo, ''); -- null 이면 멱등 지문(md5)이 통째로 null 이 되므로 빈 글로 다룬다
  if p_token_hash is null or p_token_hash !~ '^[0-9a-f]{64}$' or p_delivery_date is null or p_idempotency_key is null
    or length(p_memo) > 500 or jsonb_typeof(p_lines) is distinct from 'array' or jsonb_array_length(p_lines) not between 1 and 100 then
    raise exception 'Invalid order request';
  end if;
  select * into v_link from public.storefront_links where token_hash = p_token_hash for update;
  if not found or v_link.source <> 'catalog' then raise exception 'Link unavailable'; end if;
  if v_is_member then
    if p_store_account_id is null or p_member_id is null or p_auth_user_id is null then raise exception 'Store member unavailable'; end if;
    perform 1 from public.store_accounts a where a.company_id = v_link.company_id and a.id = p_store_account_id;
    if not found then raise exception 'Store member unavailable'; end if;
    perform 1 from public.store_account_members m join public.app_users u on u.id = m.auth_user_id
      where m.company_id = v_link.company_id and m.store_account_id = p_store_account_id and m.id = p_member_id and m.auth_user_id = p_auth_user_id;
    if not found then raise exception 'Store member unavailable'; end if;
  end if;
  v_day := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  v_fingerprint := md5(p_delivery_date::text || ':' || p_memo || ':' || p_lines::text || ':' || coalesce(p_order_id::text, '') || ':' || coalesce(p_store_account_id::text, '') || ':' || coalesce(p_member_id::text, '') || ':' || coalesce(p_auth_user_id::text, ''));
  select * into v_request from public.store_order_requests where company_id = v_link.company_id and link_id = v_link.id and idempotency_key = p_idempotency_key;
  if found then
    if v_request.request_fingerprint <> v_fingerprint then raise exception 'Idempotency conflict'; end if;
    return v_request.result;
  end if;
  if v_link.revoked_at is not null or v_link.expires_at <= clock_timestamp() or not v_link.can_order then raise exception 'Link unavailable'; end if;
  select delivery_territory_id into v_customer_territory from public.normalized_customers where company_id = v_link.company_id and id = v_link.customer_id;
  if not found then raise exception 'Store unavailable'; end if;
  select * into v_company from public.store_order_settings where company_id = v_link.company_id;
  if not found then
    v_company.cutoff_days_before := 1; v_company.cutoff_time := time '22:00'; v_company.minimum_amount := 0; v_company.minimum_policy := 'notice'; v_company.delivery_fee := 0;
  end if;
  select * into v_territory from public.store_order_territory_rules where company_id = v_link.company_id and territory_id = v_customer_territory;
  select * into v_customer_rule from public.store_order_customer_rules where company_id = v_link.company_id and customer_id = v_link.customer_id;
  v_weekdays := coalesce(v_customer_rule.delivery_weekdays, v_territory.delivery_weekdays);
  v_days := coalesce(v_customer_rule.cutoff_days_before, v_territory.cutoff_days_before, v_company.cutoff_days_before);
  v_time := coalesce(v_customer_rule.cutoff_time, v_territory.cutoff_time, v_company.cutoff_time);
  v_minimum := coalesce(v_customer_rule.minimum_amount, v_territory.minimum_amount, v_company.minimum_amount);
  v_policy := coalesce(v_customer_rule.minimum_policy, v_territory.minimum_policy, v_company.minimum_policy);
  v_fee := coalesce(v_customer_rule.delivery_fee, v_territory.delivery_fee, v_company.delivery_fee);
  if v_weekdays is null or not extract(dow from p_delivery_date)::smallint = any(v_weekdays)
    or (clock_timestamp() at time zone 'Asia/Seoul') >= (p_delivery_date - v_days)::timestamp + v_time
    or exists(select 1 from public.store_order_holidays h
      where h.company_id = v_link.company_id and (h.territory_id is null or h.territory_id = v_customer_territory)
        and ((h.kind = 'weekly' and h.weekday = extract(dow from p_delivery_date)::smallint)
          or (h.kind = 'fixed' and h.month = extract(month from p_delivery_date)::smallint and h.day = extract(day from p_delivery_date)::smallint)
          or (h.kind = 'date' and h.holiday_date = p_delivery_date))) then
    raise exception 'Delivery date unavailable';
  end if;
  if p_order_id is null then
    insert into public.store_orders(company_id, customer_id, link_id, document_version_id, delivery_date, idempotency_key, request_memo, store_account_id, ordered_by_member_id)
      values (v_link.company_id, v_link.customer_id, v_link.id, null, p_delivery_date, p_idempotency_key, p_memo, p_store_account_id, p_member_id) returning * into v_order;
  else
    select * into v_order from public.store_orders
      where company_id = v_link.company_id and id = p_order_id and customer_id = v_link.customer_id and link_id = v_link.id for update;
    if not found or v_order.status <> 'submitted' or p_expected_revision is null or v_order.revision is distinct from p_expected_revision
      or (v_is_member and (v_order.store_account_id is distinct from p_store_account_id or v_order.ordered_by_member_id is null)) then
      raise exception 'Order cannot be edited';
    end if;
    if (clock_timestamp() at time zone 'Asia/Seoul') >= (v_order.delivery_date - v_days)::timestamp + v_time then raise exception 'Order cannot be edited'; end if;
    delete from public.store_order_lines where company_id = v_link.company_id and order_id = v_order.id;
  end if;
  perform 1 from public.pricing_promotions p where p.company_id = v_link.company_id
    and p.id in (select (value->>'promotionId')::uuid from jsonb_array_elements(p_lines) where nullif(value->>'promotionId', '') is not null) order by p.id for update;
  v_day := (clock_timestamp() at time zone 'Asia/Seoul')::date;
  if v_link.expires_at <= clock_timestamp() then raise exception 'Link unavailable'; end if;
  if (clock_timestamp() at time zone 'Asia/Seoul') >= (p_delivery_date - v_days)::timestamp + v_time
    or (p_order_id is not null and (clock_timestamp() at time zone 'Asia/Seoul') >= (v_order.delivery_date - v_days)::timestamp + v_time) then
    raise exception 'Delivery date unavailable';
  end if;
  for v_line in select * from jsonb_array_elements(p_lines) loop
    v_product_id := (v_line->>'productId')::uuid;
    v_promo_id := nullif(v_line->>'promotionId', '')::uuid;
    v_qty_raw := (v_line->>'quantity')::numeric;
    v_line_key := v_product_id::text || ':' || coalesce(v_promo_id::text, '');
    if v_line_key = any(v_seen) or v_qty_raw <= 0 or v_qty_raw > 100000 or scale(v_qty_raw) > 3 then raise exception 'Invalid order line'; end if;
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
    select * into v_product from public.product_catalog where company_id = v_link.company_id and id = v_product_id and is_active;
    if not found then raise exception 'Product unavailable'; end if;
    v_market := v_product.order_pricing_mode = 'market';
    v_tax_type := v_product.tax_type; v_price := null; v_includes_tax := false; v_applies := false;
    if v_promo_id is not null then
      select * into v_promotion from public.pricing_promotions p
        where p.company_id = v_link.company_id and p.id = v_promo_id and p.product_id = v_product_id and p.starts_on <= v_day and p.ends_on >= v_day and p.stock is distinct from 0;
      if not found then raise exception 'Promotion unavailable'; end if;
      v_applies := public.promotion_applies_to(v_link.company_id, v_promo_id, v_link.customer_id);
      if v_applies then
        select coalesce(sum(sl.quantity), 0), coalesce(sum(sl.quantity) filter (where so.customer_id = v_link.customer_id), 0) into v_reserved, v_store_reserved
          from public.store_order_lines sl join public.store_orders so on so.company_id = sl.company_id and so.id = sl.order_id
          where sl.company_id = v_link.company_id and sl.promotion_id = v_promotion.id and so.status <> 'cancelled' and so.id <> v_order.id;
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
      select * into v_agreement from public.customer_price_agreements a
        where a.company_id = v_link.company_id and a.customer_id = v_link.customer_id and a.product_catalog_id = v_product_id and a.status = 'active'
          and a.effective_from <= p_delivery_date and (a.effective_until is null or a.effective_until >= p_delivery_date) and a.sales_unit = v_product.sales_unit
        order by a.effective_from desc, a.id desc limit 1;
      if found then
        v_price := v_agreement.unit_price; v_tax_type := v_agreement.tax_type; v_includes_tax := v_agreement.price_includes_tax;
      else
        v_price := coalesce(public.margin_template_price_v1(v_link.company_id, v_link.customer_id, v_product_id),
          (select e.price from public.pricing_p0_effective e where e.company_id = v_link.company_id and e.product_id = v_product_id and e.price > 0));
      end if;
      if v_price is null or v_price <= 0 then raise exception 'Price unavailable'; end if;
    end if;
    if v_tax_type not in ('taxable', 'exempt') then raise exception 'Tax type unavailable'; end if;
    if not v_market and v_price * v_quantity > 9007199254740991 then raise exception 'Order amount too large'; end if;
    insert into public.store_order_lines(company_id, order_id, product_id, promotion_id, product_name, specification, sales_unit, quantity, unit_price, tax_type, price_includes_tax, is_market_price,
        line_memo, memo_kind, memo_tags)
      values (v_link.company_id, v_order.id, v_product_id, v_promo_id,
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
    where company_id = v_link.company_id and id = v_order.id returning * into v_order;
  insert into public.store_order_requests(company_id, link_id, idempotency_key, order_id, request_fingerprint, result)
    values (v_link.company_id, v_link.id, p_idempotency_key, v_order.id, v_fingerprint,
      jsonb_build_object('id', v_order.id, 'revision', v_order.revision, 'knownTotal', v_order.known_total, 'marketPricePending', v_order.has_market_price, 'promotionNotApplied', v_not_applied));
  return jsonb_build_object('id', v_order.id, 'revision', v_order.revision, 'knownTotal', v_order.known_total, 'marketPricePending', v_order.has_market_price, 'promotionNotApplied', v_not_applied);
end $$;

-- 공개 진입점 2개(점주 링크 주문 / 로그인한 구성원 주문). 공용 본문만 호출한다.
create or replace function public.place_store_catalog_order_v1(p_token_hash text, p_delivery_date date, p_lines jsonb, p_idempotency_key uuid, p_order_id uuid default null, p_expected_revision integer default null, p_memo text default '')
returns jsonb language sql set search_path to 'public', 'pg_temp' as $$
  select public.place_store_catalog_order_core_v1(p_token_hash, p_delivery_date, p_lines, p_idempotency_key, p_order_id, p_expected_revision, p_memo, null, null, null)
$$;
create or replace function public.place_store_catalog_member_order_v1(p_token_hash text, p_delivery_date date, p_lines jsonb, p_idempotency_key uuid, p_order_id uuid default null, p_expected_revision integer default null, p_memo text default '', p_store_account_id uuid default null, p_member_id uuid default null, p_auth_user_id uuid default null)
returns jsonb language plpgsql set search_path to 'public', 'pg_temp' as $$
begin
  if p_store_account_id is null or p_member_id is null or p_auth_user_id is null then raise exception 'Store member unavailable'; end if;
  return public.place_store_catalog_order_core_v1(p_token_hash, p_delivery_date, p_lines, p_idempotency_key, p_order_id, p_expected_revision, p_memo, p_store_account_id, p_member_id, p_auth_user_id);
end $$;

revoke all on function public.issue_catalog_storefront_links_v1(uuid, jsonb, timestamptz, uuid) from public, anon, authenticated;
revoke all on function public.place_store_catalog_order_core_v1(text, date, jsonb, uuid, uuid, integer, text, uuid, uuid, uuid) from public, anon, authenticated;
revoke all on function public.place_store_catalog_order_v1(text, date, jsonb, uuid, uuid, integer, text) from public, anon, authenticated;
revoke all on function public.place_store_catalog_member_order_v1(text, date, jsonb, uuid, uuid, integer, text, uuid, uuid, uuid) from public, anon, authenticated;
grant execute on function public.issue_catalog_storefront_links_v1(uuid, jsonb, timestamptz, uuid) to service_role;
grant execute on function public.place_store_catalog_order_core_v1(text, date, jsonb, uuid, uuid, integer, text, uuid, uuid, uuid) to service_role;
grant execute on function public.place_store_catalog_order_v1(text, date, jsonb, uuid, uuid, integer, text) to service_role;
grant execute on function public.place_store_catalog_member_order_v1(text, date, jsonb, uuid, uuid, integer, text, uuid, uuid, uuid) to service_role;

commit;
