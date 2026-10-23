-- 운영 적용 완료(2026-10-23). 재실행 금지.
-- 유통사가 실제로 납품할 수 있는 품목 분류를 단계와 무관하게 복수 선택하기 위한 저장 구조입니다.

begin;

create table if not exists public.company_supplied_product_categories (
  company_id uuid not null,
  category_key text not null,
  created_at timestamptz not null default now(),
  created_by_user_id uuid,
  constraint company_supplied_product_categories_pk primary key (company_id, category_key),
  constraint company_supplied_product_categories_company_fk
    foreign key (company_id) references public.companies(id) on delete cascade,
  constraint company_supplied_product_categories_key_check
    check (category_key ~ '^[a-z0-9_-]+(?:/[a-z0-9_-]+)*$' and length(category_key) <= 120)
);

create index if not exists company_supplied_product_categories_company_idx
  on public.company_supplied_product_categories(company_id, created_at desc);

alter table public.company_supplied_product_categories enable row level security;
revoke all on table public.company_supplied_product_categories from public, anon, authenticated;
grant select, insert, update, delete on table public.company_supplied_product_categories to service_role;

commit;

-- ROLLBACK (승인 후 별도 실행)
-- drop table if exists public.company_supplied_product_categories;
