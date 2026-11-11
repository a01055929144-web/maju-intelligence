-- DRAFT ONLY (CC-24). Never run against production without the CEO's explicit approval phrase.
-- Product delete: products nobody has used are deleted for good; products that appear in orders, documents,
-- stock, contract prices, receipts or deliveries are only hidden (is_active = false) so history stays intact.
-- One function, one transaction. p_apply = false only counts (the confirm dialog shows both numbers first).
-- Service-only: no anon/authenticated grants; the app server enforces company boundaries and roles.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.cc24_delete_products(uuid,uuid[],boolean)') is not null then raise exception 'cc24_already_applied'; end if;
  if to_regclass('public.product_catalog') is null then raise exception 'cc24_dependency_missing'; end if;
end $$;

-- A product counts as "used" when any of these history tables points at it. The list matches the foreign keys that
-- RESTRICT the delete or would null out / hide history (checked on production 2026-11-11). A table that does not
-- exist in a database cannot hold references, so it is skipped. Pure derived rows (pricing_items, margin templates,
-- promotions, price history, unit conversions, store preferences) are removed with the product by their own cascades.
create function public.cc24_delete_products(p_company uuid, p_ids uuid[], p_apply boolean default false) returns jsonb
language plpgsql security invoker set search_path = public,pg_temp as $$
declare
  refs constant text[][] := array[
    ['business_document_lines','product_catalog_id'], ['customer_price_agreements','product_catalog_id'],
    ['delivery_event_items','product_id'], ['inventory_balances','product_catalog_id'],
    ['inventory_document_positions','product_catalog_id'], ['inventory_movements','product_catalog_id'],
    ['inventory_stocktake_lines','product_catalog_id'], ['purchase_receipt_lines','product_catalog_id'],
    ['purchase_receipt_line_overrides','product_catalog_id'], ['sales_offer_items','product_id'],
    ['sales_quote_items','product_catalog_id'], ['store_order_lines','product_id']];
  ids uuid[]; used uuid[] := '{}'; part uuid[]; i integer; del integer := 0; hid integer := 0;
begin
  if p_ids is null or cardinality(p_ids) = 0 or cardinality(p_ids) > 500 then raise exception 'cc24_invalid_ids'; end if;
  perform pg_advisory_xact_lock(hashtextextended('cc24:' || p_company::text, 0));
  -- Only this company's products count; ids that do not exist (or belong to another company) are ignored.
  select coalesce(array_agg(id), '{}') into ids from public.product_catalog where company_id = p_company and id = any(p_ids);
  for i in 1 .. array_length(refs, 1) loop
    if to_regclass('public.' || refs[i][1]) is not null then
      execute format('select coalesce(array_agg(distinct %I), ''{}'') from public.%I where %I = any($1)', refs[i][2], refs[i][1], refs[i][2]) into part using ids;
      used := used || part;
    end if;
  end loop;
  select count(*) into hid from (select distinct u from unnest(used) u) s;
  del := cardinality(ids) - hid;
  if p_apply then
    delete from public.product_catalog where company_id = p_company and id = any(ids) and not (id = any(used));
    update public.product_catalog set is_active = false, updated_at = now() where company_id = p_company and id = any(used) and is_active;
  end if;
  return jsonb_build_object('requested', cardinality(p_ids), 'found', cardinality(ids), 'deletable', del, 'hideOnly', hid, 'applied', p_apply);
end $$;

revoke all on function public.cc24_delete_products(uuid,uuid[],boolean) from public,anon,authenticated;
grant execute on function public.cc24_delete_products(uuid,uuid[],boolean) to service_role;
commit;
