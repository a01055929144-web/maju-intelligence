-- Disposable PostgreSQL 17 fixture only. Never run against production.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table business_permit_leads(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, status text not null default '신규',
  phone text, address text, kakao_place_url text, industry_primary text, permit_status text,
  open_date date, permit_date date, created_at timestamptz not null default now());
create table lead_enrichment_events(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, lead_id uuid not null,
  source text not null, attempted_at timestamptz not null default now(), metadata jsonb not null default '{}');

-- 기존 정의(down 파일)로 시작
\i 20261114-CC-46-enrichment-targets.down.sql

do $$
declare c uuid := gen_random_uuid(); other uuid := gen_random_uuid();
  l_full uuid; l_nophone uuid; l_nokakao uuid; l_etc uuid; l_unclassified uuid; l_excluded uuid; l_old uuid; l_retry uuid; l_other uuid; n int;
begin
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소','k','한식', current_date) returning id into l_full;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,null,'주소','k','한식', current_date) returning id into l_nophone;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date) returning id into l_nokakao;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소','k','기타', current_date) returning id into l_etc;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소','k','미분류', current_date) returning id into l_unclassified;
  insert into business_permit_leads(company_id, status, phone, address, kakao_place_url, industry_primary, open_date) values (c,'제외','010','주소',null,'기타', current_date) returning id into l_excluded;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'기타', current_date - 400) returning id into l_old;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'기타', current_date) returning id into l_retry;
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) values (c, l_retry, 'cron', now() - interval '1 day', '{"event_type":"external_info_enrichment"}');
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (other,null,null,null,'기타', current_date) returning id into l_other;
  -- 폐업 리드 4곳(전화·주소는 있고 카카오 링크만 없음 → 새 규칙에서만 후보가 될 곳): 상태 '폐업…' / 인허가 상태 폐업·말소·취소 → 제외
  insert into business_permit_leads(company_id, status, phone, address, kakao_place_url, industry_primary, open_date) values (c,'폐업 확인 필요','010','주소',null,'한식', current_date);
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, permit_status, open_date) values (c,'010','주소',null,'한식','폐업', current_date);
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, permit_status, open_date) values (c,'010','주소',null,'한식','말소', current_date);
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, permit_status, open_date) values (c,'010','주소',null,'한식','취소', current_date);

  -- 기존 규칙: 전화/주소 빈 곳만
  select count(*) into n from public.list_leads_due_for_enrichment(c, 100);
  if n <> 1 then raise exception 'old rule should pick only the no-phone lead, got %', n; end if;
end $$;

\i 20261114-CC-46-enrichment-targets.sql

do $$
declare c uuid; ids uuid[]; n int;
begin
  select company_id into c from business_permit_leads limit 1;
  select array_agg(lead_id) into ids from public.list_leads_due_for_enrichment(c, 100);
  -- 전화 없음 + 카카오 링크 없음 + '기타' + '미분류' = 4곳. 제외·폐업(4곳)·180일 밖·최근 시도(1일 전)·다른 회사는 빠진다.
  if coalesce(array_length(ids, 1), 0) <> 4 then raise exception 'new rule should pick 4 leads, got %', coalesce(array_length(ids, 1), 0); end if;
  if has_function_privilege('anon', 'public.list_leads_due_for_enrichment(uuid,integer)', 'execute') then raise exception 'anon must not execute'; end if;
  if has_function_privilege('authenticated', 'public.list_leads_due_for_enrichment(uuid,integer)', 'execute') then raise exception 'authenticated must not execute'; end if;
  if not has_function_privilege('service_role', 'public.list_leads_due_for_enrichment(uuid,integer)', 'execute') then raise exception 'service_role must execute'; end if;
end $$;

-- 재시도 주기(+30·60·90일 → 월 1회 → 최대 6회): 카카오 링크 없는 리드를 개업일·시도 횟수·마지막 시도로 만들어 확인
do $$
declare c uuid := gen_random_uuid(); ids uuid[];
  l_due30 uuid; l_gap uuid; l_early uuid; l_due60 uuid; l_m_due uuid; l_m_wait uuid; l_max uuid; l_halt uuid; l_hugi uuid; l_err uuid; l_mix uuid;
begin
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 35) returning id into l_due30;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 35) returning id into l_gap;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 20) returning id into l_early;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 65) returning id into l_due60;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 150) returning id into l_m_due;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 150) returning id into l_m_wait;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 170) returning id into l_max;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 190) returning id into l_halt;
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date) returning id into l_hugi;

  -- l_due30: 시도 1회(10일 전), 개업 35일 → +30일 지남 → 대상 / l_gap: 마지막 시도 3일 전 → 7일 간격 미달 → 제외 / l_early: 개업 20일 → +30일 전 → 제외
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) values (c, l_due30, 'cron', now() - interval '10 days', '{"event_type":"external_info_enrichment"}');
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) values (c, l_gap, 'cron', now() - interval '3 days', '{"event_type":"external_info_enrichment"}');
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) values (c, l_early, 'cron', now() - interval '10 days', '{"event_type":"external_info_enrichment"}');
  -- l_due60: 시도 2회(마지막 10일 전), 개업 65일 → +60일 지남 → 대상
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) select c, l_due60, 'cron', now() - interval '10 days' - g * interval '1 day', '{"event_type":"external_info_enrichment"}' from generate_series(0, 1) g;
  -- l_m_due: 시도 4회(마지막 31일 전) → 월 1회 주기 도래 → 대상 / l_m_wait: 마지막 20일 전 → 제외
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) select c, l_m_due, 'cron', now() - interval '31 days' - g * interval '30 days', '{"event_type":"external_info_enrichment"}' from generate_series(0, 3) g;
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) select c, l_m_wait, 'cron', now() - interval '20 days' - g * interval '30 days', '{"event_type":"external_info_enrichment"}' from generate_series(0, 3) g;
  -- l_max: 6회 채움(마지막 40일 전) → 최대 횟수 → 제외 / l_halt: 개업 190일 → 180일 규칙으로 중단 → 제외 / l_hugi: 시도 없음 → 바로 대상
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) select c, l_max, 'cron', now() - interval '40 days' - g * interval '5 days', '{"event_type":"external_info_enrichment"}' from generate_series(0, 5) g;

  -- l_err: error 6건(모두 40일 전~)이어도 횟수에 안 세어 다시 대상(개업 100일, 횟수 0 → 바로 대상)
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 100) returning id into l_err;
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) select c, l_err, 'cron', now() - interval '40 days' - g * interval '5 days', '{"event_type":"external_info_enrichment","result_code":"error"}' from generate_series(0, 5) g;
  -- l_mix: error 5건 + 옛 이벤트(result_code 없음) 6건 = 센 횟수 6 → 최대 횟수라 제외(옛 이벤트는 그대로 센다)
  insert into business_permit_leads(company_id, phone, address, kakao_place_url, industry_primary, open_date) values (c,'010','주소',null,'한식', current_date - 100) returning id into l_mix;
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) select c, l_mix, 'cron', now() - interval '40 days' - g * interval '5 days', '{"event_type":"external_info_enrichment"}' from generate_series(0, 5) g;
  insert into lead_enrichment_events(company_id, lead_id, source, attempted_at, metadata) select c, l_mix, 'cron', now() - interval '20 days' - g * interval '1 day', '{"event_type":"external_info_enrichment","result_code":"error"}' from generate_series(0, 4) g;

  select array_agg(lead_id) into ids from public.list_leads_due_for_enrichment(c, 100);
  if not (l_due30 = any(ids) and l_due60 = any(ids) and l_m_due = any(ids) and l_hugi = any(ids) and l_err = any(ids)) then raise exception 'due leads missing: %', ids; end if;
  if l_gap = any(ids) or l_early = any(ids) or l_m_wait = any(ids) or l_max = any(ids) or l_halt = any(ids) or l_mix = any(ids) then raise exception 'not-due leads present: %', ids; end if;
  if array_length(ids, 1) <> 5 then raise exception 'cadence should pick exactly 5, got %', array_length(ids, 1); end if;
end $$;

-- down 왕복
\i 20261114-CC-46-enrichment-targets.down.sql
do $$
declare c uuid; n int;
begin
  select company_id into c from business_permit_leads limit 1;
  select count(*) into n from public.list_leads_due_for_enrichment(c, 100);
  if n <> 1 then raise exception 'after down, old rule should pick 1, got %', n; end if;
end $$;
