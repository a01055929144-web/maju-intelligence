-- DRAFT ONLY. Separate operating DB approval required. No data backfill or app activation.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.companies') is null
    or to_regclass('public.company_members') is null
    or to_regclass('public.product_catalog') is null
    or to_regclass('public.pricing_document_share_links') is null
    or to_regclass('public.admin_audit_logs') is null then
    raise exception 'industry_basket_prerequisites_required';
  end if;
end $$;

create table public.company_industry_baskets (
  company_id uuid not null references public.companies(id) on delete cascade,
  industry_key text not null,
  product_catalog_id uuid not null,
  default_qty numeric(14,3) not null,
  is_core boolean not null default false,
  sort_order integer not null default 0,
  updated_by uuid not null,
  updated_at timestamptz not null default clock_timestamp(),
  primary key (company_id, industry_key, product_catalog_id),
  constraint company_industry_baskets_industry_check check (
    industry_key in ('한식', '중식', '일식', '양식', '분식', '카페/디저트', '주점', '치킨/고깃집', '기타')
  ),
  constraint company_industry_baskets_qty_check check (default_qty > 0 and default_qty <= 1000000),
  constraint company_industry_baskets_sort_check check (sort_order between 0 and 10000),
  constraint company_industry_baskets_product_fk
    foreign key (company_id, product_catalog_id)
    references public.product_catalog(company_id, id) on delete restrict,
  constraint company_industry_baskets_updated_by_fk
    foreign key (company_id, updated_by)
    references public.company_members(company_id, id) on delete restrict
);

alter table public.company_industry_baskets enable row level security;
revoke all on table public.company_industry_baskets from public, anon, authenticated, service_role;
grant select, insert, update, delete on table public.company_industry_baskets to service_role;

alter table public.pricing_document_share_links add column preview_id uuid;
alter table public.pricing_document_share_links add column preview_title text;
alter table public.pricing_document_share_links add column preview_description text;
alter table public.pricing_document_share_links
  add constraint pricing_document_share_links_preview_shape_check check (
    num_nonnulls(preview_id, preview_title, preview_description) in (0, 3)
  ),
  add constraint pricing_document_share_links_preview_title_check check (
    preview_title is null or char_length(btrim(preview_title)) between 1 and 160
  ),
  add constraint pricing_document_share_links_preview_description_check check (
    preview_description is null or char_length(btrim(preview_description)) between 1 and 300
  );
create unique index pricing_document_share_links_preview_id_uq
  on public.pricing_document_share_links(preview_id) where preview_id is not null;

insert into public.admin_audit_logs(action, target_type, metadata)
values (
  'industry_basket_schema_added',
  'company_industry_baskets',
  jsonb_build_object(
    'draft', '2026-11-15-industry-basket.sql',
    'existing_share_links', (select count(*) from public.pricing_document_share_links),
    'backfilled_rows', 0
  )
);

commit;
