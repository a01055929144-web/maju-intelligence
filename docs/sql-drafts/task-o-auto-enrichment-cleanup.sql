-- Task O 조사/정리 초안 (2026-10-13)
-- 주의: 승인 전 운영 DB에 실행하지 않습니다. 기존 lead_actions를 삭제하거나 수정하지 않습니다.

-- 1) 현재 영향 건수 재확인(읽기 전용)
select
  count(*) as total_actions,
  count(*) filter (
    where actor_name = 'MAJU'
      and result = '외부 정보 보강'
  ) as auto_enrichment_actions
from public.lead_actions;

-- 2) 전용 보강 로그 테이블이 승인·배포된 이후 이관 대상과 중복 여부 확인(읽기 전용)
select
  company_id,
  lead_id,
  created_at as attempted_at,
  memo,
  count(*) over (
    partition by company_id, lead_id, created_at
  ) as exact_duplicate_count
from public.lead_actions
where actor_name = 'MAJU'
  and result = '외부 정보 보강'
order by created_at;

-- 3) 승인 후 실행할 이관 예시. 실제 lead_enrichment_events 스키마 확정 뒤 컬럼을 맞춰 사용합니다.
-- insert into public.lead_enrichment_events
--   (company_id, lead_id, source, attempted_at, succeeded, message, metadata)
-- select
--   company_id,
--   lead_id,
--   'legacy_unknown', -- 기존 행은 cron/manual 출처를 DB 값만으로 구분할 수 없음
--   created_at,
--   true,
--   memo,
--   jsonb_build_object('legacy_action_id', id, 'legacy_actor_name', actor_name)
-- from public.lead_actions
-- where actor_name = 'MAJU'
--   and result = '외부 정보 보강'
-- on conflict do nothing;

-- 4) 이관 건수와 원본 건수가 정확히 일치하는지 검증한 뒤에만 정리를 검토합니다.
-- 기존 데이터 삭제는 별도 승인 전 절대 실행하지 않습니다.
-- delete from public.lead_actions
-- where actor_name = 'MAJU'
--   and result = '외부 정보 보강';
