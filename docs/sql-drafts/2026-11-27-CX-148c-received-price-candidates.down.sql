-- DOWN CX-148c: restore the reviewed CX-148b/CX-149 definitions before dropping the shared helper. No data rewrite.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $guard$ begin
 if coalesce((select position('cx148c' in prosrc) from pg_proc where oid=to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)')),0)=0 then raise exception 'cx148c_not_applied'; end if;
end $guard$;
do $price_ddl$ begin
 execute replace($definition$create or replace function public.self_order_price_v2(
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
$$;$definition$, 'security definer',
  case when (select prosecdef from pg_proc where oid='public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure) then 'security definer' else 'security invoker' end);
end $price_ddl$;

revoke all on function public.self_order_price_v2(uuid,uuid,uuid,date,boolean) from public, anon, authenticated;
grant execute on function public.self_order_price_v2(uuid,uuid,uuid,date,boolean) to service_role;
do $list_ddl$ begin
 execute replace($definition$create or replace function public.received_document_products_v1(p_company uuid, p_customer uuid, p_date date)
returns table (product_id uuid, badge text, ends_on date)
language sql stable security definer set search_path = '' as $$
  with versions as (
    select link.document_version_id as version_id
      from public.customer_pricing_document_links link
      where link.company_id = p_company and link.customer_id = p_customer and link.active
    union all
    select (select v.id from public.pricing_document_versions v
        join public.pricing_documents d on d.company_id = v.company_id and d.id = v.document_id and d.archived_at is null
        where v.company_id = req.company_id and v.document_id = req.document_id and v.published_at is not null
        order by v.published_at desc limit 1)
      from public.store_owner_activation_requests req
      where req.company_id = p_company and req.customer_id = p_customer
        and req.document_id is not null and req.consumed_at is not null and req.cancelled_at is null
    union all
    select send.document_version_id
      from public.pricing_document_sends send
      where send.company_id = p_company and send.customer_id = p_customer and send.acceptance_status in ('sent', 'viewed', 'accepted')
    union all
    select (select v.id from public.pricing_document_versions v
        join public.pricing_documents d on d.company_id = v.company_id and d.id = v.document_id and d.archived_at is null
        where v.company_id = sl.company_id
          and v.document_id = (select v0.document_id from public.pricing_document_versions v0 where v0.company_id = sl.company_id and v0.id = sl.document_version_id)
          and v.published_at is not null
        order by v.published_at desc limit 1)
      from public.storefront_links sl
      where sl.company_id = p_company and sl.customer_id = p_customer and sl.document_version_id is not null
        and sl.revoked_at is null and sl.expires_at > now()
    union all
    -- 회사 기본 단가표(홈의 받은 단가표): 지정 문서 우선, 없으면 최근 수정한 게시 sheet, 활성 공개 링크가 있을 때만
    select (select v.id from public.pricing_document_versions v
        where v.company_id = p_company and v.document_id = def.document_id and v.published_at is not null
        order by v.published_at desc limit 1)
      from (
        select d.id as document_id
          from public.pricing_documents d
          where d.company_id = p_company and d.kind = 'sheet' and d.archived_at is null
            and exists (select 1 from public.pricing_document_versions v where v.company_id = d.company_id and v.document_id = d.id and v.published_at is not null)
          order by (d.id = (select pd.document_id from public.pricing_default_public_documents pd where pd.company_id = p_company)) desc, d.updated_at desc
          limit 1
      ) def
      where exists (select 1 from public.pricing_document_share_links s where s.company_id = p_company and s.document_id = def.document_id
        and s.lead_id is null and s.send_id is null and s.revoked_at is null and s.expires_at > now())
  ), lines as (
    select line.value as line, version.content as content
      from versions
      join public.pricing_document_versions version on version.company_id = p_company and version.id = versions.version_id
      cross join lateral jsonb_array_elements(version.content->'lines') line(value)
      where version.published_at is not null
        and coalesce((version.content->>'showPrice')::boolean, false)
        and (version.content->>'validUntil')::date >= p_date
        and coalesce((line.value->>'visible')::boolean, false)
        and (line.value->>'price')::bigint > 0
        and (nullif(line.value->>'promotionId', '') is null
          or ((nullif(line.value->>'startsOn', '') is null or (line.value->>'startsOn')::date <= p_date)
            and (nullif(line.value->>'endsOn', '') is null or (line.value->>'endsOn')::date >= p_date)
            and (nullif(line.value->>'remaining', '') is null or (line.value->>'remaining')::numeric > 0)))
  )
  select product.id,
    case when bool_or(nullif(l.line->>'promotionId', '') is not null) then '행사' else '' end,
    max(case when nullif(l.line->>'promotionId', '') is not null and nullif(l.line->>'endsOn', '') is not null
      then least((l.content->>'validUntil')::date, (l.line->>'endsOn')::date) end)
  from lines l
  join public.product_catalog product
    on product.company_id = p_company and product.id::text = l.line->>'productId' and product.sales_unit = l.line->>'unit' and product.is_active
  group by product.id
$$;$definition$, 'security definer',
  case when (select prosecdef from pg_proc where oid='public.received_document_products_v1(uuid,uuid,date)'::regprocedure) then 'security definer' else 'security invoker' end);
end $list_ddl$;

revoke all on function public.received_document_products_v1(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.received_document_products_v1(uuid, uuid, date) to service_role;

drop function public.received_document_price_candidates_v1(uuid,uuid,date);
notify pgrst,'reload schema';
commit;
