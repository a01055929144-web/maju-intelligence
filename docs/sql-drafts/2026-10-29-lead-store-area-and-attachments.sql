-- DRAFT ONLY. 승인 전 실행·migration 이동 금지.
-- 기능 플래그 LEAD_STORE_AREA_ENABLED / NEXT_PUBLIC_LEAD_STORE_AREA_ENABLED와
-- 기존 NEXT_PUBLIC_LEAD_NATIVE_ATTACHMENTS_ENABLED는 검증 완료 전 false로 유지한다.
begin;

alter table public.business_permit_leads
  add column if not exists store_area_sqm numeric(12,2);

alter table public.business_permit_leads
  drop constraint if exists business_permit_leads_store_area_sqm_check,
  add constraint business_permit_leads_store_area_sqm_check
    check (store_area_sqm is null or (store_area_sqm > 0 and store_area_sqm <= 100000));

comment on column public.business_permit_leads.store_area_sqm is
  '공공 인허가 원천 LCTN_AREA/SITEAREA의 소재지 면적(㎡). 평은 표시 시 3.3058로 나눈다.';

-- customer_attachments는 customer_id NOT NULL/FK라 리드에 그대로 연결할 수 없다.
-- Storage의 private customer-attachments 버킷과 서명 URL 생성기는 재사용하되,
-- 메타데이터 소유권은 회사+리드 FK를 갖는 별도 테이블로 분리한다.
-- 거래처 전환 추적 FK는 이번 최소 초안에서 제외한다. 운영 customer_attachments의
-- 복합 UNIQUE를 제약 이름이 아닌 실제 컬럼 기준으로 조사한 뒤 별도 승인안으로 추가한다.

create table if not exists public.lead_attachments (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  lead_id uuid not null,
  attachment_type text not null check (attachment_type in ('business_license','store_sign','store_photo','etc')),
  title text not null,
  storage_path text not null,
  mime_type text,
  byte_size bigint check (byte_size is null or byte_size >= 0),
  idempotency_key text,
  created_by uuid references public.app_users(id) on delete set null,
  created_by_name text,
  created_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint lead_attachments_lead_fk foreign key (company_id, lead_id)
    references public.business_permit_leads(company_id, id) on delete cascade,
  constraint lead_attachments_storage_path_uq unique (storage_path)
);

create index if not exists lead_attachments_company_lead_created_idx
  on public.lead_attachments(company_id, lead_id, created_at desc)
  where deleted_at is null;
create unique index if not exists lead_attachments_idempotency_uq
  on public.lead_attachments(company_id, lead_id, idempotency_key)
  where idempotency_key is not null;

alter table public.lead_attachments enable row level security;
revoke all on table public.lead_attachments from public, anon, authenticated;
grant select, insert, update, delete on table public.lead_attachments to service_role;

-- 사업자등록증 열람 감사를 리드에도 남길 수 있도록 기존 item_type을 재사용한다.
-- API는 signed URL 발급 전에 company_id+lead_id 소유권 및 담당 권한을 검사하고,
-- SENSITIVE_ACCESS_LOGS_ENABLED=true일 때 business_registration 로그 저장 실패 시 fail-closed 한다.

commit;
