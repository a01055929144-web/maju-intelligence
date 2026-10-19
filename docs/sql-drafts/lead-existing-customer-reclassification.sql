-- REVIEW ONLY: 운영 적용 금지. 사용자 승인 후 실행합니다.
-- 거래처 연결 상태지만 자동 기술 기록을 제외한 사용자 연락·방문 기록이 없는 리드를
-- '기존 거래처'로 재분류할 예상 대상을 확인합니다.

select lead.company_id, count(*) as reclassification_target_count
from public.business_permit_leads lead
where lead.status = '거래처 전환'
  and lead.matched_customer_id is not null
  and lead.is_duplicate = true
  and not exists (
    select 1
    from public.lead_actions action
    where action.company_id = lead.company_id
      and action.lead_id = lead.id
      and not (
        action.action_type = 'hold'
        and action.result in ('외부 정보 보강', '인스타 정보 수정')
      )
  )
group by lead.company_id
order by lead.company_id;

-- 승인 후 실행할 UPDATE
-- update public.business_permit_leads lead
-- set status = '기존 거래처', updated_at = now()
-- where lead.status = '거래처 전환'
--   and lead.matched_customer_id is not null
--   and lead.is_duplicate = true
--   and not exists (...위와 동일한 사용자 활동 판정...);
