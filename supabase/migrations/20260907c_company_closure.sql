-- 2026-09-07: 고객사 탈퇴(회사 계정 전체 삭제) 기능을 위한 컬럼입니다. 하드 삭제가 아니라
-- companies.status를 "closed"로 바꾸는 비활성화(소프트 삭제) 방식이라, 언제 누가 탈퇴
-- 처리했는지 기록해두면 나중에 복구하거나 문의에 대응할 때 유용합니다.
alter table public.companies
  add column if not exists closed_at timestamptz,
  add column if not exists closed_by text;
