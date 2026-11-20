-- Refuse rollback once included-price document evidence exists.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';
do $$ begin
  if exists(select 1 from public.business_document_lines where price_includes_tax_snapshot) then
    raise exception 'cx38b_down_refused_included_price_evidence';
  end if;
end $$;

do $patch$
declare fn regprocedure := 'public.save_business_document(uuid,uuid,uuid,date,text,jsonb,uuid,text,text)'::regprocedure;
  definition text := pg_get_functiondef(fn); acl aclitem[];
begin
  select proacl into acl from pg_proc where oid=fn;
  if regexp_count(definition,'tax_type_snapshot,\s*quantity,\s*unit_price,\s*price_includes_tax_snapshot,\s*memo\s*\)')<>1
    or regexp_count(definition,
      'round\(\(x\.line->>''unit_price''\)::numeric\)::bigint,\s*coalesce\(\(x\.line->>''price_includes_tax''\)::boolean,\s*false\),\s*nullif\(btrim\(x\.line->>''memo''\),\s*''''\)')<>1
    then raise exception 'cx38b_down_save_function_definition_changed'; end if;
  definition:=regexp_replace(definition,'tax_type_snapshot,\s*quantity,\s*unit_price,\s*price_includes_tax_snapshot,\s*memo\s*\)',
    'tax_type_snapshot, quantity, unit_price, memo)');
  definition:=regexp_replace(definition,
    'round\(\(x\.line->>''unit_price''\)::numeric\)::bigint,\s*coalesce\(\(x\.line->>''price_includes_tax''\)::boolean,\s*false\),\s*nullif\(btrim\(x\.line->>''memo''\),\s*''''\)',
    'round((x.line->>''unit_price'')::numeric)::bigint, nullif(btrim(x.line->>''memo''), '''')');
  execute definition;
  if (select proacl from pg_proc where oid=fn) is distinct from acl then raise exception 'cx38b_down_acl_changed'; end if;
end $patch$;

do $patch$
declare fn regprocedure := 'public.revise_order_sale_document(uuid,uuid,integer,uuid,text,text)'::regprocedure;
  definition text:=pg_get_functiondef(fn); acl aclitem[];
begin
  select proacl into acl from pg_proc where oid=fn;
  if regexp_count(definition,
    '''unit_price'',\s*l\.unit_price,\s*''price_includes_tax'',\s*l\.price_includes_tax_snapshot,\s*''memo'',\s*l\.memo')<>1
    then raise exception 'cx38b_down_revise_function_definition_changed'; end if;
  definition:=regexp_replace(definition,
    '''unit_price'',\s*l\.unit_price,\s*''price_includes_tax'',\s*l\.price_includes_tax_snapshot,\s*''memo'',\s*l\.memo',
    '''unit_price'', l.unit_price, ''memo'', l.memo');
  execute definition;
  if (select proacl from pg_proc where oid=fn) is distinct from acl then raise exception 'cx38b_down_revise_acl_changed'; end if;
end $patch$;

create or replace function public.order_sale_document_lines(p_company_id uuid,p_order_id uuid)
returns jsonb language plpgsql security definer set search_path='' as $$
declare v_lines jsonb; v_delivery_fee bigint;
begin
 select o.delivery_fee into v_delivery_fee from public.store_orders o where o.company_id=p_company_id and o.id=p_order_id;
 if not found then raise exception 'order_not_found'; end if;
 select coalesce(jsonb_agg(jsonb_build_object(
  'product_catalog_id',l.product_id,'product_code',p.product_code,'product_name',l.product_name,
  'specification',nullif(l.specification,''),'unit',coalesce(nullif(l.sales_unit,''),'EA'),
  'tax_type',l.tax_type,'quantity',l.quantity,'unit_price',case
    when l.is_market_price then public.pricing_p0_price(e.cost,e.effective_margin_bp,e.effective_rounding)
    when l.price_includes_tax and l.tax_type='taxable' then round(l.unit_price/1.1)::bigint else l.unit_price end,
  'memo',case when l.is_market_price then '시가(제안)' else null end) order by l.id),'[]'::jsonb)
 into v_lines from public.store_order_lines l join public.product_catalog p on p.company_id=l.company_id and p.id=l.product_id
 left join public.pricing_p0_effective e on e.company_id=l.company_id and e.product_id=l.product_id
 where l.company_id=p_company_id and l.order_id=p_order_id;
 if jsonb_array_length(v_lines)=0 then raise exception 'order_lines_required'; end if;
 if exists(select 1 from public.store_order_lines l left join public.pricing_p0_effective e on e.company_id=l.company_id and e.product_id=l.product_id
   where l.company_id=p_company_id and l.order_id=p_order_id and l.is_market_price and (e.product_id is null or e.cost is null or e.cost<=0))
   then raise exception 'market_price_basis_unavailable'; end if;
 if v_delivery_fee>0 then v_lines:=v_lines||jsonb_build_array(jsonb_build_object(
  'product_catalog_id',null,'product_code',null,'product_name','배송비','specification',null,'unit','건','tax_type','taxable',
  'quantity',1,'unit_price',round(v_delivery_fee/1.1)::bigint,'memo','주문 배송비(과세)')); end if;
 return v_lines;
end $$;

alter table public.business_document_lines
  drop column total_amount, drop column tax_amount, drop column supply_amount,
  drop column price_includes_tax_snapshot,
  add column supply_amount bigint generated always as (round(quantity*unit_price)::bigint) stored,
  add column tax_amount bigint generated always as (case when tax_type_snapshot='taxable' then round(round(quantity*unit_price)*0.1)::bigint else 0 end) stored,
  add column total_amount bigint generated always as (
    round(quantity*unit_price)::bigint + case when tax_type_snapshot='taxable' then round(round(quantity*unit_price)*0.1)::bigint else 0 end) stored;
commit;
