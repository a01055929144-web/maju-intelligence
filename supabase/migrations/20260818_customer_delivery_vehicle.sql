alter table public.normalized_customers
  add column if not exists delivery_vehicle text;
