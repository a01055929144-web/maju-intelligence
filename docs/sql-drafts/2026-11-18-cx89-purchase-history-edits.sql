-- CX-89: 매입 이력 줄 정정·논리 삭제·수동 추가. 운영 적용 금지(별도 승인 필요).
begin;
set local lock_timeout = '3s';

-- 운영에는 이미 E2 계약으로 존재한다. 격리 PG17처럼 선행 계약만 적재한 환경도 같은 뷰를 검증할 수 있게 보강한다.
alter table public.purchase_receipt_lines add column if not exists invalidated_at timestamptz;
alter table public.purchase_receipt_line_overrides
  add column if not exists quantity numeric(14,3),
  add column if not exists deleted_at timestamptz;

create or replace view public.purchase_receipt_effective with (security_invoker = true) as
select r.id, r.company_id, r.receipt_date, r.line_key,
  coalesce(o.product_catalog_id, r.product_catalog_id) as product_catalog_id,
  coalesce(o.product_name, r.product_name) as product_name,
  case when o.receipt_line_id is not null then o.spec else r.spec end as spec,
  case when o.receipt_line_id is not null then o.unit else r.unit end as unit,
  r.supplier_name, r.erp_code,
  case when o.receipt_line_id is not null then o.quantity else r.quantity end as quantity,
  r.unit_price, coalesce(o.unit_cost_ex_vat, r.unit_cost_ex_vat) as unit_cost_ex_vat,
  r.price_includes_vat, r.tax_type, r.total_amount,
  coalesce(o.revision, 0) as correction_revision, (o.receipt_line_id is not null) as corrected
from public.purchase_receipt_lines r
left join public.purchase_receipt_line_overrides o
  on o.company_id = r.company_id and o.receipt_line_id = r.id
where r.invalidated_at is null and o.deleted_at is null;
revoke all on public.purchase_receipt_effective from public, anon, authenticated;
grant select on public.purchase_receipt_effective to service_role;

create or replace function public.mutate_purchase_receipt_line(
  p_company uuid, p_action text, p_line uuid, p_values jsonb,
  p_reason text, p_actor text, p_expected_revision integer
) returns jsonb
language plpgsql security invoker set search_path = public, pg_temp as $$
declare
  v_line public.purchase_receipt_lines;
  v_previous public.purchase_receipt_line_overrides;
  v_catalog public.product_catalog;
  v_id uuid := p_line;
  v_product uuid;
  v_old_product uuid;
  v_date date;
  v_name text;
  v_spec text;
  v_unit text;
  v_quantity numeric;
  v_cost numeric;
  v_revision integer;
  v_before jsonb;
  v_after jsonb;
  v_latest record;
  v_recalculated boolean := false;
begin
  if p_action not in ('correct','delete','add')
     or length(trim(coalesce(p_reason,''))) not between 5 and 500
     or length(trim(coalesce(p_actor,''))) not between 1 and 80
     or coalesce(p_expected_revision,-1) < 0 then raise exception 'invalid_receipt_mutation'; end if;
  perform 1 from public.companies where id=p_company for update;
  if not found then raise exception 'company_not_found'; end if;

  if p_action='add' then
    v_date := (p_values->>'receiptDate')::date;
    v_name := trim(p_values->>'productName');
    v_product := nullif(p_values->>'productId','')::uuid;
    v_spec := nullif(trim(p_values->>'spec'),'');
    v_unit := nullif(trim(p_values->>'unit'),'');
    v_quantity := nullif(p_values->>'quantity','')::numeric;
    v_cost := nullif(p_values->>'cost','')::numeric;
    if v_date is null or length(v_name) not between 1 and 200 or v_cost is null or v_cost<0 or v_cost>1000000000 or v_cost<>round(v_cost,2)
       or (v_quantity is not null and (v_quantity<0 or v_quantity>1000000000 or v_quantity<>round(v_quantity,3))) then raise exception 'invalid_receipt_mutation'; end if;
    if v_product is not null then
      select * into v_catalog from public.product_catalog where company_id=p_company and id=v_product;
      if not found then raise exception 'product_not_in_company'; end if;
    end if;
    insert into public.purchase_receipt_lines(company_id,receipt_date,dedupe_key,line_key,product_catalog_id,supplier_name,
      product_name,spec,unit,quantity,unit_price,unit_cost_ex_vat,raw_values,created_by_name)
    values(p_company,v_date,'manual:'||gen_random_uuid(),lower(regexp_replace(v_name||'|'||coalesce(v_spec,''),'\s','','g')),
      v_product,nullif(trim(p_values->>'supplier'),''),v_name,v_spec,v_unit,v_quantity,v_cost,v_cost,'[]',trim(p_actor)) returning * into v_line;
    v_id:=v_line.id; v_revision:=0; v_before:='null'::jsonb; v_after:=to_jsonb(v_line)-'raw_values';
  else
    select * into v_line from public.purchase_receipt_lines where company_id=p_company and id=p_line for update;
    if not found then raise exception 'receipt_line_not_found'; end if;
    select * into v_previous from public.purchase_receipt_line_overrides where company_id=p_company and receipt_line_id=p_line for update;
    if coalesce(v_previous.revision,0)<>p_expected_revision then raise exception 'receipt_correction_conflict'; end if;
    v_old_product:=coalesce(v_previous.product_catalog_id,v_line.product_catalog_id);
    v_product:=coalesce(nullif(p_values->>'productId','')::uuid,v_old_product);
    if v_product is not null and not exists(select 1 from public.product_catalog where company_id=p_company and id=v_product) then raise exception 'product_not_in_company'; end if;
    v_date:=v_line.receipt_date; v_name:=coalesce(v_previous.product_name,v_line.product_name);
    v_spec:=case when p_values ? 'spec' then nullif(trim(p_values->>'spec'),'') when v_previous.receipt_line_id is not null then v_previous.spec else v_line.spec end;
    v_unit:=case when p_values ? 'unit' then nullif(trim(p_values->>'unit'),'') when v_previous.receipt_line_id is not null then v_previous.unit else v_line.unit end;
    v_quantity:=case when p_values ? 'quantity' then nullif(p_values->>'quantity','')::numeric when v_previous.receipt_line_id is not null then v_previous.quantity else v_line.quantity end;
    v_cost:=case when p_action='delete' then coalesce(v_previous.unit_cost_ex_vat,v_line.unit_cost_ex_vat) else nullif(p_values->>'cost','')::numeric end;
    if v_cost is null or v_cost<0 or v_cost>1000000000 or v_cost<>round(v_cost,2)
       or (v_quantity is not null and (v_quantity<0 or v_quantity>1000000000 or v_quantity<>round(v_quantity,3))) then raise exception 'invalid_receipt_mutation'; end if;
    v_revision:=coalesce(v_previous.revision,0)+1;
    v_before:=jsonb_build_object('product_catalog_id',coalesce(v_previous.product_catalog_id,v_line.product_catalog_id),'product_name',v_name,
      'spec',case when v_previous.receipt_line_id is not null then v_previous.spec else v_line.spec end,'unit',case when v_previous.receipt_line_id is not null then v_previous.unit else v_line.unit end,
      'quantity',case when v_previous.receipt_line_id is not null then v_previous.quantity else v_line.quantity end,'unit_cost_ex_vat',coalesce(v_previous.unit_cost_ex_vat,v_line.unit_cost_ex_vat),'deleted',v_previous.deleted_at is not null);
    insert into public.purchase_receipt_line_overrides(company_id,receipt_line_id,product_catalog_id,product_name,spec,unit,quantity,unit_cost_ex_vat,revision,corrected_at,deleted_at)
    values(p_company,p_line,v_product,v_name,v_spec,v_unit,v_quantity,v_cost,v_revision,now(),case when p_action='delete' then now() end)
    on conflict(company_id,receipt_line_id) do update set product_catalog_id=excluded.product_catalog_id,product_name=excluded.product_name,
      spec=excluded.spec,unit=excluded.unit,quantity=excluded.quantity,unit_cost_ex_vat=excluded.unit_cost_ex_vat,revision=excluded.revision,
      corrected_at=excluded.corrected_at,deleted_at=excluded.deleted_at;
    v_after:=jsonb_build_object('product_catalog_id',v_product,'product_name',v_name,'spec',v_spec,'unit',v_unit,'quantity',v_quantity,'unit_cost_ex_vat',v_cost,'deleted',p_action='delete');
  end if;

  insert into public.purchase_receipt_correction_events(company_id,receipt_line_id,before_value,after_value,reason,actor_name)
  values(p_company,v_id,v_before,v_after||jsonb_build_object('action',p_action),trim(p_reason),trim(p_actor));

  for v_product in select distinct product_id from unnest(array[v_old_product,v_product]) as ids(product_id) where product_id is not null loop
    if not exists(select 1 from public.purchase_receipt_effective where company_id=p_company and product_catalog_id=v_product and receipt_date>v_date) then
      select receipt_date,unit_cost_ex_vat into v_latest from public.purchase_receipt_effective
        where company_id=p_company and product_catalog_id=v_product order by receipt_date desc,id desc limit 1;
      if found then
        update public.product_catalog set purchase_price=v_latest.unit_cost_ex_vat,purchase_price_date=v_latest.receipt_date,updated_at=now()
          where company_id=p_company and id=v_product;
        v_recalculated:=true;
      end if;
    end if;
  end loop;
  if v_recalculated then perform public.pricing_p0_command(p_company,'{"action":"recalculate"}'::jsonb); end if;
  return jsonb_build_object('id',v_id,'revision',v_revision,'recalculated',v_recalculated);
end $$;
revoke all on function public.mutate_purchase_receipt_line(uuid,text,uuid,jsonb,text,text,integer) from public,anon,authenticated;
grant execute on function public.mutate_purchase_receipt_line(uuid,text,uuid,jsonb,text,text,integer) to service_role;
commit;
