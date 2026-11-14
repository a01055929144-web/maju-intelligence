-- Disposable PostgreSQL 17 fixture only. Never run against production.
do $$ begin create role anon; exception when duplicate_object then null; end $$;
do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
do $$ begin create role service_role; exception when duplicate_object then null; end $$;

create table business_permit_leads(
  id uuid primary key default gen_random_uuid(), company_id uuid not null, status text not null default '신규',
  phone text, address text, kakao_place_url text, industry_primary text,
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
  -- 전화 없음 + 카카오 링크 없음 + '기타' + '미분류' = 4곳. 제외·180일 밖·최근 시도(1일 전)·다른 회사는 빠진다.
  if coalesce(array_length(ids, 1), 0) <> 4 then raise exception 'new rule should pick 4 leads, got %', coalesce(array_length(ids, 1), 0); end if;
  if has_function_privilege('anon', 'public.list_leads_due_for_enrichment(uuid,integer)', 'execute') then raise exception 'anon must not execute'; end if;
  if has_function_privilege('authenticated', 'public.list_leads_due_for_enrichment(uuid,integer)', 'execute') then raise exception 'authenticated must not execute'; end if;
  if not has_function_privilege('service_role', 'public.list_leads_due_for_enrichment(uuid,integer)', 'execute') then raise exception 'service_role must execute'; end if;
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
