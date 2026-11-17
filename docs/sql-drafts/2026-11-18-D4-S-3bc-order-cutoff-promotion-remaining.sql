-- D4 S-3b/S-3c draft only. Do not apply without DB owner approval.
-- No application wiring: product cutoff remains OFF while both columns are NULL.
alter table public.product_catalog
  add column if not exists order_cutoff_days_before smallint;
alter table public.product_catalog
  add column if not exists order_cutoff_time time;

alter table public.product_catalog
  drop constraint if exists product_catalog_order_cutoff_days_check,
  add constraint product_catalog_order_cutoff_days_check
    check (order_cutoff_days_before is null or order_cutoff_days_before between 0 and 365),
  drop constraint if exists product_catalog_order_cutoff_pair_check,
  add constraint product_catalog_order_cutoff_pair_check
    check ((order_cutoff_days_before is null) = (order_cutoff_time is null));

comment on column public.product_catalog.order_cutoff_days_before is
  '품목별 주문 마감 일수. 시간과 함께 NULL이면 회사/권역/매장 마감을 사용한다.';
comment on column public.product_catalog.order_cutoff_time is
  '품목별 주문 마감 시각(Asia/Seoul). 일수와 함께 NULL이면 비활성.';

create or replace function public.promotion_remaining_v1(
  p_company uuid,
  p_promotion_ids uuid[]
)
returns table (
  promotion_id uuid,
  stock bigint,
  reserved_quantity numeric,
  remaining_quantity numeric,
  per_store_limit bigint
)
language plpgsql
stable
security definer
set search_path = public, pg_temp
as $$
begin
  if p_company is null or p_promotion_ids is null
    or cardinality(p_promotion_ids) not between 1 and 100
    or array_position(p_promotion_ids, null) is not null then
    raise exception using errcode = '22023', message = 'invalid_promotion_remaining_request';
  end if;

  return query
  select
    promotion.id,
    promotion.stock,
    coalesce(sum(line.quantity) filter (where orders.status <> 'cancelled'), 0)::numeric,
    case when promotion.stock is null then null
      else greatest(promotion.stock - coalesce(sum(line.quantity) filter (where orders.status <> 'cancelled'), 0), 0)::numeric
    end,
    promotion.per_store_limit
  from public.pricing_promotions promotion
  left join public.store_order_lines line
    on line.company_id = promotion.company_id and line.promotion_id = promotion.id
  left join public.store_orders orders
    on orders.company_id = line.company_id and orders.id = line.order_id
  where promotion.company_id = p_company
    and promotion.id = any(p_promotion_ids)
  group by promotion.id, promotion.stock, promotion.per_store_limit
  order by promotion.id;
end;
$$;

revoke all on function public.promotion_remaining_v1(uuid, uuid[]) from public, anon, authenticated;
grant execute on function public.promotion_remaining_v1(uuid, uuid[]) to service_role;
