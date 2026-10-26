-- REVIEW ONLY. 운영 적용 금지. WO-9 근무 세션 및 최신 운행 위치.
begin;
alter table public.staff_mobile_devices
  add column if not exists work_started_at timestamptz,
  add column if not exists work_ended_at timestamptz,
  add column if not exists work_auto_ends_at timestamptz,
  add column if not exists last_history_at timestamptz,
  add column if not exists last_history_lat numeric,
  add column if not exists last_history_lng numeric;
alter table public.staff_mobile_devices drop constraint if exists staff_mobile_devices_work_window_check;
alter table public.staff_mobile_devices add constraint staff_mobile_devices_work_window_check
  check (work_auto_ends_at is null or work_started_at is not null);
create index if not exists staff_mobile_devices_company_work_idx
  on public.staff_mobile_devices(company_id, work_auto_ends_at desc)
  where work_started_at is not null and work_ended_at is null;
create or replace function public.list_latest_operational_staff_locations(
  p_company_id uuid,
  p_user_id uuid default null
)
returns table (
  id uuid, device_id uuid, user_id uuid, driver_name text, delivery_vehicle text,
  latitude numeric, longitude numeric, accuracy_m numeric, recorded_at timestamptz,
  current_customer_id uuid
)
language sql
stable
security invoker
set search_path = public
as $$
  select distinct on (event.user_id)
    event.id, event.device_id, event.user_id, event.driver_name, event.delivery_vehicle,
    event.latitude, event.longitude, event.accuracy_m, event.recorded_at, event.current_customer_id
  from public.staff_location_events event
  where event.company_id = p_company_id
    and (p_user_id is null or event.user_id = p_user_id)
    and (
      event.current_customer_id is not null
      or exists (
        select 1
        from public.staff_mobile_devices device
        where device.company_id = event.company_id
          and device.user_id = event.user_id
          and device.work_started_at is not null
          and device.work_ended_at is null
          and device.work_auto_ends_at > now()
          and event.recorded_at >= device.work_started_at
      )
    )
  order by event.user_id, event.recorded_at desc;
$$;
revoke all on function public.list_latest_operational_staff_locations(uuid, uuid) from public, anon, authenticated;
grant execute on function public.list_latest_operational_staff_locations(uuid, uuid) to service_role;
commit;
-- 롤백(별도 승인 후): 기존 staff-latest-operational-locations.sql 함수를 복원한 뒤 위 인덱스·제약·6개 컬럼을 제거한다.
