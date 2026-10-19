-- 리드 목록·건수·보강 후보를 회사 영업 지역으로 DB에서 제한하기 위한 정규화 행정구역입니다.
-- 운영 적용 완료(2026-10-19). 재실행할 필요 없음.

alter table public.business_permit_leads
  add column if not exists administrative_area text;

create index if not exists business_permit_leads_company_administrative_area_idx
  on public.business_permit_leads (company_id, administrative_area);
