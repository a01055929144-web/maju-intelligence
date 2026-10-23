-- 운영 적용 완료(2026-10-23). 재실행 금지.
create table if not exists public.lead_industry_reclassification_backup_20261023 (
  company_id uuid not null,
  lead_id uuid primary key,
  industry_primary text,
  industry_tags text[],
  is_target_industry boolean not null,
  backed_up_at timestamptz not null default now()
);

revoke all on table public.lead_industry_reclassification_backup_20261023 from public, anon, authenticated;
grant all on table public.lead_industry_reclassification_backup_20261023 to service_role;
alter table public.lead_industry_reclassification_backup_20261023 enable row level security;

insert into public.lead_industry_reclassification_backup_20261023
  (company_id, lead_id, industry_primary, industry_tags, is_target_industry)
select l.company_id, l.id, l.industry_primary, l.industry_tags, l.is_target_industry
from public.business_permit_leads l
where l.is_target_industry = false
  and coalesce(l.industry_raw, '') ~ '(일반음식점|음식점|식당|중국식|외국음식전문점|횟집|패밀리레스토랑|경양식|기타|한식|일식|주점|호프|카페|제과|뷔페|부페)'
  and (coalesce(l.industry_raw, '') || ' ' || coalesce(l.business_name, '')) !~ '(미용실|이용원|네일|피부관리|학원|교습소|공인중개사|부동산중개|병원|의원|약국|한의원|동물병원|세탁|정비|카센터|숙박업|모텔|여관|고시원|PC방|노래연습장|당구장|골프연습장|체육시설|독서실|안경)'
on conflict (lead_id) do nothing;

update public.business_permit_leads l
set is_target_industry = true,
    updated_at = now()
from public.lead_industry_reclassification_backup_20261023 b
where b.company_id = l.company_id
  and b.lead_id = l.id
  and l.is_target_industry = false;

