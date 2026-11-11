\set ON_ERROR_STOP on
-- CC-29a promotion audience. Runs after pricing-p0-fixture.sql, 20261030-pricing-p0.sql and 20261030-pricing-p1.sql in a disposable DB.
do $$ begin
  if current_database() <> 'promotion_audience_cc29a_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_promotion_audience_pg17_required'; end if;
end $$;
-- Minimal stand-in for production normalized_customers (only the keys CC-19a needs).
create table public.normalized_customers(id uuid primary key default gen_random_uuid(), company_id uuid not null references public.companies(id), customer_name text not null, unique(company_id,id));
grant select on public.normalized_customers to service_role;

insert into companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into product_catalog(id,company_id,category,purchase_product_name,purchase_price) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','농산','A',1000),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','농산','OTHER',1000);
insert into normalized_customers(id,company_id,customer_name) values
 ('40000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','store A (grade gold)'),
 ('40000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000001','store B (grade gold)'),
 ('40000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','store C (no grade)'),
 ('40000000-0000-4000-8000-000000000004','00000000-0000-4000-8000-000000000002','other company store');

\ir ../../docs/sql-drafts/20261111-CC-19a-margin-templates.sql
insert into margin_templates(id,company_id,name,margin_bp,rounding) values
 ('50000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','gold',2000,10),
 ('50000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','other gold',2000,10);
update normalized_customers set margin_template_id = '50000000-0000-4000-8000-000000000001' where id in ('40000000-0000-4000-8000-000000000001','40000000-0000-4000-8000-000000000002');
insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,tax_type,badge,revision) values
 ('30000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','p','p',current_date,current_date,1,1000,2,'taxable','행사',1),
 ('30000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000002','o','o',current_date,current_date,1,1000,2,'taxable','행사',1);

\ir ../../docs/sql-drafts/20261112-CC-29a-promotion-audience.sql

do $$
declare c uuid := '00000000-0000-4000-8000-000000000001'; o uuid := '00000000-0000-4000-8000-000000000002';
 pr uuid := '30000000-0000-4000-8000-000000000001'; po uuid := '30000000-0000-4000-8000-000000000002';
 sa uuid := '40000000-0000-4000-8000-000000000001'; sb uuid := '40000000-0000-4000-8000-000000000002'; sc uuid := '40000000-0000-4000-8000-000000000003';
 so uuid := '40000000-0000-4000-8000-000000000004'; gold uuid := '50000000-0000-4000-8000-000000000001'; gold_o uuid := '50000000-0000-4000-8000-000000000002';
 v text;
begin
 -- existing promotions default to all stores; every store matches.
 if (select audience from pricing_promotions where id = pr) <> 'all' then raise exception 'default audience not all'; end if;
 if not (promotion_applies_to(c, pr, sa) and promotion_applies_to(c, pr, sb) and promotion_applies_to(c, pr, sc)) then raise exception 'all must apply to every store'; end if;

 -- permissions.
 if has_function_privilege('anon','public.promotion_applies_to(uuid,uuid,uuid)','execute') or has_function_privilege('authenticated','public.promotion_applies_to(uuid,uuid,uuid)','execute')
   or has_table_privilege('authenticated','public.pricing_promotion_targets','select') then raise exception 'app roles have access'; end if;
 if not has_function_privilege('service_role','public.promotion_applies_to(uuid,uuid,uuid)','execute') then raise exception 'service_role cannot run'; end if;

 -- only + a store target: just that store.
 update pricing_promotions set audience = 'only' where id = pr;
 insert into pricing_promotion_targets(company_id, promotion_id, customer_id) values (c, pr, sa);
 if not promotion_applies_to(c, pr, sa) or promotion_applies_to(c, pr, sb) or promotion_applies_to(c, pr, sc) then raise exception 'only+store wrong'; end if;

 -- only + a grade target: both stores of the grade, not the store without grade.
 insert into pricing_promotion_targets(company_id, promotion_id, template_id) values (c, pr, gold);
 if not promotion_applies_to(c, pr, sa) or not promotion_applies_to(c, pr, sb) or promotion_applies_to(c, pr, sc) then raise exception 'only+grade wrong'; end if;

 -- only with no target matches nobody.
 delete from pricing_promotion_targets where promotion_id = pr;
 if promotion_applies_to(c, pr, sa) or promotion_applies_to(c, pr, sc) then raise exception 'only with no targets must match nobody'; end if;

 -- except + grade: everyone except the grade (the store without grade still applies); except with no targets = everyone.
 update pricing_promotions set audience = 'except' where id = pr;
 if not (promotion_applies_to(c, pr, sa) and promotion_applies_to(c, pr, sc)) then raise exception 'except with no targets must match all'; end if;
 insert into pricing_promotion_targets(company_id, promotion_id, template_id) values (c, pr, gold);
 if promotion_applies_to(c, pr, sa) or promotion_applies_to(c, pr, sb) or not promotion_applies_to(c, pr, sc) then raise exception 'except+grade wrong'; end if;
 insert into pricing_promotion_targets(company_id, promotion_id, customer_id) values (c, pr, sc);
 if promotion_applies_to(c, pr, sc) then raise exception 'except+store wrong'; end if;

 -- unknown promotion, another company's promotion, another company's store.
 if promotion_applies_to(c, gen_random_uuid(), sa) or promotion_applies_to(c, po, sa) or promotion_applies_to(o, pr, sa) then raise exception 'cross-company or unknown promotion applied'; end if;

 -- constraints: both/neither target column, duplicate, cross-company references, bad audience.
 begin insert into pricing_promotion_targets(company_id, promotion_id, customer_id, template_id) values (c, pr, sa, gold); raise exception 'both columns accepted'; exception when check_violation then null; end;
 begin insert into pricing_promotion_targets(company_id, promotion_id) values (c, pr); raise exception 'no target accepted'; exception when check_violation then null; end;
 begin insert into pricing_promotion_targets(company_id, promotion_id, customer_id) values (c, pr, sc); raise exception 'duplicate accepted'; exception when unique_violation then null; end;
 begin insert into pricing_promotion_targets(company_id, promotion_id, customer_id) values (c, pr, so); raise exception 'other company store accepted'; exception when foreign_key_violation then null; end;
 begin insert into pricing_promotion_targets(company_id, promotion_id, template_id) values (c, pr, gold_o); raise exception 'other company grade accepted'; exception when foreign_key_violation then null; end;
 begin update pricing_promotions set audience = 'some' where id = pr; raise exception 'bad audience accepted'; exception when check_violation then null; end;

 -- deleting a promotion removes its targets; deleting a store removes its target rows.
 delete from pricing_promotion_targets where customer_id = sc;
 delete from pricing_promotions where id = pr;
 if exists(select 1 from pricing_promotion_targets where promotion_id = pr) then raise exception 'targets survived promotion delete'; end if;
end $$;

-- down is refused while a promotion has a restricted audience, then works; up works again.
insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,tax_type,badge,revision,audience) values
 ('30000000-0000-4000-8000-000000000003','00000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001','q','q',current_date,current_date,1,1000,2,'taxable','행사',1,'only');
do $$ begin
  begin
    execute 'do $x$ begin if exists(select 1 from public.pricing_promotions where audience <> ''all'') then raise exception ''cc29a_down_refused_audience_in_use''; end if; end $x$';
    raise exception 'down guard did not refuse';
  exception when others then
    if sqlerrm <> 'cc29a_down_refused_audience_in_use' then raise; end if;
  end;
end $$;
update pricing_promotions set audience = 'all';
\ir ../../docs/sql-drafts/20261112-CC-29a-promotion-audience.down.sql
do $$ begin
  if to_regclass('public.pricing_promotion_targets') is not null or to_regprocedure('public.promotion_applies_to(uuid,uuid,uuid)') is not null
    or exists(select 1 from information_schema.columns where table_name = 'pricing_promotions' and column_name = 'audience') then raise exception 'down did not remove everything'; end if;
end $$;
\ir ../../docs/sql-drafts/20261112-CC-29a-promotion-audience.sql
select 'CC-29a ok';
