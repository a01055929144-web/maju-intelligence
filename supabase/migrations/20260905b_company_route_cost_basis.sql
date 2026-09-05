alter table public.companies
  add column if not exists route_fuel_cost_won_per_km integer not null default 180,
  add column if not exists route_labor_cost_won_per_hour integer not null default 12000;

update public.companies
set
  route_fuel_cost_won_per_km = coalesce(route_fuel_cost_won_per_km, 180),
  route_labor_cost_won_per_hour = coalesce(route_labor_cost_won_per_hour, 12000);

notify pgrst, 'reload schema';
