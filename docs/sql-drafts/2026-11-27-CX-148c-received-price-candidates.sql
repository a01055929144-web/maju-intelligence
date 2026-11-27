-- DRAFT ONLY: CX-148c. No production execution; representative approval and controller preflight required.
-- Existing service-only RPC signatures and security modes retained. No data, publication, order or feature changes.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $guard$ begin
 if coalesce((select position('cx148b' in prosrc) from pg_proc where oid=to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)')),0)=0
 or to_regprocedure('public.received_document_products_v1(uuid,uuid,date)') is null then raise exception 'cx148c_requires_cx148b_and_cx149'; end if;
 if to_regprocedure('public.received_document_price_candidates_v1(uuid,uuid,date)') is not null then raise exception 'cx148c_already_applied'; end if;
end $guard$;
create function public.received_document_price_candidates_v1(p_company uuid, p_customer uuid, p_date date)
returns table(product_id uuid, price bigint, tax_type text, includes_tax boolean, promise_until date, badge text, ends_on date)
language sql stable security invoker set search_path = '' as $cx148c$
  with versions as (
    select link.document_version_id as version_id, link.linked_at as received_at, 0 as priority
      from public.customer_pricing_document_links link
      where link.company_id = p_company and link.customer_id = p_customer and link.active
    union all
    select (select v.id from public.pricing_document_versions v
        join public.pricing_documents d on d.company_id = v.company_id and d.id = v.document_id and d.archived_at is null
        where v.company_id = req.company_id and v.document_id = req.document_id and v.published_at is not null
        order by v.published_at desc, v.id desc limit 1), req.consumed_at, 0
      from public.store_owner_activation_requests req
      where req.company_id = p_company and req.customer_id = p_customer
        and req.document_id is not null and req.consumed_at is not null and req.cancelled_at is null
    union all
    select send.document_version_id, send.sent_at, 0
      from public.pricing_document_sends send
      where send.company_id = p_company and send.customer_id = p_customer and send.acceptance_status in ('sent', 'viewed', 'accepted')
    union all
    select (select v.id from public.pricing_document_versions v
        join public.pricing_documents d on d.company_id = v.company_id and d.id = v.document_id and d.archived_at is null
        where v.company_id = sl.company_id
          and v.document_id = (select v0.document_id from public.pricing_document_versions v0 where v0.company_id = sl.company_id and v0.id = sl.document_version_id)
          and v.published_at is not null
        order by v.published_at desc, v.id desc limit 1), sl.issued_at, 0
      from public.storefront_links sl
      where sl.company_id = p_company and sl.customer_id = p_customer and sl.document_version_id is not null
        and sl.revoked_at is null and sl.expires_at > now()
    union all
    -- 회사 기본 단가표(홈의 받은 단가표): 지정 문서 우선, 없으면 최근 수정한 게시 sheet, 활성 공개 링크가 있을 때만
    select (select v.id from public.pricing_document_versions v
        where v.company_id = p_company and v.document_id = def.document_id and v.published_at is not null
        order by v.published_at desc, v.id desc limit 1), null::timestamptz, 1
      from (
        select d.id as document_id
          from public.pricing_documents d
          where d.company_id = p_company and d.kind = 'sheet' and d.archived_at is null
            and exists (select 1 from public.pricing_document_versions v where v.company_id = d.company_id and v.document_id = d.id and v.published_at is not null)
          order by (d.id = (select pd.document_id from public.pricing_default_public_documents pd where pd.company_id = p_company)) desc nulls last, d.updated_at desc, d.id desc
          limit 1
      ) def
      where exists (select 1 from public.pricing_document_share_links s where s.company_id = p_company and s.document_id = def.document_id
        and s.lead_id is null and s.send_id is null and s.revoked_at is null and s.expires_at > now())
  ), lines as (
    select line.value as line, version.content as content, versions.priority, versions.received_at, version.published_at, version.id as version_id, line.ordinality
      from versions
      join public.pricing_document_versions version on version.company_id = p_company and version.id = versions.version_id
      join public.pricing_documents document on document.company_id = version.company_id and document.id = version.document_id and document.archived_at is null
      cross join lateral jsonb_array_elements(version.content->'lines') with ordinality line(value, ordinality)
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
  select distinct on (product.id) product.id,
    case when l.line->>'priceIncludesTax' = 'true' then (l.line->>'price')::bigint
      when l.line->>'taxType' = 'taxable' and coalesce((l.content #>> '{display,priceIncludesTax}')::boolean, false)
        then round((l.line->>'price')::numeric * 1.1)::bigint
      else (l.line->>'price')::bigint end,
    l.line->>'taxType',
    coalesce(l.line->>'priceIncludesTax' = 'true', false) or coalesce((l.content #>> '{display,priceIncludesTax}')::boolean, false),
    case when nullif(l.line->>'endsOn', '') is not null
      then least((l.content->>'validUntil')::date, (l.line->>'endsOn')::date) else (l.content->>'validUntil')::date end,
    case when nullif(l.line->>'promotionId', '') is not null then '행사' else '' end,
    case when nullif(l.line->>'promotionId', '') is not null and nullif(l.line->>'endsOn', '') is not null
      then least((l.content->>'validUntil')::date, (l.line->>'endsOn')::date) end
  from lines l
  join public.product_catalog product on product.company_id = p_company and product.id::text = l.line->>'productId'
    and product.sales_unit = l.line->>'unit' and product.is_active
  order by product.id, l.priority, l.published_at desc,
    (nullif(l.line->>'promotionId', '') is not null) desc, l.received_at desc nulls last, l.version_id desc, l.ordinality
$cx148c$;
revoke all on function public.received_document_price_candidates_v1(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.received_document_price_candidates_v1(uuid,uuid,date) to service_role;

do $price_ddl$ begin
 execute replace($definition$create or replace function public.self_order_price_v2(p_company uuid, p_customer uuid, p_product uuid, p_date date, p_include_promise boolean default true)
returns table(price bigint, tax_type text, includes_tax boolean, market boolean, source text, promise_until date)
language sql stable security definer set search_path = '' as $cx148c$
 -- cx148c: received store document -> default sheet -> margin catalog -> base.
 select case when product.order_pricing_mode = 'market' then null else coalesce(document.price,catalog.price,nullif(base.price,0)) end,
   coalesce(document.tax_type,product.tax_type),coalesce(document.includes_tax,false),product.order_pricing_mode = 'market',
   case when product.order_pricing_mode = 'market' then 'market' when document.price is not null then 'promise'
     when catalog.price is not null then 'catalog' when base.price > 0 then 'base' else 'unavailable' end,
   case when document.price is not null then document.promise_until end
 from public.product_catalog product
 left join lateral (select * from public.received_document_price_candidates_v1(p_company,p_customer,p_date) candidate
   where p_include_promise and candidate.product_id = p_product) document on true
 left join lateral (select nullif(public.margin_template_price_v1(p_company,p_customer,p_product),0) as price) catalog on true
 left join public.pricing_p0_effective base on base.company_id = product.company_id and base.product_id = product.id
 where product.company_id = p_company and product.id = p_product and product.is_active
$cx148c$;$definition$, 'security definer',
  case when (select prosecdef from pg_proc where oid='public.self_order_price_v2(uuid,uuid,uuid,date,boolean)'::regprocedure) then 'security definer' else 'security invoker' end);
end $price_ddl$;
do $list_ddl$ begin
 execute replace($definition$create or replace function public.received_document_products_v1(p_company uuid, p_customer uuid, p_date date)
returns table(product_id uuid,badge text,ends_on date)
language sql stable security definer set search_path = '' as $cx148c$
 select candidate.product_id,candidate.badge,candidate.ends_on
 from public.received_document_price_candidates_v1(p_company,p_customer,p_date) candidate
$cx148c$;$definition$, 'security definer',
  case when (select prosecdef from pg_proc where oid='public.received_document_products_v1(uuid,uuid,date)'::regprocedure) then 'security definer' else 'security invoker' end);
end $list_ddl$;
revoke all on function public.self_order_price_v2(uuid,uuid,uuid,date,boolean),public.received_document_products_v1(uuid,uuid,date) from public,anon,authenticated;
grant execute on function public.self_order_price_v2(uuid,uuid,uuid,date,boolean),public.received_document_products_v1(uuid,uuid,date) to service_role;
notify pgrst,'reload schema';
commit;
