-- REVIEW ONLY. Do not apply to production without DB-APPROVED for fcmdvveqmcgtioelzqun.
-- Phase 1 only: existing product_catalog rows. Product creation/raw matching stays a separate approved phase.
begin;

alter table public.product_catalog add column if not exists purchase_price_date date;

create table if not exists public.purchase_cost_date_batches_v2 (
  company_id uuid not null references public.companies(id) on delete cascade,
  id uuid not null,
  request_digest text not null,
  default_receipt_date date not null,
  source_file_name text not null check(length(trim(source_file_name)) between 1 and 255),
  actor_name text not null check(length(trim(actor_name)) between 1 and 100),
  row_count integer not null check(row_count between 1 and 5000),
  rows jsonb not null check(jsonb_typeof(rows)='array'),
  product_snapshots jsonb not null default '{}'::jsonb check(jsonb_typeof(product_snapshots)='object'),
  supplier_snapshots jsonb not null default '{}'::jsonb check(jsonb_typeof(supplier_snapshots)='object'),
  supplier_import_ids jsonb not null default '{}'::jsonb check(jsonb_typeof(supplier_import_ids)='object'),
  recalc_run_id uuid,
  status text not null check(status in ('processing','completed','restored')),
  created_at timestamptz not null default clock_timestamp(),
  restored_at timestamptz,
  primary key(company_id,id),
  foreign key(company_id,recalc_run_id) references public.price_recalc_runs(company_id,id)
);
create index if not exists purchase_cost_date_batches_v2_latest_idx
  on public.purchase_cost_date_batches_v2(company_id,created_at desc,id desc);
alter table public.purchase_cost_date_batches_v2 enable row level security;
revoke all on public.purchase_cost_date_batches_v2 from public,anon,authenticated;
grant select,insert,update on public.purchase_cost_date_batches_v2 to service_role;

alter table public.purchase_receipt_lines
  add column if not exists purchase_cost_date_batch_id uuid;
alter table public.purchase_receipt_lines
  drop constraint if exists purchase_receipt_lines_cost_date_batch_fk,
  add constraint purchase_receipt_lines_cost_date_batch_fk
    foreign key(company_id,purchase_cost_date_batch_id)
    references public.purchase_cost_date_batches_v2(company_id,id) on delete cascade;
create unique index if not exists purchase_receipt_lines_cost_date_batch_row_uq
  on public.purchase_receipt_lines(company_id,purchase_cost_date_batch_id,source_row_number)
  where purchase_cost_date_batch_id is not null;

create or replace function public.save_purchase_cost_date_batch_v2(
  p_company uuid,p_batch uuid,p_default_receipt_date date,p_rows jsonb,
  p_actor_name text,p_source_file_name text
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare
  v_existing public.purchase_cost_date_batches_v2%rowtype;
  v_digest text;
  v_item jsonb;
  v_product public.product_catalog%rowtype;
  v_supplier public.supplier_products%rowtype;
  v_date date;
  v_cost numeric;
  v_supplier_cost numeric;
  v_product_id uuid;
  v_supplier_id uuid;
  v_import_id uuid;
  v_price_selected boolean;
  v_apply_current boolean;
  v_apply_supplier_current boolean;
  v_product_snapshots jsonb := '{}'::jsonb;
  v_supplier_snapshots jsonb := '{}'::jsonb;
  v_import_ids jsonb := '{}'::jsonb;
  v_product_latest_dates jsonb := '{}'::jsonb;
  v_supplier_latest_dates jsonb := '{}'::jsonb;
  v_before_run uuid;
  v_after_run uuid;
  v_recalc_run uuid;
begin
  if p_company is null or p_batch is null or p_default_receipt_date is null
     or length(trim(coalesce(p_actor_name,''))) not between 1 and 100
     or length(trim(coalesce(p_source_file_name,''))) not between 1 and 255
     or jsonb_typeof(p_rows) is distinct from 'array'
     or jsonb_array_length(p_rows) not between 1 and 5000 then
    raise exception 'invalid_purchase_cost_date_batch';
  end if;
  v_digest := pg_catalog.md5(
    p_company::text||E'\n'||p_default_receipt_date::text||E'\n'||p_source_file_name||E'\n'||p_rows::text);
  perform 1 from public.companies where id=p_company for update;
  if not found then raise exception 'company_not_found'; end if;
  select * into v_existing from public.purchase_cost_date_batches_v2
    where company_id=p_company and id=p_batch for update;
  if found then
    if v_existing.request_digest<>v_digest then raise exception 'purchase_cost_date_batch_conflict'; end if;
    return jsonb_build_object('batchId',p_batch,'recalcRunId',v_existing.recalc_run_id,
      'status',v_existing.status,'rowCount',v_existing.row_count);
  end if;
  insert into public.purchase_cost_date_batches_v2(
    company_id,id,request_digest,default_receipt_date,source_file_name,actor_name,row_count,rows,status
  ) values(p_company,p_batch,v_digest,p_default_receipt_date,p_source_file_name,p_actor_name,
           jsonb_array_length(p_rows),p_rows,'processing');

  -- Every product/date group keeps all receipt rows and must explicitly select one price or hold the group.
  if exists(
    select 1 from(
      select value->>'productId' product_id,
        coalesce(nullif(value->>'priceDate','')::date,p_default_receipt_date) price_date,
        count(*) filter(where coalesce((value->>'priceSelected')::boolean,false)) selected_count,
        count(*) filter(where coalesce((value->>'priceHeld')::boolean,false)) held_count
      from jsonb_array_elements(p_rows)
      group by value->>'productId',coalesce(nullif(value->>'priceDate','')::date,p_default_receipt_date)
    ) grouped where selected_count>1
      or (selected_count=0 and held_count<>1)
      or (selected_count=1 and held_count<>0)
  ) then raise exception 'purchase_cost_price_selection_required'; end if;
  select coalesce(jsonb_object_agg(product_id,latest_date),'{}'::jsonb)
    into v_product_latest_dates
  from(
    select value->>'productId' product_id,
      max(coalesce(nullif(value->>'priceDate','')::date,p_default_receipt_date))::text latest_date
    from jsonb_array_elements(p_rows) group by value->>'productId'
  ) grouped;
  select coalesce(jsonb_object_agg(supplier_product_id,latest_date),'{}'::jsonb)
    into v_supplier_latest_dates
  from(
    select value->>'supplierProductId' supplier_product_id,
      max(coalesce(nullif(value->>'priceDate','')::date,p_default_receipt_date))::text latest_date
    from jsonb_array_elements(p_rows)
    where nullif(value->>'supplierProductId','') is not null
    group by value->>'supplierProductId'
  ) grouped;

  for v_item in select value from jsonb_array_elements(p_rows) loop
    if exists(select 1 from jsonb_object_keys(v_item) key where key not in(
      'productId','supplierProductId','priceDate','cost','supplierCost','selectedSourceRowNumber',
      'priceSelected','priceHeld','lineKey','productName','spec','unit','supplierName',
      'erpCode','quantity','unitPrice','priceIncludesVat','taxType','supplyAmount','vatAmount',
      'totalAmount','rawValues')) then raise exception 'unsupported_purchase_cost_date_field'; end if;
    v_product_id := nullif(v_item->>'productId','')::uuid;
    v_supplier_id := nullif(v_item->>'supplierProductId','')::uuid;
    v_date := coalesce(nullif(v_item->>'priceDate','')::date,p_default_receipt_date);
    v_cost := nullif(v_item->>'cost','')::numeric;
    v_supplier_cost := nullif(v_item->>'supplierCost','')::numeric;
    v_price_selected := coalesce((v_item->>'priceSelected')::boolean,false);
    if v_product_id is null or v_date is null or v_cost is null or v_cost<0 or v_cost>999999999999.99
       or v_cost<>round(v_cost,2) or coalesce((v_item->>'selectedSourceRowNumber')::integer,0)<1
       or (v_supplier_id is not null and (v_supplier_cost is null or v_supplier_cost<0
           or v_supplier_cost>999999999999.99 or v_supplier_cost<>round(v_supplier_cost,2))) then
      raise exception 'invalid_purchase_cost_date_row';
    end if;
    select * into v_product from public.product_catalog
      where company_id=p_company and id=v_product_id for update;
    if not found then raise exception 'existing_purchase_product_required'; end if;
    v_apply_current:=v_price_selected
      and v_date=(v_product_latest_dates->>v_product_id::text)::date
      and (v_product.purchase_price=0 or v_product.purchase_price_date is not null);
    if v_apply_current and not (v_product_snapshots ? v_product_id::text) then
      v_product_snapshots := jsonb_set(v_product_snapshots,array[v_product_id::text],jsonb_build_object(
        'purchasePrice',v_product.purchase_price,'purchasePriceDate',v_product.purchase_price_date,
        'updatedAt',v_product.updated_at));
    end if;

    if v_price_selected and v_supplier_id is not null then
      select sp.* into v_supplier from public.supplier_products sp
        join public.supplier_product_matches m on m.company_id=sp.company_id
          and m.supplier_product_id=sp.id and m.product_catalog_id=v_product_id
          and m.match_status in('auto','confirmed')
        where sp.company_id=p_company and sp.id=v_supplier_id for update of sp;
      if not found then raise exception 'supplier_product_not_linked'; end if;
      v_apply_supplier_current:=v_date=(v_supplier_latest_dates->>v_supplier_id::text)::date
        and (v_supplier.last_seen_date is null or v_date>=v_supplier.last_seen_date);
      if v_apply_supplier_current and not (v_supplier_snapshots ? v_supplier_id::text) then
        v_supplier_snapshots := jsonb_set(v_supplier_snapshots,array[v_supplier_id::text],jsonb_build_object(
          'latestCost',v_supplier.latest_cost,'costConfirmed',v_supplier.cost_confirmed,
          'lastSeenDate',v_supplier.last_seen_date,'updatedAt',v_supplier.updated_at));
      end if;
      v_import_id := nullif(v_import_ids->>v_supplier.supplier_id::text,'')::uuid;
      if v_import_id is null then
        insert into public.product_catalog_imports(
          company_id,supplier_id,file_name,mapping,total_rows,updated_count,status,created_by_name,completed_at
        ) values(p_company,v_supplier.supplier_id,p_source_file_name,'{"contract":"purchase-cost-date-v2"}'::jsonb,
                 jsonb_array_length(p_rows),0,'processing',p_actor_name,null)
        returning id into v_import_id;
        v_import_ids := jsonb_set(v_import_ids,array[v_supplier.supplier_id::text],to_jsonb(v_import_id));
      end if;
      insert into public.supplier_product_cost_history(
        company_id,supplier_product_id,import_id,price_date,purchase_price
      ) values(p_company,v_supplier_id,v_import_id,v_date,v_supplier_cost);
      if v_apply_supplier_current then
        update public.supplier_products set
          latest_cost=case when last_seen_date is null or v_date>=last_seen_date then v_supplier_cost else latest_cost end,
          cost_confirmed=case when last_seen_date is null or v_date>=last_seen_date then true else cost_confirmed end,
          last_seen_date=greatest(coalesce(last_seen_date,v_date),v_date),
          updated_at=case when last_seen_date is null or v_date>=last_seen_date then clock_timestamp() else updated_at end
        where company_id=p_company and id=v_supplier_id;
        select * into v_supplier from public.supplier_products
          where company_id=p_company and id=v_supplier_id;
        v_supplier_snapshots := jsonb_set(v_supplier_snapshots,array[v_supplier_id::text,'afterLatestCost'],
          to_jsonb(v_supplier.latest_cost));
        v_supplier_snapshots := jsonb_set(v_supplier_snapshots,array[v_supplier_id::text,'afterCostConfirmed'],
          to_jsonb(v_supplier.cost_confirmed));
        v_supplier_snapshots := jsonb_set(v_supplier_snapshots,array[v_supplier_id::text,'afterLastSeenDate'],
          coalesce(to_jsonb(v_supplier.last_seen_date),'null'::jsonb));
      end if;
    end if;

    insert into public.purchase_receipt_lines(
      company_id,receipt_date,dedupe_key,line_key,product_catalog_id,supplier_name,erp_code,
      product_name,spec,unit,quantity,unit_price,price_includes_vat,tax_type,unit_cost_ex_vat,
      supply_amount,vat_amount,total_amount,file_name,source_row_number,raw_values,created_by_name,
      purchase_cost_date_batch_id
    ) values(
      p_company,v_date,'v2:'||p_batch::text||':'||(v_item->>'selectedSourceRowNumber'),
      coalesce(nullif(v_item->>'lineKey',''),v_product_id::text),v_product_id,
      nullif(v_item->>'supplierName',''),nullif(v_item->>'erpCode',''),
      coalesce(nullif(v_item->>'productName',''),v_product.purchase_product_name),
      nullif(v_item->>'spec',''),nullif(v_item->>'unit',''),nullif(v_item->>'quantity','')::numeric,
      coalesce(nullif(v_item->>'unitPrice','')::numeric,v_cost),
      coalesce((v_item->>'priceIncludesVat')::boolean,false),nullif(v_item->>'taxType',''),v_cost,
      nullif(v_item->>'supplyAmount','')::numeric,nullif(v_item->>'vatAmount','')::numeric,
      nullif(v_item->>'totalAmount','')::numeric,p_source_file_name,
      (v_item->>'selectedSourceRowNumber')::integer,coalesce(v_item->'rawValues','[]'::jsonb),p_actor_name,p_batch
    );
    if v_apply_current then
      update public.product_catalog set
        purchase_price=case when purchase_price_date is null or v_date>=purchase_price_date then v_cost else purchase_price end,
        purchase_price_date=greatest(coalesce(purchase_price_date,v_date),v_date),
        updated_at=case when purchase_price_date is null or v_date>=purchase_price_date then clock_timestamp() else updated_at end
      where company_id=p_company and id=v_product_id;
      select * into v_product from public.product_catalog
        where company_id=p_company and id=v_product_id;
      v_product_snapshots := jsonb_set(v_product_snapshots,array[v_product_id::text,'afterPurchasePrice'],
        to_jsonb(v_product.purchase_price));
      v_product_snapshots := jsonb_set(v_product_snapshots,array[v_product_id::text,'afterPurchasePriceDate'],
        coalesce(to_jsonb(v_product.purchase_price_date),'null'::jsonb));
    end if;
  end loop;
  update public.product_catalog_imports set status='completed',updated_count=(
      select count(*) from public.supplier_product_cost_history h
      where h.company_id=p_company and h.import_id=product_catalog_imports.id
    ),completed_at=clock_timestamp()
    where company_id=p_company and id in(select value::text::uuid from jsonb_each_text(v_import_ids));
  select id into v_before_run from public.price_recalc_runs
    where company_id=p_company order by created_at desc,id desc limit 1;
  perform public.pricing_p0_command(p_company,'{"action":"recalculate"}'::jsonb);
  select id into v_after_run from public.price_recalc_runs
    where company_id=p_company order by created_at desc,id desc limit 1;
  if v_after_run is distinct from v_before_run then v_recalc_run:=v_after_run; end if;
  update public.purchase_cost_date_batches_v2 set
    product_snapshots=v_product_snapshots,supplier_snapshots=v_supplier_snapshots,
    supplier_import_ids=v_import_ids,recalc_run_id=v_recalc_run,status='completed'
    where company_id=p_company and id=p_batch;
  return jsonb_build_object('batchId',p_batch,'recalcRunId',v_recalc_run,
    'status','completed','rowCount',jsonb_array_length(p_rows));
end $$;

create or replace function public.restore_purchase_cost_date_batch_v2(
  p_company uuid,p_batch uuid,p_actor_name text
) returns jsonb
language plpgsql security invoker set search_path=pg_catalog,public
as $$
declare
  v_batch public.purchase_cost_date_batches_v2%rowtype;
  v_pair record;
begin
  if p_company is null or p_batch is null or length(trim(coalesce(p_actor_name,''))) not between 1 and 100
  then raise exception 'invalid_purchase_cost_date_restore'; end if;
  perform 1 from public.companies where id=p_company for update;
  if not found then raise exception 'company_not_found'; end if;
  select * into v_batch from public.purchase_cost_date_batches_v2
    where company_id=p_company and id=p_batch for update;
  if not found then raise exception 'purchase_cost_date_batch_not_found'; end if;
  if v_batch.status='restored' then return jsonb_build_object('batchId',p_batch,'status','restored'); end if;
  if p_batch is distinct from(select id from public.purchase_cost_date_batches_v2
      where company_id=p_company and status='completed' order by created_at desc,id desc limit 1)
  then raise exception 'only_latest_purchase_cost_date_batch'; end if;
  if v_batch.recalc_run_id is not null then
    if (select restored from public.price_recalc_runs
        where company_id=p_company and id=v_batch.recalc_run_id) then
      raise exception 'price_run_restored_separately';
    end if;
  elsif exists(select 1 from public.price_recalc_runs
               where company_id=p_company and created_at>v_batch.created_at) then
    raise exception 'price_changed_since_purchase_cost_date_batch';
  end if;
  for v_pair in select * from jsonb_each(v_batch.product_snapshots) loop
    if not exists(select 1 from public.product_catalog where company_id=p_company and id=v_pair.key::uuid
      and purchase_price is not distinct from nullif(v_pair.value->>'afterPurchasePrice','')::numeric
      and purchase_price_date is not distinct from nullif(v_pair.value->>'afterPurchasePriceDate','')::date)
    then raise exception 'product_changed_since_purchase_cost_date_batch'; end if;
  end loop;
  for v_pair in select * from jsonb_each(v_batch.supplier_snapshots) loop
    if not exists(select 1 from public.supplier_products where company_id=p_company and id=v_pair.key::uuid
      and latest_cost is not distinct from nullif(v_pair.value->>'afterLatestCost','')::numeric
      and cost_confirmed is not distinct from nullif(v_pair.value->>'afterCostConfirmed','')::boolean
      and last_seen_date is not distinct from nullif(v_pair.value->>'afterLastSeenDate','')::date)
    then raise exception 'supplier_changed_since_purchase_cost_date_batch'; end if;
  end loop;
  if v_batch.recalc_run_id is not null then
    perform public.pricing_p0_command(
      p_company,jsonb_build_object('action','restore','batchId',v_batch.recalc_run_id));
  end if;
  delete from public.purchase_receipt_lines where company_id=p_company and purchase_cost_date_batch_id=p_batch;
  delete from public.product_catalog_imports where company_id=p_company
    and id in(select value::text::uuid from jsonb_each_text(v_batch.supplier_import_ids));
  for v_pair in select * from jsonb_each(v_batch.product_snapshots) loop
    update public.product_catalog set purchase_price=(v_pair.value->>'purchasePrice')::numeric,
      purchase_price_date=nullif(v_pair.value->>'purchasePriceDate','')::date,updated_at=clock_timestamp()
      where company_id=p_company and id=v_pair.key::uuid;
  end loop;
  for v_pair in select * from jsonb_each(v_batch.supplier_snapshots) loop
    update public.supplier_products set latest_cost=nullif(v_pair.value->>'latestCost','')::numeric,
      cost_confirmed=(v_pair.value->>'costConfirmed')::boolean,
      last_seen_date=nullif(v_pair.value->>'lastSeenDate','')::date,updated_at=clock_timestamp()
      where company_id=p_company and id=v_pair.key::uuid;
  end loop;
  update public.purchase_cost_date_batches_v2 set status='restored',restored_at=clock_timestamp()
    where company_id=p_company and id=p_batch;
  return jsonb_build_object('batchId',p_batch,'status','restored');
end $$;

revoke all on function public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text),
  public.restore_purchase_cost_date_batch_v2(uuid,uuid,text) from public,anon,authenticated,service_role;
grant execute on function public.save_purchase_cost_date_batch_v2(uuid,uuid,date,jsonb,text,text),
  public.restore_purchase_cost_date_batch_v2(uuid,uuid,text) to service_role;
commit;

-- No rollback block is provided until the draft is approved. Existing v1 objects are intentionally untouched.
