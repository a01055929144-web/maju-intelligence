-- REVIEW ONLY. 안전 검토가 전체 후보 75건과 승인 표본 7건의 범위 차이를 감지해 운영 실행 보류.
-- 아래 조건은 본사·강남구·최근 30일의 승인된 7건만 대상으로 고정합니다.
begin;
create table if not exists public.lead_industry_reclassification_backup_20261023_round2
  (like public.business_permit_leads including defaults including constraints);
alter table public.lead_industry_reclassification_backup_20261023_round2 enable row level security;
revoke all on table public.lead_industry_reclassification_backup_20261023_round2 from public,anon,authenticated;
grant select,insert on table public.lead_industry_reclassification_backup_20261023_round2 to service_role;

insert into public.lead_industry_reclassification_backup_20261023_round2
select lead.* from public.business_permit_leads lead
where lead.is_target_industry=false
  and lead.company_id='04ebb7bb-8da0-4723-8211-f2a947939344'::uuid
  and lead.administrative_area='서울특별시 강남구'
  and coalesce(lead.open_date,lead.permit_date,lead.created_at::date)>=(current_date-30)
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
  and company_id='04ebb7bb-8da0-4723-8211-f2a947939344'::uuid
  and administrative_area='서울특별시 강남구'
  and coalesce(open_date,permit_date,created_at::date)>=(current_date-30)
  and industry_raw in ('패밀리레스트랑','푸드트럭','출장조리');
commit;

-- ROLLBACK (별도 승인)
-- update public.business_permit_leads lead set
--   industry_primary=b.industry_primary,industry_tags=b.industry_tags,
--   is_target_industry=b.is_target_industry,exclude_reason=b.exclude_reason,
--   status=b.status,updated_at=b.updated_at
-- from public.lead_industry_reclassification_backup_20261023_round2 b
-- where lead.company_id=b.company_id and lead.id=b.id;
