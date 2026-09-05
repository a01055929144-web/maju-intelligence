-- 2026-08-26: 회사 자체 가입(온보딩) 지원.
-- P0-3(가입 화면)과 P0-4(사업자등록번호 중복 가입 방지)를 위한 컬럼과 제약을 추가합니다.
alter table public.companies
  add column if not exists business_registration_number text,
  add column if not exists terms_agreed_at timestamptz,
  add column if not exists privacy_agreed_at timestamptz;

-- 사업자등록번호가 실제로 입력된 회사끼리만 중복을 막습니다(과거에 관리자가 수동 생성한
-- 회사는 사업자등록번호가 없을 수 있으므로 null/빈 값은 제약에서 제외).
create unique index if not exists companies_business_registration_number_unique
  on public.companies (business_registration_number)
  where business_registration_number is not null and business_registration_number <> '';
