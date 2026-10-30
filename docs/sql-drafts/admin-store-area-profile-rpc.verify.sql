-- 비운영 PostgreSQL 전용 검증. 운영 DB 실행 금지.
-- 최소 스키마와 admin_store_area_profile(uuid) 함수가 준비된 격리 DB에서 실행한다.
begin;

insert into public.business_permit_leads (id, company_id, industry_raw, store_area_sqm) values
  ('00000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '한식', null),
  ('00000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '한식', 0),
  ('00000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '한식', 10),
  ('00000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '한식', 30),
  ('00000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '카페', 100000.004),
  ('00000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '카페', -0.004),
  ('00000000-0000-4000-8000-000000000007', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '한식', 0.004),
  ('00000000-0000-4000-8000-000000000008', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '격리표본', 77);

insert into public.business_permit_lead_source_records
  (id, company_id, lead_id, source, source_record_key, raw_payload) values
  ('10000000-0000-4000-8000-000000000001', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000003', 'gov_restaurant_api', 'a-gov-same', '{"storeAreaSqm":" 30.005 "}'),
  ('10000000-0000-4000-8000-000000000002', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000003', 'seoul_opendata_api', 'a-seoul-same', '{"storeAreaSqm":"30.00"}'),
  ('10000000-0000-4000-8000-000000000003', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000004', 'gov_restaurant_api', 'a-gov-missing', '{"storeAreaSqm":""}'),
  ('10000000-0000-4000-8000-000000000004', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000004', 'seoul_opendata_api', 'a-seoul-missing', '{"storeAreaSqm":"20"}'),
  ('10000000-0000-4000-8000-000000000005', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000005', 'gov_restaurant_api', 'a-gov-invalid', '{"storeAreaSqm":"-0.004"}'),
  ('10000000-0000-4000-8000-000000000006', 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa', '00000000-0000-4000-8000-000000000005', 'seoul_opendata_api', 'a-seoul-small', '{"storeAreaSqm":"0.004"}'),
  ('10000000-0000-4000-8000-000000000007', 'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb', '00000000-0000-4000-8000-000000000008', 'gov_restaurant_api', 'b-gov', '{"storeAreaSqm":"77"}');

do $verify$
declare
  result jsonb := public.admin_store_area_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
  other_company jsonb := public.admin_store_area_profile('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
begin
  if (result #>> '{profile,totalRows}')::integer <> 7
    or (result #>> '{profile,blankCount}')::integer <> 1
    or (result #>> '{profile,zeroCount}')::integer <> 1
    or (result #>> '{profile,invalidCount}')::integer <> 2
    or (result #>> '{profile,positiveCount}')::integer <> 3 then
    raise exception 'lead aggregate mismatch: %', result;
  end if;

  if (result #>> '{profile,industryMedians,0,industry}') <> '한식'
    or (result #>> '{profile,industryMedians,0,medianSqm}')::numeric <> 10 then
    raise exception 'industry median mismatch: %', result;
  end if;

  if (result #>> '{sourceComparison,governmentSourceRecords}')::integer <> 3
    or (result #>> '{sourceComparison,seoulSourceRecords}')::integer <> 3
    or (result #>> '{sourceComparison,matchedLeadCount}')::integer <> 3
    or (result #>> '{sourceComparison,comparableAreaCount}')::integer <> 1
    or (result #>> '{sourceComparison,missingAreaOnEitherSourceCount}')::integer <> 2
    or (result #>> '{sourceComparison,equalWithinPrecisionCount}')::integer <> 1
    or (result #>> '{sourceComparison,medianAbsoluteDifferenceSqm}')::numeric <> 0.01 then
    raise exception 'source comparison mismatch: %', result;
  end if;

  if (other_company #>> '{profile,totalRows}')::integer <> 1
    or (other_company #>> '{profile,positiveCount}')::integer <> 1
    or (other_company #>> '{sourceComparison,governmentSourceRecords}')::integer <> 1
    or (other_company #>> '{sourceComparison,seoulSourceRecords}')::integer <> 0 then
    raise exception 'company isolation mismatch: %', other_company;
  end if;

  if has_function_privilege('anon', 'public.admin_store_area_profile(uuid)', 'execute')
    or has_function_privilege('authenticated', 'public.admin_store_area_profile(uuid)', 'execute')
    or not has_function_privilege('service_role', 'public.admin_store_area_profile(uuid)', 'execute') then
    raise exception 'function execution privilege mismatch';
  end if;
end
$verify$;

set local role service_role;
select public.admin_store_area_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa') is not null as service_role_can_execute;
reset role;

explain (analyze, buffers, settings, timing off)
select public.admin_store_area_profile('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');

rollback;
