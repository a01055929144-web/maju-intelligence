-- 검토 전용. 실행 금지: 기존 리드는 삭제하지 않고 대표 리드로 연결하는 방식입니다.
alter table public.business_permit_leads
  add column if not exists merged_into_lead_id uuid,
  add column if not exists merged_at timestamptz,
  add column if not exists merge_reason text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'business_permit_leads_company_id_id_key') then
    alter table public.business_permit_leads add constraint business_permit_leads_company_id_id_key unique(company_id, id);
  end if;
  if not exists (select 1 from pg_constraint where conname = 'business_permit_leads_merged_into_fk') then
    alter table public.business_permit_leads add constraint business_permit_leads_merged_into_fk
      foreign key(company_id, merged_into_lead_id)
      references public.business_permit_leads(company_id, id) on delete restrict;
  end if;
end $$;

create index if not exists business_permit_leads_active_canonical_idx
  on public.business_permit_leads(company_id, canonical_fingerprint)
  where merged_into_lead_id is null;

-- 실제 병합은 dry-run의 대표 선정 결과를 임시 테이블로 확정한 뒤 FK 기록을 대표 ID로 옮기고,
-- 마지막에 losing row의 merged_into_lead_id/merged_at/merge_reason만 기록합니다. DELETE는 하지 않습니다.

-- ROLLBACK (실제 병합 배치 ID/시각을 확정한 뒤 해당 배치만 실행)
-- update public.business_permit_leads
-- set merged_into_lead_id = null, merged_at = null, merge_reason = null
-- where merged_at >= :merge_batch_started_at and merged_at < :merge_batch_finished_at;

