-- 11/4 매입 기록 보관 (대표 요청: 수량·공급가액·부가세·합계를 저장해 두고 나중에 쓰기, 당일 매입 수량 확인).
-- 운영 DB fcmdvveqmcgtioelzqun 승인 문구 필요. 새 테이블 1개만 추가하고 기존 테이블은 바꾸지 않습니다.
-- 중복 방지: (company_id, dedupe_key) 유니크. dedupe_key = 매입일|매입처|품목키(이름+규격, 띄어쓰기·괄호 무시).
--   같은 날 같은 파일을 다시 올려도 줄이 늘지 않고 덮어씁니다.
begin;
create table if not exists public.purchase_receipt_lines (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  receipt_date date not null,
  dedupe_key text not null,
  line_key text not null,
  product_catalog_id uuid,
  supplier_name text,
  erp_code text,
  product_name text not null,
  spec text,
  unit text,
  quantity numeric(14,3),
  unit_price numeric(14,2) not null,
  price_includes_vat boolean not null default false,
  unit_cost_ex_vat numeric(14,2) not null,
  supply_amount numeric(16,2),
  vat_amount numeric(16,2),
  total_amount numeric(16,2),
  file_name text,
  source_row_number integer,
  raw_values jsonb not null default '[]'::jsonb,
  created_by_name text,
  created_at timestamptz not null default now(),
  constraint purchase_receipt_lines_dedupe unique (company_id, dedupe_key),
  constraint purchase_receipt_lines_amounts check (unit_price >= 0 and unit_cost_ex_vat >= 0 and (quantity is null or quantity >= 0)),
  constraint purchase_receipt_lines_catalog_fk foreign key (company_id, product_catalog_id) references public.product_catalog(company_id, id) on delete set null (product_catalog_id)
);
create index if not exists purchase_receipt_lines_date_idx on public.purchase_receipt_lines(company_id, receipt_date desc);
create index if not exists purchase_receipt_lines_item_idx on public.purchase_receipt_lines(company_id, line_key, receipt_date desc);
alter table public.purchase_receipt_lines enable row level security;
revoke all on public.purchase_receipt_lines from anon, authenticated;
comment on table public.purchase_receipt_lines is '매입 엑셀에서 받은 날짜·품목별 매입 기록(수량·금액·부가세 기준). 같은 날 같은 품목은 덮어씀';
commit;
