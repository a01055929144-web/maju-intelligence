-- 초안 · 운영 미적용(컨트롤타워 검토 → 대표 승인 문구 전 적용 금지). CC-46-2 ②: 보강 대상 넓히기.
-- 기존: 전화 또는 주소가 비어 있는 리드만. 변경: 카카오 링크가 없거나 업종이 '기타'·'미분류'인 리드도 포함.
-- CC-46-2⓪ C-2(같은 함수라 이 파일 하나로 합침 — 따로 두면 나중 것이 앞의 것을 덮어씀):
--  ① 폐업 리드 제외 — 앱 isClosedLead(lib/leads.ts)와 같은 판정: 리드 상태가 '폐업…'으로 시작하거나 인허가 상태에 폐업·말소·취소.
--     (tests/closed-lead-sql.test.ts 가 이 파일의 정규식과 isClosedLead 결과가 같은지 확인)
--  ② 재시도 주기: 개업(없으면 인허가·생성) +30·+60·+90일에 1회씩, 그 뒤 월 1회(마지막 시도 30일 후), 최대 6회.
--     이전: 14일→28일→60일 간격. 새 가게는 카카오맵 등록이 늦어 일찍 재시도해도 소용없음(46-2⓪ 3절).
--     +30·60·90일 시도는 직전 시도와 최소 7일 간격(늦게 들어온 리드가 매일 밤 재시도되는 것 방지).
--     시도 횟수 = source='cron' 의 external_info_enrichment 이벤트 수. result_code='error'(API 오류) 이벤트는 횟수에서 뺀다 — 오류는 6회 한도를 쓰지 않고 다시 대상이 된다. result_code가 없는 옛 이벤트는 센다.
--     (last_attempted_at 은 error 포함 — 횟수 1 이상이면 직전 시도와의 간격 규칙이 오류 직후 재시도를 막는다.)
-- 그대로 둔 것: 제외 상태 제외 · 인허가/개업일 180일 이내(여기서 중단 — 180일 밖의 밀린 리드는 46-2 ④ 일괄 보강 스크립트가 따로 다룸) · 오래 시도 안 한 순 정렬.
-- 6회 시나리오: 첫 시도 → +30 → +60 → +90 → +120 → +150일(이후 180일 규칙으로 종료).

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
  cross join lateral (
    select coalesce(lead.open_date, lead.permit_date, (lead.created_at at time zone 'Asia/Seoul')::date) as base_date
  ) as lead_base
  left join lateral (
    select
      count(*) filter (where coalesce(event.metadata ->> 'result_code', '') <> 'error')::integer as attempt_count,
      max(event.attempted_at) as last_attempted_at
    from public.lead_enrichment_events as event
    where event.company_id = p_company_id
      and event.lead_id = lead.id
      and event.source = 'cron'
      and event.metadata ->> 'event_type' = 'external_info_enrichment'
  ) as retry_history on true
  where lead.company_id = p_company_id
    and lead.status <> '제외'
    and not (coalesce(lead.status, '') ~ '^폐업' or coalesce(lead.permit_status, '') ~ '폐업|말소|취소')
    and (
      lead.phone is null
      or lead.address is null
      or lead.kakao_place_url is null
      or lead.industry_primary is null
      or lead.industry_primary in ('기타', '미분류')
    )
    and lead_base.base_date >= ((now() at time zone 'Asia/Seoul')::date - 180)
    and (
      retry_history.attempt_count = 0
      or (
        retry_history.attempt_count < 6
        and retry_history.last_attempted_at <= now() - case when retry_history.attempt_count <= 3 then interval '7 days' else interval '30 days' end
        and (
          retry_history.attempt_count > 3
          or (now() at time zone 'Asia/Seoul')::date >= lead_base.base_date + 30 * retry_history.attempt_count
        )
      )
    )
  order by retry_history.last_attempted_at asc nulls first, lead.created_at asc
  limit greatest(1, least(coalesce(p_limit, 30), 500));
$$;

revoke all on function public.list_leads_due_for_enrichment(uuid, integer) from public, anon, authenticated;
grant execute on function public.list_leads_due_for_enrichment(uuid, integer) to service_role;

commit;
