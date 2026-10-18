-- 운영 적용 완료(2026-10-18). 재실행 금지.
-- Task P 후속: 신규 리드 보강 재조회 주기 14일 → 28일 → 60일, 개업 180일 후 중단.

begin;

create or replace function public.list_leads_due_for_enrichment(
  p_company_id uuid,
  p_limit integer default 30
)
returns table (lead_id uuid)
language sql
stable
security invoker
set search_path = ''
as $$
  select lead.id as lead_id
  from public.business_permit_leads as lead
  left join lateral (
    select
      count(*)::integer as attempt_count,
      max(event.attempted_at) as last_attempted_at
    from public.lead_enrichment_events as event
    where event.company_id = p_company_id
      and event.lead_id = lead.id
      and event.source = 'cron'
      and event.metadata ->> 'event_type' = 'external_info_enrichment'
  ) as retry_history on true
  where lead.company_id = p_company_id
    and lead.status <> '제외'
    and (lead.phone is null or lead.address is null)
    and coalesce(lead.open_date, lead.permit_date, (lead.created_at at time zone 'Asia/Seoul')::date)
      >= ((now() at time zone 'Asia/Seoul')::date - 180)
    and (
      retry_history.last_attempted_at is null
      or retry_history.last_attempted_at <= now() - case
        when retry_history.attempt_count <= 1 then interval '14 days'
        when retry_history.attempt_count = 2 then interval '28 days'
        else interval '60 days'
      end
    )
  order by retry_history.last_attempted_at asc nulls first, lead.created_at asc
  limit greatest(1, least(coalesce(p_limit, 30), 500));
$$;

revoke all on function public.list_leads_due_for_enrichment(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_leads_due_for_enrichment(uuid, integer) to service_role;

commit;
