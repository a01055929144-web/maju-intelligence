-- REVIEW ONLY. 운영 적용 전 사용자 승인이 필요합니다.
-- 빈 사업자등록번호는 허용하고, 실제 번호만 회사 전체에서 중복을 막습니다.

begin;

do $$
begin
  if exists (
    select 1
    from public.companies
    where nullif(btrim(business_registration_number), '') is not null
    group by regexp_replace(business_registration_number, '[^0-9]', '', 'g')
    having count(*) > 1
  ) then
    raise exception '사업자등록번호 중복 회사가 있어 고유 인덱스를 만들 수 없습니다. 아래 사전 점검 결과를 먼저 정리하세요.';
  end if;
end $$;

create unique index if not exists companies_business_registration_number_nonblank_uq
  on public.companies ((regexp_replace(business_registration_number, '[^0-9]', '', 'g')))
  where nullif(btrim(business_registration_number), '') is not null;

commit;

-- 사전 점검(읽기 전용):
-- select regexp_replace(business_registration_number, '[^0-9]', '', 'g') as normalized_number,
--        array_agg(id order by created_at) as company_ids,
--        array_agg(name order by created_at) as company_names
-- from public.companies
-- where nullif(btrim(business_registration_number), '') is not null
-- group by 1 having count(*) > 1;

-- 롤백(별도 승인 후):
-- drop index if exists public.companies_business_registration_number_nonblank_uq;
