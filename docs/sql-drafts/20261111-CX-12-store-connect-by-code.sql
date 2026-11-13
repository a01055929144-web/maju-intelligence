-- DRAFT ONLY (CX-12). Requires separate operating DB approval AFTER 20261111-CX-10-store-profiles.sql. No flag, no data here.
-- A signed-in store owner connects their MAJU store profile to ONE distributor by typing that distributor's invite code.
-- Always creates a NEW customer (needs distributor review later, CX-13). It never attaches to an existing customer by name/address:
-- anyone holding a code could otherwise guess a name+address and reach another customer's order history.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';

do $$ begin
  if to_regclass('public.store_profiles') is null or to_regclass('public.company_store_invite_codes') is null
    or to_regclass('public.store_accounts') is null or to_regclass('public.store_account_member_events') is null
    then raise exception 'cx12_requires_cx10'; end if;
  if to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)') is not null then raise exception 'cx12_already_applied'; end if;
end $$;

create function public.connect_store_profile_by_invite_code_v1(p_auth_user_id uuid, p_store_profile_id uuid, p_code_hash text)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare prof public.store_profiles%rowtype; code public.company_store_invite_codes%rowtype;
  v_account uuid; v_customer uuid; v_import uuid; v_member uuid;
begin
  -- Only an active owner of this profile may connect it.
  perform 1 from public.store_profile_members
    where store_profile_id = p_store_profile_id and auth_user_id = p_auth_user_id and role = 'owner' and status = 'active' for share;
  if not found then raise exception 'store_profile_owner_required'; end if;
  select * into prof from public.store_profiles where id = p_store_profile_id and status = 'active' for share;
  if not found then raise exception 'store_profile_owner_required'; end if;
  -- One message for unknown / expired / revoked codes: the caller cannot tell which, so codes cannot be probed.
  select * into code from public.company_store_invite_codes
    where code_hash = p_code_hash and revoked_at is null and expires_at > clock_timestamp() for share;
  if not found then raise exception 'store_invite_code_invalid'; end if;
  perform pg_advisory_xact_lock(hashtextextended(code.company_id::text || '|' || prof.id::text, 0));
  -- Already connected to this distributor: return it (double click / retry creates nothing).
  select id into v_account from public.store_accounts where company_id = code.company_id and store_profile_id = prof.id;
  if found then
    return jsonb_build_object('companyId', code.company_id, 'storeAccountId', v_account, 'alreadyLinked', true);
  end if;

  insert into public.customer_imports(company_id, source, row_count, status, quality_score, completed_at)
    values(code.company_id, 'store_profile_invite', 1, 'completed', 100, clock_timestamp()) returning id into v_import;
  insert into public.normalized_customers(company_id, import_id, customer_name, address, normalized_key)
    values(code.company_id, v_import, prof.store_name,
      nullif(btrim(concat_ws(' ', prof.base_address, prof.address_detail)), ''), 'profile:' || prof.id::text) returning id into v_customer;
  -- The business number stays on the profile. The distributor-side account is unverified (registration_pending) until a later check.
  insert into public.store_accounts(company_id, customer_id, business_registration_number, business_status,
      business_status_verified_at, verification_request_id, terms_version, terms_accepted_at, status, store_profile_id, invite_code_id)
    values(code.company_id, v_customer, null, 'registration_pending', null, null,
      prof.terms_version, prof.terms_accepted_at, 'active', prof.id, code.id) returning id into v_account;
  insert into public.store_account_members(company_id, store_account_id, auth_user_id, role, status, joined_at)
    values(code.company_id, v_account, p_auth_user_id, 'owner', 'active', clock_timestamp()) returning id into v_member;
  insert into public.store_account_member_events(company_id, store_account_id, member_id, event_type, actor_user_key)
    values(code.company_id, v_account, v_member, 'join', 'store-profile-invite:' || code.id::text);
  update public.store_accounts set terms_accepted_by_member_id = v_member where company_id = code.company_id and id = v_account;
  return jsonb_build_object('companyId', code.company_id, 'storeAccountId', v_account, 'alreadyLinked', false);
end $$;

revoke all on function public.connect_store_profile_by_invite_code_v1(uuid,uuid,text) from public, anon, authenticated, service_role;
grant execute on function public.connect_store_profile_by_invite_code_v1(uuid,uuid,text) to service_role;
notify pgrst, 'reload schema';
commit;
