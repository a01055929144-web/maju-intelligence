-- DRAFT ONLY. Operating DB application needs separate project-specific approval.
begin;
set local lock_timeout='3s';
set local statement_timeout='10s';
create function public.change_store_connection_v1(
  p_company_id uuid,p_store_account_id uuid,p_member_id uuid,p_auth_user_id uuid,p_action text
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.store_accounts%rowtype; m public.store_account_members%rowtype; target record;
begin
  if p_action is null or p_action not in ('leave','close') then raise exception 'store_connection_invalid'; end if;
  -- Member ordering locks the bearer link before the account. Match that order.
  if p_action='close' then
    perform 1 from public.storefront_links l join public.store_accounts s
      on s.company_id=l.company_id and s.customer_id=l.customer_id
      where s.company_id=p_company_id and s.id=p_store_account_id order by l.id for update of l;
  end if;
  select * into a from public.store_accounts where company_id=p_company_id and id=p_store_account_id for update;
  if a.id is null or a.status<>'active' then raise exception 'store_connection_unavailable'; end if;
  select * into m from public.store_account_members where company_id=p_company_id and store_account_id=p_store_account_id
    and id=p_member_id and auth_user_id=p_auth_user_id and status='active' for update;
  perform 1 from public.app_users where id=p_auth_user_id and status='active' for share;
  if not found or m.id is null
    or (p_action='leave' and m.role='owner') or (p_action='close' and m.role<>'owner')
    then raise exception 'store_connection_forbidden'; end if;
  if p_action='close' then
    update public.store_accounts set status='closed',updated_at=clock_timestamp() where company_id=p_company_id and id=a.id;
    update public.storefront_links set revoked_at=coalesce(revoked_at,clock_timestamp()),can_order=false
      where company_id=p_company_id and customer_id=a.customer_id;
  end if;
  for target in select id from public.store_account_members where company_id=p_company_id and store_account_id=a.id
    and status in ('active','invited') and (p_action='close' or id=m.id) order by id for update loop
    update public.store_account_members set status='removed',removed_at=clock_timestamp(),removed_by_member_id=m.id,invite_token_hash=null
      where company_id=p_company_id and store_account_id=a.id and id=target.id;
    insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_member_id,reason)
      values(p_company_id,a.id,target.id,'remove',m.id,case when p_action='close' then 'store_connection_closed' else 'store_connection_left' end);
  end loop;
  return jsonb_build_object('completed',true,'action',p_action);
end $$;
revoke all on function public.change_store_connection_v1(uuid,uuid,uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.change_store_connection_v1(uuid,uuid,uuid,uuid,text) to service_role;
notify pgrst,'reload schema';
commit;
