-- 1) 거래처 다중 연락처: 대표/실장/부장/매니저 등 한 거래처에 여러 담당자를 등록할 수 있게 합니다.
--    기존 normalized_customers.representative_name/phone은 "대표 연락처" 한 명만 남기고,
--    이 테이블이 그 외 추가 연락처를 담당합니다.
create table if not exists public.customer_contacts (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  customer_id uuid not null references public.normalized_customers(id) on delete cascade,
  role text not null default '담당자', -- 대표/실장/부장/매니저/기타 등 자유 입력
  name text not null,
  phone text,
  memo text,
  is_primary boolean not null default false,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists customer_contacts_customer_idx on public.customer_contacts (customer_id, sort_order);
create index if not exists customer_contacts_company_idx on public.customer_contacts (company_id);

-- 2) 거래처 카드에 리뷰 기반 키워드 뱃지·AI 요약을 보여주기 위한 컬럼입니다.
--    영업시간(business_hours)은 이미 있으므로 여기서는 리뷰 요약·키워드만 추가합니다.
--    review_source는 나중에 "네이버"/"카카오"/"구글"처럼 어느 채널 기준인지 표시할 때 씁니다.
alter table public.normalized_customers
  add column if not exists review_summary text,
  add column if not exists review_keywords text[] not null default '{}',
  add column if not exists review_source text,
  add column if not exists reviews_updated_at timestamptz;

-- 3) 신규 리드(사업자 인허가)도 방문 전 파악한 메뉴 메모를 남길 수 있게 합니다(견적서 초안 작성용).
alter table public.business_permit_leads
  add column if not exists menu_notes text,
  add column if not exists review_summary text,
  add column if not exists review_keywords text[] not null default '{}',
  add column if not exists reviews_updated_at timestamptz;
