-- Disposable surrounding keys only; accounting/inventory definitions below are unchanged production sources.
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    or to_regclass('public.business_documents') is null or to_regclass('public.inventory_movements') is not null
    then raise exception 'cx75_fresh_disposable_erp_required'; end if;
  if exists(select 1 from public.business_documents) or exists(select 1 from public.business_document_lines)
    then raise exception 'cx75_surrounding_documents_not_empty'; end if;
end $$;
-- Replace only the empty six-column surrounding P2 fixture. No CASCADE: unexpected dependencies fail closed.
drop table public.business_document_lines;
drop table public.business_documents;
create table if not exists public.product_suppliers(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table if not exists public.supplier_products(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table if not exists public.company_members(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table if not exists public.delivery_territories(id uuid primary key,company_id uuid not null,unique(company_id,id));
create table if not exists public.supplier_product_matches(company_id uuid not null,supplier_product_id uuid not null,
  product_catalog_id uuid not null,match_status text not null);
\ir ../../supabase/migrations/20261016190000_erp_phase_1_documents_ledger.sql
\ir ../../supabase/migrations/20261016200000_erp_phase_1b_v2.sql
\ir ../../supabase/migrations/20261016201000_erp_phase_1c_line_move_copy.sql
\ir ../../supabase/migrations/20261016202000_inventory_phase_1.sql
insert into public.product_inventory_settings(company_id,product_catalog_id,tracking_enabled)
values('00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',true);
insert into public.product_unit_conversions(company_id,product_catalog_id,unit_name,base_quantity,is_base)
values('00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','BOX',1,true);
insert into public.inventory_movements(company_id,product_catalog_id,movement_type,quantity_delta,value_delta,unit_cost,business_date,reason,idempotency_key)
values('00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001','adjustment',1000,800000,800,'2026-11-18','CX75 synthetic opening','cx75-synthetic-opening');
insert into public.inventory_balances(company_id,product_catalog_id,on_hand_quantity,inventory_value,average_unit_cost)
values('00000000-0000-4000-8000-000000000001','60000000-0000-4000-8000-000000000001',1000,800000,800);

-- Complete snapshots catch updates/deletes as well as extra rows. No substitute posting functions.
create function pg_temp.cx75_postings() returns jsonb language sql as $$
 select jsonb_build_object(
  'confirmed_documents',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.business_documents t where status='confirmed'),
  'ledger',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.partner_ledger_entries t),
  'movements',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.inventory_movements t),
  'positions',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.inventory_document_positions t),
  'balances',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.inventory_balances t));
$$;
create function pg_temp.cx75_effects() returns jsonb language sql as $$
 select jsonb_build_object(
  'postings',pg_temp.cx75_postings(),
  'orders',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.store_orders t),
  'lines',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.store_order_lines t),
  'notifications',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.company_notifications t),
  'requests',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.store_account_order_requests t),
  'documents',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.business_documents t),
  'document_lines',(select coalesce(jsonb_agg(to_jsonb(t) order by to_jsonb(t)::text),'[]') from public.business_document_lines t));
$$;
