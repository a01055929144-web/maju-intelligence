-- 2026-08-31 피드백: "영업리드(신규리드, 개업일자 아님)도 키워드 검색량으로 영업순위를 알아야
-- 한다" — 기존 "영업리드" 정렬 모드는 business_permit_leads(공공 인허가 신규 개업 데이터)만
-- 재정렬하는 방식이라, 이미 오래전부터 운영 중인 매장은 애초에 리드 풀에 들어오지 못했습니다.
-- 카카오 로컬 키워드 검색으로 "개업일자와 무관하게 이미 운영 중인" 매장까지 리드 풀에 채워
-- 넣기 위한 테이블/컬럼을 추가합니다.

-- 고객사가 직접 지정한 확장 탐색 지역(반경 자동 탐색 외 추가 지역)입니다. 예: "서울 마포구 합정동".
create table if not exists public.company_lead_search_regions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  label text not null,
  latitude numeric,
  longitude numeric,
  created_at timestamptz not null default now()
);

create index if not exists company_lead_search_regions_company_id_idx
  on public.company_lead_search_regions (company_id);

-- 야간 자동 탐색 상태 표시(기존 gov_restaurant_sync_last_*, seoul_restaurant_sync_last_*와 동일한
-- 패턴)와, 매일 다른 기준점 묶음을 훑기 위한 회전 커서(rotation cursor)입니다.
alter table companies
  add column if not exists kakao_keyword_lead_sync_last_at timestamptz,
  add column if not exists kakao_keyword_lead_sync_last_status text,
  add column if not exists kakao_keyword_lead_sync_last_message text,
  add column if not exists kakao_keyword_lead_sweep_cursor integer not null default 0;
