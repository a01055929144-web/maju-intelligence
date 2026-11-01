-- WO-25 / 22·23차 기준 단가 SQL 초안. 운영 DB 적용 금지.
-- 실제 전표 단가는 business_document_lines.unit_price에 계속 저장한다.

begin;

create table if not exists public.product_base_prices (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  product_id uuid not null,
  effective_date date not null,
  base_cost bigint not null check (base_cost >= 0),
  base_price bigint not null check (base_price >= 0),
  price_overridden boolean not null default false,
  source text not null check (source in ('manual', 'excel', 'purchase_reflect', 'voucher', 'copy_prev')),
  created_by_user_id uuid,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, product_id, effective_date),
  foreign key (company_id, product_id)
    references public.product_catalog(company_id, id) on delete cascade
);

create index if not exists product_base_prices_company_date_idx
  on public.product_base_prices(company_id, effective_date desc, product_id);

alter table public.product_base_prices enable row level security;
revoke all on public.product_base_prices from public, anon, authenticated;
grant select, insert, update, delete on public.product_base_prices to service_role;

commit;

-- down (승인 후 적용 시 별도 롤백으로 실행)
-- drop table if exists public.product_base_prices;
