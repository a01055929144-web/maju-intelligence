-- DRAFT ONLY (CX-10 backfill). Separate approval after 20261111-CX-10-store-profiles.sql is applied.
-- Each existing per-distributor store account gets its own MAJU store profile (1:1). Accounts are not merged
-- even if business numbers match; merging belongs to a later reviewed step.
begin;
set local lock_timeout='3s';
set local statement_timeout='60s';
lock table public.store_accounts, public.store_account_members in share row exclusive mode;

with source as (
  select a.id account_id, a.company_id,
    left(btrim(coalesce(nullif(btrim(c.customer_name),''), '이름 미등록 매장')), 100) store_name,
    a.business_registration_number, a.business_status,
    nullif(btrim(coalesce(c.delivery_base_address, c.address, '')), '') base_address,
    nullif(btrim(coalesce(c.delivery_address_detail, '')), '') address_detail,
    a.terms_version, a.terms_accepted_at
  from public.store_accounts a
  join public.normalized_customers c on c.company_id = a.company_id and c.id = a.customer_id
  where a.store_profile_id is null
), profiles as (
  insert into public.store_profiles(store_name, business_registration_number, business_status, base_address, address_detail,
      origin, backfilled_from_store_account_id, terms_version, terms_accepted_at)
  select store_name, business_registration_number,
      case when business_registration_number is null then 'registration_pending' else business_status end,
      left(base_address, 300), left(address_detail, 200), 'backfill', account_id, terms_version, terms_accepted_at
  from source
  returning id, backfilled_from_store_account_id
), linked as (
  update public.store_accounts a set store_profile_id = p.id, updated_at = clock_timestamp()
  from profiles p where a.id = p.backfilled_from_store_account_id
  returning a.id account_id, a.company_id, p.id profile_id
)
insert into public.store_profile_members(store_profile_id, auth_user_id, role, joined_at)
select l.profile_id, m.auth_user_id, m.role, coalesce(m.joined_at, clock_timestamp())
from linked l
join public.store_account_members m on m.company_id = l.company_id and m.store_account_id = l.account_id
where m.status = 'active' and m.auth_user_id is not null;

do $$ begin
  if exists(select 1 from public.store_accounts where store_profile_id is null)
    then raise exception 'cx10_backfill_incomplete'; end if;
end $$;
commit;
