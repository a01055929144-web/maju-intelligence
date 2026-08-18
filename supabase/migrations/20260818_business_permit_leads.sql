-- 신규 영업 리드(사업자 인허가 신규 데이터 기반) 기능을 위한 테이블입니다.
-- 설계 문서의 6개 테이블(lead_sources/business_permit_leads/lead_candidates/lead_scores/
-- lead_metrics/lead_actions)을 v1에서는 2개(business_permit_leads/lead_actions)로 합쳤습니다.
-- 점수·업종분류·연락채널 등은 모두 business_permit_leads 한 행에 저장하고, 행동 이력만
-- 별도 테이블로 분리합니다. 데이터가 적은 v1 단계에서 조인을 줄이는 게 더 실용적이고,
-- 나중에 스코어링을 별도 배치로 재계산하는 구조가 필요해지면 lead_scores로 다시 쪼갤 수 있습니다.

create table if not exists public.business_permit_leads (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,

  -- 인허가 원본 데이터
  business_name text not null,
  business_number text,
  representative_name text,
  permit_status text,
  is_active boolean not null default true,
  permit_date date,
  open_date date,
  address text,
  phone text,
  latitude numeric,
  longitude numeric,
  jurisdiction text,
  source text not null default 'manual_upload',
  lead_period text not null default 'recent',

  -- 업종 분류
  industry_raw text,
  industry_primary text,
  industry_tags text[] not null default '{}',
  is_target_industry boolean not null default true,

  -- 기존 거래처 중복 여부
  matched_customer_id uuid references public.normalized_customers(id) on delete set null,
  is_duplicate boolean not null default false,

  -- 영업 상태·액션
  status text not null default '신규 수집',
  next_action text,
  next_action_reasons text[] not null default '{}',
  exclude_reason text,

  -- 추천 점수(v1: 인허가 신규성 + 업종 적합도 + 영업 접근성만 실데이터로 계산,
  -- 나머지 항목은 보강 전까지 0점 처리하며 score_breakdown에 그 사실을 남깁니다)
  score_total integer not null default 0,
  score_breakdown jsonb not null default '{}'::jsonb,
  grade text,

  -- 외부 보강 데이터(수동 입력 또는 추후 배치 업데이트)
  naver_place_url text,
  kakao_place_url text,
  google_place_url text,
  instagram_url text,
  review_count integer,
  rating numeric,
  keyword_volume integer,

  raw_payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- 같은 사업자번호가 같은 회사에 중복 적재되지 않도록 합니다(재업로드 시 upsert 기준).
create unique index if not exists business_permit_leads_company_bizno_key
  on public.business_permit_leads (company_id, business_number)
  where business_number is not null and business_number <> '';

create index if not exists business_permit_leads_company_period_idx
  on public.business_permit_leads (company_id, lead_period);

create index if not exists business_permit_leads_company_status_idx
  on public.business_permit_leads (company_id, status);

create index if not exists business_permit_leads_company_duplicate_idx
  on public.business_permit_leads (company_id, is_duplicate);

-- 리드별 영업 행동 이력(전화/DM/방문/보류/제외/거래처전환)입니다. 한 리드에 여러 건 쌓입니다.
create table if not exists public.lead_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null references public.business_permit_leads(id) on delete cascade,
  action_type text not null,
  result text,
  memo text,
  actor_name text,
  created_at timestamptz not null default now()
);

create index if not exists lead_actions_lead_id_idx on public.lead_actions (lead_id, created_at desc);
