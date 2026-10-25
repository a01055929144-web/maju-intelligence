-- REVIEW ONLY. 운영 적용 전 대표 승인 필요(프로젝트 fcmdvveqmcgtioelzqun).
-- WO-2: 리드 목록의 최근 연락 칸과 서버 필터/정렬에 쓰는 비정규화 요약입니다.
-- 기존 리드 백필은 이 초안 범위 밖이며 별도 승인 후 실행합니다.

begin;

alter table public.business_permit_leads
  add column if not exists last_contact_at timestamptz,
  add column if not exists last_contact_channel text,
  add column if not exists last_contact_summary text;

do $$
begin
  if not exists (
    select 1 from pg_constraint
    where conname = 'business_permit_leads_last_contact_channel_check'
      and conrelid = 'public.business_permit_leads'::regclass
  ) then
    alter table public.business_permit_leads
      add constraint business_permit_leads_last_contact_channel_check
      check (last_contact_channel is null or last_contact_channel in ('call','dm','visit','quote','sms','talktalk','email','fax'));
  end if;
end
$$;

create index if not exists business_permit_leads_company_last_contact_idx
  on public.business_permit_leads(company_id, last_contact_at desc, id)
  where merged_into_lead_id is null;

create or replace function public.sync_permit_lead_last_contact()
returns trigger
language plpgsql
security invoker
set search_path = public
as $$
begin
  if new.action_type not in ('call','dm','visit','quote','sms','talktalk','email','fax') then
    return new;
  end if;

  update public.business_permit_leads lead
  set
    last_contact_at = new.created_at,
    last_contact_channel = new.action_type,
    last_contact_summary = left(coalesce(nullif(new.result, ''), nullif(new.memo, ''), new.action_type), 240)
  where lead.company_id = new.company_id
    and lead.id = new.lead_id
    and (lead.last_contact_at is null or lead.last_contact_at <= new.created_at);

  return new;
end;
$$;

revoke all on function public.sync_permit_lead_last_contact() from public, anon, authenticated;
grant execute on function public.sync_permit_lead_last_contact() to service_role;

drop trigger if exists lead_actions_sync_permit_last_contact on public.lead_actions;
create trigger lead_actions_sync_permit_last_contact
after insert or update of action_type, result, memo, created_at
on public.lead_actions
for each row execute function public.sync_permit_lead_last_contact();

commit;

-- 롤백(별도 승인 후):
-- begin;
-- drop trigger if exists lead_actions_sync_permit_last_contact on public.lead_actions;
-- drop function if exists public.sync_permit_lead_last_contact();
-- drop index if exists public.business_permit_leads_company_last_contact_idx;
-- alter table public.business_permit_leads
--   drop constraint if exists business_permit_leads_last_contact_channel_check,
--   drop column if exists last_contact_summary,
--   drop column if exists last_contact_channel,
--   drop column if exists last_contact_at;
-- commit;
