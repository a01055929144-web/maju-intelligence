begin;
insert into companies values ('00000000-0000-4000-8000-000000000021'),('00000000-0000-4000-8000-000000000022');
insert into product_catalog(id,company_id,purchase_product_name,category,purchase_price)
select md5('pricing-p0-priority-'||n)::uuid,'00000000-0000-4000-8000-000000000021','품목 '||n,'채소',800 from generate_series(1,5000) n;
set local role service_role;
do $$
declare c uuid:='00000000-0000-4000-8000-000000000021'; other uuid:='00000000-0000-4000-8000-000000000022';
 p uuid:=md5('pricing-p0-priority-1')::uuid; g uuid; run uuid; state jsonb;
begin
 perform pricing_p0_command(c,'{"action":"defaults","margin":20,"rounding":10}');
 if (select effective_margin_bp from pricing_p0_effective where company_id=c and product_id=p)<>2000 then raise exception 'Default margin missing'; end if;
 perform pricing_p0_command(c,'{"action":"group","name":"채소 그룹","margin":50,"rounding":100}');
 select id into g from margin_groups where company_id=c;
 perform pricing_p0_command(c,jsonb_build_object('action','category','category','채소','groupId',g));
 begin
   perform pricing_p0_command(other,jsonb_build_object('action','category','category','채소','groupId',g));
   raise exception 'Cross-company category accepted';
 exception when foreign_key_violation then null; end;
 state:=pricing_p0_state(c);
 if (state->>'total')::integer<>5000 or jsonb_array_length(state->'items')<>50 or (state->>'pendingCount')::integer<>5000 then raise exception '5000 row paging/global count'; end if;
 if (pricing_p0_state(c,'품목 5000',1)->>'total')::integer<>1 or (pricing_p0_state(c,'품목 5000',1)->>'pendingCount')::integer<>5000 then raise exception 'Search/global count'; end if;
 if jsonb_array_length(pricing_p0_state(c,'',101)->'items')<>0 then raise exception 'Page bounds'; end if;
 if (select count(distinct x->>'id') from (select jsonb_array_elements(pricing_p0_state(c,'',1)->'items') x union all select jsonb_array_elements(pricing_p0_state(c,'',2)->'items')) t)<>100 then raise exception 'Unstable page overlap'; end if;
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 if (select count(*) from pricing_items where company_id=c and price=1200)<>5000 then raise exception 'Category calculation did not cover all pages'; end if;
 if (pricing_p0_state(c)->>'pendingCount')::integer<>0 then raise exception 'Pending after calculation'; end if;
 perform pricing_p0_command(c,jsonb_build_object('action','item-margin','productId',p,'margin',0));
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 if (select price from pricing_items where company_id=c and product_id=p)<>800 then raise exception 'Zero item margin precedence'; end if;
 perform pricing_p0_command(c,jsonb_build_object('action','direct','productId',p,'price',801));
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 if (select price from pricing_items where company_id=c and product_id=p)<>801 then raise exception 'Direct price must bypass margin and rounding'; end if;
 perform pricing_p0_command(c,jsonb_build_object('action','direct','productId',p,'price',null));
 perform pricing_p0_command(c,jsonb_build_object('action','item-margin','productId',p,'margin',null));
 perform pricing_p0_command(c,jsonb_build_object('action','category','category','채소','groupId',''));
 if (pricing_p0_state(c)->>'pendingCount')::integer<>5000 then raise exception 'Category removal must inherit default'; end if;
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 if (select count(*) from pricing_items where company_id=c and price=960)<>5000 then raise exception 'Default fallback calculation'; end if;
 perform pricing_p0_command(c,'{"action":"defaults","margin":0,"rounding":100}');
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 select id into run from price_recalc_runs where company_id=c order by created_at desc,id desc limit 1;
 if (select count(*) from pricing_items where company_id=c and price=800)<>5000 then raise exception 'Default zero margin'; end if;
 perform pricing_p0_command(c,jsonb_build_object('action','restore','batchId',run));
 perform pricing_p0_command(c,jsonb_build_object('action','restore','batchId',run));
 if (select count(*) from pricing_items where company_id=c and price=960)<>5000 or (pricing_p0_state(c)->>'pendingCount')::integer<>5000 then raise exception '5000 row restore'; end if;
 -- Retain a mapping so company deletion verifies its cascade as well.
 perform pricing_p0_command(c,jsonb_build_object('action','category','category','채소','groupId',g));
 if has_table_privilege('authenticated','margin_group_categories','select') or has_table_privilege('anon','pricing_settings','select') or has_table_privilege('anon','pricing_p0_effective','select') then raise exception 'New rule tables exposed'; end if;
end $$;
reset role;
delete from companies where id='00000000-0000-4000-8000-000000000021';
do $$ begin
 if exists(select 1 from margin_group_categories) or exists(select 1 from pricing_settings) or exists(select 1 from pricing_items) or exists(select 1 from price_recalc_changes) or exists(select 1 from price_recalc_runs) then raise exception 'Company rule/run cascade'; end if;
end $$;
rollback;
