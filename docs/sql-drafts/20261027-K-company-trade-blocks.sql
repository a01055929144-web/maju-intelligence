-- K 회사 내 거래 금지(블랙리스트) 설계 초안
-- 승인 전 실행 금지. 이 파일은 supabase/migrations 아래의 운영 마이그레이션이 아니다.
-- 회사 간 공유·조회, 기존 고객 삭제, 리드 자동 제외 트리거를 포함하지 않는다.

create table if not exists public.company_trade_blocks (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  business_number text not null,
  reason_code text not null,
  memo text,
  created_by_member_id uuid,
  created_by_name text not null,
  created_by_role text not null,
  created_at timestamptz not null default now(),
  revoked_at timestamptz,
  revoked_by_member_id uuid,
  revoked_by_name text,
  revoked_by_role text,
  revoke_memo text,
  constraint company_trade_blocks_business_number_check
    check (business_number ~ '^[0-9]{10}$'),
  constraint company_trade_blocks_reason_check
    check (reason_code in ('unpaid_balance', 'payment_issue', 'contract_issue', 'other')),
  constraint company_trade_blocks_created_role_check
    check (created_by_role in ('owner', 'manager')),
  constraint company_trade_blocks_revoked_role_check
    check (revoked_by_role is null or revoked_by_role in ('owner', 'manager')),
  constraint company_trade_blocks_revoke_fields_check
    check (
      (revoked_at is null and revoked_by_member_id is null and revoked_by_name is null and revoked_by_role is null)
      or
      (revoked_at is not null and revoked_by_name is not null and revoked_by_role is not null)
    ),
  constraint company_trade_blocks_created_member_company_fk
    foreign key (company_id, created_by_member_id)
    references public.company_members(company_id, id)
    on delete set null (created_by_member_id),
  constraint company_trade_blocks_revoked_member_company_fk
    foreign key (company_id, revoked_by_member_id)
    references public.company_members(company_id, id)
    on delete set null (revoked_by_member_id)
);

-- 위 복합 FK는 20261014084917_phase1_customer_assignment_ids.sql에서 추가된
-- company_members_company_id_id_unique 제약을 전제로 한다. 실제 적용 전 운영 DB에
-- 해당 제약이 있는지 확인하고, 없으면 같은 이름의 UNIQUE(company_id, id)를 먼저 적용한다.

-- 회사별로 같은 사업자번호의 활성 거래 금지는 한 건만 허용한다.
-- 다른 회사의 동일 번호 등록은 허용되며 회사 간 정보는 결합하지 않는다.
create unique index if not exists company_trade_blocks_company_number_active_uq
  on public.company_trade_blocks(company_id, business_number)
  where revoked_at is null;

create index if not exists company_trade_blocks_company_created_idx
  on public.company_trade_blocks(company_id, created_at desc);

alter table public.company_trade_blocks enable row level security;

-- 앱은 서버의 검증된 경로로만 접근한다. 실제 적용 전 프로젝트의 Data API 노출 설정과
-- service_role 사용 경로를 다시 확인한다.
revoke all on table public.company_trade_blocks from anon, authenticated;

-- 의도적으로 포함하지 않은 항목:
-- 1) business_permit_leads UPDATE/DELETE 트리거
-- 2) normalized_customers DELETE 또는 relationship_status 변경
-- 3) 회사 간 사업자번호 조회 함수/뷰
-- 4) 미수·결제 사유 공유
-- 5) SECURITY DEFINER 함수

