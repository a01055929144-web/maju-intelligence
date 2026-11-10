-- Data-only draft. Never run without explicit production approval.
-- The executor must set the approved company ID in the same transaction:
--   begin;
--   select set_config('maju.target_company_id', '<approved-company-uuid>', true);
--   -- paste/run this file
--   commit;

do $seed$
declare
  v_company_text text := nullif(current_setting('maju.target_company_id', true), '');
  v_company uuid;
  v_territory constant uuid := '02000000-0000-4000-8000-000000000001';
begin
  if v_company_text is null or v_company_text !~* '^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$' then
    raise exception 'target_company_id_required';
  end if;
  v_company := v_company_text::uuid;

  if to_regclass('public.delivery_territories') is null
    or to_regclass('public.delivery_territory_areas') is null
    or to_regclass('public.store_order_territory_rules') is null then
    raise exception 'delivery_configuration_tables_required';
  end if;
  if not exists (select 1 from public.companies where id = v_company) then
    raise exception 'target_company_not_found';
  end if;
  if exists (select 1 from public.delivery_territories where company_id = v_company)
    or exists (select 1 from public.delivery_territory_areas where company_id = v_company)
    or exists (select 1 from public.store_order_territory_rules where company_id = v_company) then
    raise exception 'target_company_delivery_configuration_not_empty';
  end if;
  if exists (select 1 from public.delivery_territories where id = v_territory) then
    raise exception 'seed_territory_id_conflict';
  end if;

  insert into public.delivery_territories(id, company_id, name, is_active)
  values (v_territory, v_company, '서울 송파구', true);

  insert into public.delivery_territory_areas(company_id, territory_id, administrative_area)
  values (v_company, v_territory, '서울특별시 송파구');

  insert into public.store_order_territory_rules(company_id, territory_id, delivery_weekdays)
  values (v_company, v_territory, array[1,2,3,4,5,6]::smallint[]);

  if not exists (
    select 1
    from public.delivery_territories t
    join public.delivery_territory_areas a on a.company_id = t.company_id and a.territory_id = t.id
    join public.store_order_territory_rules r on r.company_id = t.company_id and r.territory_id = t.id
    where t.company_id = v_company and t.id = v_territory and t.name = '서울 송파구' and t.is_active
      and a.administrative_area = '서울특별시 송파구'
      and r.delivery_weekdays = array[1,2,3,4,5,6]::smallint[]
  ) then
    raise exception 'songpa_delivery_seed_verification_failed';
  end if;
end
$seed$;
