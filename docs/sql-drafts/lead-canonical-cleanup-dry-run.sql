-- 조회 전용. 기존 리드 병합·삭제·상태 변경 금지.
-- 대표 리드 우선순위: 사용자 연락/방문 기록 보유 -> 최근 수정 -> UUID.
with normalized as (
  select l.*,
    regexp_replace(lower(coalesce(l.business_name, '')), '[^0-9a-z가-힣]', '', 'g') || '|' ||
    regexp_replace(lower(coalesce(l.address, '')), '[^0-9a-z가-힣]', '', 'g') as fingerprint
  from public.business_permit_leads l
), duplicate_groups as (
  select company_id, fingerprint, count(*) as row_count,
    array_agg(id order by
      exists (
        select 1 from public.lead_actions a
        where a.company_id = n.company_id and a.lead_id = n.id
          and not (a.action_type = 'hold' and a.result in ('외부 정보 보강', '인스타그램 정보 수정'))
      ) desc,
      updated_at desc,
      id
    ) as ordered_ids
  from normalized n
  where fingerprint <> '|'
  group by company_id, fingerprint
  having count(*) > 1
), losing_leads as (
  select g.company_id, losing.id
  from duplicate_groups g
  cross join lateral unnest(g.ordered_ids[2:]) losing(id)
)
select c.name, g.company_id,
  count(*) as duplicate_groups,
  sum(g.row_count - 1) as merge_rows,
  count(*) filter (where exists (
    select 1 from unnest(g.ordered_ids) candidate(id)
    join public.lead_actions a on a.company_id = g.company_id and a.lead_id = candidate.id
    where not (a.action_type = 'hold' and a.result in ('외부 정보 보강', '인스타그램 정보 수정'))
  )) as groups_with_user_activity,
  (select count(*) from public.lead_actions a join losing_leads l on l.company_id = a.company_id and l.id = a.lead_id where l.company_id = g.company_id) as move_actions,
  (select count(*) from public.lead_business_hour_intervals h join losing_leads l on l.company_id = h.company_id and l.id = h.lead_id where l.company_id = g.company_id) as move_business_hours,
  (select count(*) from public.lead_enrichment_events e join losing_leads l on l.company_id = e.company_id and l.id = e.lead_id where l.company_id = g.company_id) as move_enrichment_events,
  (select count(*) from public.sales_quotes q join losing_leads l on l.company_id = q.company_id and l.id = q.lead_id where l.company_id = g.company_id) as move_quotes
from duplicate_groups g
join public.companies c on c.id = g.company_id
group by c.name, g.company_id
order by merge_rows desc;
