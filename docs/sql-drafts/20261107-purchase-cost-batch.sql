-- REVIEW ONLY. Production execution requires separate approval for fcmdvveqmcgtioelzqun.
-- Dependencies: existing pricing_p0_command, price_recalc_runs, product catalog and supplier mapping.
-- One batch stores cost snapshots; existing pricing_p0_command stores sales-price snapshots.
begin;

create table if not exists public.purchase_cost_batches (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null,
  request_digest text not null,
  changes jsonb not null check (jsonb_typeof(changes) = 'array' and jsonb_array_length(changes) between 1 and 100),
  price_run_id uuid,
  actor_name text not null check (length(trim(actor_name)) between 1 and 100),
  created_at timestamptz not null default clock_timestamp(),
  restored_at timestamptz,
  primary key (company_id, id),
  foreign key (company_id, price_run_id) references public.price_recalc_runs(company_id, id)
    on delete no action deferrable initially deferred
);
create index if not exists purchase_cost_batches_latest_idx
  on public.purchase_cost_batches(company_id, created_at desc, id desc);
alter table public.purchase_cost_batches enable row level security;
revoke all on public.purchase_cost_batches from public, anon, authenticated;
grant select, insert, update on public.purchase_cost_batches to service_role;

create or replace function public.save_purchase_cost_batch_v1(
  p_company uuid, p_batch uuid, p_changes jsonb, p_actor_name text
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  v_existing public.purchase_cost_batches%rowtype;
  v_digest text;
  v_item jsonb;
  v_product_id uuid;
  v_supplier_id uuid;
  v_seen_products uuid[] := '{}';
  v_seen_suppliers uuid[] := '{}';
  v_expected numeric;
  v_expected_supplier_raw numeric;
  v_cost numeric;
  v_raw_cost numeric;
  v_ratio numeric;
  v_product public.product_catalog%rowtype;
  v_supplier public.supplier_products%rowtype;
  v_match public.supplier_product_matches%rowtype;
  v_product_after timestamptz;
  v_supplier_after timestamptz;
  v_supplier_import uuid;
  v_snapshots jsonb := '[]'::jsonb;
  v_before_run uuid;
  v_after_run uuid;
  v_price_run uuid;
begin
  if p_company is null or p_batch is null or length(trim(coalesce(p_actor_name, ''))) not between 1 and 100
     or jsonb_typeof(p_changes) is distinct from 'array'
     or jsonb_array_length(p_changes) not between 1 and 100 then
    raise exception 'invalid_purchase_cost_batch';
  end if;
  v_digest := md5(p_changes::text);

  -- Serializes this writer with pricing_p0_command and same-company retries.
  perform 1 from public.companies where id = p_company for update;
  if not found then raise exception 'company_not_found'; end if;
  select * into v_existing from public.purchase_cost_batches
    where company_id = p_company and id = p_batch for update;
  if found then
    if v_existing.request_digest <> v_digest then raise exception 'purchase_cost_batch_conflict'; end if;
    return jsonb_build_object('batchId', p_batch, 'priceRunId', v_existing.price_run_id,
                              'status', case when v_existing.restored_at is null then 'already_applied' else 'restored' end);
  end if;

  -- The batch is all-or-nothing: no rows are visible if any validation or price calculation fails.
  for v_item in select value from jsonb_array_elements(p_changes) loop
    v_product_id := (v_item->>'productId')::uuid;
    v_supplier_id := nullif(v_item->>'supplierProductId', '')::uuid;
    v_expected := (v_item->>'expectedCost')::numeric;
    v_expected_supplier_raw := (v_item->>'expectedSupplierCost')::numeric;
    v_cost := (v_item->>'cost')::numeric;
    if v_product_id is null or v_product_id = any(v_seen_products)
       or (v_supplier_id is not null and v_supplier_id = any(v_seen_suppliers))
       or v_expected is null or v_cost is null or v_expected < 0 or v_cost < 0
       or v_cost > 999999999999.99 or v_expected > 999999999999.99 or v_cost = v_expected
       or v_cost <> round(v_cost, 2) or v_expected <> round(v_expected, 2) then
      raise exception 'invalid_purchase_cost_change';
    end if;
    v_seen_products := array_append(v_seen_products, v_product_id);
    if v_supplier_id is not null then v_seen_suppliers := array_append(v_seen_suppliers, v_supplier_id); end if;

    select * into v_product from public.product_catalog
      where company_id = p_company and id = v_product_id for update;
    if not found then raise exception 'purchase_product_not_found'; end if;
    if coalesce(v_product.purchase_price, 0) <> v_expected then raise exception 'purchase_cost_changed'; end if;

    v_supplier_import := null;
    v_raw_cost := null;
    v_supplier_after := null;
    if v_supplier_id is not null then
      if not (v_item ? 'expectedSupplierCost') then
        raise exception 'expected_supplier_cost_required';
      end if;
      select * into v_supplier from public.supplier_products
        where company_id = p_company and id = v_supplier_id for update;
      if not found then raise exception 'supplier_product_not_found'; end if;
      if v_supplier.latest_cost is distinct from v_expected_supplier_raw then
        raise exception 'supplier_cost_changed';
      end if;
      select * into v_match from public.supplier_product_matches
        where company_id = p_company and supplier_product_id = v_supplier_id
          and product_catalog_id = v_product_id and match_status in ('auto', 'confirmed')
        limit 1;
      if not found then raise exception 'supplier_product_not_linked'; end if;
      if nullif(lower(trim(v_supplier.raw_unit)), '') = nullif(lower(trim(v_product.sales_unit)), '')
         and nullif(trim(v_product.sales_unit), '') is not null then
        v_ratio := 1;
      elsif v_match.conversion_confirmed and v_match.purchase_to_sales_ratio > 0 then
        v_ratio := v_match.purchase_to_sales_ratio;
      else
        raise exception 'purchase_unit_conversion_missing';
      end if;
      v_raw_cost := v_cost * v_ratio;
      if v_raw_cost > 999999999999.99 or v_raw_cost <> round(v_raw_cost, 2) then
        raise exception 'supplier_unit_cost_not_representable';
      end if;
      update public.supplier_products
        set latest_cost = v_raw_cost, cost_confirmed = true,
            last_seen_date = (clock_timestamp() at time zone 'Asia/Seoul')::date,
            updated_at = clock_timestamp()
        where company_id = p_company and id = v_supplier_id
        returning updated_at into v_supplier_after;
      insert into public.product_catalog_imports(
        company_id, supplier_id, file_name, mapping, total_rows, updated_count,
        status, created_by_name, completed_at
      ) values (
        p_company, v_supplier.supplier_id,
        left(coalesce(nullif(v_item->>'fileName', ''), '매입가 변경'), 255),
        '{}'::jsonb, 1, 1, 'completed', p_actor_name, clock_timestamp()
      ) returning id into v_supplier_import;
      insert into public.supplier_product_cost_history(
        company_id, supplier_product_id, import_id, price_date, purchase_price
      ) values (
        p_company, v_supplier_id, v_supplier_import,
        (clock_timestamp() at time zone 'Asia/Seoul')::date, v_raw_cost
      );
    end if;

    update public.product_catalog
      set purchase_price = v_cost, updated_at = clock_timestamp()
      where company_id = p_company and id = v_product_id
      returning updated_at into v_product_after;
    v_snapshots := v_snapshots || jsonb_build_array(jsonb_build_object(
      'productId', v_product_id, 'supplierProductId', v_supplier_id,
      'beforeProductCost', v_product.purchase_price, 'afterProductCost', v_cost,
      'afterProductUpdatedAt', v_product_after,
      'beforeSupplierCost', case when v_supplier_id is null then null else v_supplier.latest_cost end,
      'afterSupplierCost', v_raw_cost,
      'beforeSupplierConfirmed', case when v_supplier_id is null then null else v_supplier.cost_confirmed end,
      'beforeSupplierLastSeenDate', case when v_supplier_id is null then null else v_supplier.last_seen_date end,
      'afterSupplierUpdatedAt', v_supplier_after,
      'importId', v_supplier_import
    ));
  end loop;

  select id into v_before_run from public.price_recalc_runs
    where company_id = p_company order by created_at desc, id desc limit 1;
  perform public.pricing_p0_command(p_company, '{"action":"recalculate"}'::jsonb);
  select id into v_after_run from public.price_recalc_runs
    where company_id = p_company order by created_at desc, id desc limit 1;
  if v_after_run is distinct from v_before_run then v_price_run := v_after_run; end if;

  insert into public.purchase_cost_batches(company_id, id, request_digest, changes, price_run_id, actor_name)
    values(p_company, p_batch, v_digest, v_snapshots, v_price_run, p_actor_name);
  return jsonb_build_object('batchId', p_batch, 'priceRunId', v_price_run, 'status', 'applied');
end $$;

create or replace function public.restore_purchase_cost_batch_v1(
  p_company uuid, p_batch uuid, p_actor_name text
) returns jsonb
language plpgsql security invoker set search_path = pg_catalog, public
as $$
declare
  v_batch public.purchase_cost_batches%rowtype;
  v_item jsonb;
  v_product public.product_catalog%rowtype;
  v_supplier public.supplier_products%rowtype;
  v_import uuid;
begin
  if p_company is null or p_batch is null or length(trim(coalesce(p_actor_name, ''))) not between 1 and 100 then
    raise exception 'invalid_purchase_cost_restore';
  end if;
  perform 1 from public.companies where id = p_company for update;
  if not found then raise exception 'company_not_found'; end if;
  select * into v_batch from public.purchase_cost_batches
    where company_id = p_company and id = p_batch for update;
  if not found then raise exception 'purchase_cost_batch_not_found'; end if;
  if v_batch.restored_at is not null then
    return jsonb_build_object('batchId', p_batch, 'status', 'already_restored');
  end if;
  if p_batch is distinct from (
    select id from public.purchase_cost_batches where company_id = p_company
    order by created_at desc, id desc limit 1
  ) then raise exception 'only_latest_purchase_cost_batch'; end if;
  if v_batch.price_run_id is not null then
    if (select restored from public.price_recalc_runs
        where company_id = p_company and id = v_batch.price_run_id) then
      raise exception 'price_run_restored_separately';
    end if;
  elsif exists(select 1 from public.price_recalc_runs
               where company_id = p_company and created_at > v_batch.created_at) then
    raise exception 'price_changed_since_purchase_batch';
  end if;

  for v_item in select value from jsonb_array_elements(v_batch.changes) loop
    select * into v_product from public.product_catalog
      where company_id = p_company and id = (v_item->>'productId')::uuid for update;
    if not found or v_product.purchase_price is distinct from (v_item->>'afterProductCost')::numeric
       or v_product.updated_at is distinct from (v_item->>'afterProductUpdatedAt')::timestamptz then
      raise exception 'product_changed_since_purchase_batch';
    end if;
    if v_item->>'supplierProductId' is not null then
      select * into v_supplier from public.supplier_products
        where company_id = p_company and id = (v_item->>'supplierProductId')::uuid for update;
      if not found or v_supplier.latest_cost is distinct from (v_item->>'afterSupplierCost')::numeric
         or v_supplier.cost_confirmed is distinct from true
         or v_supplier.updated_at is distinct from (v_item->>'afterSupplierUpdatedAt')::timestamptz then
        raise exception 'supplier_changed_since_purchase_batch';
      end if;
    end if;
  end loop;

  -- Existing price restore and cost reversal share this transaction.
  if v_batch.price_run_id is not null then
    perform public.pricing_p0_command(
      p_company, jsonb_build_object('action', 'restore', 'batchId', v_batch.price_run_id)
    );
  end if;
  for v_item in select value from jsonb_array_elements(v_batch.changes) loop
    update public.product_catalog
      set purchase_price = (v_item->>'beforeProductCost')::numeric, updated_at = clock_timestamp()
      where company_id = p_company and id = (v_item->>'productId')::uuid;
    if v_item->>'supplierProductId' is not null then
      select * into v_supplier from public.supplier_products
        where company_id = p_company and id = (v_item->>'supplierProductId')::uuid for update;
      if not found then raise exception 'supplier_product_not_found'; end if;
      update public.supplier_products
        set latest_cost = (v_item->>'beforeSupplierCost')::numeric,
            cost_confirmed = (v_item->>'beforeSupplierConfirmed')::boolean,
            last_seen_date = (v_item->>'beforeSupplierLastSeenDate')::date,
            updated_at = clock_timestamp()
        where company_id = p_company and id = (v_item->>'supplierProductId')::uuid;
      insert into public.product_catalog_imports(
        company_id, supplier_id, file_name, mapping, total_rows, updated_count,
        status, created_by_name, completed_at
      ) values(
        p_company, v_supplier.supplier_id, '직전 저장 복구', '{}'::jsonb,
        1, 1, 'completed', p_actor_name, clock_timestamp()
      ) returning id into v_import;
      if v_item->>'beforeSupplierCost' is not null then
        insert into public.supplier_product_cost_history(
          company_id, supplier_product_id, import_id, price_date, purchase_price
        ) values(
          p_company, (v_item->>'supplierProductId')::uuid, v_import,
          (clock_timestamp() at time zone 'Asia/Seoul')::date,
          (v_item->>'beforeSupplierCost')::numeric
        );
      end if;
    end if;
  end loop;
  update public.purchase_cost_batches set restored_at = clock_timestamp()
    where company_id = p_company and id = p_batch;
  return jsonb_build_object('batchId', p_batch, 'status', 'restored');
end $$;

revoke all on function public.save_purchase_cost_batch_v1(uuid, uuid, jsonb, text),
  public.restore_purchase_cost_batch_v1(uuid, uuid, text) from public, anon, authenticated;
grant execute on function public.save_purchase_cost_batch_v1(uuid, uuid, jsonb, text),
  public.restore_purchase_cost_batch_v1(uuid, uuid, text) to service_role;
commit;

-- Rollback draft; only after confirming no batch rows and no callers remain:
-- begin;
-- do $$ begin
--   if exists(select 1 from public.purchase_cost_batches) then raise exception 'purchase_cost_batches_not_empty'; end if;
-- end $$;
-- drop function if exists public.restore_purchase_cost_batch_v1(uuid, uuid, text);
-- drop function if exists public.save_purchase_cost_batch_v1(uuid, uuid, jsonb, text);
-- drop table if exists public.purchase_cost_batches;
-- commit;
