-- DB-APPROVED: 대표 회사의 공식 원천 유효 면적만 채운다. 기존 값은 유지한다.
begin;

with valid_source as (
  select s.lead_id, s.id, s.last_seen_at,
    case when length(replace(btrim(coalesce(s.raw_payload ->> 'storeAreaSqm', '')), ',', '')) < 18
      and replace(btrim(coalesce(s.raw_payload ->> 'storeAreaSqm', '')), ',', '') ~ '^[0-9]+([.][0-9]+)?$'
      then replace(btrim(s.raw_payload ->> 'storeAreaSqm'), ',', '')::numeric
      else null end as area
  from public.business_permit_lead_source_records s
  where s.company_id = '04ebb7bb-8da0-4723-8211-f2a947939344'
    and s.source in ('gov_restaurant_api', 'seoul_opendata_api')
), latest as (
  select distinct on (lead_id) lead_id, round(area, 2) as area
  from valid_source
  where area > 0 and area <= 100000
  order by lead_id, last_seen_at desc nulls last, id
)
update public.business_permit_leads l
set store_area_sqm = latest.area
from latest
where l.id = latest.lead_id
  and l.company_id = '04ebb7bb-8da0-4723-8211-f2a947939344'
  and l.store_area_sqm is null;

commit;
