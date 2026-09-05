-- 하나의 사업자등록번호(예: 종사업자번호)로 여러 거래처(지점)를 운영하는 경우를 위한
-- 회사별 "중복 허용" 사업자번호 목록입니다. 데이터 등록/업로드 시 이 표에 등록된
-- 사업자번호는 자동 병합·중복 경고 대상에서 제외되고 상호명+주소 기준으로 구분됩니다.

create table if not exists public.business_number_exceptions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  business_registration_number text not null,
  memo text,
  created_by text,
  created_at timestamptz not null default now(),
  constraint business_number_exceptions_company_number_unique unique (company_id, business_registration_number)
);

create index if not exists idx_business_number_exceptions_company
  on public.business_number_exceptions(company_id);

alter table public.business_number_exceptions enable row level security;
