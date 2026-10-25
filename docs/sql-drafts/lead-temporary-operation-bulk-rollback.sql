-- REVIEW ONLY. 복원이 필요할 때 별도 승인 후 실행하세요.
-- 2026-10-25 임시 영업 일괄 분류 배치의 변경 전 값을 복원합니다.

begin;

update public.business_permit_leads lead
set
  status = backup.previous_status,
  next_action = backup.previous_next_action,
  next_action_reasons = backup.previous_next_action_reasons,
  exclude_reason = backup.previous_exclude_reason
from public.lead_temporary_operation_backups backup
where backup.batch_id = 'cf8bd948-65c7-4c8e-bc54-993cb3f6352e'::uuid
  and backup.lead_id = lead.id
  and backup.company_id = lead.company_id;

commit;
