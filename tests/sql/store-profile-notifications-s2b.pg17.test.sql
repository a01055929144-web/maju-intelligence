\set ON_ERROR_STOP on
-- S-2b runs after CX-10/12/13 in the disposable store_member_order_test chain.
do $$ begin
  if current_database()<>'store_member_order_test' or current_setting('server_version_num')::int/10000<>17
    then raise exception 's2b_disposable_pg17_required'; end if;
end $$;
alter table public.normalized_customers add column if not exists representative_name text;
alter table public.normalized_customers add column if not exists delivery_base_address text;
alter table public.normalized_customers add column if not exists delivery_address_detail text;
alter table public.normalized_customers add column if not exists access_note text;
alter table public.normalized_customers add column if not exists delivery_contact_phone text;
alter table public.normalized_customers add column if not exists preferred_delivery_time text;
grant select,update on public.normalized_customers to service_role;

\ir ../../docs/sql-drafts/2026-11-17-store-profile-notifications.sql

do $$ begin
  if has_table_privilege('anon','public.company_notifications','select')
    or has_table_privilege('authenticated','public.company_notifications','insert')
    or has_function_privilege('authenticated','public.update_store_profile_v1(uuid,uuid,jsonb,text)','execute')
    or not has_function_privilege('service_role','public.confirm_new_store_account_v1(uuid,uuid,uuid,uuid,text)','execute')
    or exists(select 1 from information_schema.columns where table_schema='public' and table_name='store_profiles' and column_name ilike '%password%')
    then raise exception 's2b_contract_or_privileges_wrong'; end if;
end $$;

create temporary table s2b_ctx as
select a.company_id,a.id account_id,a.customer_id,a.store_profile_id,m.id member_id,m.auth_user_id,
  (select c.id from companies c where c.id<>a.company_id limit 1) other_company
from store_accounts a join store_profile_members m on m.store_profile_id=a.store_profile_id
  and m.role='owner' and m.status='active'
where a.status='active' limit 1;
grant select on s2b_ctx to service_role;

set role service_role;
do $$
declare x s2b_ctx%rowtype; r jsonb; notification uuid; original_name text; existing_order uuid;
begin
  select * into x from s2b_ctx;
  if x.account_id is null or x.other_company is null then raise exception 's2b_fixture_missing'; end if;
  select customer_name into original_name from normalized_customers where company_id=x.company_id and id=x.customer_id;
  select id into existing_order from store_orders where company_id=x.company_id limit 1;
  if existing_order is null then raise exception 's2b_order_fixture_missing'; end if;

  -- Only an owner can edit; unknown/business-number keys are rejected and no password field exists.
  begin perform update_store_profile_v1(x.store_profile_id,gen_random_uuid(),'{}','not-owner');
    raise exception 's2b_non_owner_accepted';
  exception when raise_exception then if sqlerrm<>'store_profile_owner_required' then raise; end if; end;
  begin perform update_store_profile_v1(x.store_profile_id,x.auth_user_id,'{"businessRegistrationNumber":"9999999999"}','forbidden');
    raise exception 's2b_business_number_edit_accepted';
  exception when raise_exception then if sqlerrm<>'store_profile_field_not_editable' then raise; end if; end;
  begin perform update_store_profile_v1(x.store_profile_id,x.auth_user_id,'{"baseAddress":"  "}','empty-address');
    raise exception 's2b_empty_address_accepted';
  exception when raise_exception then if sqlerrm<>'store_profile_address_required' then raise; end if; end;

  r:=update_store_profile_v1(x.store_profile_id,x.auth_user_id,
    jsonb_build_object('storeName','S2B 매장 새 이름','representativeName','S2B 대표','baseAddress','합성로 17',
      'addressDetail','S2B 17층','accessNote','후문으로 호출','deliveryContactPhone','02-1234-5678','preferredDeliveryTime','06:00~08:00'),'s2b-change-1');
  if jsonb_array_length(r->'changedFields')<>7
    or not exists(select 1 from store_profile_change_events where id=(r->>'eventId')::uuid and cardinality(changed_fields)=7)
    or (select count(*) from company_notifications where notification_type='store_profile_changed' and store_account_id=x.account_id)<>1
    then raise exception 's2b_change_or_notifications_wrong: %',r; end if;
  if not (update_store_profile_v1(x.store_profile_id,x.auth_user_id,'{"storeName":"ignored retry"}','s2b-change-1')->>'alreadyApplied')::boolean
    or (select count(*) from store_profile_change_events where store_profile_id=x.store_profile_id)<>1
    then raise exception 's2b_update_not_idempotent'; end if;

  -- Profile edits do not overwrite distributor data until explicit apply; management name is a separate choice.
  if (select customer_name from normalized_customers where company_id=x.company_id and id=x.customer_id)<>original_name
    then raise exception 's2b_customer_auto_overwritten'; end if;
  select id into notification from company_notifications where company_id=x.company_id and store_account_id=x.account_id and notification_type='store_profile_changed';
  r:=apply_store_profile_notification_v1(x.company_id,notification,x.auth_user_id,false);
  if (select customer_name from normalized_customers where company_id=x.company_id and id=x.customer_id)<>original_name
    or not exists(select 1 from normalized_customers where company_id=x.company_id and id=x.customer_id
      and representative_name='S2B 대표' and delivery_base_address='합성로 17' and delivery_address_detail='S2B 17층'
      and access_note='후문으로 호출' and delivery_contact_phone='02-1234-5678' and preferred_delivery_time='06:00~08:00')
    or not (apply_store_profile_notification_v1(x.company_id,notification,x.auth_user_id,true)->>'alreadyApplied')::boolean
    then raise exception 's2b_explicit_apply_wrong'; end if;

  -- A later unprocessed profile notification blocks an older one; applying the latest also closes the older row.
  perform update_store_profile_v1(x.store_profile_id,x.auth_user_id,'{"deliveryContactPhone":"02-0000-0001"}','s2b-change-old');
  perform pg_sleep(0.001);
  perform update_store_profile_v1(x.store_profile_id,x.auth_user_id,'{"deliveryContactPhone":"02-0000-0002"}','s2b-change-new');
  select id into notification from company_notifications where company_id=x.company_id and store_account_id=x.account_id
    and idempotency_key like 'store-profile-change:%' and processed_at is null order by created_at,id limit 1;
  begin perform apply_store_profile_notification_v1(x.company_id,notification,x.auth_user_id,false);
    raise exception 's2b_superseded_notification_applied';
  exception when raise_exception then if sqlerrm<>'store_profile_notification_superseded' then raise; end if; end;
  select id into notification from company_notifications where company_id=x.company_id and store_account_id=x.account_id
    and idempotency_key like 'store-profile-change:%' and processed_at is null order by created_at desc,id desc limit 1;
  perform apply_store_profile_notification_v1(x.company_id,notification,x.auth_user_id,false);
  if (select delivery_contact_phone from normalized_customers where company_id=x.company_id and id=x.customer_id)<>'02-0000-0002'
    or exists(select 1 from company_notifications where company_id=x.company_id and store_account_id=x.account_id
      and notification_type='store_profile_changed' and processed_at is null)
    then raise exception 's2b_latest_notification_or_old_processing_wrong'; end if;

  -- Confirm RPC is company-scoped and fills blanks only; existing distributor values remain.
  update normalized_customers set representative_name='유통사 대표',delivery_contact_phone=null where company_id=x.company_id and id=x.customer_id;
  r:=confirm_new_store_account_v1(x.company_id,x.account_id,null,x.auth_user_id,'S2B 담당');
  if not (r->>'alreadyConfirmed')::boolean or not exists(select 1 from normalized_customers
      where company_id=x.company_id and id=x.customer_id and representative_name='유통사 대표' and delivery_contact_phone='02-0000-0002')
    then raise exception 's2b_blank_fill_wrong: %',r; end if;
  begin perform confirm_new_store_account_v1(x.other_company,x.account_id,null,x.auth_user_id,'x');
    raise exception 's2b_cross_company_confirm_accepted';
  exception when raise_exception then if sqlerrm<>'store_account_not_found' then raise; end if; end;

  -- 09 contract: new-order notifications use the same table and company-scoped idempotency key.
  insert into company_notifications(company_id,notification_type,store_account_id,customer_id,order_id,idempotency_key)
    values(x.company_id,'new_order',x.account_id,x.customer_id,existing_order,'s2b-new-order-1');
  begin
    insert into company_notifications(company_id,notification_type,store_account_id,customer_id,order_id,idempotency_key)
      values(x.company_id,'new_order',x.account_id,x.customer_id,existing_order,'s2b-new-order-1');
    raise exception 's2b_duplicate_notification_accepted';
  exception when unique_violation then null; end;
  begin
    insert into company_notifications(company_id,notification_type,store_account_id,customer_id,idempotency_key)
      values(x.other_company,'new_store',x.account_id,x.customer_id,'s2b-cross-company');
    raise exception 's2b_cross_company_notification_accepted';
  exception when foreign_key_violation then null; end;
end $$;
reset role;

-- Down refuses real rows, then succeeds after synthetic cleanup; the draft can be applied again.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/2026-11-17-store-profile-notifications.down.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin if to_regclass('public.company_notifications') is null then raise exception 's2b_down_guard_failed'; end if; end $$;
delete from company_notifications;
delete from store_profile_change_events;
update store_profiles set representative_name=null,access_note=null,delivery_contact_phone=null,preferred_delivery_time=null;
\ir ../../docs/sql-drafts/2026-11-17-store-profile-notifications.down.sql
do $$ begin
  if to_regclass('public.company_notifications') is not null or to_regclass('public.store_profile_change_events') is not null
    or to_regprocedure('public.update_store_profile_v1(uuid,uuid,jsonb,text)') is not null
    or exists(select 1 from information_schema.columns where table_name='store_profiles' and column_name='representative_name')
    then raise exception 's2b_down_incomplete'; end if;
end $$;
\ir ../../docs/sql-drafts/2026-11-17-store-profile-notifications.sql
select 's2b store profile notifications PG17 passed' result;
