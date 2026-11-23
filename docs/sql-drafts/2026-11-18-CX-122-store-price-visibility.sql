-- DRAFT ONLY. Requires separate operating DB approval. Keep STORE_PRICE_VISIBILITY_ENABLED=OFF.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '20s';

do $$ begin
  if to_regclass('public.store_accounts') is null
    or to_regclass('public.company_members') is null
    or to_regclass('public.companies') is null
  then raise exception 'cx122_prerequisites_required'; end if;
  if exists(select 1 from information_schema.columns
    where table_schema='public' and table_name='store_accounts' and column_name='price_visibility_status')
  then raise exception 'cx122_already_applied'; end if;
end $$;

alter table public.store_accounts
  add column price_visibility_status text not null default 'pending'
    check(price_visibility_status in ('pending','confirmed')),
  add column price_visibility_confirmed_at timestamptz,
  add column price_visibility_confirmed_by_member_id uuid,
  add constraint store_accounts_price_visibility_state_ck check(
    (price_visibility_status='pending' and price_visibility_confirmed_at is null and price_visibility_confirmed_by_member_id is null)
    or
    (price_visibility_status='confirmed' and price_visibility_confirmed_at is not null and price_visibility_confirmed_by_member_id is not null)
  ),
  add constraint store_accounts_price_visibility_actor_fk
    foreign key(company_id,price_visibility_confirmed_by_member_id)
    references public.company_members(company_id,id) on delete restrict;

create table public.store_price_visibility_events(
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null references public.companies(id) on delete cascade,
  store_account_id uuid not null,
  event_type text not null check(event_type in ('confirmed','cancelled')),
  actor_company_member_id uuid not null,
  actor_role text not null check(actor_role in ('owner','manager')),
  memo text,
  -- These are display-only references. They never grant price visibility.
  reference_snapshot jsonb not null default '{}'::jsonb check(jsonb_typeof(reference_snapshot)='object'),
  created_at timestamptz not null default clock_timestamp(),
  foreign key(company_id,store_account_id) references public.store_accounts(company_id,id) on delete cascade,
  foreign key(company_id,actor_company_member_id) references public.company_members(company_id,id) on delete restrict
);
create index store_price_visibility_events_account_idx
  on public.store_price_visibility_events(company_id,store_account_id,created_at desc);
alter table public.store_price_visibility_events enable row level security;
revoke all on public.store_price_visibility_events from public,anon,authenticated;
grant select,insert on public.store_price_visibility_events to service_role;

create function public.set_store_price_visibility_v1(
  p_company uuid,p_store_account uuid,p_actor_company_member uuid,p_action text,p_memo text default null,
  p_reference_snapshot jsonb default '{}'::jsonb
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare account public.store_accounts%rowtype; actor_role text; target_status text;
begin
  if p_action not in ('confirm','cancel') then raise exception 'store_price_visibility_invalid_action'; end if;
  if p_reference_snapshot is null or jsonb_typeof(p_reference_snapshot)<>'object'
    or exists(select 1 from jsonb_each(p_reference_snapshot) where jsonb_typeof(value) not in ('boolean','null'))
    then raise exception 'store_price_visibility_invalid_reference'; end if;
  select coalesce(permission_role,case when role in ('owner','manager') then role else 'staff' end)
    into actor_role from public.company_members
    where company_id=p_company and id=p_actor_company_member and status='active' for share;
  if actor_role is null or actor_role not in ('owner','manager')
    then raise exception 'store_price_visibility_forbidden'; end if;
  select * into account from public.store_accounts
    where company_id=p_company and id=p_store_account and status='active' for update;
  if not found then raise exception 'store_account_not_found'; end if;
  if account.business_status='registration_pending'
    then raise exception 'store_price_visibility_preopening'; end if;
  target_status:=case p_action when 'confirm' then 'confirmed' else 'pending' end;
  if account.price_visibility_status=target_status then
    return jsonb_build_object('storeAccountId',account.id,'status',target_status,'alreadyApplied',true);
  end if;
  update public.store_accounts set
    price_visibility_status=target_status,
    price_visibility_confirmed_at=case when target_status='confirmed' then clock_timestamp() end,
    price_visibility_confirmed_by_member_id=case when target_status='confirmed' then p_actor_company_member end,
    updated_at=clock_timestamp()
    where company_id=p_company and id=p_store_account;
  insert into public.store_price_visibility_events(company_id,store_account_id,event_type,
    actor_company_member_id,actor_role,memo,reference_snapshot)
    values(p_company,p_store_account,case p_action when 'confirm' then 'confirmed' else 'cancelled' end,
      p_actor_company_member,actor_role,left(nullif(btrim(p_memo),''),500),p_reference_snapshot);
  return jsonb_build_object('storeAccountId',account.id,'status',target_status,'alreadyApplied',false);
end $$;

create function public.store_price_visible_v1(p_company uuid,p_store_account uuid) returns boolean
language sql stable security invoker set search_path=public,pg_temp as $$
  select exists(select 1 from public.store_accounts
    where company_id=p_company and id=p_store_account and status='active'
      and business_status<>'registration_pending' and price_visibility_status='confirmed')
$$;

create function public.pending_store_price_visibility_count_v1(
  p_company uuid,p_actor_company_member uuid
) returns integer language plpgsql stable security invoker set search_path=public,pg_temp as $$
declare actor_role text; result integer;
begin
  select coalesce(permission_role,case when role in ('owner','manager') then role else 'staff' end)
    into actor_role from public.company_members
    where company_id=p_company and id=p_actor_company_member and status='active';
  if actor_role is null or actor_role not in ('owner','manager')
    then raise exception 'store_price_visibility_forbidden'; end if;
  select count(*)::integer into result from public.store_accounts
    where company_id=p_company and status='active' and business_status<>'registration_pending'
      and price_visibility_status='pending';
  return result;
end $$;

revoke all on function public.set_store_price_visibility_v1(uuid,uuid,uuid,text,text,jsonb) from public,anon,authenticated,service_role;
revoke all on function public.store_price_visible_v1(uuid,uuid) from public,anon,authenticated,service_role;
revoke all on function public.pending_store_price_visibility_count_v1(uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.set_store_price_visibility_v1(uuid,uuid,uuid,text,text,jsonb) to service_role;
grant execute on function public.store_price_visible_v1(uuid,uuid) to service_role;
grant execute on function public.pending_store_price_visibility_count_v1(uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
