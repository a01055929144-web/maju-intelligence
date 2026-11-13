\set ON_ERROR_STOP on
-- CX-12 connect a store profile to a distributor by invite code. Runs after the CX-10 test in the disposable store_member_order_test chain.
do $$ begin
  if current_database() <> 'store_member_order_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'disposable_store_connect_pg17_required'; end if;
end $$;

-- The CX-10 test ends with its own down, so bring CX-10 up again.
\ir ../../docs/sql-drafts/20261111-CX-10-store-profiles.sql

-- Production state after 20261110-store-preopening.sql: unverified (registration_pending) store accounts are allowed.
-- Reproduce only that relaxation if the surrounding chain has not left it in place.
do $$ begin
  if not exists(select 1 from pg_constraint where conname = 'store_accounts_registration_pending_check') then
    alter table public.store_accounts alter column business_registration_number drop not null,
      alter column business_status_verified_at drop not null, alter column verification_request_id drop not null;
    alter table public.store_accounts drop constraint store_accounts_business_status_check;
    alter table public.store_accounts add constraint store_accounts_business_status_check
      check (business_status in ('active','closed','suspended','registration_pending'));
    alter table public.store_accounts add constraint store_accounts_registration_pending_check
      check ((business_status <> 'registration_pending' or
        (business_registration_number is null and business_status_verified_at is null and verification_request_id is null))
        and (business_status <> 'active' or
        (business_registration_number is not null and business_status_verified_at is not null and verification_request_id is not null)));
  end if;
end $$;
-- Production service_role already owns these tables' write grants; the synthetic chain only grants select.
grant insert, update on public.customer_imports, public.normalized_customers to service_role;

\ir ../../docs/sql-drafts/20261111-CX-12-store-connect-by-code.sql

insert into companies(id) values ('0b000000-0000-4000-8000-00000000000b') on conflict do nothing;
insert into app_users values ('f2200000-0000-4000-8000-000000000001','active'), ('f2200000-0000-4000-8000-000000000002','active'),
  ('f2200000-0000-4000-8000-000000000003','active') on conflict do nothing;

do $$ begin
  if has_function_privilege('anon','public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)','execute')
    or has_function_privilege('authenticated','public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)','execute')
    or not has_function_privilege('service_role','public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)','execute')
    then raise exception 'cx12_privileges_wrong'; end if;
end $$;

set role service_role;
do $$
declare a uuid := '00000000-0000-4000-8000-000000000001'; b uuid := '0b000000-0000-4000-8000-00000000000b';
  owner1 uuid := 'f2200000-0000-4000-8000-000000000001'; other uuid := 'f2200000-0000-4000-8000-000000000002'; stranger uuid := 'f2200000-0000-4000-8000-000000000003';
  p1 uuid; p2 uuid; ha text := md5('cx12-a') || md5('cx12-a2'); hb text := md5('cx12-b') || md5('cx12-b2');
  code_a uuid; code_b uuid; revoked_id uuid; hr text := md5('cx12-r') || md5('cx12-r2'); he text := md5('cx12-e') || md5('cx12-e2');
  existing_customer uuid; imp uuid; r jsonb; r2 jsonb; r3 jsonb; acct uuid; cust uuid;
begin
  p1 := (create_store_profile_v1(owner1, '합성 연결 매장', '1234567891', '합성로 10', '2층', 'v1', 'direct')->>'storeProfileId')::uuid;
  p2 := (create_store_profile_v1(other, '합성 다른 매장', '', '합성로 20', '', 'v1', 'direct')->>'storeProfileId')::uuid;
  code_a := issue_company_store_invite_code_v1(a, ha, clock_timestamp() + interval '7 days', 'ci');
  code_b := issue_company_store_invite_code_v1(b, hb, clock_timestamp() + interval '7 days', 'ci');
  revoked_id := issue_company_store_invite_code_v1(a, hr, clock_timestamp() + interval '7 days', 'ci');
  perform revoke_company_store_invite_code_v1(a, revoked_id);
  insert into company_store_invite_codes(company_id, code_hash, created_by_key, expires_at, created_at)
    values(a, he, 'ci', clock_timestamp() - interval '1 day', clock_timestamp() - interval '2 days');

  -- A distributor customer that already has the same name and address: it must NOT be reused or linked.
  insert into customer_imports(company_id, source, row_count, status, quality_score, completed_at) values(a,'excel',1,'completed',100,now()) returning id into imp;
  insert into normalized_customers(company_id, import_id, customer_name, address, normalized_key)
    values(a, imp, '합성 연결 매장', '합성로 10 2층', 'existing:same-name') returning id into existing_customer;

  -- 1) Connect with distributor A's code.
  r := connect_store_profile_by_invite_code_v1(owner1, p1, ha);
  if (r->>'companyId')::uuid <> a or (r->>'alreadyLinked')::boolean then raise exception 'cx12_connect_result_wrong'; end if;
  acct := (r->>'storeAccountId')::uuid;
  select customer_id into cust from store_accounts where id = acct;
  if cust = existing_customer then raise exception 'cx12_attached_to_existing_customer'; end if;
  if exists(select 1 from store_accounts where company_id = a and customer_id = existing_customer) then raise exception 'cx12_existing_customer_linked'; end if;
  if not exists(select 1 from store_accounts where id = acct and company_id = a and store_profile_id = p1 and invite_code_id = code_a
      and business_status = 'registration_pending' and business_registration_number is null and status = 'active' and terms_accepted_by_member_id is not null)
    or not exists(select 1 from normalized_customers where id = cust and company_id = a and customer_name = '합성 연결 매장' and normalized_key = 'profile:' || p1::text)
    or not exists(select 1 from customer_imports i join normalized_customers c on c.import_id = i.id where c.id = cust and i.source = 'store_profile_invite')
    or not exists(select 1 from store_account_members where company_id = a and store_account_id = acct and auth_user_id = owner1 and role = 'owner' and status = 'active')
    or not exists(select 1 from store_account_member_events where company_id = a and store_account_id = acct and event_type = 'join')
    then raise exception 'cx12_connection_rows_wrong'; end if;

  -- 2) Retry / double click creates nothing new.
  r2 := connect_store_profile_by_invite_code_v1(owner1, p1, ha);
  if not (r2->>'alreadyLinked')::boolean or (r2->>'storeAccountId')::uuid <> acct
    or (select count(*) from store_accounts where company_id = a and store_profile_id = p1) <> 1
    or (select count(*) from normalized_customers where company_id = a and normalized_key = 'profile:' || p1::text) <> 1
    then raise exception 'cx12_not_idempotent'; end if;

  -- 3) The same store may connect to a second distributor; each side sees only its own row.
  r3 := connect_store_profile_by_invite_code_v1(owner1, p1, hb);
  if (r3->>'companyId')::uuid <> b or (r3->>'storeAccountId')::uuid = acct then raise exception 'cx12_second_company_wrong'; end if;
  if exists(select 1 from store_accounts where company_id = a and id = (r3->>'storeAccountId')::uuid)
    or exists(select 1 from store_accounts where company_id = b and id = acct)
    or (select count(*) from store_accounts where company_id = a and store_profile_id = p1) <> 1
    then raise exception 'cx12_cross_company_visible'; end if;

  -- 4) Unknown, expired and revoked codes all fail with the same message and create nothing.
  declare msgs text[] := '{}'; h text; before_count int := (select count(*) from store_accounts);
  begin
    foreach h in array array[md5('nope') || md5('nope2'), he, hr] loop
      begin
        perform connect_store_profile_by_invite_code_v1(other, p2, h);
        raise exception 'cx12_bad_code_accepted';
      exception when raise_exception then
        if sqlerrm = 'cx12_bad_code_accepted' then raise; end if;
        msgs := msgs || sqlerrm;
      end;
    end loop;
    if msgs <> array['store_invite_code_invalid','store_invite_code_invalid','store_invite_code_invalid']
      or (select count(*) from store_accounts) <> before_count then raise exception 'cx12_code_errors_distinguishable_or_leaky: %', msgs; end if;
  end;

  -- 5) Only the profile's own active owner may connect it.
  begin perform connect_store_profile_by_invite_code_v1(stranger, p2, ha); raise exception 'cx12_stranger_accepted';
  exception when raise_exception then if sqlerrm <> 'store_profile_owner_required' then raise; end if; end;
  begin perform connect_store_profile_by_invite_code_v1(other, p1, ha); raise exception 'cx12_other_users_profile_accepted';
  exception when raise_exception then if sqlerrm <> 'store_profile_owner_required' then raise; end if; end;
  update store_profiles set status = 'suspended' where id = p2;
  begin perform connect_store_profile_by_invite_code_v1(other, p2, ha); raise exception 'cx12_suspended_profile_accepted';
  exception when raise_exception then if sqlerrm <> 'store_profile_owner_required' then raise; end if; end;
  update store_profiles set status = 'active' where id = p2;
  if exists(select 1 from store_accounts where store_profile_id = p2) then raise exception 'cx12_rejected_calls_created_rows'; end if;
end $$;
reset role;

-- 6) Down refuses while a connection exists, then works once the connections no longer reference codes.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261111-CX-12-store-connect-by-code.down.sql
\set ON_ERROR_STOP on
do $$ begin
  if to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)') is null then raise exception 'cx12_down_dropped_with_connections'; end if;
end $$;
update store_accounts set invite_code_id = null;
\ir ../../docs/sql-drafts/20261111-CX-12-store-connect-by-code.down.sql
do $$ begin
  if to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)') is not null then raise exception 'cx12_down_incomplete'; end if;
end $$;
\ir ../../docs/sql-drafts/20261111-CX-12-store-connect-by-code.sql
select 'cx12 store connect PG17 passed' result;
