-- 운영 적용 승인(2026-10-23): 두 회사 전체 기간·지역의 정확한 3개 업태 75건.
begin;
create table if not exists public.lead_industry_reclassification_backup_20261023_round2
  (like public.business_permit_leads including defaults including constraints);
alter table public.lead_industry_reclassification_backup_20261023_round2 enable row level security;
revoke all on table public.lead_industry_reclassification_backup_20261023_round2 from public,anon,authenticated;
grant select,insert on table public.lead_industry_reclassification_backup_20261023_round2 to service_role;

insert into public.lead_industry_reclassification_backup_20261023_round2
select lead.* from public.business_permit_leads lead
where lead.is_target_industry=false
  and lead.industry_raw in ('패밀리레스트랑','푸드트럭','출장조리')
on conflict do nothing;

update public.business_permit_leads
set industry_primary=case industry_raw
      when '패밀리레스트랑' then '양식'
      when '푸드트럭' then '프랜차이즈/배달'
      when '출장조리' then '뷔페/단체급식' end,
    industry_tags=array[industry_raw],is_target_industry=true,
    exclude_reason=case when exclude_reason='영업 대상 업종 아님' then null else exclude_reason end,
    status=case when status='제외' and is_active=true and is_duplicate=false then '신규 수집' else status end,
    updated_at=now()
where is_target_industry=false
  and industry_raw in ('패밀리레스트랑','푸드트럭','출장조리');
commit;

-- ROLLBACK (별도 승인)
-- update public.business_permit_leads lead set
--   industry_primary=b.industry_primary,industry_tags=b.industry_tags,
--   is_target_industry=b.is_target_industry,exclude_reason=b.exclude_reason,
--   status=b.status,updated_at=b.updated_at
-- from public.lead_industry_reclassification_backup_20261023_round2 b
-- where lead.company_id=b.company_id and lead.id=b.id;
