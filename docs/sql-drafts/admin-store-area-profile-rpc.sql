-- 초안 전용. 운영 DB 실행 금지. 대표 승인·비운영 검증·EXPLAIN 검토 후 정식 migration으로 옮긴다.
-- 목적: 2만 건 이상의 원문을 PostgREST로 페이지 조회하지 않고 회사 범위 집계 JSON 한 건만 반환한다.

create or replace function public.admin_store_area_profile(p_company_id uuid)
returns jsonb
language sql
stable
security invoker
set search_path = ''
as $function$
with lead_base as (
  select
    coalesce(nullif(btrim(lead.industry_raw), ''), '미분류') as industry,
    round(lead.store_area_sqm::numeric, 2) as area_sqm
  from public.business_permit_leads lead
  where lead.company_id = p_company_id
),
lead_summary as (
  select
    count(*)::bigint as total_rows,
    count(*) filter (where area_sqm is null)::bigint as blank_count,
    count(*) filter (where area_sqm = 0)::bigint as zero_count,
    count(*) filter (where area_sqm < 0 or area_sqm > 100000)::bigint as invalid_count,
    count(*) filter (where area_sqm > 0 and area_sqm <= 100000)::bigint as positive_count
  from lead_base
),
industry_stats as (
  select
    industry,
    count(*)::bigint as sampled_rows,
    count(*) filter (where area_sqm > 0 and area_sqm <= 100000)::bigint as positive_rows,
    round((percentile_cont(0.5) within group (order by area_sqm)
      filter (where area_sqm > 0 and area_sqm <= 100000))::numeric, 2) as median_sqm
  from lead_base
  group by industry
),
industry_json as (
  select coalesce(jsonb_agg(jsonb_build_object(
    'industry', industry,
    'medianSqm', median_sqm,
    'positiveRows', positive_rows,
    'sampledRows', sampled_rows
  ) order by positive_rows desc, industry), '[]'::jsonb) as value
  from industry_stats
  where positive_rows > 0
),
source_raw as (
  select
    source_record.id,
    source_record.lead_id,
    source_record.source,
    case
      when replace(btrim(coalesce(source_record.raw_payload ->> 'storeAreaSqm', '')), ',', '')
        ~ '^[+-]?([0-9]+([.][0-9]+)?|[.][0-9]+)$'
      then round(replace(btrim(source_record.raw_payload ->> 'storeAreaSqm'), ',', '')::numeric, 2)
      else null
    end as area_sqm
  from public.business_permit_lead_source_records source_record
  where source_record.company_id = p_company_id
    and source_record.source in ('gov_restaurant_api', 'seoul_opendata_api')
),
source_counts as (
  select
    count(*) filter (where source = 'gov_restaurant_api')::bigint as government_source_records,
    count(*) filter (where source = 'seoul_opendata_api')::bigint as seoul_source_records
  from source_raw
),
source_per_lead as (
  select
    lead_id,
    count(*) filter (where source = 'gov_restaurant_api') > 0 as has_government,
    count(*) filter (where source = 'seoul_opendata_api') > 0 as has_seoul,
    (array_agg(area_sqm order by id) filter (
      where source = 'gov_restaurant_api' and area_sqm > 0 and area_sqm <= 100000
    ))[1] as government_area,
    (array_agg(area_sqm order by id) filter (
      where source = 'seoul_opendata_api' and area_sqm > 0 and area_sqm <= 100000
    ))[1] as seoul_area
  from source_raw
  group by lead_id
),
pair_summary as (
  select
    count(*) filter (where has_government and has_seoul)::bigint as matched_lead_count,
    count(*) filter (where has_government and has_seoul and government_area is not null and seoul_area is not null)::bigint as comparable_area_count,
    count(*) filter (where has_government and has_seoul and (government_area is null or seoul_area is null))::bigint as missing_area_on_either_source_count,
    count(*) filter (where has_government and has_seoul and government_area is not null and seoul_area is not null
      and round(abs(government_area - seoul_area), 2) <= 0.01)::bigint as equal_within_precision_count,
    round((percentile_cont(0.5) within group (order by round(abs(government_area - seoul_area), 2))
      filter (where has_government and has_seoul and government_area is not null and seoul_area is not null))::numeric, 2)
      as median_absolute_difference_sqm
  from source_per_lead
)
select jsonb_build_object(
  'measuredAt', to_char(statement_timestamp() at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.MS"Z"'),
  'profile', jsonb_build_object(
    'totalRows', lead_summary.total_rows,
    'blankCount', lead_summary.blank_count,
    'blankRate', case when lead_summary.total_rows = 0 then 0 else round(lead_summary.blank_count * 100.0 / lead_summary.total_rows, 1) end,
    'zeroCount', lead_summary.zero_count,
    'zeroRate', case when lead_summary.total_rows = 0 then 0 else round(lead_summary.zero_count * 100.0 / lead_summary.total_rows, 1) end,
    'invalidCount', lead_summary.invalid_count,
    'invalidRate', case when lead_summary.total_rows = 0 then 0 else round(lead_summary.invalid_count * 100.0 / lead_summary.total_rows, 1) end,
    'positiveCount', lead_summary.positive_count,
    'industryMedians', industry_json.value
  ),
  'sourceComparison', jsonb_build_object(
    'measurement', case when pair_summary.comparable_area_count > 0 then 'measured' else 'unmeasured' end,
    'governmentSourceRecords', source_counts.government_source_records,
    'seoulSourceRecords', source_counts.seoul_source_records,
    'matchedLeadCount', pair_summary.matched_lead_count,
    'comparableAreaCount', pair_summary.comparable_area_count,
    'missingAreaOnEitherSourceCount', pair_summary.missing_area_on_either_source_count,
    'equalWithinPrecisionCount', pair_summary.equal_within_precision_count,
    'medianAbsoluteDifferenceSqm', pair_summary.median_absolute_difference_sqm
  )
)
from lead_summary
cross join industry_json
cross join source_counts
cross join pair_summary;
$function$;

-- public 함수는 기본적으로 PUBLIC 실행 권한이 생기므로 모두 회수하고 서버 service_role만 허용한다.
revoke all on function public.admin_store_area_profile(uuid) from public, anon, authenticated;
grant execute on function public.admin_store_area_profile(uuid) to service_role;

comment on function public.admin_store_area_profile(uuid) is
  '관리자 서버 전용 회사별 매장 면적 집계. 원문 행·키·URL을 반환하지 않는다.';
