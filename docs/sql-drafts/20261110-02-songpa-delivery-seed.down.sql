-- Exact data rollback for 20261110-02-songpa-delivery-seed.sql.
-- Run only before the generated territory is linked or used, with the same
-- maju.target_company_id transaction-local setting as the up draft.

do $rollback$
declare
  v_company_text text := nullif(current_setting('maju.target_company_id', true), '');
  v_company uuid;
  v_territory constant uuid := '02000000-0000-4000-8000-000000000001';
  v_in_use boolean;
  v_deleted integer;
  v_reference record;
begin
  if v_company_text is null or v_company_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'target_company_id_required';
  end if;
  v_company := v_company_text::uuid;

  if not exists (
    select 1 from public.delivery_territories
    where company_id = v_company and id = v_territory and name = '서울 송파구' and is_active
  ) or not exists (
    select 1 from public.delivery_territory_areas
    where company_id = v_company and territory_id = v_territory and administrative_area = '서울특별시 송파구'
  ) or not exists (
    select 1 from public.store_order_territory_rules
    where company_id = v_company and territory_id = v_territory
      and delivery_weekdays = array[1,2,3,4,5,6]::smallint[]
  ) then
    raise exception 'songpa_delivery_seed_missing_or_drifted';
  end if;

  for v_reference in
    select * from (values
      ('normalized_customers', 'delivery_territory_id'),
      ('territory_staff_assignments', 'territory_id'),
      ('delivery_route_units', 'territory_id'),
      ('business_documents', 'territory_id'),
      ('store_order_holidays', 'territory_id')
    ) as refs(table_name, column_name)
  loop
    if to_regclass(format('public.%I', v_reference.table_name)) is not null then
      execute format(
        'select exists(select 1 from public.%I where company_id = $1 and %I = $2)',
        v_reference.table_name,
        v_reference.column_name
      ) into v_in_use using v_company, v_territory;
      if v_in_use then raise exception 'songpa_delivery_seed_in_use:%', v_reference.table_name; end if;
    end if;
  end loop;

  delete from public.store_order_territory_rules
  where company_id = v_company and territory_id = v_territory
    and delivery_weekdays = array[1,2,3,4,5,6]::smallint[];
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'songpa_delivery_rule_rollback_mismatch'; end if;

  delete from public.delivery_territory_areas
  where company_id = v_company and territory_id = v_territory
    and administrative_area = '서울특별시 송파구';
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'songpa_delivery_area_rollback_mismatch'; end if;

  delete from public.delivery_territories
  where company_id = v_company and id = v_territory and name = '서울 송파구' and is_active;
  get diagnostics v_deleted = row_count;
  if v_deleted <> 1 then raise exception 'songpa_delivery_territory_rollback_mismatch'; end if;
end
$rollback$;
