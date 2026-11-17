-- CX-77 DRAFT ONLY. Never run in production without explicit representative DB approval.
begin;
set local lock_timeout='3s';
set local statement_timeout='30s';
do $$ begin
  if to_regclass('public.store_profiles') is null or to_regclass('public.store_profile_members') is null
    or to_regclass('public.store_account_members') is null or to_regclass('public.store_account_member_events') is null
  then raise exception 'cx77_dependencies_required'; end if;
  if to_regclass('public.store_profile_member_invitations') is not null then raise exception 'cx77_already_applied'; end if;
end $$;

create table public.store_profile_member_invitations(
  id uuid primary key default gen_random_uuid(),
  store_profile_id uuid not null references public.store_profiles(id) on delete restrict,
  invited_by_member_id uuid not null,
  role text not null check(role in ('manager','staff')),
  display_name text not null check(length(btrim(display_name)) between 1 and 100),
  invite_token_hash text not null unique check(invite_token_hash ~ '^[0-9a-f]{64}$'),
  expires_at timestamptz not null,
  consumed_at timestamptz,
  consumed_by_auth_user_id uuid references public.app_users(id) on delete restrict,
  cancelled_at timestamptz,
  created_at timestamptz not null default clock_timestamp(),
  foreign key(store_profile_id,invited_by_member_id) references public.store_profile_members(store_profile_id,id) on delete restrict,
  check(num_nonnulls(consumed_at,cancelled_at)<=1),
  check((consumed_at is null)=(consumed_by_auth_user_id is null))
);
create index store_profile_member_invitations_pending_idx on public.store_profile_member_invitations(store_profile_id,expires_at)
  where consumed_at is null and cancelled_at is null;
alter table public.store_profile_member_invitations enable row level security;
revoke all on public.store_profile_member_invitations from public,anon,authenticated;
grant select,insert,update on public.store_profile_member_invitations to service_role;

create function public.create_store_profile_member_invitation_v1(
  p_store_profile uuid,p_auth_user_id uuid,p_role text,p_display_name text,p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare actor_id uuid; invitation_id uuid; expiry timestamptz:=clock_timestamp()+interval '7 days';
begin
  if p_role not in ('manager','staff') or nullif(btrim(p_display_name),'') is null or length(btrim(p_display_name))>100
    or p_invite_token_hash !~ '^[0-9a-f]{64}$' then raise exception 'store_profile_invitation_invalid'; end if;
  select id into actor_id from public.store_profile_members where store_profile_id=p_store_profile
    and auth_user_id=p_auth_user_id and role='owner' and status='active' for share;
  if not found then raise exception 'store_profile_owner_required'; end if;
  insert into public.store_profile_member_invitations(store_profile_id,invited_by_member_id,role,display_name,invite_token_hash,expires_at)
    values(p_store_profile,actor_id,p_role,btrim(p_display_name),p_invite_token_hash,expiry) returning id into invitation_id;
  return jsonb_build_object('invitationId',invitation_id,'expiresAt',expiry);
end $$;

create function public.accept_store_profile_member_invitation_v1(p_invite_token_hash text,p_auth_user_id uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare invitation public.store_profile_member_invitations%rowtype; profile_member_id uuid; account record; account_member_id uuid;
begin
  select * into invitation from public.store_profile_member_invitations where invite_token_hash=p_invite_token_hash for update;
  if not found or invitation.consumed_at is not null or invitation.cancelled_at is not null or invitation.expires_at<=clock_timestamp()
    then raise exception 'store_profile_invitation_invalid'; end if;
  select id into profile_member_id from public.store_profile_members where store_profile_id=invitation.store_profile_id and auth_user_id=p_auth_user_id for update;
  if found then
    if exists(select 1 from public.store_profile_members where id=profile_member_id and role='owner' and status='active')
      then raise exception 'store_profile_owner_role_immutable'; end if;
    update public.store_profile_members set role=invitation.role,status='active',joined_at=clock_timestamp(),removed_at=null where id=profile_member_id;
  else
    insert into public.store_profile_members(store_profile_id,auth_user_id,role,status)
      values(invitation.store_profile_id,p_auth_user_id,invitation.role,'active') returning id into profile_member_id;
  end if;
  for account in select company_id,id from public.store_accounts where store_profile_id=invitation.store_profile_id and status='active' for share loop
    select id into account_member_id from public.store_account_members where company_id=account.company_id and store_account_id=account.id
      and auth_user_id=p_auth_user_id order by joined_at desc nulls last limit 1 for update;
    if found then
      update public.store_account_members set role=invitation.role,status='active',invite_token_hash=null,invited_at=null,
        joined_at=clock_timestamp(),removed_by_member_id=null,removed_at=null where id=account_member_id;
    else
      insert into public.store_account_members(company_id,store_account_id,auth_user_id,role,status,joined_at)
        values(account.company_id,account.id,p_auth_user_id,invitation.role,'active',clock_timestamp()) returning id into account_member_id;
    end if;
    insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key)
      values(account.company_id,account.id,account_member_id,'join','profile-invitation:'||invitation.id);
  end loop;
  update public.store_profile_member_invitations set consumed_at=clock_timestamp(),consumed_by_auth_user_id=p_auth_user_id where id=invitation.id;
  return jsonb_build_object('storeProfileId',invitation.store_profile_id,'memberId',profile_member_id,'role',invitation.role);
end $$;

create function public.remove_store_profile_member_v1(p_store_profile uuid,p_auth_user_id uuid,p_target_member uuid)
returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare target public.store_profile_members%rowtype; account record; account_member_id uuid;
begin
  perform 1 from public.store_profile_members where store_profile_id=p_store_profile and auth_user_id=p_auth_user_id
    and role='owner' and status='active' for share;
  if not found then raise exception 'store_profile_owner_required'; end if;
  select * into target from public.store_profile_members where store_profile_id=p_store_profile and id=p_target_member and status='active' for update;
  if not found or target.role='owner' then raise exception 'store_profile_member_removal_forbidden'; end if;
  update public.store_profile_members set status='removed',removed_at=clock_timestamp() where id=target.id;
  for account in select company_id,id from public.store_accounts where store_profile_id=p_store_profile and status='active' for share loop
    select id into account_member_id from public.store_account_members where company_id=account.company_id and store_account_id=account.id
      and auth_user_id=target.auth_user_id and status='active' for update;
    if found then
      update public.store_account_members set status='removed',removed_by_member_id=null,removed_at=clock_timestamp() where id=account_member_id;
      insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key)
        values(account.company_id,account.id,account_member_id,'remove','profile-owner:'||p_auth_user_id);
    end if;
  end loop;
  return jsonb_build_object('storeProfileId',p_store_profile,'memberId',target.id,'status','removed');
end $$;

revoke all on function public.create_store_profile_member_invitation_v1(uuid,uuid,text,text,text) from public,anon,authenticated,service_role;
revoke all on function public.accept_store_profile_member_invitation_v1(text,uuid) from public,anon,authenticated,service_role;
revoke all on function public.remove_store_profile_member_v1(uuid,uuid,uuid) from public,anon,authenticated,service_role;
grant execute on function public.create_store_profile_member_invitation_v1(uuid,uuid,text,text,text) to service_role;
grant execute on function public.accept_store_profile_member_invitation_v1(text,uuid) to service_role;
grant execute on function public.remove_store_profile_member_v1(uuid,uuid,uuid) to service_role;
notify pgrst,'reload schema';
commit;
