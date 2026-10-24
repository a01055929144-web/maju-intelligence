-- 운영 적용 완료(2026-10-24). 재실행 금지.
-- 병합 계획 고정 스키마이며 실제 병합은 수행하지 않습니다.
begin;

create table if not exists public.lead_merge_plan_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  merge_batch_id uuid not null,
  group_key text not null,
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
  constraint lead_merge_plan_items_batch_loser_uq unique(merge_batch_id,losing_lead_id),
  constraint lead_merge_plan_items_batch_group_loser_uq unique(merge_batch_id,group_key,losing_lead_id)
);

create index if not exists lead_merge_plan_items_batch_status_idx
  on public.lead_merge_plan_items(company_id,merge_batch_id,execution_status);
create index if not exists lead_merge_plan_items_batch_group_idx
  on public.lead_merge_plan_items(company_id,merge_batch_id,group_key);
create index if not exists lead_merge_plan_items_batch_representative_idx
  on public.lead_merge_plan_items(merge_batch_id,representative_lead_id);

create or replace function public.guard_lead_merge_plan_item()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  if exists (
    select 1 from public.business_permit_leads lead_row
    where lead_row.company_id=new.company_id
      and lead_row.id in (new.representative_lead_id,new.losing_lead_id)
      and lead_row.merged_into_lead_id is not null
  ) then
    raise exception 'already merged leads cannot be added to a merge plan';
  end if;
  if exists (
    select 1 from public.lead_merge_plan_items item
    where item.merge_batch_id=new.merge_batch_id and item.id<>new.id
      and (item.losing_lead_id=new.representative_lead_id
        or item.representative_lead_id=new.losing_lead_id)
  ) then
    raise exception 'a lead cannot be both representative and losing lead in one batch';
  end if;
  return new;
end;
$$;
revoke all on function public.guard_lead_merge_plan_item() from public,anon,authenticated;
grant execute on function public.guard_lead_merge_plan_item() to service_role;
drop trigger if exists lead_merge_plan_items_guard_trg on public.lead_merge_plan_items;
create trigger lead_merge_plan_items_guard_trg
before insert or update of company_id,merge_batch_id,representative_lead_id,losing_lead_id
on public.lead_merge_plan_items for each row execute function public.guard_lead_merge_plan_item();

alter table public.lead_merge_plan_items enable row level security;
revoke all on table public.lead_merge_plan_items from public,anon,authenticated;
grant select,insert,update on table public.lead_merge_plan_items to service_role;

commit;

-- 실행기는 group_key별로 representative_updated_at/losing_updated_at을 모두 비교합니다.
-- 하나라도 바뀐 그룹의 모든 항목을 skipped_changed로 기록하고 나머지 그룹은 계속합니다.
-- 적용 대상 그룹에서는 계획 행과 실행 행의 차이를 허용하지 않습니다.

