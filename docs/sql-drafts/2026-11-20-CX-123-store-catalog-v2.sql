-- CX-123 review draft only. Do not apply to production without DB approval.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)') is not null then
    raise exception 'cx123_already_applied';
  end if;
  if to_regclass('public.store_accounts') is null
    or to_regclass('public.product_catalog') is null
    or to_regclass('public.product_categories') is null
    or to_regclass('public.pricing_promotions') is null
    or to_regprocedure('public.self_order_member(uuid,uuid,uuid)') is null
    or to_regprocedure('public.store_order_eligibility(uuid,uuid,uuid)') is null
    or to_regprocedure('public.self_order_price_v2(uuid,uuid,uuid,date,boolean)') is null
  then raise exception 'cx123_dependency_missing'; end if;
  if not exists (
    select 1 from information_schema.columns
    where table_schema='public' and table_name='product_catalog'
      and column_name in ('order_cutoff_days_before','order_cutoff_time')
    group by table_schema,table_name having count(*)=2
  ) then raise exception 'cx123_cutoff_dependency_missing'; end if;
end $$;

-- Until CX-122 exists, preserve the current rule: prices are visible only when ordering is eligible.
-- Once CX-122 is applied, its manual food-service confirmation is the sole visibility decision.
create function public.cx123_store_price_visible(
  p_company uuid,
  p_store_account uuid,
  p_order_blockers text[]
) returns boolean
language plpgsql stable security definer set search_path = '' as $$
declare result boolean;
begin
  if to_regprocedure('public.store_price_visible_v1(uuid,uuid)') is null then
    return cardinality(p_order_blockers) = 0;
  end if;
  execute 'select public.store_price_visible_v1($1,$2)'
    into result using p_company,p_store_account;
  return coalesce(result,false);
end $$;

create function public.store_member_catalog_v2(
  p_account uuid,
  p_user uuid,
  p_date date,
  p_company uuid default null,
  p_large_category text default null,
  p_middle_category text default null,
  p_small_category text default null,
  p_search text default null,
  p_page integer default 1
) returns table (
  company_id uuid,
  store_account_id uuid,
  order_blockers text[],
  can_order boolean,
  price_visible boolean,
  product_id uuid,
  product_name text,
  sales_spec text,
  sales_unit text,
  photo_url text,
  large_category text,
  middle_category text,
  small_category text,
  tax_type text,
  price bigint,
  includes_tax boolean,
  market boolean,
  price_source text,
  promise_until date,
  order_cutoff_days_before smallint,
  order_cutoff_time time,
  promotions jsonb
)
language plpgsql stable security definer set search_path = '' as $$
begin
  if p_account is null or p_user is null or p_date is null or p_page not between 1 and 10000 then
    raise exception using errcode='22023',message='invalid_store_catalog_request';
  end if;

  return query
  with anchor as (
    select account.store_profile_id,account.id
    from public.store_accounts account
    where account.id=p_account
      and public.self_order_member(account.company_id,account.id,p_user) is not null
  ), scopes as materialized (
    select account.company_id,account.id,account.customer_id,
      public.store_order_eligibility(account.company_id,account.id,p_user) blockers
    from anchor
    join public.store_accounts account
      on account.store_profile_id=anchor.store_profile_id or account.id=anchor.id
    where (p_company is null or account.company_id=p_company)
      and public.self_order_member(account.company_id,account.id,p_user) is not null
  ), visible_scopes as materialized (
    select scopes.*,
      public.cx123_store_price_visible(scopes.company_id,scopes.id,scopes.blockers) show_price
    from scopes
  ), catalog as (
    select scope.company_id,scope.id store_account_id,scope.blockers,scope.show_price,
      product.id product_id,
      coalesce(nullif(btrim(product.sales_product_name),''),nullif(btrim(product.canonical_name),''),product.purchase_product_name) product_name,
      product.sales_spec,product.sales_unit,product.photo_url,
      case category.level when 1 then category.name when 2 then parent.name else grandparent.name end large_category,
      case category.level when 2 then category.name when 3 then parent.name end middle_category,
      case category.level when 3 then category.name end small_category,
      priced.tax_type,priced.price,priced.includes_tax,priced.market,priced.source,priced.promise_until,
      product.order_cutoff_days_before,product.order_cutoff_time,
      coalesce(promotion.items,'[]'::jsonb) promotions
    from visible_scopes scope
    join public.product_catalog product on product.company_id=scope.company_id and product.is_active
    left join public.product_categories category
      on category.company_id=product.company_id and category.id=product.category_id and category.is_active
    left join public.product_categories parent
      on parent.company_id=category.company_id and parent.id=category.parent_id and parent.is_active
    left join public.product_categories grandparent
      on grandparent.company_id=parent.company_id and grandparent.id=parent.parent_id and grandparent.is_active
    cross join lateral public.self_order_price_v2(scope.company_id,scope.customer_id,product.id,p_date,true) priced
    left join lateral (
      select jsonb_agg(jsonb_build_object(
        'id',active.id,'name',active.display_name,
        'price',case when scope.show_price then active.price end,
        'taxType',active.tax_type,'badge',active.badge,'endsOn',active.ends_on,
        'stock',active.stock,'perStoreLimit',active.per_store_limit
      ) order by active.ends_on,active.id) items
      from public.pricing_promotions active
      where active.company_id=product.company_id and active.product_id=product.id
        and p_date between active.starts_on and active.ends_on
        and (active.stock is null or active.stock>0)
    ) promotion on true
  )
  select catalog.company_id,catalog.store_account_id,catalog.blockers,
    cardinality(catalog.blockers)=0,catalog.show_price,catalog.product_id,catalog.product_name,
    catalog.sales_spec,catalog.sales_unit,catalog.photo_url,catalog.large_category,
    catalog.middle_category,catalog.small_category,catalog.tax_type,
    case when catalog.show_price then catalog.price end,
    case when catalog.show_price then catalog.includes_tax end,
    catalog.market,case when catalog.show_price then catalog.source end,
    case when catalog.show_price then catalog.promise_until end,
    catalog.order_cutoff_days_before,catalog.order_cutoff_time,catalog.promotions
  from catalog
  where (nullif(btrim(p_large_category),'') is null or catalog.large_category=p_large_category)
    and (nullif(btrim(p_middle_category),'') is null or catalog.middle_category=p_middle_category)
    and (nullif(btrim(p_small_category),'') is null or catalog.small_category=p_small_category)
    and (nullif(btrim(p_search),'') is null or position(lower(btrim(p_search)) in lower(
      concat_ws(' ',catalog.product_name,catalog.sales_spec,catalog.sales_unit)
    ))>0)
  order by catalog.company_id,catalog.product_name,catalog.product_id
  limit 50 offset ((p_page-1)*50);
end $$;

revoke all on function public.cx123_store_price_visible(uuid,uuid,text[]) from public,anon,authenticated,service_role;
revoke all on function public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)
  from public,anon,authenticated;
grant execute on function public.store_member_catalog_v2(uuid,uuid,date,uuid,text,text,text,text,integer)
  to service_role;

commit;
