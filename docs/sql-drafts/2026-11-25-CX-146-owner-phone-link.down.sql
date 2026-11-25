-- DOWN: CX-146. 연결 기록(phone_match·owner_vouched 매장)이 있으면 중단한다(데이터를 지우지 않는다).
begin;
set local lock_timeout = '3s';
do $$ begin
  if exists (select 1 from public.store_accounts where owner_vouched or price_visibility_confirmed_source = 'phone_match')
  then raise exception 'cx146_down_blocked_phone_linked_accounts_exist'; end if;
end $$;
drop function if exists public.decline_phone_link_v1(uuid, text, uuid[], uuid[]);
drop function if exists public.confirm_phone_link_v1(uuid, text, uuid[], uuid[]);
drop function if exists public.phone_link_candidates_v1(uuid, text, uuid[]);
drop table if exists public.store_phone_link_notices;
alter table public.store_accounts drop constraint store_accounts_registration_pending_check;
alter table public.store_accounts add constraint store_accounts_registration_pending_check
  check ((business_status <> 'registration_pending' or
    (business_registration_number is null and business_status_verified_at is null and verification_request_id is null))
    and (business_status <> 'active' or
    (business_registration_number is not null and business_status_verified_at is not null and verification_request_id is not null)));
alter table public.store_accounts drop constraint store_accounts_price_visibility_state_ck;
alter table public.store_accounts add constraint store_accounts_price_visibility_state_ck check (
  (price_visibility_status = 'pending' and price_visibility_confirmed_at is null
    and price_visibility_confirmed_by_member_id is null and price_visibility_confirmed_source = 'member')
  or (price_visibility_status = 'confirmed' and price_visibility_confirmed_at is not null and (
    (price_visibility_confirmed_source = 'member' and price_visibility_confirmed_by_member_id is not null)
    or (price_visibility_confirmed_source = 'system_signup' and price_visibility_confirmed_by_member_id is null)))
);
alter table public.store_accounts drop constraint store_accounts_price_visibility_source_ck;
alter table public.store_accounts add constraint store_accounts_price_visibility_confirmed_source_check
  check (price_visibility_confirmed_source in ('member', 'system_signup'));
alter table public.store_accounts drop column owner_vouched;
drop index if exists public.normalized_customers_owner_mobile_idx;
alter table public.normalized_customers drop column owner_mobile;
notify pgrst, 'reload schema';
commit;
