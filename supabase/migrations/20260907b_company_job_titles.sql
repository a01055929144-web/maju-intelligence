-- 2026-09-07: 직원 "담당 업무" 이름표(배송기사/영업직원/현장관리자/일반직원 등)를 회사가
-- 자유롭게 추가/삭제할 수 있도록 회사별 카탈로그 테이블을 추가합니다.
-- 기본 4개 값(driver/sales/manager/member)은 권한 체계(lib/workspace.ts)와 연결되어 있어
-- 화면에서 항상 고정으로 제공되고 삭제할 수 없습니다. 이 테이블에는 회사가 직접 추가한
-- 커스텀 이름표만 저장되며, 저장된 라벨 문자열이 그대로 staff_invitations.role 값으로
-- 쓰입니다(권한상으로는 lib/workspace.ts normalizeWorkspaceRole()이 인식하지 못하는 값이라
-- 자동으로 일반직원과 동일한 권한으로 처리됩니다 — 안전한 기본값).
create table if not exists public.company_job_titles (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  created_by text,
  created_at timestamptz not null default now(),
  constraint company_job_titles_company_label_unique unique (company_id, label)
);

create index if not exists idx_company_job_titles_company
  on public.company_job_titles(company_id);

alter table public.company_job_titles enable row level security;
