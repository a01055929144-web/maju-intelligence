-- REVIEW ONLY. 운영 적용 전 별도 승인이 필요합니다.
-- 직원별 N+1 조회를 회사 단위 1회 조회로 바꾸기 위한 함수와 부분 인덱스입니다.
begin;

create index if not exists staff_location_events_company_user_work_recorded_idx
  on public.staff_location_events(company_id, user_id, recorded_at desc)
  where current_customer_id is not null;

create or replace function public.list_latest_operational_staff_locations(
  p_company_id uuid,
  p_user_id uuid default null
)
returns table (
  id uuid,
  device_id uuid,
  user_id uuid,
  driver_name text,
  delivery_vehicle text,
  latitude numeric,
  longitude numeric,
  accuracy_m numeric,
  recorded_at timestamptz,
  current_customer_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (event.user_id)
    event.id,
    event.device_id,
    event.user_id,
    event.driver_name,
    event.delivery_vehicle,
    event.latitude,
    event.longitude,
    event.accuracy_m,
    event.recorded_at,
    event.current_customer_id
  from public.staff_location_events event
  where event.company_id = p_company_id
    and event.current_customer_id is not null
    and (p_user_id is null or event.user_id = p_user_id)
  order by event.user_id, event.recorded_at desc;
$$;

revoke all on function public.list_latest_operational_staff_locations(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_latest_operational_staff_locations(uuid, uuid) to service_role;

commit;

-- 롤백(필요 시 별도 승인 후 실행)
-- drop function if exists public.list_latest_operational_staff_locations(uuid, uuid);
-- drop index if exists public.staff_location_events_company_user_work_recorded_idx;
