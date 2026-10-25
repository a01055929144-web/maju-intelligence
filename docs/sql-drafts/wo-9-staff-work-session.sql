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
-- list_latest_operational_staff_locations는 활성 근무 세션을 우선하고 current_customer_id는 구버전 앱 fallback으로 유지한다.
commit;
-- 롤백(별도 승인 후): 위 인덱스·제약·6개 컬럼을 제거한다.
