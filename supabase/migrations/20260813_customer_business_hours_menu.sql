alter table public.normalized_customers
  add column if not exists business_hours text,
  add column if not exists menu_summary text;
