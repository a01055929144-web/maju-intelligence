-- 운영 적용 완료(2026-10-25). 재실행 금지.
-- 배치 cf8bd948-65c7-4c8e-bc54-993cb3f6352e의 변경 전 상태를 보관합니다.

create table if not exists public.lead_temporary_operation_backups (
  batch_id uuid not null,
  lead_id uuid not null,
  company_id uuid not null,
  previous_status text,
  previous_next_action text,
  previous_next_action_reasons text[],
  previous_exclude_reason text,
  classification_reason text not null,
  backed_up_at timestamptz not null default now(),
  primary key (batch_id, lead_id)
);

alter table public.lead_temporary_operation_backups enable row level security;
revoke all on table public.lead_temporary_operation_backups from public, anon, authenticated;
grant all on table public.lead_temporary_operation_backups to service_role;

-- 운영 데이터 분류 UPDATE는 위 배치 ID로 1회 실행했으며 이 마이그레이션에서 반복하지 않습니다.
-- 복원은 docs/sql-drafts/lead-temporary-operation-bulk-rollback.sql을 사용합니다.
