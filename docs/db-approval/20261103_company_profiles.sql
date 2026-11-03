-- 11/3 회사 정보 통합(대표 선택: 사업자·주소·서류·소개/이미지·취급품목·배송·결제·상담·관리자전용 전부).
-- 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요. 기존 테이블은 바꾸지 않고 1:1 프로필 테이블 + 비공개 버킷만 추가.
begin;
create table if not exists public.company_profiles (
  company_id uuid primary key references public.companies(id) on delete cascade,
  -- 사업자
  sub_business_number text,
  owner_name text,
  business_conditions text[] not null default '{}',   -- 업태
  business_items text[] not null default '{}',        -- 종목
  founded_on date,
  main_phone text,
  fax text,
  email text,
  intro text,
  -- 사업장 주소 (창고=출발지는 companies.origin_address 를 그대로 사용)
  business_postcode text,
  business_address text,
  business_address_detail text,
  warehouse_same_as_business boolean not null default false,
  -- 취급 품목 (대분류는 company_supplied_product_categories 그대로 사용)
  main_store_segments text[] not null default '{}',
  signature_items text,
  -- 배송 (주문 마감·최소금액은 store_order_settings 그대로 사용)
  delivery_weekdays smallint[] not null default '{1,2,3,4,5,6}',
  next_day_cutoff_time time,
  delivery_time_window text,
  delivery_methods text[] not null default '{}',
  delivery_comment text,
  -- 결제
  payment_methods text[] not null default '{}',
  payment_cycle text not null default '협의',
  first_order_minimum_won integer,
  payment_comment text,
  settlement_bank text,
  settlement_account_number text,
  settlement_account_holder text,
  -- 상담
  holiday_notice text,
  accepts_new_stores boolean not null default true,
  consult_weekdays smallint[] not null default '{1,2,3,4,5}',
  consult_hours text,
  -- 서류·이미지 (비공개 버킷 company-documents 경로)
  business_certificate_path text,
  bankbook_path text,
  representative_image_path text,
  -- 관리자 전용
  admin_memo text,
  grade text,
  price_competitiveness text,
  erp_types text[] not null default '{}',
  plan_name text,
  contract_on date,
  trial_ends_on date,
  updated_at timestamptz not null default now(),
  updated_by text,
  constraint company_profiles_weekdays_check check (delivery_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[] and consult_weekdays <@ '{0,1,2,3,4,5,6}'::smallint[]),
  constraint company_profiles_first_min_check check (first_order_minimum_won is null or first_order_minimum_won >= 0)
);
alter table public.company_profiles enable row level security;
revoke all on public.company_profiles from public, anon, authenticated;
grant all on public.company_profiles to service_role;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('company-documents', 'company-documents', false, 10485760, array['application/pdf','image/jpeg','image/png'])
on conflict (id) do nothing;
commit;
