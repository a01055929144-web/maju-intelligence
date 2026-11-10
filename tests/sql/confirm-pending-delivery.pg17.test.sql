\set ON_ERROR_STOP on
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 'disposable_pending_confirmation_pg17_required'; end if;
end $$;
\ir ../../docs/sql-drafts/20261110-09-confirm-pending-delivery.sql
\ir ../../docs/sql-drafts/20261110-09-confirm-pending-delivery.down.sql
\ir ../../docs/sql-drafts/20261110-09-confirm-pending-delivery.sql
begin;
insert into app_users(id,status) select user_id,'active' from company_members on conflict(id) do nothing;
create temporary table confirm_case as select o.id,o.company_id,m.id member,m.user_id,o.revision,o.known_total
  from store_orders o join company_members m on m.company_id=o.company_id and m.status='active' and m.role='owner'
  where o.delivery_confirmation='pending' and o.status='submitted' limit 1;
grant select on confirm_case to service_role;
create function synthetic_resolution_audit_failure() returns trigger language plpgsql as $$ begin
  if current_setting('test.resolution_fail',true)='on' then raise exception 'synthetic_resolution_audit_failure'; end if; return new;
end $$;
create trigger synthetic_resolution_audit_failure before insert on store_order_delivery_resolutions_09 for each row execute function synthetic_resolution_audit_failure();
set role service_role;
do $$ declare c record; r jsonb; retried jsonb; k uuid:=gen_random_uuid(); day date:=(clock_timestamp() at time zone 'Asia/Seoul')::date+1; cancelled uuid; reserved numeric; begin
  select * into strict c from confirm_case;
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,gen_random_uuid(),c.revision,day-2,'confirm');
    raise exception 'past_date_confirmed';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_date_invalid' then raise; end if; end;
  begin
    perform resolve_pending_order_delivery_09(gen_random_uuid(),c.id,c.member,c.user_id,gen_random_uuid(),c.revision,day,'confirm');
    raise exception 'other_company_confirmation';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_manager_required' then raise; end if; end;
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,gen_random_uuid(),gen_random_uuid(),c.revision,day,'confirm');
    raise exception 'forged_confirmation_actor';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_manager_required' then raise; end if; end;
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,gen_random_uuid(),c.revision+1,day,'confirm');
    raise exception 'stale_confirmation_allowed';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_revision_conflict' then raise; end if; end;
  perform set_config('test.resolution_fail','on',true);
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,gen_random_uuid(),c.revision,day,'confirm');
    raise exception 'resolution_failure_not_atomic';
  exception when raise_exception then if sqlerrm<>'synthetic_resolution_audit_failure' then raise; end if; end;
  perform set_config('test.resolution_fail','off',true);
  if not exists(select 1 from store_orders where id=c.id and delivery_date is null and revision=c.revision and delivery_confirmation='pending') then raise exception 'resolution_rollback_failed'; end if;
  update company_members set membership_expires_at=clock_timestamp()-interval '1 minute' where company_id=c.company_id and id=c.member;
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,gen_random_uuid(),c.revision,day,'confirm');
    raise exception 'expired_manager_confirmed';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_manager_required' then raise; end if; end;
  update company_members set membership_expires_at=null where company_id=c.company_id and id=c.member;
  update app_users set status='suspended' where id=c.user_id;
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,gen_random_uuid(),c.revision,day,'confirm');
    raise exception 'inactive_user_confirmed';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_manager_required' then raise; end if; end;
  update app_users set status='active' where id=c.user_id;
  insert into store_order_settings(company_id) values(c.company_id);
  update store_order_customer_rules set delivery_weekdays=array[((extract(dow from day)::int+1)%7)::smallint]
    where company_id=c.company_id and customer_id=(select customer_id from store_orders where id=c.id);
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,gen_random_uuid(),c.revision,day,'confirm');
    raise exception 'configured_schedule_ignored';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_date_unavailable' then raise; end if; end;
  delete from store_order_settings where company_id=c.company_id;
  r:=resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,k,c.revision,day,'confirm');
  retried:=resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,k,c.revision,day,'confirm');
  if r is distinct from retried or not exists(select 1 from store_orders where id=c.id and company_id=c.company_id and delivery_date=day and delivery_confirmation='scheduled' and revision=c.revision+1 and known_total=c.known_total and status='submitted')
    or (select count(*) from store_order_delivery_resolutions_09 where order_id=c.id)<>1 then raise exception 'date_confirmation_failed'; end if;
  begin
    perform resolve_pending_order_delivery_09(c.company_id,c.id,c.member,c.user_id,k,c.revision,day+1,'confirm');
    raise exception 'resolution_key_reused';
  exception when raise_exception then if sqlerrm<>'pending_confirmation_key_conflict' then raise; end if; end;
  insert into store_orders(company_id,customer_id,link_id,document_version_id,delivery_date,delivery_confirmation,idempotency_key,store_account_id,ordered_by_member_id)
    select company_id,customer_id,link_id,document_version_id,null,'pending',gen_random_uuid(),store_account_id,ordered_by_member_id from store_orders where id=c.id returning id into cancelled;
  insert into store_order_lines(company_id,order_id,product_id,product_name,specification,sales_unit,quantity,unit_price,tax_type,price_includes_tax)
    select company_id,cancelled,product_id,product_name,specification,sales_unit,quantity,unit_price,tax_type,price_includes_tax from store_order_lines where order_id=c.id;
  -- The native promotional reservation aggregate includes submitted orders only.
  select coalesce(sum(l.quantity),0) into reserved from store_order_lines l join store_orders o on o.company_id=l.company_id and o.id=l.order_id where o.id=cancelled and o.status='submitted';
  if reserved<=0 then raise exception 'synthetic_reservation_missing'; end if;
  perform resolve_pending_order_delivery_09(c.company_id,cancelled,c.member,c.user_id,gen_random_uuid(),1,null,'cancel');
  if not exists(select 1 from store_orders where id=cancelled and status='cancelled' and delivery_date is null and revision=2)
    or exists(select 1 from store_order_lines l join store_orders o on o.company_id=l.company_id and o.id=l.order_id where o.id=cancelled and o.status='submitted')
    then raise exception 'pending_cancellation_reservation_not_released'; end if;
  if has_function_privilege('anon','resolve_pending_order_delivery_09(uuid,uuid,uuid,uuid,uuid,integer,date,text)','EXECUTE')
    or has_function_privilege('authenticated','resolve_pending_order_delivery_09(uuid,uuid,uuid,uuid,uuid,integer,date,text)','EXECUTE') then raise exception 'resolution_public_acl'; end if;
end $$;
reset role;
drop trigger synthetic_resolution_audit_failure on store_order_delivery_resolutions_09;
drop function synthetic_resolution_audit_failure();
commit;
select 'confirm_pending_delivery_pg17_pass';
