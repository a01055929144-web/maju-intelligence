-- REVIEW ONLY: 운영 DB 적용·백필·기능 ON 금지.
-- migration 파일이 아니다. 별도 승인 후 새 migration으로 승격한다.

begin;

alter table public.normalized_customers
  add column delivery_eligibility text;

-- 승인 시점 이전의 모든 거래처는 현재 수동 코스와 미배정 그룹을 보존한다.
update public.normalized_customers
set delivery_eligibility = 'eligible'
where delivery_eligibility is null;

alter table public.normalized_customers
  alter column delivery_eligibility set default 'not_ready',
  alter column delivery_eligibility set not null;

alter table public.normalized_customers
  add constraint normalized_customers_delivery_eligibility_check
  check (delivery_eligibility in ('eligible', 'not_ready'));

comment on column public.normalized_customers.delivery_eligibility is
  '배송 후보 명시 상태. 기존 행은 승인 백필로 eligible, 신규 행은 기본 not_ready. 주문·관계·사업자 상태로 추정하지 않는다.';

commit;

-- 승인 전 실행 금지 down 초안:
-- begin;
-- alter table public.normalized_customers
--   drop constraint if exists normalized_customers_delivery_eligibility_check,
--   drop column if exists delivery_eligibility;
-- commit;
