-- DRAFT ONLY. CX-149: 매장 홈 "받은 단가표 품목" 목록용 읽기 함수. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- self_order_price_v2(CX-148b)와 같은 후보 집합(거래처 전용 링크·가입 문서·발송·회수 안 된 storefront 링크 + 회사 기본 단가표)에서
-- 이 매장이 받은 단가표에 실제로 들어 있는 상품만 돌려준다. 가격은 돌려주지 않는다(가격은 self_order_price_v2에서만).
-- 새 함수 1개, 기존 함수·데이터 변경 없음. 선행: CX-148b.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if coalesce((select position('cx148b' in prosrc) from pg_proc where oid = to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)')), 0) = 0
  then raise exception 'cx149_requires_cx148b'; end if;
  if to_regprocedure('public.received_document_products_v1(uuid,uuid,date)') is not null then raise exception 'cx149_already_applied'; end if;
end $$;

create function public.received_document_products_v1(p_company uuid, p_customer uuid, p_date date)
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
$$;

revoke all on function public.received_document_products_v1(uuid, uuid, date) from public, anon, authenticated;
grant execute on function public.received_document_products_v1(uuid, uuid, date) to service_role;
notify pgrst, 'reload schema';
commit;
