-- 운영 적용 완료(2026-11-07). schema_migrations version=20261107075454, name=store_kakao_membership_20261107. 운영 DB 재실행 금지.
-- DB 승인 전 초안. 운영 실행 금지.
-- 기존 store_accounts/store_account_members/store_account_member_events를 재사용한다.
begin;

do $$
begin
  if exists (
    select 1 from public.store_account_members m
    left join public.app_users u on u.id=m.auth_user_id
    where m.auth_user_id is not null and u.id is null
  ) then
    raise exception 'store_member_auth_user_orphan';
  end if;
end $$;

alter table public.store_account_members
  add constraint store_account_members_auth_user_fk
  foreign key(auth_user_id) references public.app_users(id) on delete set null not valid;
alter table public.store_account_members validate constraint store_account_members_auth_user_fk;

create unique index store_account_member_active_auth_uq
  on public.store_account_members(company_id,store_account_id,auth_user_id)
  where auth_user_id is not null and status='active';
create unique index store_account_member_invite_hash_uq
  on public.store_account_members(invite_token_hash)
  where invite_token_hash is not null;

create function public.provision_store_owner_v1(
  p_company_id uuid, p_store_account_id uuid, p_auth_user_id uuid, p_actor_company_member_id uuid
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_member public.store_account_members%rowtype; v_actor_role text;
begin
  select coalesce(permission_role,case when role in ('owner','manager') then role else 'staff' end) into v_actor_role
    from public.company_members where company_id=p_company_id and id=p_actor_company_member_id and status='active';
  if v_actor_role is null or v_actor_role not in ('owner','manager') then raise exception 'store_owner_approval_forbidden'; end if;
  perform 1 from public.store_accounts
    where company_id=p_company_id and id=p_store_account_id and status in ('pending','active') for update;
  if not found then raise exception 'store_account_not_available'; end if;
  perform 1 from public.app_users where id=p_auth_user_id and status='active';
  if not found then raise exception 'auth_user_not_found'; end if;
  if exists(select 1 from public.store_account_members where company_id=p_company_id and store_account_id=p_store_account_id and role='owner' and status='active') then
    raise exception 'active_store_owner_exists';
  end if;
  if exists(select 1 from public.store_account_members where company_id=p_company_id and store_account_id=p_store_account_id and auth_user_id=p_auth_user_id and status='active') then
    raise exception 'active_store_member_exists';
  end if;
  insert into public.store_account_members(company_id,store_account_id,auth_user_id,role,status,joined_at)
    values(p_company_id,p_store_account_id,p_auth_user_id,'owner','active',clock_timestamp()) returning * into v_member;
  insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key)
    values(p_company_id,p_store_account_id,v_member.id,'join','company_member:'||p_actor_company_member_id::text);
  return jsonb_build_object('id',v_member.id,'role',v_member.role,'status',v_member.status);
end $$;

create function public.create_store_member_invitation_v1(
  p_company_id uuid, p_store_account_id uuid, p_actor_member_id uuid,
  p_role text, p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_actor public.store_account_members%rowtype; v_member public.store_account_members%rowtype;
begin
  if p_role not in ('manager','staff') or p_invite_token_hash is null or p_invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_store_invitation';
  end if;
  perform 1 from public.store_accounts where company_id=p_company_id and id=p_store_account_id and status='active' for update;
  if not found then raise exception 'store_account_not_active'; end if;
  select * into v_actor from public.store_account_members
    where company_id=p_company_id and store_account_id=p_store_account_id and id=p_actor_member_id and status='active' for share;
  if not found or v_actor.role not in ('owner','manager') or (p_role='manager' and v_actor.role<>'owner') then
    raise exception 'store_invitation_forbidden';
  end if;
  insert into public.store_account_members(company_id,store_account_id,role,status,invited_by_member_id,invite_token_hash,invited_at)
    values(p_company_id,p_store_account_id,p_role,'invited',v_actor.id,p_invite_token_hash,clock_timestamp()) returning * into v_member;
  insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_member_id)
    values(p_company_id,p_store_account_id,v_member.id,'invite',v_actor.id);
  return jsonb_build_object('id',v_member.id,'role',v_member.role,'status',v_member.status);
end $$;

create function public.accept_store_member_invitation_v1(
  p_company_id uuid, p_store_account_id uuid, p_auth_user_id uuid, p_invite_token_hash text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_member public.store_account_members%rowtype;
begin
  if p_invite_token_hash is null or p_invite_token_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'invalid_store_invitation';
  end if;
  perform 1 from public.store_accounts where company_id=p_company_id and id=p_store_account_id and status='active' for update;
  if not found then raise exception 'store_account_not_active'; end if;
  perform 1 from public.app_users where id=p_auth_user_id and status='active';
  if not found then raise exception 'auth_user_not_found'; end if;
  select * into v_member from public.store_account_members
    where company_id=p_company_id and store_account_id=p_store_account_id
      and invite_token_hash=p_invite_token_hash and status='invited' for update;
  if not found or v_member.invited_at is null or v_member.invited_at < clock_timestamp()-interval '7 days' then
    raise exception 'store_invitation_not_available';
  end if;
  if exists(select 1 from public.store_account_members where company_id=p_company_id and store_account_id=p_store_account_id and auth_user_id=p_auth_user_id and status='active') then
    raise exception 'active_store_member_exists';
  end if;
  update public.store_account_members set auth_user_id=p_auth_user_id,status='active',joined_at=clock_timestamp(),invite_token_hash=null
    where company_id=p_company_id and store_account_id=p_store_account_id and id=v_member.id returning * into v_member;
  insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key)
    values(p_company_id,p_store_account_id,v_member.id,'join','auth_user:'||p_auth_user_id::text);
  return jsonb_build_object('id',v_member.id,'role',v_member.role,'status',v_member.status);
end $$;

revoke all on function public.provision_store_owner_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated;
revoke all on function public.create_store_member_invitation_v1(uuid,uuid,uuid,text,text) from public,anon,authenticated;
revoke all on function public.accept_store_member_invitation_v1(uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.provision_store_owner_v1(uuid,uuid,uuid,uuid) to service_role;
grant execute on function public.create_store_member_invitation_v1(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.accept_store_member_invitation_v1(uuid,uuid,uuid,text) to service_role;

do $$ begin
  if has_function_privilege('public','public.provision_store_owner_v1(uuid,uuid,uuid,uuid)','execute')
    or has_function_privilege('anon','public.create_store_member_invitation_v1(uuid,uuid,uuid,text,text)','execute')
    or has_function_privilege('authenticated','public.accept_store_member_invitation_v1(uuid,uuid,uuid,text)','execute')
    or not has_function_privilege('service_role','public.accept_store_member_invitation_v1(uuid,uuid,uuid,text)','execute') then
    raise exception 'store_membership_function_grants_invalid';
  end if;
end $$;
commit;
