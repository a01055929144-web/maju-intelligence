-- 운영 적용 완료(2026-10-25). 재실행 금지.
-- 한 배치에서 같은 대표 리드가 서로 다른 group_key에 속하는 계획 오류를 차단합니다.
create or replace function public.guard_lead_merge_plan_item()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if exists (
    select 1
    from public.lead_merge_plan_items item
    where item.merge_batch_id = new.merge_batch_id
      and item.id <> new.id
      and (
        item.losing_lead_id = new.representative_lead_id
        or item.representative_lead_id = new.losing_lead_id
        or (
          item.representative_lead_id = new.representative_lead_id
          and item.group_key <> new.group_key
        )
      )
  ) then
    raise exception '한 리드는 같은 배치에서 서로 다른 병합 그룹이나 역할에 속할 수 없습니다.';
  end if;
  return new;
end;
$$;

revoke all on function public.guard_lead_merge_plan_item() from public, anon, authenticated;
grant execute on function public.guard_lead_merge_plan_item() to service_role;

drop trigger if exists lead_merge_plan_items_guard_trg on public.lead_merge_plan_items;
create trigger lead_merge_plan_items_guard_trg
before insert or update of company_id, merge_batch_id, group_key, representative_lead_id, losing_lead_id
on public.lead_merge_plan_items
for each row execute function public.guard_lead_merge_plan_item();
