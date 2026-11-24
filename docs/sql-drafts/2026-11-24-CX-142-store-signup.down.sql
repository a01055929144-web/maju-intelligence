-- DOWN: CX-142. 시스템 확인·store_signup 리드 연결이 이미 생겼으면 되돌릴 기록자/방법이 없으므로 중단한다(데이터를 임의로 바꾸지 않음).
begin;
do $$ begin
  if exists (select 1 from public.store_accounts where price_visibility_confirmed_source = 'system_signup')
    or exists (select 1 from public.store_price_visibility_events where actor_role = 'system')
    then raise exception 'cx142_down_blocked_system_confirmations_exist'; end if;
  if exists (select 1 from public.business_permit_leads where matched_customer_method = 'store_signup')
    then raise exception 'cx142_down_blocked_store_signup_leads_exist'; end if;
end $$;

drop function if exists public.finalize_store_signup_v1(uuid, uuid, text, uuid);
drop function if exists public.record_store_invite_open_v1(text);
drop index if exists public.lead_actions_store_signup_once_uq;
alter table public.business_permit_leads drop constraint if exists business_permit_leads_match_method_check;
alter table public.business_permit_leads add constraint business_permit_leads_match_method_check
  check (matched_customer_method is null or matched_customer_method in ('business_number', 'name_address', 'manual', 'conversion'));
alter table public.store_owner_activation_requests drop column first_opened_at, drop column last_opened_at, drop column open_count;

alter table public.store_price_visibility_events
  drop constraint store_price_visibility_events_actor_role_ck, drop constraint store_price_visibility_events_actor_system_ck;
alter table public.store_price_visibility_events alter column actor_company_member_id set not null;
alter table public.store_price_visibility_events add constraint store_price_visibility_events_actor_role_check check (actor_role in ('owner', 'manager'));
alter table public.store_accounts drop constraint store_accounts_price_visibility_state_ck;
alter table public.store_accounts drop column price_visibility_confirmed_source;
alter table public.store_accounts add constraint store_accounts_price_visibility_state_ck check (
  (price_visibility_status = 'pending' and price_visibility_confirmed_at is null and price_visibility_confirmed_by_member_id is null)
  or (price_visibility_status = 'confirmed' and price_visibility_confirmed_at is not null and price_visibility_confirmed_by_member_id is not null));

-- CX-122 원래 본문으로 되돌림
create or replace function public.set_store_price_visibility_v1(
  p_company uuid, p_store_account uuid, p_actor_company_member uuid, p_action text, p_memo text default null,
  p_reference_snapshot jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path = public, pg_temp as $$
declare account public.store_accounts%rowtype; actor_role text; target_status text;
begin
  if p_action not in ('confirm', 'cancel') then raise exception 'store_price_visibility_invalid_action'; end if;
  if p_reference_snapshot is null or jsonb_typeof(p_reference_snapshot) <> 'object'
    or exists (select 1 from jsonb_each(p_reference_snapshot) where jsonb_typeof(value) not in ('boolean', 'null'))
    then raise exception 'store_price_visibility_invalid_reference'; end if;
  select coalesce(permission_role, case when role in ('owner', 'manager') then role else 'staff' end)
    into actor_role from public.company_members
    where company_id = p_company and id = p_actor_company_member and status = 'active' for share;
  if actor_role is null or actor_role not in ('owner', 'manager')
    then raise exception 'store_price_visibility_forbidden'; end if;
  select * into account from public.store_accounts
    where company_id = p_company and id = p_store_account and status = 'active' for update;
  if not found then raise exception 'store_account_not_found'; end if;
  if account.business_status = 'registration_pending'
    then raise exception 'store_price_visibility_preopening'; end if;
  target_status := case p_action when 'confirm' then 'confirmed' else 'pending' end;
  if account.price_visibility_status = target_status then
    return jsonb_build_object('storeAccountId', account.id, 'status', target_status, 'alreadyApplied', true);
  end if;
  update public.store_accounts set
    price_visibility_status = target_status,
    price_visibility_confirmed_at = case when target_status = 'confirmed' then clock_timestamp() end,
    price_visibility_confirmed_by_member_id = case when target_status = 'confirmed' then p_actor_company_member end,
    updated_at = clock_timestamp()
    where company_id = p_company and id = p_store_account;
  insert into public.store_price_visibility_events(company_id, store_account_id, event_type,
    actor_company_member_id, actor_role, memo, reference_snapshot)
    values (p_company, p_store_account, case p_action when 'confirm' then 'confirmed' else 'cancelled' end,
      p_actor_company_member, actor_role, left(nullif(btrim(p_memo), ''), 500), p_reference_snapshot);
  return jsonb_build_object('storeAccountId', account.id, 'status', target_status, 'alreadyApplied', false);
end $$;
revoke all on function public.set_store_price_visibility_v1(uuid, uuid, uuid, text, text, jsonb) from public, anon, authenticated, service_role;
grant execute on function public.set_store_price_visibility_v1(uuid, uuid, uuid, text, text, jsonb) to service_role;
notify pgrst, 'reload schema';
commit;
