-- Run only in a new disposable PostgreSQL 17 database. No schema drops or production calls.
do $$ begin
  if not exists(select from pg_roles where rolname='service_role') then create role service_role; end if;
  if not exists(select from pg_roles where rolname='anon') then create role anon; end if;
  if not exists(select from pg_roles where rolname='authenticated') then create role authenticated; end if;
end $$;
alter role service_role bypassrls;
create table public.companies(id uuid primary key);
create table public.store_order_settings(company_id uuid primary key references public.companies(id), updated_at timestamptz default now());
create table public.purchase_receipt_lines(
  id uuid primary key, company_id uuid references public.companies(id), product_catalog_id uuid,
  receipt_date date, quantity numeric, unit text, unit_cost_ex_vat numeric, tax_type text,
  unique(company_id,id)
);
create table public.purchase_receipt_line_overrides(company_id uuid,receipt_line_id uuid,unit_cost_ex_vat numeric,revision integer,primary key(company_id,receipt_line_id));
create view public.purchase_receipt_effective with(security_invoker=true) as
select r.id,r.company_id,r.product_catalog_id,r.receipt_date,r.quantity,r.unit,
  coalesce(o.unit_cost_ex_vat,r.unit_cost_ex_vat) as unit_cost_ex_vat,r.tax_type,coalesce(o.revision,0) as correction_revision
from public.purchase_receipt_lines r left join public.purchase_receipt_line_overrides o on o.company_id=r.company_id and o.receipt_line_id=r.id;
create table public.purchase_receipt_correction_events(id bigint generated always as identity, company_id uuid, receipt_line_id uuid);
grant usage on schema public to service_role;
grant select,insert,update on public.store_order_settings to service_role;
grant select,update on public.purchase_receipt_lines to service_role;
grant select on public.purchase_receipt_effective,public.purchase_receipt_correction_events,public.purchase_receipt_line_overrides to service_role;
\ir ../../docs/sql-drafts/20261105-storefront-cost-direction.sql

insert into public.companies values('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into public.store_order_settings(company_id) values('00000000-0000-4000-8000-000000000001');
insert into public.purchase_receipt_lines(id,company_id,product_catalog_id,receipt_date,quantity,unit,unit_cost_ex_vat,tax_type) values
('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-01',1,'봉',1000,'exempt'),
('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-02',1,'봉',1200,'exempt'),
('10000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-03',1,'박스',9999,'exempt'),
('10000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','2026-10-04',1,'봉',1,'exempt'),
('10000000-0000-4000-8000-000000000005','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-05',0,'봉',7000,'exempt');

create function pg_temp.check_source(p_line uuid, p_eligible boolean default true) returns bigint language sql as $$
  select public.check_storefront_cost_source(e.company_id,e.id,to_jsonb(e),p_eligible,'synthetic-owner','synthetic valid source review')
  from public.purchase_receipt_effective e where e.id=p_line
$$;
create function pg_temp.directions() returns jsonb language sql as $$
  select coalesce(jsonb_agg(to_jsonb(d)),'[]'::jsonb) from public.storefront_cost_directions('00000000-0000-4000-8000-000000000001',array['20000000-0000-4000-8000-000000000001']::uuid[]) d
$$;
do $$ begin
  if (select show_purchase_cost_direction from public.store_order_settings limit 1) then raise exception 'must default off'; end if;
  if pg_temp.directions()<>'[]' then raise exception 'off leaked'; end if;
end $$;
select public.set_storefront_cost_direction_visibility('00000000-0000-4000-8000-000000000001',true);
do $$ begin if pg_temp.directions()<>'[]' then raise exception 'unreviewed records leaked'; end if; end $$;
select pg_temp.check_source('10000000-0000-4000-8000-000000000001');
do $$ begin if pg_temp.directions()<>'[]' then raise exception 'one point leaked'; end if; end $$;
select pg_temp.check_source('10000000-0000-4000-8000-000000000002');
select pg_temp.check_source('10000000-0000-4000-8000-000000000003');
select pg_temp.check_source('10000000-0000-4000-8000-000000000004');
insert into public.purchase_receipt_lines(id,company_id,product_catalog_id,receipt_date,quantity,unit,unit_cost_ex_vat,tax_type) values('10000000-0000-4000-8000-000000000007','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2099-01-01',1,'봉',99999,'exempt');
select pg_temp.check_source('10000000-0000-4000-8000-000000000007');
set role service_role;
select public.check_storefront_cost_source(e.company_id,e.id,to_jsonb(e),true,'synthetic-owner','verified service source review') from public.purchase_receipt_effective e where e.id='10000000-0000-4000-8000-000000000002';
select * from public.storefront_cost_directions('00000000-0000-4000-8000-000000000001',array['20000000-0000-4000-8000-000000000001']::uuid[]);
reset role;
do $$ begin
  if pg_temp.directions() <> '[{"product_id":"20000000-0000-4000-8000-000000000001","sales_unit":"봉","direction":"up"}]'::jsonb then raise exception 'up/unit/company projection mismatch'; end if;
  begin
    perform public.storefront_cost_directions('00000000-0000-4000-8000-000000000001',array_fill('20000000-0000-4000-8000-000000000001'::uuid,array[101]));
    raise exception 'oversized direction scope accepted';
  exception when others then if sqlerrm <> 'invalid_direction_scope' then raise; end if; end;
  begin
    perform pg_temp.check_source('10000000-0000-4000-8000-000000000005');
    raise exception 'zero quantity was accepted';
  exception when others then if sqlerrm <> 'receipt_not_eligible' then raise; end if; end;
  begin
    perform public.check_storefront_cost_source('00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001','{}',true,'owner','wrong company source');
    raise exception 'cross company source accepted';
  exception when others then if sqlerrm <> 'receipt_not_found' then raise; end if; end;
  begin
    perform public.check_storefront_cost_source('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','{}',true,'owner','stale source snapshot');
    raise exception 'stale snapshot accepted';
  exception when others then if sqlerrm <> 'receipt_changed_retry' then raise; end if; end;
end $$;

-- Identical retry stays valid; changed-and-restored raw uploads cannot resurrect old approval.
update public.purchase_receipt_lines set unit_cost_ex_vat=1200 where id='10000000-0000-4000-8000-000000000002';
do $$ begin if (pg_temp.directions()->0->>'direction') is distinct from 'up' then raise exception 'identical upload invalidated review'; end if; end $$;
update public.purchase_receipt_lines set unit_cost_ex_vat=1100 where id='10000000-0000-4000-8000-000000000002';
update public.purchase_receipt_lines set unit_cost_ex_vat=1200 where id='10000000-0000-4000-8000-000000000002';
update public.purchase_receipt_lines set storefront_cost_revision=0 where id='10000000-0000-4000-8000-000000000002';
do $$ begin
  if pg_temp.directions()<>'[]' then raise exception 'restored upload resurrected approval'; end if;
  if (select storefront_cost_revision from public.purchase_receipt_lines where id='10000000-0000-4000-8000-000000000002')<>2 then raise exception 'source revision was forged'; end if;
end $$;
select pg_temp.check_source('10000000-0000-4000-8000-000000000002');
-- Corrections do not touch the raw row: cancelling one still invalidates its old review.
insert into public.purchase_receipt_line_overrides values('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002',800,1);
insert into public.purchase_receipt_correction_events(company_id,receipt_line_id) values('00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000002');
do $$ begin if pg_temp.directions()<>'[]' then raise exception 'changed receipt approval reused'; end if; end $$;
delete from public.purchase_receipt_line_overrides where receipt_line_id='10000000-0000-4000-8000-000000000002';
do $$ begin if pg_temp.directions()<>'[]' then raise exception 'cancelled correction resurrected approval'; end if; end $$;
select pg_temp.check_source('10000000-0000-4000-8000-000000000002');
do $$ begin if (pg_temp.directions()->0->>'direction') is distinct from 'up' then raise exception 'explicit recheck failed'; end if; end $$;
select pg_temp.check_source('10000000-0000-4000-8000-000000000002',false);
do $$ begin if pg_temp.directions()<>'[]' then raise exception 'invalid source not excluded'; end if; end $$;
update public.purchase_receipt_lines set unit_cost_ex_vat=800 where id='10000000-0000-4000-8000-000000000002';
select pg_temp.check_source('10000000-0000-4000-8000-000000000002');
do $$ begin if (pg_temp.directions()->0->>'direction') is distinct from 'down' then raise exception 'down failed'; end if; end $$;
update public.purchase_receipt_lines set unit_cost_ex_vat=1000 where id='10000000-0000-4000-8000-000000000002';
select pg_temp.check_source('10000000-0000-4000-8000-000000000002');
do $$ begin if pg_temp.directions()<>'[]' then raise exception 'unchanged cost leaked'; end if; end $$;

update public.purchase_receipt_lines set unit_cost_ex_vat=1200 where id='10000000-0000-4000-8000-000000000002';
select pg_temp.check_source('10000000-0000-4000-8000-000000000002');
insert into public.purchase_receipt_lines(id,company_id,product_catalog_id,receipt_date,quantity,unit,unit_cost_ex_vat,tax_type) values('10000000-0000-4000-8000-000000000006','00000000-0000-4000-8000-000000000001','20000000-0000-4000-8000-000000000001','2026-10-02',1,'봉',1300,'exempt');
select pg_temp.check_source('10000000-0000-4000-8000-000000000006');
do $$ begin if pg_temp.directions()<>'[]' then raise exception 'same day ambiguous price leaked'; end if; end $$;

do $$ begin
  if has_function_privilege('anon','public.storefront_cost_directions(uuid,uuid[])','execute')
     or has_function_privilege('anon','public.guard_storefront_cost_source_revision()','execute')
     or has_function_privilege('authenticated','public.check_storefront_cost_source(uuid,uuid,jsonb,boolean,text,text)','execute')
     or has_table_privilege('authenticated','public.storefront_cost_source_checks','select') then raise exception 'private grants leaked'; end if;
  if not has_function_privilege('service_role','public.storefront_cost_directions(uuid,uuid[])','execute') then raise exception 'service grant missing'; end if;
end $$;
set role service_role;
select public.set_storefront_cost_direction_visibility('00000000-0000-4000-8000-000000000001',false);
select * from public.storefront_cost_directions('00000000-0000-4000-8000-000000000001',array['20000000-0000-4000-8000-000000000001']::uuid[]);
reset role;
create temp table before_cost_direction_down as select id,to_jsonb(r)-'storefront_cost_revision' as business_snapshot from public.purchase_receipt_lines r;
\ir ../../docs/sql-drafts/20261105-storefront-cost-direction.down.sql
do $$ begin
  if to_regclass('public.storefront_cost_source_checks') is not null then raise exception 'down left source checks'; end if;
  if (select count(*) from public.purchase_receipt_lines)<>7 then raise exception 'down changed receipts'; end if;
  if exists(select 1 from public.purchase_receipt_lines r join before_cost_direction_down b using(id) where to_jsonb(r) is distinct from b.business_snapshot) then raise exception 'down changed receipt business values'; end if;
end $$;
\ir ../../docs/sql-drafts/20261105-storefront-cost-direction.sql
do $$ begin
  if (select show_purchase_cost_direction from public.store_order_settings where company_id='00000000-0000-4000-8000-000000000001') then raise exception 'up after down not off'; end if;
end $$;
select 'storefront_cost_direction_pg17_pass' as result;
