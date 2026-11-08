begin;

create function public.remove_store_member_v1(
  p_company_id uuid, p_store_account_id uuid, p_actor_member_id uuid, p_target_member_id uuid
) returns jsonb
language plpgsql security invoker set search_path=public,pg_temp as $$
declare v_actor public.store_account_members%rowtype; v_target public.store_account_members%rowtype;
begin
  perform 1 from public.store_accounts
    where company_id=p_company_id and id=p_store_account_id and status='active' and business_status='active' for update;
  if not found then raise exception 'store_account_inactive'; end if;

  select * into v_actor from public.store_account_members
    where company_id=p_company_id and store_account_id=p_store_account_id and id=p_actor_member_id and status='active' for share;
  select * into v_target from public.store_account_members
    where company_id=p_company_id and store_account_id=p_store_account_id and id=p_target_member_id and status='active' for update;
  if v_actor.id is null or v_target.id is null or v_actor.role not in ('owner','manager') or v_target.role='owner'
    or (v_actor.role='manager' and v_target.role<>'staff') then raise exception 'store_member_removal_forbidden'; end if;

  update public.store_account_members set status='removed', removed_by_member_id=v_actor.id,
    removed_at=clock_timestamp() where company_id=p_company_id and store_account_id=p_store_account_id and id=v_target.id;
  insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_member_id)
    values(p_company_id,p_store_account_id,v_target.id,'remove',v_actor.id);
  return jsonb_build_object('memberId',v_target.id,'status','removed');
end $$;

revoke all on function public.remove_store_member_v1(uuid,uuid,uuid,uuid) from public,anon,authenticated;
grant execute on function public.remove_store_member_v1(uuid,uuid,uuid,uuid) to service_role;

do $$ begin
  if has_function_privilege('public','public.remove_store_member_v1(uuid,uuid,uuid,uuid)','execute')
    or has_function_privilege('anon','public.remove_store_member_v1(uuid,uuid,uuid,uuid)','execute')
    or has_function_privilege('authenticated','public.remove_store_member_v1(uuid,uuid,uuid,uuid)','execute')
    or not has_function_privilege('service_role','public.remove_store_member_v1(uuid,uuid,uuid,uuid)','execute')
  then raise exception 'remove_store_member_v1 grant check failed'; end if;
end $$;

commit;
