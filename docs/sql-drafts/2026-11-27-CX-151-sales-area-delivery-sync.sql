-- CX-151 draft only. Do not run in production without separate approval.
begin;

alter table public.company_lead_search_regions
  add column if not exists delivery_disabled boolean not null default false;

create or replace function public.sales_area_delivery_sync_status_v1(p_company_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = ''
as $function$
  with default_territory as (
    select id
    from public.delivery_territories
    where company_id = p_company_id
      and name = '기본 배송 권역(영업 지역)'
    limit 1
  ), assigned as (
    select btrim(label) as area, delivery_disabled
    from public.company_lead_search_regions
    where company_id = p_company_id
      and coalesce(area_kind, 'assigned') = 'assigned'
      and length(btrim(label)) > 0
  ), classified as (
    select a.area,
      a.delivery_disabled,
      coalesce(own.territory_id = dt.id, false) as in_default,
      coalesce(own.territory_id is not null and own.territory_id is distinct from dt.id, false) as in_other
    from assigned a
    left join default_territory dt on true
    left join public.delivery_territory_areas own
      on own.company_id = p_company_id and own.administrative_area = a.area
  )
  select pg_catalog.jsonb_build_object(
    'defaultTerritoryId', (select id from default_territory),
    'syncedAreas', coalesce((select pg_catalog.jsonb_agg(area order by area) from classified where not delivery_disabled and in_default), '[]'::jsonb),
    'disabledAreas', coalesce((select pg_catalog.jsonb_agg(area order by area) from classified where delivery_disabled), '[]'::jsonb),
    'conflictAreas', coalesce((select pg_catalog.jsonb_agg(area order by area) from classified where not delivery_disabled and in_other), '[]'::jsonb),
    'missingAreas', coalesce((select pg_catalog.jsonb_agg(area order by area) from classified where not delivery_disabled and not in_default and not in_other), '[]'::jsonb)
  );
$function$;

create or replace function public.sync_sales_areas_to_default_delivery_territory_v1(p_company_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
declare
  v_default_territory_id uuid;
begin
  if p_company_id is null then
    raise exception using errcode = '22004', message = 'company_id_required';
  end if;

  perform 1 from public.companies where id = p_company_id;
  if not found then
    raise exception using errcode = 'P0002', message = 'company_not_found';
  end if;

  select id into v_default_territory_id
  from public.delivery_territories
  where company_id = p_company_id
    and name = '기본 배송 권역(영업 지역)'
  limit 1;

  if v_default_territory_id is null and exists (
    select 1 from public.company_lead_search_regions
    where company_id = p_company_id
      and coalesce(area_kind, 'assigned') = 'assigned'
      and not delivery_disabled
      and length(btrim(label)) > 0
  ) then
    insert into public.delivery_territories (company_id, name)
    values (p_company_id, '기본 배송 권역(영업 지역)')
    on conflict (company_id, name) do update set updated_at = now()
    returning id into v_default_territory_id;
  end if;

  if v_default_territory_id is not null then
    delete from public.delivery_territory_areas a
    where a.company_id = p_company_id
      and a.territory_id = v_default_territory_id
      and not exists (
        select 1 from public.company_lead_search_regions r
        where r.company_id = p_company_id
          and coalesce(r.area_kind, 'assigned') = 'assigned'
          and not r.delivery_disabled
          and btrim(r.label) = a.administrative_area
      );

    insert into public.delivery_territory_areas (company_id, territory_id, administrative_area)
    select p_company_id, v_default_territory_id, btrim(r.label)
    from public.company_lead_search_regions r
    where r.company_id = p_company_id
      and coalesce(r.area_kind, 'assigned') = 'assigned'
      and not r.delivery_disabled
      and length(btrim(r.label)) > 0
      and not exists (
        select 1 from public.delivery_territory_areas occupied
        where occupied.company_id = p_company_id
          and occupied.administrative_area = btrim(r.label)
      )
    on conflict (company_id, administrative_area) do nothing;
  end if;

  return public.sales_area_delivery_sync_status_v1(p_company_id);
end;
$function$;

create or replace function public.set_sales_area_delivery_disabled_v1(
  p_company_id uuid,
  p_region_id uuid,
  p_disabled boolean
)
returns jsonb
language plpgsql
security definer
set search_path = ''
as $function$
begin
  if p_company_id is null or p_region_id is null or p_disabled is null then
    raise exception using errcode = '22004', message = 'required_argument_missing';
  end if;

  update public.company_lead_search_regions
  set delivery_disabled = p_disabled
  where company_id = p_company_id
    and id = p_region_id
    and coalesce(area_kind, 'assigned') = 'assigned';

  if not found then
    raise exception using errcode = 'P0002', message = 'sales_area_not_found';
  end if;

  return public.sync_sales_areas_to_default_delivery_territory_v1(p_company_id);
end;
$function$;

revoke all on function public.sales_area_delivery_sync_status_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.sync_sales_areas_to_default_delivery_territory_v1(uuid) from public, anon, authenticated, service_role;
revoke all on function public.set_sales_area_delivery_disabled_v1(uuid, uuid, boolean) from public, anon, authenticated, service_role;
grant execute on function public.sales_area_delivery_sync_status_v1(uuid) to service_role;
grant execute on function public.sync_sales_areas_to_default_delivery_territory_v1(uuid) to service_role;
grant execute on function public.set_sales_area_delivery_disabled_v1(uuid, uuid, boolean) to service_role;

comment on column public.company_lead_search_regions.delivery_disabled is
  'CX-151: true면 영업 지역으로 유지하되 기본 배송 권역에는 넣지 않는다.';

commit;
