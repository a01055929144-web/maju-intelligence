-- DRAFT ONLY. Requires #1240. No operating application or runtime integration.
-- A verdict is provisional outside the transaction that creates the connection/order.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '10s';
do $$ begin
  if to_regclass('public.distributor_industry_categories') is null
    or to_regclass('public.company_distributor_industries') is null
    or to_regclass('public.store_profile_members') is null then
    raise exception 'cx93_industry_prerequisites_required';
  end if;
end $$;

create function public.check_store_distributor_industry_v1(p_company uuid, p_profile uuid, p_user uuid)
returns text language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare scoped_companies uuid[]; companies uuid[];
begin
  if current_setting('transaction_isolation') <> 'read committed'
    then raise exception 'cx93_read_committed_required'; end if;
  -- Identity comes from a verified server session/profile, never public request scope.
  perform 1 from public.store_profiles s where s.id = p_profile and s.status = 'active'
    and exists(select 1 from public.store_profile_members m join public.app_users u on u.id = m.auth_user_id
      where m.store_profile_id = s.id and m.auth_user_id = p_user and m.status = 'active' and u.status = 'active')
    for update of s;
  if not found then return 'store_member_unavailable'; end if;
  perform 1 from public.store_profile_members m join public.app_users u on u.id = m.auth_user_id
    where m.store_profile_id = p_profile and m.auth_user_id = p_user and m.status = 'active' and u.status = 'active'
    order by m.id for share of m, u;
  if not found then return 'store_member_unavailable'; end if;

  -- This profile lock must also cover the caller's write in the SAME transaction.
  -- #1240 assignment writes lock companies; category edits lock category rows.
  select array_agg(id order by id) into scoped_companies from (
    select p_company as id union
    select a.company_id from public.store_accounts a
      where a.store_profile_id = p_profile and a.status = 'active'
  ) scoped;
  perform 1 from public.companies c where c.id = any(scoped_companies) order by c.id for share of c;
  if not exists(select 1 from public.companies where id = p_company and status = 'active')
    then return 'store_member_unavailable'; end if;
  select array_agg(id order by id) into companies from public.companies
    where id = any(scoped_companies) and status = 'active';
  perform 1 from public.distributor_industry_categories c
    where exists(select 1 from public.company_distributor_industries x
      where x.company_id = any(companies) and x.industry_category_id = c.id)
    order by c.id for share of c;

  -- Missing or retired classifications never silently become an empty allowed set.
  if exists(select 1 from unnest(companies) scoped(id)
      where not exists(select 1 from public.company_distributor_industries x where x.company_id = scoped.id))
    or exists(select 1 from public.company_distributor_industries x
      join public.distributor_industry_categories c on c.id = x.industry_category_id
      where x.company_id = any(companies) and c.status <> 'active')
    then return 'business_type_review_required'; end if;
  if exists(select 1 from public.company_distributor_industries target
      join public.company_distributor_industries other on other.industry_category_id = target.industry_category_id
      where target.company_id = p_company and other.company_id <> p_company and other.company_id = any(companies))
    then return 'same_industry_connection'; end if;
  return 'eligible';
end $$;

create function public.assert_store_distributor_industry_v1(p_company uuid, p_profile uuid, p_user uuid)
returns void language plpgsql volatile security definer set search_path = pg_catalog, public, pg_temp as $$
declare reason text;
begin
  reason := public.check_store_distributor_industry_v1(p_company, p_profile, p_user);
  if reason <> 'eligible' then raise exception using errcode = 'P0001', message = reason; end if;
end $$;

revoke all on function public.check_store_distributor_industry_v1(uuid,uuid,uuid),
  public.assert_store_distributor_industry_v1(uuid,uuid,uuid) from public, anon, authenticated, service_role;
grant execute on function public.check_store_distributor_industry_v1(uuid,uuid,uuid),
  public.assert_store_distributor_industry_v1(uuid,uuid,uuid) to service_role;
comment on function public.assert_store_distributor_industry_v1(uuid,uuid,uuid) is
  'CX-93 draft internal assertion. Call inside the authorized connection/first-order write transaction. No bearer approval receipt.';
notify pgrst, 'reload schema';
commit;
