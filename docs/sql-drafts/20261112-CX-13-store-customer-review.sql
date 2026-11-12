-- DRAFT ONLY (CX-13). Never run against production without the CEO's explicit approval phrase.
-- First trade of a store connected by invite code: the distributor must confirm the (auto-created) customer before the
-- store's orders are confirmed / delivered / invoiced. Decisions (CEO 11/12): C = the review state lives on store_accounts;
-- G1 = orders are still accepted, but moving them past "submitted" is blocked until the customer is confirmed;
-- first step = candidates + "confirm as new customer" + "link to existing customer" (only when the auto-created customer is still empty).
-- Needs CX-10/CX-12 applied. Existing store accounts (link sign-ups) become 'confirmed' (column default); only accounts created by
-- connect_store_profile_by_invite_code_v1 from now on start as 'needs_review'. Service-only: no anon/authenticated grants.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)') is null or to_regclass('public.store_profiles') is null
    then raise exception 'cx13_requires_cx12'; end if;
  if not exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'normalized_customers' and column_name = 'duplicate_of')
    then raise exception 'cx13_dependency_missing'; end if;
  if exists(select 1 from information_schema.columns where table_schema = 'public' and table_name = 'store_accounts' and column_name = 'customer_review_status')
    then raise exception 'cx13_already_applied'; end if;
end $$;

-- 1) State on the store account. Existing rows are 'confirmed' (no behavior change for link sign-ups).
alter table public.store_accounts
  add column customer_review_status text not null default 'confirmed' check (customer_review_status in ('needs_review', 'confirmed')),
  add column customer_confirmed_by_user_id uuid,
  add column customer_confirmed_at timestamptz;

-- 2) History of confirmations and links (the replaced auto-created customer id stays here).
create table public.store_customer_review_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null,
  event_type text not null check (event_type in ('confirmed_new', 'linked_existing')),
  from_customer_id uuid not null,
  to_customer_id uuid not null,
  actor_user_id uuid,
  actor_name text,
  created_at timestamptz not null default now(),
  foreign key (company_id, store_account_id) references public.store_accounts(company_id, id) on delete cascade
);
create index store_customer_review_events_account_idx on public.store_customer_review_events(company_id, store_account_id, created_at desc);
alter table public.store_customer_review_events enable row level security;
revoke all on public.store_customer_review_events from public, anon, authenticated;
grant select, insert on public.store_customer_review_events to service_role;

-- 3) Is this customer free of unconfirmed store accounts? (for delivery / voucher callers that work by customer)
create function public.store_customer_confirmed(p_company uuid, p_customer uuid) returns boolean
language sql stable security invoker set search_path = public,pg_temp as $$
  select not exists(select 1 from public.store_accounts a
    where a.company_id = p_company and a.customer_id = p_customer and a.customer_review_status = 'needs_review') $$;
revoke all on function public.store_customer_confirmed(uuid,uuid) from public, anon, authenticated;
grant execute on function public.store_customer_confirmed(uuid,uuid) to service_role;

-- 4) G1 guard at the database: an order of an unconfirmed store account cannot leave "submitted"
--    (cancel stays allowed). Covers the inbox "confirm" PATCH and every later step that advances the status.
create function public.store_orders_review_guard() returns trigger
language plpgsql security invoker set search_path = public,pg_temp as $$
begin
  if new.store_account_id is not null and exists(select 1 from public.store_accounts a
      where a.company_id = new.company_id and a.id = new.store_account_id and a.customer_review_status = 'needs_review') then
    raise exception 'store_customer_review_required';
  end if;
  return new;
end $$;
revoke all on function public.store_orders_review_guard() from public, anon, authenticated;
create trigger store_orders_review_guard before update of status on public.store_orders
  for each row when (new.status in ('received', 'in_delivery', 'delivered') and old.status is distinct from new.status)
  execute function public.store_orders_review_guard();

-- 5) Confirm the auto-created customer as the store's customer ("새 거래처로 확인").
create function public.confirm_store_customer_v1(p_company uuid, p_store_account uuid, p_actor uuid, p_actor_name text) returns jsonb
language plpgsql security invoker set search_path = public,pg_temp as $$
declare a public.store_accounts%rowtype;
begin
  if p_company is null or p_store_account is null then raise exception 'store_review_invalid_request'; end if;
  select * into a from public.store_accounts where company_id = p_company and id = p_store_account for update;
  if not found then raise exception 'store_account_not_found'; end if;
  if a.customer_review_status = 'confirmed' then
    return jsonb_build_object('storeAccountId', a.id, 'customerId', a.customer_id, 'alreadyConfirmed', true);
  end if;
  update public.store_accounts set customer_review_status = 'confirmed', customer_confirmed_by_user_id = p_actor,
    customer_confirmed_at = clock_timestamp(), updated_at = clock_timestamp() where company_id = p_company and id = a.id;
  insert into public.store_customer_review_events(company_id, store_account_id, event_type, from_customer_id, to_customer_id, actor_user_id, actor_name)
    values (p_company, a.id, 'confirmed_new', a.customer_id, a.customer_id, p_actor, left(p_actor_name, 100));
  return jsonb_build_object('storeAccountId', a.id, 'customerId', a.customer_id, 'alreadyConfirmed', false);
end $$;
revoke all on function public.confirm_store_customer_v1(uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.confirm_store_customer_v1(uuid,uuid,uuid,text) to service_role;

-- 6) Existing-customer candidates for the review screen (read-only, this company only, at most 10). NEVER merges anything.
--    1) the profile's business number equals the customer's  2) same name (spaces/punctuation/case ignored) and same first 10 address characters.
--    Customers that already have a store account, duplicates and the auto-created customer itself are not offered.
create function public.store_customer_review_candidates_v1(p_company uuid, p_store_account uuid) returns jsonb
language plpgsql stable security invoker set search_path = public,pg_temp as $$
declare a public.store_accounts%rowtype; prof public.store_profiles%rowtype; own public.normalized_customers%rowtype; norm_name text; norm_addr text; result jsonb;
begin
  select * into a from public.store_accounts where company_id = p_company and id = p_store_account;
  if not found then raise exception 'store_account_not_found'; end if;
  if a.store_profile_id is null then return '[]'::jsonb; end if;
  select * into prof from public.store_profiles where id = a.store_profile_id;
  select * into own from public.normalized_customers where company_id = p_company and id = a.customer_id;
  norm_name := regexp_replace(lower(own.customer_name), '[\s()\-·.,]', '', 'g');
  norm_addr := left(regexp_replace(coalesce(own.address, ''), '\s', '', 'g'), 10);
  select coalesce(jsonb_agg(jsonb_build_object('customerId', x.id, 'name', x.customer_name, 'address', x.address,
      'reason', case x.rank when 1 then 'business_number' else 'name_address' end) order by x.rank, x.customer_name), '[]'::jsonb) into result
  from (select * from (
      select c.id, c.customer_name, c.address,
        case when prof.business_registration_number ~ '^\d{10}$' and regexp_replace(coalesce(c.business_registration_number, ''), '\D', '', 'g') = prof.business_registration_number then 1
             when norm_name <> '' and norm_addr <> '' and regexp_replace(lower(c.customer_name), '[\s()\-·.,]', '', 'g') = norm_name
               and left(regexp_replace(coalesce(c.address, ''), '\s', '', 'g'), 10) = norm_addr then 2 end as rank
      from public.normalized_customers c
      where c.company_id = p_company and c.id <> a.customer_id and c.duplicate_of is null
        and not exists(select 1 from public.store_accounts s where s.company_id = p_company and s.customer_id = c.id)) cand
    where cand.rank is not null order by cand.rank, cand.customer_name limit 10) x;
  return result;
end $$;
revoke all on function public.store_customer_review_candidates_v1(uuid,uuid) from public, anon, authenticated;
grant execute on function public.store_customer_review_candidates_v1(uuid,uuid) to service_role;

-- 7) Link the store account to an EXISTING customer ("기존 거래처에 연결"). Only while the account awaits review, the current customer was
--    auto-created by the invite connect (normalized_key 'profile:…'), nothing refers to it yet, and the target customer has no store account.
--    The account then points at the existing customer and is confirmed; the empty auto-created customer is kept and marked as a duplicate of it.
create function public.link_store_account_to_customer_v1(p_company uuid, p_store_account uuid, p_customer uuid, p_actor uuid, p_actor_name text) returns jsonb
language plpgsql security invoker set search_path = public,pg_temp as $$
declare a public.store_accounts%rowtype; placeholder public.normalized_customers%rowtype; i integer; used boolean;
  refs constant text[][] := array[
    ['store_orders','customer_id'], ['customer_price_agreements','customer_id'], ['storefront_links','customer_id'],
    ['pricing_document_acceptance_requests','customer_id'], ['pricing_document_sends','customer_id'], ['customer_pricing_document_links','customer_id'],
    ['business_documents','customer_id'], ['delivery_events','customer_id'], ['store_order_customer_rules','customer_id'],
    ['store_product_preferences','customer_id'], ['tax_invoices','customer_id'], ['partner_ledger_entries','customer_id'],
    ['store_owner_activation_requests','customer_id']];
begin
  if p_company is null or p_store_account is null or p_customer is null then raise exception 'store_review_invalid_request'; end if;
  select * into a from public.store_accounts where company_id = p_company and id = p_store_account for update;
  if not found then raise exception 'store_account_not_found'; end if;
  if a.customer_review_status <> 'needs_review' then raise exception 'store_account_not_pending_review'; end if;
  if p_customer = a.customer_id then raise exception 'store_review_same_customer'; end if;
  perform 1 from public.normalized_customers where company_id = p_company and id = p_customer for share;
  if not found then raise exception 'store_review_customer_not_found'; end if;
  if exists(select 1 from public.store_accounts where company_id = p_company and customer_id = p_customer) then raise exception 'store_review_target_has_store_account'; end if;
  select * into placeholder from public.normalized_customers where company_id = p_company and id = a.customer_id for update;
  if not found or placeholder.normalized_key not like 'profile:%' then raise exception 'store_review_customer_not_auto_created'; end if;
  for i in 1 .. array_length(refs, 1) loop
    if to_regclass('public.' || refs[i][1]) is not null then
      execute format('select exists(select 1 from public.%I where company_id = $1 and %I = $2)', refs[i][1], refs[i][2]) into used using p_company, placeholder.id;
      if used then raise exception 'store_review_placeholder_in_use: %', refs[i][1]; end if;
    end if;
  end loop;
  update public.store_accounts set customer_id = p_customer, customer_review_status = 'confirmed', customer_confirmed_by_user_id = p_actor,
    customer_confirmed_at = clock_timestamp(), updated_at = clock_timestamp() where company_id = p_company and id = a.id;
  update public.normalized_customers set duplicate_of = p_customer where company_id = p_company and id = placeholder.id;
  insert into public.store_customer_review_events(company_id, store_account_id, event_type, from_customer_id, to_customer_id, actor_user_id, actor_name)
    values (p_company, a.id, 'linked_existing', placeholder.id, p_customer, p_actor, left(p_actor_name, 100));
  return jsonb_build_object('storeAccountId', a.id, 'customerId', p_customer, 'replacedCustomerId', placeholder.id);
end $$;
revoke all on function public.link_store_account_to_customer_v1(uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.link_store_account_to_customer_v1(uuid,uuid,uuid,uuid,text) to service_role;

-- 8) The invite connect now creates the account as 'needs_review' (two single-line anchors, each must match exactly once).
do $patch$
declare fn constant regprocedure := to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)');
  definition text; original_acl aclitem[];
  sources constant text[] := array[$s$status, store_profile_id, invite_code_id)$s$, $s$'active', prof.id, code.id) returning id into v_account;$s$];
  targets constant text[] := array[$t$status, store_profile_id, invite_code_id, customer_review_status)$t$, $t$'active', prof.id, code.id, 'needs_review') returning id into v_account; -- cx13$t$];
  i integer;
begin
  select proacl into original_acl from pg_proc where oid = fn and not prosecdef;
  if not found then raise exception 'cx13_invoker_required'; end if;
  definition := pg_get_functiondef(fn);
  if strpos(definition, '-- cx13') > 0 then raise exception 'cx13_already_applied'; end if;
  for i in 1 .. array_length(sources, 1) loop
    if (length(definition) - length(replace(definition, sources[i], ''))) / length(sources[i]) <> 1 then raise exception 'cx13_definition_changed: anchor %', i; end if;
  end loop;
  for i in 1 .. array_length(sources, 1) loop definition := replace(definition, sources[i], targets[i]); end loop;
  execute definition;
  if fn::oid <> to_regprocedure('public.connect_store_profile_by_invite_code_v1(uuid,uuid,text)')::oid
    or (select proacl from pg_proc where oid = fn) is distinct from original_acl or (select prosecdef from pg_proc where oid = fn)
    then raise exception 'cx13_identity_acl_or_security_changed'; end if;
end $patch$;
commit;
