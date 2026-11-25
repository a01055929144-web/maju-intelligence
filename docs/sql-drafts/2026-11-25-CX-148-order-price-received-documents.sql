-- DRAFT ONLY. CX-148: 주문가(self_order_price_v2)가 "매장이 받은 단가표"를 따르게 한다. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 원인(운영 읽기 확인): 홍곱창은 customer_pricing_document_links가 0건이라 promise 가격이 비고 base로 떨어짐 + 행사(promotionId) 줄은 함수가 제외 + 최신 단가표 v5(버터 6,845)와 기본가(6,850) 반올림 차이.
-- 변경: 후보 문서 = (a) 기존 customer_pricing_document_links (b) 이 거래처가 가입에 쓴 문서(store_owner_activation_requests, 최신 게시 버전) (c) 이 거래처 앞 발송(pricing_document_sends sent/viewed/accepted).
--       후보 중 가장 최근 게시 버전의 줄 가격을 단가표 화면과 같은 규칙(documentDisplayPrice)으로 반환. 행사 줄은 startsOn~endsOn·재고가 남았을 때만. 후보에 없으면 기존처럼 catalog → base.
-- 시그니처·반환 열·권한은 그대로(create or replace). 데이터 변경 없음.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)') is null
    or to_regclass('public.pricing_document_sends') is null or to_regclass('public.store_owner_activation_requests') is null
    or to_regclass('public.pricing_documents') is null or to_regclass('public.customer_pricing_document_links') is null
  then raise exception 'cx148_prerequisites_required'; end if;
  if (select position('cx148' in prosrc) from pg_proc where oid = 'public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure) > 0
  then raise exception 'cx148_already_applied'; end if;
end $$;

create or replace function public.self_order_price_v2(
  p_company uuid, p_customer uuid, p_product uuid, p_date date, p_include_promise boolean default true
)
returns table (price bigint, tax_type text, includes_tax boolean, market boolean, source text, promise_until date)
language sql stable security definer set search_path = '' as $$
  -- cx148: received-document price
  select
    case
      when product.order_pricing_mode = 'market' then null
      else coalesce(promise.price, catalog.price, nullif(base.price, 0))
    end,
    coalesce(promise.tax_type, product.tax_type),
    coalesce(promise.includes_tax, false),
    product.order_pricing_mode = 'market',
    case
      when product.order_pricing_mode = 'market' then 'market'
      when promise.price is not null then 'promise'
      when catalog.price is not null then 'catalog'
      when base.price > 0 then 'base'
      else 'unavailable'
    end,
    case when promise.price is not null then promise.promise_until end
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
