\set ON_ERROR_STOP on
-- CX-13 first-trade customer review. Runs right after store-connect-cx12.pg17.test.sql in the disposable store_member_order_test chain
-- (CX-10/CX-12 are applied, its stores/accounts exist). Synthetic data only.
do $$ begin
  if current_database() <> 'store_member_order_test' or current_setting('server_version_num')::int/10000 <> 17
    then raise exception 'cx13_disposable_pg17_required'; end if;
  if to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)') is null then raise exception 'cx13_needs_cx12_test_state'; end if;
end $$;

create temporary table cx13_before as
 select oid, proacl, pg_get_functiondef(oid) definition from pg_proc where oid = 'public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)'::regprocedure;
create temporary table cx13_old_accounts as select id, status from public.store_accounts;
-- The synthetic chain customer table has no duplicate_of (production does).
alter table public.normalized_customers add column if not exists duplicate_of uuid;
grant select, update on public.store_orders, public.store_accounts, public.normalized_customers to service_role;
grant select, insert on public.storefront_links to service_role;

\ir ../../docs/sql-drafts/20261112-CX-13-store-customer-review.sql

do $$ begin
  -- existing accounts (link sign-ups and the CX-12 test accounts) stay confirmed: nothing changes for them.
  if exists(select 1 from public.store_accounts where customer_review_status <> 'confirmed') then raise exception 'cx13_existing_accounts_not_confirmed'; end if;
  if exists(select from cx13_before o join pg_proc p on p.oid = o.oid where p.proacl is distinct from o.proacl or p.prosecdef) then raise exception 'cx13_connect_acl_or_security_changed'; end if;
  if (select (length(pg_get_functiondef(oid)) - length(replace(pg_get_functiondef(oid), '-- cx13', ''))) / 7 from pg_proc where oid = 'public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)'::regprocedure) <> 1 then raise exception 'cx13_connect_marker_count'; end if;
  -- privileges: service_role only.
  if has_function_privilege('anon', 'public.confirm_store_customer_v1(uuid,uuid,uuid,text)', 'execute') or has_function_privilege('authenticated', 'public.link_store_account_to_customer_v1(uuid,uuid,uuid,uuid,text)', 'execute')
    or has_function_privilege('authenticated', 'public.store_customer_review_candidates_v1(uuid,uuid)', 'execute') or has_function_privilege('authenticated', 'public.store_customer_confirmed(uuid,uuid)', 'execute')
    or has_table_privilege('authenticated', 'public.store_customer_review_events', 'select') or has_table_privilege('anon', 'public.store_customer_review_events', 'insert')
    or not has_function_privilege('service_role', 'public.confirm_store_customer_v1(uuid,uuid,uuid,text)', 'execute') or not has_function_privilege('service_role', 'public.link_store_account_to_customer_v1(uuid,uuid,uuid,uuid,text)', 'execute')
    then raise exception 'cx13_privileges_wrong'; end if;
end $$;

-- Fixture: two stores connect by code (they start as needs_review), plus existing customers for candidates and linking.
insert into app_users values ('f1300000-0000-4000-8000-000000000001','active'), ('f1300000-0000-4000-8000-000000000002','active'), ('f1300000-0000-4000-8000-000000000003','active') on conflict do nothing;
insert into customer_imports(id, company_id, source, row_count, status, quality_score, completed_at) values ('f1300000-0000-4000-8000-0000000000a0','00000000-0000-4000-8000-000000000001','excel',1,'completed',100,now());
insert into normalized_customers(id, company_id, import_id, customer_name, business_registration_number, address, normalized_key) values
 ('f1300000-0000-4000-8000-0000000000c1','00000000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-0000000000a0','CX13 번호일치 매장','2223334445','다른로 1','existing:biznum'),
 ('f1300000-0000-4000-8000-0000000000c2','00000000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-0000000000a0','CX13 이름주소 매장','','합성로 77길 3층','existing:nameaddr'),
 ('f1300000-0000-4000-8000-0000000000c3','00000000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-0000000000a0','CX13 이미 계정 있는 매장','2223334445','다른로 1','existing:hasaccount'),
 ('f1300000-0000-4000-8000-0000000000c4','00000000-0000-4000-8000-000000000001','f1300000-0000-4000-8000-0000000000a0','CX13 연결 대상','','먼곳 9','existing:linktarget'),
 ('f1300000-0000-4000-8000-0000000000c5','00000000-0000-4000-8000-000000000002','f1300000-0000-4000-8000-0000000000a0','CX13 다른 회사 매장','2223334445','다른로 1','other-company');

create function public.cx13_expect(sql text, message text) returns void language plpgsql as $$
begin
 begin execute sql; raise exception 'cx13_expected_failure_missing: %', message;
 exception when raise_exception then if sqlerrm <> message then raise; end if; end;
end $$;
grant execute on function public.cx13_expect(text, text) to service_role;
create temporary table cx13_ctx(name text primary key, account uuid, customer uuid, member uuid);
grant all on cx13_ctx to service_role;

set role service_role;
do $$
declare a uuid := '00000000-0000-4000-8000-000000000001'; h text := md5('cx13-a') || md5('cx13-a2');
  o1 uuid := 'f1300000-0000-4000-8000-000000000001'; o2 uuid := 'f1300000-0000-4000-8000-000000000002'; o3 uuid := 'f1300000-0000-4000-8000-000000000003';
  p uuid; r jsonb; n text; owner uuid; pname text; pbiz text; paddr text; pdetail text;
begin
  perform issue_company_store_invite_code_v1(a, h, clock_timestamp() + interval '7 days', 'ci');
  for n, owner, pname, pbiz, paddr, pdetail in values ('one', o1, 'CX13 번호일치 후보용', '2223334445', '새주소 1', ''), ('two', o2, 'CX13 이름주소 매장', '', '합성로 77길', '3층'), ('three', o3, 'CX13 연결 매장', '', '완전다른 주소 5', '') loop
    p := (create_store_profile_v1(owner, pname, pbiz, paddr, pdetail, 'v1', 'direct')->>'storeProfileId')::uuid;
    r := connect_store_profile_by_invite_code_v1(owner, p, h);
    insert into cx13_ctx select n, (r->>'storeAccountId')::uuid, s.customer_id, (select m.id from store_account_members m where m.store_account_id = s.id limit 1) from store_accounts s where s.id = (r->>'storeAccountId')::uuid;
  end loop;
end $$;
reset role;

-- as the table owner: an existing account for one candidate, an order + a link for store "one", a link for store "two", one legacy-link order.
insert into store_accounts(company_id, customer_id, business_status, terms_version, terms_accepted_at, status)
  values ('00000000-0000-4000-8000-000000000001', 'f1300000-0000-4000-8000-0000000000c3', 'registration_pending', 'v1', now(), 'active');
insert into storefront_links(id, company_id, customer_id, document_version_id, token_nonce, token_hash, expires_at)
  select 'f1300000-0000-4000-8000-0000000000d1', '00000000-0000-4000-8000-000000000001', customer, '80000000-0000-4000-8000-000000000001', md5('cx13-l1'), md5('cx13-l1') || md5('cx13-l1b'), '2099-12-31' from cx13_ctx where name = 'one';
insert into storefront_links(id, company_id, customer_id, document_version_id, token_nonce, token_hash, expires_at)
  select 'f1300000-0000-4000-8000-0000000000d2', '00000000-0000-4000-8000-000000000001', customer, '80000000-0000-4000-8000-000000000001', md5('cx13-l2'), md5('cx13-l2') || md5('cx13-l2b'), '2099-12-31' from cx13_ctx where name = 'two';
insert into store_orders(id, company_id, customer_id, link_id, document_version_id, delivery_date, idempotency_key, store_account_id, ordered_by_member_id)
  select 'f1300000-0000-4000-8000-0000000000e1', '00000000-0000-4000-8000-000000000001', customer, 'f1300000-0000-4000-8000-0000000000d1', '80000000-0000-4000-8000-000000000001', '2099-01-05', gen_random_uuid(), account, member from cx13_ctx where name = 'one';
insert into store_orders(id, company_id, customer_id, link_id, document_version_id, delivery_date, idempotency_key)
  values ('f1300000-0000-4000-8000-0000000000e2', '00000000-0000-4000-8000-000000000001', '20000000-0000-4000-8000-000000000001', '90000000-0000-4000-8000-000000000001', '80000000-0000-4000-8000-000000000001', '2099-01-05', gen_random_uuid());

set role service_role;
do $$
declare a uuid := '00000000-0000-4000-8000-000000000001'; acct1 uuid; acct2 uuid; acct3 uuid; cust2 uuid; cust3 uuid; c jsonb; r jsonb;
  actor uuid := 'f1300000-0000-4000-8000-000000000001';
begin
  select account into acct1 from cx13_ctx where name = 'one'; select account, customer into acct2, cust2 from cx13_ctx where name = 'two'; select account, customer into acct3, cust3 from cx13_ctx where name = 'three';
  if (select count(*) from store_accounts where customer_review_status = 'needs_review') <> 3 then raise exception 'cx13_new_connects_not_needs_review'; end if;

  -- candidates: business number (not the account-holding customer, not another company), name+address, none.
  c := store_customer_review_candidates_v1(a, acct1);
  if jsonb_array_length(c) <> 1 or c->0->>'customerId' <> 'f1300000-0000-4000-8000-0000000000c1' or c->0->>'reason' <> 'business_number' then raise exception 'cx13_candidates_biznum_wrong: %', c; end if;
  c := store_customer_review_candidates_v1(a, acct2);
  if jsonb_array_length(c) <> 1 or c->0->>'customerId' <> 'f1300000-0000-4000-8000-0000000000c2' or c->0->>'reason' <> 'name_address' then raise exception 'cx13_candidates_name_wrong: %', c; end if;
  if jsonb_array_length(store_customer_review_candidates_v1(a, acct3)) <> 0 then raise exception 'cx13_candidates_none_wrong'; end if;
  perform cx13_expect(format('select store_customer_review_candidates_v1(%L,%L)', '00000000-0000-4000-8000-000000000002', acct1), 'store_account_not_found');

  -- G1: the order is accepted (it exists as submitted) but cannot be confirmed / delivered; legacy link orders are untouched.
  perform cx13_expect($q$update store_orders set status = 'received' where id = 'f1300000-0000-4000-8000-0000000000e1'$q$, 'store_customer_review_required');
  perform cx13_expect($q$update store_orders set status = 'delivered' where id = 'f1300000-0000-4000-8000-0000000000e1'$q$, 'store_customer_review_required');
  update store_orders set status = 'received' where id = 'f1300000-0000-4000-8000-0000000000e2';
  if store_customer_confirmed(a, (select customer from cx13_ctx where name = 'one')) then raise exception 'cx13_confirmed_helper_wrong'; end if;

  -- confirm as a new customer: state, event, idempotence, and the order can now be confirmed.
  r := confirm_store_customer_v1(a, acct1, actor, '합성 담당');
  if (r->>'alreadyConfirmed')::boolean or not exists(select 1 from store_accounts where id = acct1 and customer_review_status = 'confirmed' and customer_confirmed_by_user_id = actor and customer_confirmed_at is not null) then raise exception 'cx13_confirm_wrong'; end if;
  if not (confirm_store_customer_v1(a, acct1, actor, '합성 담당')->>'alreadyConfirmed')::boolean then raise exception 'cx13_confirm_not_idempotent'; end if;
  if (select count(*) from store_customer_review_events where store_account_id = acct1 and event_type = 'confirmed_new') <> 1 then raise exception 'cx13_confirm_event_wrong'; end if;
  update store_orders set status = 'received' where id = 'f1300000-0000-4000-8000-0000000000e1';
  if not store_customer_confirmed(a, (select customer from cx13_ctx where name = 'one')) then raise exception 'cx13_confirmed_helper_after_wrong'; end if;
  perform cx13_expect(format('select confirm_store_customer_v1(%L,%L,%L,%L)', '00000000-0000-4000-8000-000000000002', acct1, actor, 'x'), 'store_account_not_found');

  -- link to an existing customer: refusals first.
  perform cx13_expect(format('select link_store_account_to_customer_v1(%L,%L,%L,%L,%L)', a, acct1, 'f1300000-0000-4000-8000-0000000000c4', actor, 'x'), 'store_account_not_pending_review');
  perform cx13_expect(format('select link_store_account_to_customer_v1(%L,%L,%L,%L,%L)', a, acct2, 'f1300000-0000-4000-8000-0000000000c3', actor, 'x'), 'store_review_target_has_store_account');
  perform cx13_expect(format('select link_store_account_to_customer_v1(%L,%L,%L,%L,%L)', a, acct2, cust2, actor, 'x'), 'store_review_same_customer');
  perform cx13_expect(format('select link_store_account_to_customer_v1(%L,%L,%L,%L,%L)', a, acct2, 'f1300000-0000-4000-8000-0000000000c5', actor, 'x'), 'store_review_customer_not_found');
  perform cx13_expect(format('select link_store_account_to_customer_v1(%L,%L,%L,%L,%L)', a, acct2, 'f1300000-0000-4000-8000-0000000000c2', actor, 'x'), 'store_review_placeholder_in_use: storefront_links');
  if exists(select 1 from store_accounts where id = acct2 and (customer_id <> cust2 or customer_review_status <> 'needs_review')) or exists(select 1 from normalized_customers where id = cust2 and duplicate_of is not null) then raise exception 'cx13_refused_link_changed_data'; end if;

  -- link succeeds for the clean account: account to existing customer, confirmed, placeholder kept and marked, history kept.
  r := link_store_account_to_customer_v1(a, acct3, 'f1300000-0000-4000-8000-0000000000c4', actor, '합성 담당');
  if (r->>'replacedCustomerId')::uuid <> cust3 or not exists(select 1 from store_accounts where id = acct3 and customer_id = 'f1300000-0000-4000-8000-0000000000c4' and customer_review_status = 'confirmed' and customer_confirmed_at is not null)
    or not exists(select 1 from normalized_customers where id = cust3 and duplicate_of = 'f1300000-0000-4000-8000-0000000000c4')
    or not exists(select 1 from store_customer_review_events where store_account_id = acct3 and event_type = 'linked_existing' and from_customer_id = cust3 and to_customer_id = 'f1300000-0000-4000-8000-0000000000c4')
    then raise exception 'cx13_link_wrong'; end if;
end $$;
reset role;

-- a placeholder that was not auto-created is refused (the table owner flips the key and back).
update normalized_customers set normalized_key = 'manual:cx13' where id = (select customer from cx13_ctx where name = 'two');
set role service_role;
select cx13_expect(format('select link_store_account_to_customer_v1(%L,%L,%L,%L,%L)', '00000000-0000-4000-8000-000000000001', (select account from cx13_ctx where name = 'two'), 'f1300000-0000-4000-8000-0000000000c2', 'f1300000-0000-4000-8000-000000000001', 'x'), 'store_review_customer_not_auto_created');
reset role;
select 'cx13_review_state_guard_candidates_confirm_link_pg17_pass';

-- down: refused while an account awaits review; after resolving it, refused while history exists; then exact restore; then up again.
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261112-CX-13-store-customer-review.down.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin if not exists(select 1 from information_schema.columns where table_name = 'store_accounts' and column_name = 'customer_review_status') then raise exception 'cx13_down_guard_missed_unconfirmed'; end if; end $$;
update store_accounts set customer_review_status = 'confirmed';
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261112-CX-13-store-customer-review.down.sql
\set ON_ERROR_STOP on
rollback;
do $$ begin if not exists(select 1 from information_schema.columns where table_name = 'store_accounts' and column_name = 'customer_review_status') then raise exception 'cx13_down_guard_missed_history'; end if; end $$;
delete from store_customer_review_events;
\ir ../../docs/sql-drafts/20261112-CX-13-store-customer-review.down.sql
do $$ begin
  if exists(select from cx13_before o join pg_proc p on p.oid = o.oid where o.definition <> pg_get_functiondef(p.oid) or o.proacl is distinct from p.proacl) then raise exception 'cx13_down_did_not_restore_connect_exactly'; end if;
  if exists(select 1 from information_schema.columns where table_name = 'store_accounts' and column_name = 'customer_review_status') or to_regclass('public.store_customer_review_events') is not null
    or to_regprocedure('public.confirm_store_customer_v1(uuid,uuid,uuid,text)') is not null or exists(select 1 from pg_trigger where tgname = 'store_orders_review_guard') then raise exception 'cx13_down_incomplete'; end if;
end $$;
\ir ../../docs/sql-drafts/20261112-CX-13-store-customer-review.sql
select 'cx13_down_guards_exact_restore_and_reapply_pg17_pass';
