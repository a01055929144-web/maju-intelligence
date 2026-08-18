alter table public.normalized_customers
  add column if not exists naver_place_url text,
  add column if not exists kakao_place_url text,
  add column if not exists google_map_url text,
  add column if not exists place_links_checked_at timestamptz;

create index if not exists idx_normalized_customers_place_links
  on public.normalized_customers(company_id)
  where naver_place_url is not null
     or kakao_place_url is not null
     or google_map_url is not null;
