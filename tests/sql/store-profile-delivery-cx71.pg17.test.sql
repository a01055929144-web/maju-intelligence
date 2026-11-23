\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int/10000<>17 then raise exception 'cx71_pg17_required'; end if; end $$;
\ir ../../docs/sql-drafts/20261117-CX-71-store-profile-delivery.sql
do $$ declare account record; result jsonb; begin
  select sa.store_profile_id,m.auth_user_id into strict account from public.store_accounts sa join public.store_profile_members m
    on m.store_profile_id=sa.store_profile_id and m.role='owner' and m.status='active' where sa.status='active' order by sa.id limit 1;
  result:=public.update_store_profile_delivery_v1(account.store_profile_id,account.auth_user_id,
    '{"taxInvoiceEmail":"owner@example.com","receiveMethod":"dawn","accessPassword":"do-not-log"}','cx71-save');
  if result->'changedFields' ? 'accessPassword' or result::text like '%do-not-log%' then raise exception 'cx71_password_leaked_in_result'; end if;
  if exists(select 1 from public.store_profile_change_events where store_profile_id=account.store_profile_id and (before_values::text like '%do-not-log%' or after_values::text like '%do-not-log%'))
    or exists(select 1 from public.company_notifications where before_values::text like '%do-not-log%' or after_values::text like '%do-not-log%')
  then raise exception 'cx71_password_leaked_in_log'; end if;
  result:=public.update_store_profile_delivery_v1(account.store_profile_id,account.auth_user_id,'{"accessPassword":"changed"}','cx71-save');
  if (result->>'alreadyApplied')<>'true' or exists(select 1 from public.store_profiles where id=account.store_profile_id and access_password='changed')
  then raise exception 'cx71_idempotency_failed'; end if;
  begin perform public.update_store_profile_delivery_v1(account.store_profile_id,gen_random_uuid(),'{}','cx71-wrong-owner'); raise exception 'cx71_wrong_owner_accepted';
  exception when raise_exception then if sqlerrm<>'store_profile_owner_required' then raise; end if; end;
  insert into public.store_profile_attachments(store_profile_id,kind,storage_path) values(account.store_profile_id,'cold','store-profiles/test/cold');
  begin insert into public.store_profile_attachments(store_profile_id,kind,storage_path) values(account.store_profile_id,'cold','store-profiles/test/other'); raise exception 'cx71_duplicate_kind_accepted';
  exception when unique_violation then null; end;
end $$;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261117-CX-71-store-profile-delivery.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if to_regprocedure('public.update_store_profile_delivery_v1(uuid,uuid,jsonb,text)') is null
    or to_regclass('public.store_profile_attachments') is null
  then raise exception 'cx71_guarded_down_removed_live_data'; end if;
end $$;
select 'CX-71 store profile delivery PG17 passed' result;
