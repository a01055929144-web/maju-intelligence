begin;
insert into companies values ('00000000-0000-4000-8000-000000000001'),('00000000-0000-4000-8000-000000000002');
insert into product_catalog(id,company_id,purchase_product_name,purchase_price) values
 ('10000000-0000-4000-8000-000000000001','00000000-0000-4000-8000-000000000001','A',800),
 ('10000000-0000-4000-8000-000000000002','00000000-0000-4000-8000-000000000002','B',900);
set local role service_role;
do $$
declare c uuid := '00000000-0000-4000-8000-000000000001'; other uuid := '00000000-0000-4000-8000-000000000002';
 p uuid := '10000000-0000-4000-8000-000000000001'; q uuid := '10000000-0000-4000-8000-000000000002'; g uuid; run uuid; n integer;
begin
 perform pricing_p0_command(c,'{"action":"group","name":"기본","margin":20,"rounding":10}');
 select id into g from margin_groups where company_id=c;
 perform pricing_p0_command(c,jsonb_build_object('action','assign','productId',p,'groupId',g));
 begin
   perform pricing_p0_command(other,jsonb_build_object('action','assign','productId',q,'groupId',g));
   raise exception 'Cross-company group unexpectedly accepted';
 exception when foreign_key_violation then null; end;
 begin
   perform pricing_p0_command(other,jsonb_build_object('action','assign','productId',p,'groupId',g));
   raise exception 'Cross-company product unexpectedly accepted';
 exception when foreign_key_violation then null; end;
 if jsonb_array_length(pricing_p0_state(other)->'items') <> 1 then raise exception 'State isolation'; end if;
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 select id into run from price_recalc_runs where company_id=c;
 if (select price from pricing_items where company_id=c and product_id=p) <> 1000 then raise exception 'Wrong price'; end if;
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 select count(*) into n from price_recalc_runs where company_id=c;
 if n<>1 then raise exception 'Duplicate recalculation created run'; end if;
 perform pricing_p0_command(c,jsonb_build_object('action','restore','batchId',run));
 perform pricing_p0_command(c,jsonb_build_object('action','restore','batchId',run));
 if (select price from pricing_items where company_id=c and product_id=p) <> 0 then raise exception 'Restore/idempotency'; end if;
 update product_catalog set purchase_price=880 where company_id=c;
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 select id into run from price_recalc_runs where company_id=c order by created_at desc,id desc limit 1;
 if (select price from pricing_items where company_id=c and product_id=p) <> 1100 then raise exception 'Changed cost'; end if;
 perform pricing_p0_command(c,jsonb_build_object('action','direct','productId',p,'price',0));
 begin
   perform pricing_p0_command(c,jsonb_build_object('action','restore','batchId',run));
   raise exception 'Restore conflict missed';
 exception when raise_exception then
   if SQLERRM='Restore conflict missed' then raise; end if;
 end;
 if (select price from pricing_items where company_id=c and product_id=p)<>0 then raise exception 'Direct zero precedence'; end if;
 perform pricing_p0_command(c,'{"action":"recalculate"}');
 if (select price from pricing_items where company_id=c and product_id=p)<>0 then raise exception 'Recalculated direct price'; end if;
 if pricing_p0_price(1,9999,1)<>10000 or pricing_p0_price(1000000000000,0,1)<>1000000000000 then raise exception 'Numeric boundary'; end if;
 begin
   perform pricing_p0_price(1000000000000,9999,1); raise exception 'Overflow missed';
 exception when raise_exception then if SQLERRM='Overflow missed' then raise; end if; end;
 if has_function_privilege('anon','pricing_p0_state(uuid,text,integer)','execute') or has_table_privilege('authenticated','pricing_items','select') then raise exception 'Role exposure'; end if;
end $$;
reset role;
set local role authenticated;
do $$ begin
 begin perform * from pricing_items; raise exception 'RLS read allowed'; exception when insufficient_privilege then null; end;
 begin perform pricing_p0_state('00000000-0000-4000-8000-000000000001'); raise exception 'RPC allowed'; exception when insufficient_privilege then null; end;
end $$;
reset role;
delete from companies where id='00000000-0000-4000-8000-000000000001';
do $$ begin
 if exists(select 1 from pricing_items) or exists(select 1 from margin_groups) or exists(select 1 from price_recalc_runs) or exists(select 1 from price_recalc_changes) or exists(select 1 from margin_group_categories) or exists(select 1 from pricing_settings) then raise exception 'Company cascade incomplete'; end if;
 if not exists(select 1 from companies where id='00000000-0000-4000-8000-000000000002') then raise exception 'Other company deleted'; end if;
end $$;
rollback;
