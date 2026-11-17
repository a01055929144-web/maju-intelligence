-- Run after the disposable S-2b fixture; verify the actual approved CX-58 column definitions.
\set ON_ERROR_STOP on
do $$ begin
  if current_database() <> 'store_member_order_test' or current_setting('server_version_num')::int / 10000 <> 17
  then raise exception 'cx60_disposable_pg17_required'; end if;
end $$;
create table if not exists public.company_profiles(company_id uuid primary key, sub_business_number text);
create table if not exists public.business_number_exceptions(company_id uuid, business_registration_number text, memo text);
\ir ../../docs/sql-drafts/2026-11-17-CX-58-customer-business-identity.sql
create temporary table cx60_before as
select oid,pg_get_functiondef(oid) definition from pg_proc where oid in (
  'public.update_store_profile_v1(uuid,uuid,jsonb,text)'::regprocedure,
  'public.confirm_new_store_account_v1(uuid,uuid,uuid,uuid,text)'::regprocedure,
  'public.apply_store_profile_notification_v1(uuid,uuid,uuid,boolean)'::regprocedure
);
\ir ../../docs/sql-drafts/20261117-CX-60-store-business-identity-settings.sql
do $$ declare
  account record;
  notification uuid;
  original_name text;
  result jsonb;
begin
  select a.company_id,a.id,a.customer_id,a.store_profile_id,m.auth_user_id into strict account
  from public.store_accounts a join public.store_profile_members m
    on m.store_profile_id=a.store_profile_id and m.role='owner' and m.status='active'
  where a.status='active' and a.customer_review_status='confirmed' order by a.id limit 1;
  select customer_name into original_name from public.normalized_customers
    where company_id=account.company_id and id=account.customer_id;
  begin
    perform public.update_store_profile_v1(account.store_profile_id,gen_random_uuid(),
      '{"businessName":"다른 점주"}','cx60-unauthorized');
    raise exception 'cx60_wrong_owner_accepted';
  exception when raise_exception then
    if sqlerrm<>'store_profile_owner_required' then raise; end if;
  end;
  begin
    perform public.update_store_profile_v1(account.store_profile_id,account.auth_user_id,
      '{"subBusinessNumber":"002"}','cx60-invalid');
    raise exception 'cx60_invalid_number_accepted';
  exception when check_violation then null; end;

  result:=public.update_store_profile_v1(account.store_profile_id,account.auth_user_id,
    '{"businessName":"합성 법인","subBusinessNumber":"0002","businessEntityType":"corporation"}','cx60-identity');
  if jsonb_array_length(result->'changedFields')<>3 then raise exception 'cx60_identity_not_saved'; end if;
  result:=public.update_store_profile_v1(account.store_profile_id,account.auth_user_id,
    '{"businessName":"다른 값"}','cx60-identity');
  if (result->>'alreadyApplied') is distinct from 'true' then raise exception 'cx60_request_key_not_idempotent'; end if;
  if exists(select 1 from public.normalized_customers where company_id=account.company_id and id=account.customer_id
    and business_name is not null) then raise exception 'cx60_customer_changed_without_confirmation'; end if;

  update public.normalized_customers set business_name='유통사 저장 상호'
    where company_id=account.company_id and id=account.customer_id;
  perform public.confirm_new_store_account_v1(account.company_id,account.id,null,account.auth_user_id,'합성 담당');
  if not exists(select 1 from public.normalized_customers where company_id=account.company_id and id=account.customer_id
    and business_name='유통사 저장 상호' and sub_business_number='0002' and business_entity_type='corporation')
  then raise exception 'cx60_initial_confirmation_fill_wrong'; end if;

  -- A delivery-only change must retain the earlier unprocessed identity change.
  perform pg_sleep(0.001);
  perform public.update_store_profile_v1(account.store_profile_id,account.auth_user_id,
    '{"accessNote":"합성 후문"}','cx60-delivery');
  select id into strict notification from public.company_notifications
    where company_id=account.company_id and store_account_id=account.id and notification_type='store_profile_changed'
    and processed_at is null order by created_at desc,id desc limit 1;
  begin
    perform public.apply_store_profile_notification_v1(gen_random_uuid(),notification,account.auth_user_id,false);
    raise exception 'cx60_cross_company_notification_applied';
  exception when raise_exception then
    if sqlerrm<>'store_profile_notification_not_found' then raise; end if;
  end;
  perform public.apply_store_profile_notification_v1(account.company_id,notification,account.auth_user_id,false);
  if not exists(select 1 from public.normalized_customers where company_id=account.company_id and id=account.customer_id
    and business_name='합성 법인' and customer_name=original_name and access_note='합성 후문'
    and sub_business_number='0002' and business_entity_type='corporation')
  then raise exception 'cx60_pending_identity_lost'; end if;

  perform public.update_store_profile_v1(account.store_profile_id,account.auth_user_id,
    '{"subBusinessNumber":null}','cx60-clear');
  if not exists(select 1 from public.store_profiles where id=account.store_profile_id
    and sub_business_number is null and business_name='합성 법인')
  then raise exception 'cx60_omission_or_explicit_clear_wrong'; end if;

  for notification in select id from public.company_notifications
    where store_account_id=account.id and company_id=account.company_id and notification_type='store_profile_changed'
      and processed_at is null order by created_at desc,id desc
  loop
    perform public.apply_store_profile_notification_v1(account.company_id,notification,account.auth_user_id,false);
    exit;
  end loop;
end $$;
\ir ../../docs/sql-drafts/20261117-CX-60-store-business-identity-settings.down.sql
do $$ begin
  if exists(select 1 from cx60_before where pg_get_functiondef(oid)<>definition)
    then raise exception 'cx60_down_did_not_restore_rpc'; end if;
  if not exists(select 1 from public.store_profiles where business_name='합성 법인')
    then raise exception 'cx60_down_lost_profile_data'; end if;
end $$;
select 'CX-60 identity settings and notification PG17 passed' as result;
