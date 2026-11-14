-- 초안 · 운영 미적용(컨트롤타워 검토 → 대표 승인 문구 전 적용 금지). CC-46-2 ②: 보강 대상 넓히기.
-- 기존: 전화 또는 주소가 비어 있는 리드만. 변경: 카카오 링크가 없거나 업종이 '기타'·'미분류'인 리드도 포함.
-- 그대로 둔 것: 제외 상태 제외 · 인허가/개업일 180일 이내 · 재시도 간격(14일→28일→60일) · 오래 시도 안 한 순 정렬.
-- (180일 밖의 밀린 리드는 46-2 ④ 일괄 보강 스크립트가 따로 다룸 — 이 함수의 180일 규칙은 바꾸지 않음.)

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
    and (
      lead.phone is null
      or lead.address is null
      or lead.kakao_place_url is null
      or lead.industry_primary is null
      or lead.industry_primary in ('기타', '미분류')
    )
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
