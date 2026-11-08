\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'store_member_order_test_delivery_09'
    or current_setting('server_version_num')::integer/10000<>17 then
    raise exception 'disposable_stage_d_completion_pg17_required';
  end if;
end $$;
alter table public.normalized_customers add column if not exists assigned_staff_member_id uuid;
alter table public.normalized_customers add column if not exists delivery_vehicle text;
create table if not exists public.route_plan_confirmations (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  driver_name text not null,
  route_date date not null,
  customer_ids jsonb not null default '[]'::jsonb,
  unique(company_id,driver_name,route_date)
);
alter table public.route_plan_confirmations enable row level security;
grant usage on schema public to service_role;
grant select,insert,update on public.route_plan_confirmations to service_role;
grant select,update on public.normalized_customers to service_role;
grant select on public.store_orders,public.customer_notes,public.customer_attachments,
  public.store_order_delivery_completion_orders_09 to service_role;
notify pgrst,'reload schema';

