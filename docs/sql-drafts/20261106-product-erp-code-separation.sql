-- 고객사 ERP 코드와 MAJU 내부 product_code 분리 초안.
-- 운영 DB 적용 금지. product_code/next_product_code/잠금 트리거는 변경하지 않는다.

begin;

alter table public.product_catalog
  add column if not exists erp_code text;

do $$ begin
  alter table public.product_catalog
    add constraint product_catalog_erp_code_not_blank_check
    check (erp_code is null or length(btrim(erp_code)) between 1 and 80);
exception when duplicate_object then null;
end $$;

create unique index if not exists product_catalog_erp_code_uq
  on public.product_catalog(company_id, lower(btrim(erp_code)))
  where erp_code is not null and btrim(erp_code) <> '';

comment on column public.product_catalog.product_code is
  'MAJU internal immutable company product code (P-000001).';
comment on column public.product_catalog.erp_code is
  'Optional customer ERP product code; unique per company after trim/case normalization.';

commit;

-- 진단 전용: 자동 UPDATE 하지 않는다.
-- 1) 추가 후 ERP 코드가 비어 있을 상품 수
select company_id, count(*) as products_without_erp_code
from public.product_catalog
where erp_code is null
group by company_id
order by company_id;

-- 2) 사람 검토가 가능한 단일 매입처 품번 후보 수
with candidates as (
  select m.company_id, m.product_catalog_id,
         min(btrim(sp.supplier_code)) as candidate_erp_code
  from public.supplier_product_matches m
  join public.supplier_products sp
    on sp.company_id = m.company_id and sp.id = m.supplier_product_id
  where m.match_status in ('auto', 'confirmed')
    and nullif(btrim(sp.supplier_code), '') is not null
  group by m.company_id, m.product_catalog_id
  having count(distinct lower(btrim(sp.supplier_code))) = 1
)
select company_id, count(*) as review_candidates
from candidates
group by company_id
order by company_id;

