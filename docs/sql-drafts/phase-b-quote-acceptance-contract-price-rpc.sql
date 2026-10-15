-- Phase B P2-2 검토용 초안. 운영 DB에 실행하지 마세요.
-- 목적: 기존 계약 종료/취소, 신규 계약 생성, 견적 수락을 한 트랜잭션에서 처리합니다.
create or replace function public.accept_sales_quote_and_apply_prices(
  p_company_id uuid,
  p_quote_id uuid,
  p_actor_name text default null,
  p_effective_date date default (now() at time zone 'Asia/Seoul')::date
)
returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_quote public.sales_quotes%rowtype;
  v_item record;
  v_tax_type text;
  v_applied_count integer := 0;
  v_tax_unconfirmed_count integer := 0;
  v_unlinked_count integer := 0;
begin
  select * into v_quote
  from public.sales_quotes
  where company_id = p_company_id and id = p_quote_id
  for update;

  if not found then
    raise exception '이 회사의 견적을 찾지 못했습니다.' using errcode = 'P0002';
  end if;
  if v_quote.status not in ('sent', 'accepted') then
    raise exception '발행한 견적만 수락 처리할 수 있습니다.' using errcode = 'P0001';
  end if;
  if v_quote.status = 'accepted' and v_quote.pricing_applied_at is not null then
    return jsonb_build_object('already_applied', true, 'applied_count', 0, 'tax_unconfirmed_count', 0, 'unlinked_count', 0, 'pending_customer_conversion', false);
  end if;

  if v_quote.customer_id is null then
    update public.sales_quotes set
      accepted_at = coalesce(accepted_at, now()), accepted_by_name = p_actor_name,
      accepted_via = 'staff', status = 'accepted', updated_at = now()
    where company_id = p_company_id and id = p_quote_id;
    return jsonb_build_object('already_applied', false, 'applied_count', 0, 'tax_unconfirmed_count', 0, 'unlinked_count', 0, 'pending_customer_conversion', true);
  end if;

  for v_item in
    select qi.*, pc.tax_type as catalog_tax_type
    from public.sales_quote_items qi
    left join public.product_catalog pc
      on pc.company_id = qi.company_id and pc.id = qi.product_catalog_id
    where qi.company_id = p_company_id and qi.quote_id = p_quote_id
    order by qi.sort_order, qi.id
  loop
    if v_item.product_catalog_id is null then
      v_unlinked_count := v_unlinked_count + 1;
      continue;
    end if;
    v_tax_type := case
      when v_item.tax_type_snapshot in ('taxable', 'exempt') then v_item.tax_type_snapshot
      when v_item.catalog_tax_type in ('taxable', 'exempt') then v_item.catalog_tax_type
      else null
    end;
    if v_tax_type is null then
      v_tax_unconfirmed_count := v_tax_unconfirmed_count + 1;
      continue;
    end if;

    update public.customer_price_agreements set
      effective_until = case when effective_from >= p_effective_date then null else p_effective_date - 1 end,
      status = case when effective_from >= p_effective_date then 'cancelled' else 'ended' end,
      ended_by_name = p_actor_name, ended_at = now(), updated_at = now()
    where company_id = p_company_id
      and customer_id = v_quote.customer_id
      and product_catalog_id = v_item.product_catalog_id
      and status = 'active';

    insert into public.customer_price_agreements (
      company_id, customer_id, product_catalog_id, sales_unit, unit_price, tax_type,
      price_includes_tax, effective_from, status, source_quote_id, source_quote_item_id, created_by_name
    ) values (
      p_company_id, v_quote.customer_id, v_item.product_catalog_id,
      coalesce(nullif(v_item.sales_unit_snapshot, ''), nullif(v_item.unit, ''), 'EA'),
      round(v_item.sales_unit_price)::bigint, v_tax_type, false, p_effective_date,
      'active', p_quote_id, v_item.id, p_actor_name
    );
    v_applied_count := v_applied_count + 1;
  end loop;

  update public.sales_quotes set
    accepted_at = coalesce(accepted_at, now()), accepted_by_name = p_actor_name,
    accepted_via = 'staff', pricing_applied_at = now(), status = 'accepted', updated_at = now()
  where company_id = p_company_id and id = p_quote_id;

  return jsonb_build_object(
    'already_applied', false,
    'applied_count', v_applied_count,
    'tax_unconfirmed_count', v_tax_unconfirmed_count,
    'unlinked_count', v_unlinked_count,
    'pending_customer_conversion', false
  );
end;
$$;

revoke all on function public.accept_sales_quote_and_apply_prices(uuid, uuid, text, date)
  from public, anon, authenticated;
grant execute on function public.accept_sales_quote_and_apply_prices(uuid, uuid, text, date)
  to service_role;

-- 롤백 초안
-- drop function if exists public.accept_sales_quote_and_apply_prices(uuid, uuid, text, date);
