\set ON_ERROR_STOP on
do $$ begin if current_setting('server_version_num')::int/10000<>17 then raise exception 'cx77_pg17_required'; end if; end $$;
\ir ../../docs/sql-drafts/20261118-CX-77-store-profile-member-invitations.sql
do $$ declare
  owner record; invited_user uuid:=gen_random_uuid(); result jsonb; target uuid; linked_count int;
begin
  select a.company_id,a.store_profile_id,m.auth_user_id into strict owner from public.store_accounts a join public.store_profile_members m
    on m.store_profile_id=a.store_profile_id and m.role='owner' and m.status='active' where a.status='active'
      and exists(select 1 from public.store_accounts linked where linked.store_profile_id=a.store_profile_id
        and linked.company_id<>a.company_id and linked.status='active')
    order by a.id limit 1;
  insert into public.app_users(id,status) values(invited_user,'active');
  perform public.create_store_profile_member_invitation_v1(owner.store_profile_id,owner.auth_user_id,'manager','합성 점장',repeat('a',64));
  begin perform public.create_store_profile_member_invitation_v1(owner.store_profile_id,invited_user,'staff','위조',repeat('b',64)); raise exception 'cx77_non_owner_invited';
  exception when raise_exception then if sqlerrm<>'store_profile_owner_required' then raise; end if; end;
  result:=public.accept_store_profile_member_invitation_v1(repeat('a',64),invited_user);
  target:=(result->>'memberId')::uuid;
  select count(*) into linked_count from public.store_accounts where store_profile_id=owner.store_profile_id and status='active';
  if (select count(*) from public.store_account_members am join public.store_accounts a on a.company_id=am.company_id and a.id=am.store_account_id
      where a.store_profile_id=owner.store_profile_id and am.auth_user_id=invited_user and am.role='manager' and am.status='active')<>linked_count
    then raise exception 'cx77_not_synced_to_all_accounts'; end if;
  begin perform public.accept_store_profile_member_invitation_v1(repeat('a',64),invited_user); raise exception 'cx77_reused_invitation';
  exception when raise_exception then if sqlerrm<>'store_profile_invitation_invalid' then raise; end if; end;
  perform public.remove_store_profile_member_v1(owner.store_profile_id,owner.auth_user_id,target);
  if exists(select 1 from public.store_profile_members where id=target and status='active')
    or exists(select 1 from public.store_account_members where auth_user_id=invited_user and status='active')
    then raise exception 'cx77_removal_not_immediate_everywhere'; end if;
end $$;
\set ON_ERROR_STOP off
\ir ../../docs/sql-drafts/20261118-CX-77-store-profile-member-invitations.down.sql
\set ON_ERROR_STOP on
do $$ begin if to_regclass('public.store_profile_member_invitations') is null then raise exception 'cx77_guarded_down_removed_history'; end if; end $$;
select 'CX-77 profile invitation PG17 passed' result;
