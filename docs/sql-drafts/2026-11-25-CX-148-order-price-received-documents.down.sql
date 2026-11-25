-- DOWN: CX-148. self_order_price_v2를 CX-120(운영 현재) 본문으로 되돌린다. 데이터 변경 없음.
begin;
set local lock_timeout = '3s';
create or replace function public.self_order_price_v2(
  p_company uuid,
  p_customer uuid,
  p_product uuid,
  p_date date,
  p_include_promise boolean default true
)
returns table (
  price bigint,
  tax_type text,
  includes_tax boolean,
  market boolean,
  source text,
  promise_until date
)
language sql stable security definer set search_path = '' as $$
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
        when line.value->>'taxType' = 'taxable'
          and coalesce((version.content #>> '{display,priceIncludesTax}')::boolean, false)
          then round((line.value->>'price')::numeric * 1.1)::bigint
        else (line.value->>'price')::bigint
      end as price,
      line.value->>'taxType' as tax_type,
      coalesce((version.content #>> '{display,priceIncludesTax}')::boolean, false) as includes_tax,
      (version.content->>'validUntil')::date as promise_until
    from public.customer_pricing_document_links link
    join public.pricing_document_versions version
      on version.company_id = link.company_id
     and version.document_id = link.document_id
     and version.id = link.document_version_id
    cross join lateral jsonb_array_elements(version.content->'lines') line(value)
    where p_include_promise
      and link.company_id = p_company
      and link.customer_id = p_customer
      and link.active
      and version.published_at is not null
      and coalesce((version.content->>'showPrice')::boolean, false)
      and (version.content->>'validUntil')::date >= p_date
      and line.value->>'productId' = product.id::text
      and line.value->>'unit' = product.sales_unit
      and coalesce((line.value->>'visible')::boolean, false)
      and nullif(line.value->>'promotionId', '') is null
      and (line.value->>'price')::bigint > 0
    order by version.published_at desc, link.linked_at desc, link.id desc
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
