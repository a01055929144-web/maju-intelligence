-- CC-32c DRAFT. 운영 적용 금지: 대표의 명시 승인 문구(DB-APPROVED) 전에는 supabase/migrations 로 옮기지 않는다.
-- 매장 등급(회사가 직접 만드는 분류: VIP·일반·신규 …) — 카탈로그(margin_templates)와 따로 관리한다. A/B/C 매출 등급(grade_override)은 건드리지 않는다.
-- 운영 확인(2026-11-13 읽기 조회): pricing_promotion_targets 는 target_kind 열이 없고 customer_id / template_id 둘 중 하나만 채우는 구조
-- (CHECK (customer_id IS NULL) <> (template_id IS NULL)), 행 0개. 그래서 지시서의 "target_kind 허용값 추가"는 "store_grade_id 열 추가 + 셋 중 정확히 하나" 로 구현한다.
begin;

create table public.company_store_grades (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  name text not null check (length(btrim(name)) between 1 and 40),
  color text not null default 'slate' check (color in ('slate','teal','blue','amber','rose','violet','emerald')),
  sort_order integer not null default 0,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id)
);
-- 같은 회사 안에서 보관하지 않은 등급 이름은 대소문자 무시하고 유일(보관한 이름은 다시 쓸 수 있다).
create unique index company_store_grades_name_uq on public.company_store_grades (company_id, lower(btrim(name))) where archived_at is null;
create index company_store_grades_company_idx on public.company_store_grades (company_id, sort_order, name);
alter table public.company_store_grades enable row level security; -- 정책 없음: service_role 만 접근(앱은 서버 API 경유)
revoke all on public.company_store_grades from public, anon, authenticated;
grant select, insert, update, delete on public.company_store_grades to service_role;

alter table public.normalized_customers add column store_grade_id uuid;
alter table public.normalized_customers
  add constraint normalized_customers_store_grade_fk foreign key (company_id, store_grade_id)
    references public.company_store_grades (company_id, id); -- 기본 NO ACTION: 쓰는 매장이 있으면 등급을 지울 수 없다(보관만).
create index normalized_customers_store_grade_idx on public.normalized_customers (company_id, store_grade_id) where store_grade_id is not null;

alter table public.pricing_promotion_targets add column store_grade_id uuid;
alter table public.pricing_promotion_targets
  add constraint pricing_promotion_targets_store_grade_fk foreign key (company_id, store_grade_id)
    references public.company_store_grades (company_id, id) on delete cascade;
alter table public.pricing_promotion_targets drop constraint pricing_promotion_targets_check;
alter table public.pricing_promotion_targets
  add constraint pricing_promotion_targets_kind_check check (num_nonnulls(customer_id, template_id, store_grade_id) = 1);
create unique index pricing_promotion_targets_grade_uq on public.pricing_promotion_targets (promotion_id, store_grade_id) where store_grade_id is not null;

-- 행사 노출 판정: 매장 직접 지정 · 카탈로그 · 매장 등급 중 하나라도 맞으면 hit (only=맞는 매장만, except=맞는 매장 제외). 기존 동작은 그대로.
create or replace function public.promotion_applies_to(p_company uuid, p_promotion uuid, p_customer uuid)
returns boolean language plpgsql stable set search_path to 'public', 'pg_temp' as $$
declare aud text; hit boolean;
begin
  select audience into aud from public.pricing_promotions where company_id = p_company and id = p_promotion;
  if aud is null then return false; end if;
  if aud = 'all' then return true; end if;
  select exists(
    select 1 from public.pricing_promotion_targets t
    where t.company_id = p_company and t.promotion_id = p_promotion
      and (t.customer_id = p_customer
        or (t.template_id is not null and t.template_id = (select c.margin_template_id from public.normalized_customers c where c.company_id = p_company and c.id = p_customer))
        or (t.store_grade_id is not null and t.store_grade_id = (select c.store_grade_id from public.normalized_customers c where c.company_id = p_company and c.id = p_customer)))
  ) into hit;
  return case aud when 'only' then hit else not hit end;
end $$;

commit;
