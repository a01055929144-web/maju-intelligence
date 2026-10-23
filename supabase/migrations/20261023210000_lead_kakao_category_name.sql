-- 운영 적용 완료(2026-10-23). 재실행 금지.
-- 운영 적용 승인(2026-10-23). 기존 리드 일괄 재조회 금지.
-- 카카오 category_name 원문을 다음 보강부터 자연스럽게 축적합니다. 기존 리드 일괄 재조회는 하지 않습니다.
begin;

alter table public.business_permit_leads
  add column if not exists kakao_category_name text;

do $$ begin
  if not exists (
    select 1
    from pg_constraint
    where conrelid = 'public.business_permit_leads'::regclass
      and conname = 'business_permit_leads_kakao_category_name_length_ck'
  ) then
    alter table public.business_permit_leads
      add constraint business_permit_leads_kakao_category_name_length_ck
      check (kakao_category_name is null or char_length(kakao_category_name) <= 500);
  end if;
end $$;

create index if not exists business_permit_leads_company_kakao_category_idx
  on public.business_permit_leads(company_id, kakao_category_name)
  where kakao_category_name is not null;

commit;

-- ROLLBACK (데이터 보존 여부를 확인한 뒤 별도 승인으로 실행)
-- drop index if exists public.business_permit_leads_company_kakao_category_idx;
-- alter table public.business_permit_leads drop constraint if exists business_permit_leads_kakao_category_name_length_ck;
-- alter table public.business_permit_leads drop column if exists kakao_category_name;
