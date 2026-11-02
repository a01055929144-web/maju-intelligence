-- DB-APPROVED: fcmdvveqmcgtioelzqun / L-2, 2026-11-02.
-- 면적만 추가한다. lead_attachments는 이 승인 범위에 없다.
begin;

alter table public.business_permit_leads
  add column if not exists store_area_sqm numeric(12,2);

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conrelid = 'public.business_permit_leads'::regclass
      and conname = 'business_permit_leads_store_area_sqm_check'
  ) then
    alter table public.business_permit_leads
      add constraint business_permit_leads_store_area_sqm_check
      check (store_area_sqm is null or (store_area_sqm > 0 and store_area_sqm <= 100000));
  end if;
end $$;

comment on column public.business_permit_leads.store_area_sqm is
  '공공 인허가 원천 LCTN_AREA/SITEAREA 소재지 면적(㎡). 평은 표시 시 3.3058로 나눈다.';

commit;
