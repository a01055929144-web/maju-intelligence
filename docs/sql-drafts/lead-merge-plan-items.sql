-- REVIEW ONLY. 운영 실행 금지. 병합 계획 고정용 스키마 초안.
begin;

create table if not exists public.lead_merge_plan_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  merge_batch_id uuid not null,
  candidate_fingerprint text not null,
  merge_confirmed_key text not null,
  representative_lead_id uuid not null,
  losing_lead_id uuid not null,
  match_reason text not null check(match_reason in ('source_key','business_number','strict_name_address')),
  resolved_status text,
  status_resolution_reason text not null,
  status_source_modified_at timestamptz,
  representative_updated_at timestamptz not null,
  losing_updated_at timestamptz not null,
  planned_at timestamptz not null default now(),
  execution_status text not null default 'planned'
    check(execution_status in ('planned','applied','skipped_changed','rolled_back')),
  executed_at timestamptz,
  constraint lead_merge_plan_items_batch_fk foreign key(company_id,merge_batch_id)
    references public.lead_merge_batches(company_id,id) on delete cascade,
  constraint lead_merge_plan_items_representative_fk foreign key(company_id,representative_lead_id)
    references public.business_permit_leads(company_id,id) on delete no action deferrable initially deferred,
  constraint lead_merge_plan_items_losing_fk foreign key(company_id,losing_lead_id)
    references public.business_permit_leads(company_id,id) on delete no action deferrable initially deferred,
  constraint lead_merge_plan_items_not_self_ck check(representative_lead_id<>losing_lead_id),
  constraint lead_merge_plan_items_batch_loser_uq unique(merge_batch_id,losing_lead_id)
);

create index if not exists lead_merge_plan_items_batch_status_idx
  on public.lead_merge_plan_items(company_id,merge_batch_id,execution_status);
alter table public.lead_merge_plan_items enable row level security;
revoke all on table public.lead_merge_plan_items from public,anon,authenticated;
grant select,insert,update on table public.lead_merge_plan_items to service_role;

commit;

-- 실행기는 representative_updated_at/losing_updated_at이 현재 값과 정확히 같은 항목만 적용합니다.
-- 하나라도 달라진 항목은 skipped_changed로 기록하고, 허용 차이 0 원칙에 따라 배치 전체를 실행하지 않습니다.
