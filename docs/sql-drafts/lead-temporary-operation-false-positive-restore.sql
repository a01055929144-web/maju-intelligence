-- REVIEW ONLY. 운영 데이터 변경 승인 전 실행 금지.
-- 2026-10-25 실제 조회 결과 복구 대상은 0건입니다. 아래 UPDATE는 향후 대상이 생길 때 다시
-- 건수를 확인하고 승인받은 뒤 사용하는 복구 초안입니다.
begin;

create table if not exists public.lead_temporary_operation_restore_backup_20261025
  (like public.business_permit_leads including defaults);

with restore_candidates as (
  select lead.id
  from public.business_permit_leads lead
  where lead.merged_into_lead_id is null
    and lead.status = '임시 영업'
    and lead.next_action_reasons && array[
      '단기 영업 표지: 일원',
      '단기 영업 표지: 일대',
      '단기 영업 표지: 광장'
    ]::text[]
    and not (
      coalesce(lead.address, '') ~ '(^|[[:space:],(])(일원|일대)($|[[:space:],.)])'
      or coalesce(lead.address, '') ~ '(공원|시민|역)[[:space:]]*광장($|[[:space:],.)])'
    )
), backed_up as (
  insert into public.lead_temporary_operation_restore_backup_20261025
  select lead.*
  from public.business_permit_leads lead
  join restore_candidates candidate on candidate.id = lead.id
  returning id
)
update public.business_permit_leads lead
set status = '신규 수집',
    exclude_reason = null,
    next_action = '정보 확인',
    next_action_reasons = array['임시 영업 오탐 복구']::text[],
    updated_at = now()
where lead.id in (select id from backed_up);

-- 승인 실행 시 변경 건수를 먼저 확인하고 commit으로 바꿉니다.
rollback;

-- 되돌리기 초안: 백업 행 전체 컬럼을 원본에 복원해야 하므로 실제 실행 전 현재 스키마 컬럼을
-- 다시 대조해 명시적 UPDATE 목록을 작성합니다. 시간 범위 기반 복구는 사용하지 않습니다.
