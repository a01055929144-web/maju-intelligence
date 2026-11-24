-- DRAFT ONLY. CX-140 ③: 회사가 지정하는 "기본 단가표" 포인터. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 비어 있으면 서버가 가장 최근 게시한 sheet를 쓴다(이 표에 행을 채우지 않음). 기존 데이터 변경 없음.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

create table public.pricing_default_public_documents (
  company_id uuid primary key references public.companies(id) on delete cascade,
  document_id uuid not null,
  set_by_key text not null check (set_by_key ~ '^[0-9a-f]{64}$'),
  updated_at timestamptz not null default clock_timestamp(),
  foreign key (company_id, document_id) references public.pricing_documents(company_id, id) on delete cascade
);
alter table public.pricing_default_public_documents enable row level security;
revoke all on public.pricing_default_public_documents from public, anon, authenticated, service_role;
grant select, insert, update on public.pricing_default_public_documents to service_role;

commit;
