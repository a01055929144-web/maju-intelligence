-- Enables customer master upsert by company + normalized customer key.
-- Run this once if schema.sql was already executed before this migration was added.

with ranked_customers as (
  select
    id,
    row_number() over (
      partition by company_id, normalized_key
      order by created_at desc, id desc
    ) as rank
  from public.normalized_customers
)
delete from public.normalized_customers
where id in (
  select id
  from ranked_customers
  where rank > 1
);

create unique index if not exists idx_normalized_customers_company_key_unique
on public.normalized_customers(company_id, normalized_key);
