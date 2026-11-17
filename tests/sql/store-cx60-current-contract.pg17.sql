-- Characterize the existing S-2b contract after the disposable S-2b fixture.
-- Replace these gap assertions with positive coverage when the CX-60 RPC contract lands.
\set ON_ERROR_STOP on
begin;
do $$ declare
  account record;
  notification_id uuid;
  before_representative text;
begin
  if current_database() <> 'store_member_order_test' or current_setting('server_version_num')::int / 10000 <> 17 then
    raise exception 'cx60_disposable_pg17_required';
  end if;
  select a.company_id, a.id, a.customer_id, a.store_profile_id, m.auth_user_id into strict account
  from public.store_accounts a join public.store_profile_members m
    on m.store_profile_id = a.store_profile_id and m.role = 'owner' and m.status = 'active'
  where a.status = 'active'
  order by a.id limit 1;

  begin
    perform public.update_store_profile_v1(account.store_profile_id, account.auth_user_id,
      '{"businessName":"합성 법인","subBusinessNumber":"0002","businessEntityType":"corporation"}', 'cx60-unsupported');
    raise exception 'cx60_expected_gap_not_reproduced';
  exception when raise_exception then
    if sqlerrm <> 'store_profile_field_not_editable' then raise; end if;
  end;

  select representative_name into before_representative from public.normalized_customers
    where company_id = account.company_id and id = account.customer_id;
  perform public.update_store_profile_v1(account.store_profile_id, account.auth_user_id,
    '{"representativeName":"CX-60 앞선 합성 변경"}', 'cx60-first');
  perform pg_sleep(0.001);
  perform public.update_store_profile_v1(account.store_profile_id, account.auth_user_id,
    '{"accessNote":"CX-60 뒤따른 합성 변경"}', 'cx60-second');
  select id into strict notification_id from public.company_notifications
    where company_id = account.company_id and store_account_id = account.id
      and notification_type = 'store_profile_changed' and processed_at is null
    order by created_at desc, id desc limit 1;
  perform public.apply_store_profile_notification_v1(account.company_id, notification_id, account.auth_user_id, false);

  if not exists (select 1 from public.normalized_customers
    where company_id = account.company_id and id = account.customer_id
      and representative_name is not distinct from before_representative
      and access_note = 'CX-60 뒤따른 합성 변경')
    or exists (select 1 from public.company_notifications where company_id = account.company_id
      and store_account_id = account.id and notification_type = 'store_profile_changed' and processed_at is null)
  then raise exception 'cx60_expected_notification_gap_not_reproduced'; end if;
end $$;
rollback;
select 'CX-60 current RPC gaps reproduced on PostgreSQL 17' as result;
