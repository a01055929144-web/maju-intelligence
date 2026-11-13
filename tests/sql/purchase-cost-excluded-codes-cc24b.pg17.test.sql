\set ON_ERROR_STOP on
-- CC-24b excluded upload codes. Disposable DB with the pricing-p0 fixture only (needs companies); product_suppliers is a stand-in with the production key.
do $$ begin
  if current_database() <> 'purchase_excluded_codes_cc24b_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_excluded_codes_pg17_required'; end if;
end $$;
insert into companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
create table public.product_suppliers(id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id) on delete cascade, name text not null, unique(company_id, id));
insert into product_suppliers(id, company_id, name) values ('50000000-0000-4000-8000-00000000000a','00000000-0000-4000-8000-000000000001','supplier A'),('50000000-0000-4000-8000-00000000000b','00000000-0000-4000-8000-000000000001','supplier B'),('50000000-0000-4000-8000-00000000000c','00000000-0000-4000-8000-000000000002','other company supplier');
\ir ../../docs/sql-drafts/20261112-CC-24b-purchase-cost-excluded-codes.sql

do $$
declare c1 uuid := '00000000-0000-4000-8000-000000000001'; c2 uuid := '00000000-0000-4000-8000-000000000002';
begin
  -- permissions: app roles have nothing, service_role can read/insert/delete (not update).
  if has_table_privilege('anon','public.purchase_cost_excluded_codes','select') or has_table_privilege('authenticated','public.purchase_cost_excluded_codes','select')
    or has_table_privilege('authenticated','public.purchase_cost_excluded_codes','insert') then raise exception 'cc24b_app_roles_have_access'; end if;
  if not (has_table_privilege('service_role','public.purchase_cost_excluded_codes','select') and has_table_privilege('service_role','public.purchase_cost_excluded_codes','insert')
    and has_table_privilege('service_role','public.purchase_cost_excluded_codes','delete')) or has_table_privilege('service_role','public.purchase_cost_excluded_codes','update')
    then raise exception 'cc24b_service_role_grants_wrong'; end if;
  if not (select relrowsecurity from pg_class where oid = 'public.purchase_cost_excluded_codes'::regclass) then raise exception 'cc24b_rls_off'; end if;

  insert into purchase_cost_excluded_codes(company_id, code) values (c1, 'A-100'), (c2, 'A-100'); -- same code in two companies is fine
  -- same code, different case, same company: rejected.
  begin insert into purchase_cost_excluded_codes(company_id, code) values (c1, 'a-100'); raise exception 'cc24b_case_duplicate_allowed';
  exception when unique_violation then null; end;
  -- untrimmed, empty and too long codes are rejected.
  begin insert into purchase_cost_excluded_codes(company_id, code) values (c1, ' B-1'); raise exception 'cc24b_untrimmed_allowed';
  exception when check_violation then null; end;
  begin insert into purchase_cost_excluded_codes(company_id, code) values (c1, ''); raise exception 'cc24b_empty_allowed';
  exception when check_violation then null; end;
  begin insert into purchase_cost_excluded_codes(company_id, code) values (c1, repeat('x', 81)); raise exception 'cc24b_too_long_allowed';
  exception when check_violation then null; end;
  -- unknown company rejected.
  begin insert into purchase_cost_excluded_codes(company_id, code) values ('00000000-0000-4000-8000-0000000000ff', 'Z'); raise exception 'cc24b_unknown_company_allowed';
  exception when foreign_key_violation then null; end;
  -- supplier scope: the same code may exist company-wide and once per supplier; duplicates inside one scope are rejected (case-insensitive), including company-wide (NULL) ones.
  insert into purchase_cost_excluded_codes(company_id, supplier_id, code) values (c1, '50000000-0000-4000-8000-00000000000a', 'A-100'), (c1, '50000000-0000-4000-8000-00000000000b', 'A-100');
  begin insert into purchase_cost_excluded_codes(company_id, supplier_id, code) values (c1, '50000000-0000-4000-8000-00000000000a', 'a-100'); raise exception 'cc24b_supplier_duplicate_allowed';
  exception when unique_violation then null; end;
  begin insert into purchase_cost_excluded_codes(company_id, supplier_id, code) values (c1, null, 'A-100'); raise exception 'cc24b_company_wide_duplicate_allowed';
  exception when unique_violation then null; end;
  -- a supplier of another company is rejected.
  begin insert into purchase_cost_excluded_codes(company_id, supplier_id, code) values (c1, '50000000-0000-4000-8000-00000000000c', 'Q'); raise exception 'cc24b_foreign_supplier_allowed';
  exception when foreign_key_violation then null; end;
  -- deleting a supplier deletes only that supplier's codes (company-wide codes stay company-wide).
  delete from product_suppliers where id = '50000000-0000-4000-8000-00000000000a';
  if (select count(*) from purchase_cost_excluded_codes where company_id = c1) <> 2 or exists(select 1 from purchase_cost_excluded_codes where supplier_id = '50000000-0000-4000-8000-00000000000a') then raise exception 'cc24b_supplier_cascade_wrong'; end if;
  delete from purchase_cost_excluded_codes where supplier_id is not null;
  -- deleting a company removes its codes only.
  delete from companies where id = c2;
  if (select count(*) from purchase_cost_excluded_codes) <> 1 or not exists(select 1 from purchase_cost_excluded_codes where company_id = c1) then raise exception 'cc24b_company_cascade_wrong'; end if;
end $$;
select 'cc24b_table_grants_unique_case_checks_cascade_pg17_pass';

-- down is refused while codes exist, works once the list is empty, and the table can be applied again.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261112-CC-24b-purchase-cost-excluded-codes.down.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin if to_regclass('public.purchase_cost_excluded_codes') is null then raise exception 'cc24b_down_guard_missed_codes'; end if; end $$;
delete from purchase_cost_excluded_codes;
\ir ../../docs/sql-drafts/20261112-CC-24b-purchase-cost-excluded-codes.down.sql
do $$ begin if to_regclass('public.purchase_cost_excluded_codes') is not null then raise exception 'cc24b_down_left_table'; end if; end $$;
\ir ../../docs/sql-drafts/20261112-CC-24b-purchase-cost-excluded-codes.sql
select 'cc24b_down_guard_and_reapply_pg17_pass';
