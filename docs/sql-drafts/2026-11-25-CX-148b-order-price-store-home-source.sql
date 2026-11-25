-- DRAFT ONLY. CX-148b: 주문가(self_order_price_v2)의 후보를 매장 홈이 보여 주는 "받은 단가표"와 같은 출처로 맞춘다. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 배경: CX-148 적용 후에도 홍곱창 9줄이 base. 후보(링크·발송·가입 문서)가 모두 없거나 만료됐고, 홈의 이번 달 단가표는 회사 기본 단가표(최신 게시 sheet + 활성 공개 링크, relation-home defaultSheet)에서 온다.
-- 추가 후보: (1) 매장 홈이 보여 주는 storefront_links(회수 안 됨·만료 전) 문서의 최신 게시본 (2) 회사 기본 단가표(지정 문서 우선, 없으면 최근 수정 sheet, 활성 공개 링크 있을 때만)
-- 우선순위: 거래처 전용(링크·가입·발송·storefront 링크) → 카탈로그(마진 템플릿) → 회사 기본 단가표 → 기본가.  회수된 storefront_links는 근거로 인정하지 않음(회수 = 회사가 그 거래처에 준 문서를 거둔 것).
-- 시그니처·반환 열·권한은 그대로. 데이터 변경 없음. CX-148 선행.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)') is null
    or to_regclass('public.storefront_links') is null or to_regclass('public.pricing_document_share_links') is null
    or to_regclass('public.pricing_default_public_documents') is null or to_regclass('public.pricing_documents') is null
  then raise exception 'cx148b_prerequisites_required'; end if;
  if (select position('cx148' in prosrc) from pg_proc where oid = 'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure) = 0
  then raise exception 'cx148_must_be_applied_first'; end if;
  if (select position('cx148b' in prosrc) from pg_proc where oid = 'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure) > 0
  then raise exception 'cx148b_already_applied'; end if;
end $$;

create or replace function public.self_order_price_v2(
  p_company uuid, p_customer uuid, p_product uuid, p_date date, p_include_promise boolean default true
)
returns table (price bigint, tax_type text, includes_tax boolean, market boolean, source text, promise_until date)
language sql stable security definer set search_path = '' as $$
  -- cx148b: received-document price (store link / activation / send / company default sheet)
  select
    case
      when product.order_pricing_mode = 'market' then null
      else coalesce(promise.price, catalog.price, sheet.price, nullif(base.price, 0))
    end,
    coalesce(promise.tax_type, case when catalog.price is null then sheet.tax_type end, product.tax_type),
    coalesce(promise.includes_tax, case when catalog.price is null then sheet.includes_tax end, false),
    product.order_pricing_mode = 'market',
    case
      when product.order_pricing_mode = 'market' then 'market'
      when promise.price is not null then 'promise'
      when catalog.price is not null then 'catalog'
      when sheet.price is not null then 'promise'
      when base.price > 0 then 'base'
      else 'unavailable'
    end,
    case when promise.price is not null then promise.promise_until
      when catalog.price is null and sheet.price is not null then sheet.promise_until end
  from public.product_catalog product
  left join lateral (
    select
      case
        when line.value->>'priceIncludesTax' = 'true' then (line.value->>'price')::bigint
        when line.value->>'taxType' = 'taxable'
          and coalesce((version.content #>> '{display,priceIncludesTax}')::boolean, false)
          then round((line.value->>'price')::numeric * 1.1)::bigint
        else (line.value->>'price')::bigint
      end as price,
      line.value->>'taxType' as tax_type,
      (line.value->>'priceIncludesTax' = 'true'
        or coalesce((version.content #>> '{display,priceIncludesTax}')::boolean, false)) as includes_tax,
      case when nullif(line.value->>'endsOn', '') is not null
        then least((version.content->>'validUntil')::date, (line.value->>'endsOn')::date)
        else (version.content->>'validUntil')::date end as promise_until
    from (
      select link.document_version_id as version_id, link.linked_at as received_at
        from public.customer_pricing_document_links link
        where link.company_id = p_company and link.customer_id = p_customer and link.active
      union all
      select (select v.id from public.pricing_document_versions v
          join public.pricing_documents d on d.company_id = v.company_id and d.id = v.document_id and d.archived_at is null
          where v.company_id = req.company_id and v.document_id = req.document_id and v.published_at is not null
          order by v.published_at desc limit 1), req.consumed_at
        from public.store_owner_activation_requests req
        where req.company_id = p_company and req.customer_id = p_customer
          and req.document_id is not null and req.consumed_at is not null and req.cancelled_at is null
      union all
      select send.document_version_id, send.sent_at
        from public.pricing_document_sends send
        where send.company_id = p_company and send.customer_id = p_customer
          and send.acceptance_status in ('sent', 'viewed', 'accepted')
      union all
      -- 매장 홈이 보여 주는 받은 문서(회수되지 않고 만료 전인 storefront_links)의 문서 최신 게시본
      select (select v.id from public.pricing_document_versions v
          join public.pricing_documents d on d.company_id = v.company_id and d.id = v.document_id and d.archived_at is null
          where v.company_id = sl.company_id and v.document_id = (select v0.document_id from public.pricing_document_versions v0 where v0.company_id = sl.company_id and v0.id = sl.document_version_id) and v.published_at is not null
          order by v.published_at desc limit 1), sl.issued_at
        from public.storefront_links sl
        where sl.company_id = p_company and sl.customer_id = p_customer and sl.document_version_id is not null
          and sl.revoked_at is null and sl.expires_at > now()
    ) received
    join public.pricing_document_versions version
      on version.company_id = p_company and version.id = received.version_id
    cross join lateral jsonb_array_elements(version.content->'lines') line(value)
    where p_include_promise
      and version.published_at is not null
      and coalesce((version.content->>'showPrice')::boolean, false)
      and (version.content->>'validUntil')::date >= p_date
      and line.value->>'productId' = product.id::text
      and line.value->>'unit' = product.sales_unit
      and coalesce((line.value->>'visible')::boolean, false)
      and (line.value->>'price')::bigint > 0
      and (nullif(line.value->>'promotionId', '') is null
        or ((nullif(line.value->>'startsOn', '') is null or (line.value->>'startsOn')::date <= p_date)
          and (nullif(line.value->>'endsOn', '') is null or (line.value->>'endsOn')::date >= p_date)
          and (nullif(line.value->>'remaining', '') is null or (line.value->>'remaining')::numeric > 0)))
    order by version.published_at desc, nullif(line.value->>'promotionId', '') is not null desc, received.received_at desc
    limit 1
  ) promise on true
  left join lateral (
    select nullif(public.margin_template_price_v1(p_company, p_customer, p_product), 0) as price
  ) catalog on true
  -- 회사 기본 단가표(홈의 받은 단가표에 보이는 것): 지정 문서 없으면 최근 수정한 게시 sheet, 활성 공개 링크가 있을 때만. 거래처 전용 가격·카탈로그 가격이 없을 때만 쓴다.
  left join lateral (
    select
      case
        when line.value->>'priceIncludesTax' = 'true' then (line.value->>'price')::bigint
        when line.value->>'taxType' = 'taxable'
          and coalesce((version.content #>> '{display,priceIncludesTax}')::boolean, false)
          then round((line.value->>'price')::numeric * 1.1)::bigint
        else (line.value->>'price')::bigint
      end as price,
      line.value->>'taxType' as tax_type,
      (line.value->>'priceIncludesTax' = 'true'
        or coalesce((version.content #>> '{display,priceIncludesTax}')::boolean, false)) as includes_tax,
      case when nullif(line.value->>'endsOn', '') is not null
        then least((version.content->>'validUntil')::date, (line.value->>'endsOn')::date)
        else (version.content->>'validUntil')::date end as promise_until
    from (
      select d.id as document_id
        from public.pricing_documents d
        where d.company_id = p_company and d.kind = 'sheet' and d.archived_at is null
          and exists (select 1 from public.pricing_document_versions v where v.company_id = d.company_id and v.document_id = d.id and v.published_at is not null)
        order by (d.id = (select pd.document_id from public.pricing_default_public_documents pd where pd.company_id = p_company)) desc, d.updated_at desc
        limit 1
    ) def
    join public.pricing_document_versions version on version.id = (select v.id from public.pricing_document_versions v
          join public.pricing_documents d on d.company_id = v.company_id and d.id = v.document_id and d.archived_at is null
          where v.company_id = p_company and v.document_id = def.document_id and v.published_at is not null
          order by v.published_at desc limit 1)
    cross join lateral jsonb_array_elements(version.content->'lines') line(value)
    where p_include_promise and catalog.price is null
      and version.content->>'kind' = 'sheet'
      and exists (select 1 from public.pricing_document_share_links s where s.company_id = p_company and s.document_id = def.document_id
        and s.lead_id is null and s.send_id is null and s.revoked_at is null and s.expires_at > now())
      and version.published_at is not null
      and coalesce((version.content->>'showPrice')::boolean, false)
      and (version.content->>'validUntil')::date >= p_date
      and line.value->>'productId' = product.id::text
      and line.value->>'unit' = product.sales_unit
      and coalesce((line.value->>'visible')::boolean, false)
      and (line.value->>'price')::bigint > 0
      and (nullif(line.value->>'promotionId', '') is null
        or ((nullif(line.value->>'startsOn', '') is null or (line.value->>'startsOn')::date <= p_date)
          and (nullif(line.value->>'endsOn', '') is null or (line.value->>'endsOn')::date >= p_date)
          and (nullif(line.value->>'remaining', '') is null or (line.value->>'remaining')::numeric > 0)))
    order by nullif(line.value->>'promotionId', '') is not null desc
    limit 1
  ) sheet on true
  left join public.pricing_p0_effective base
    on base.company_id = product.company_id and base.product_id = product.id
  where product.company_id = p_company
    and product.id = p_product
    and product.is_active
$$;

revoke all on function public.self_order_price_v2(uuid,uuid,uuid,date,boolean) from public, anon, authenticated;
grant execute on function public.self_order_price_v2(uuid,uuid,uuid,date,boolean) to service_role;
notify pgrst, 'reload schema';
commit;
