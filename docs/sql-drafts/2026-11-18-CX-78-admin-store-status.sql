-- DRAFT ONLY. CX-78 관리자 매장 멈추기/풀기. 운영 적용·기능 ON·배포 금지.
begin;
set local lock_timeout = '3s';
set local statement_timeout = '30s';

do $$ begin
  if to_regclass('public.store_profiles') is null
    or to_regclass('public.store_accounts') is null
    or to_regclass('public.admin_audit_logs') is null
    then raise exception 'cx78_admin_store_status_dependencies_required'; end if;
end $$;

create or replace function public.admin_set_store_profile_status_v1(
  p_company uuid,
  p_store_profile uuid,
  p_target_status text,
  p_request_key text,
  p_actor_user uuid,
  p_actor_name text
) returns jsonb
language plpgsql
security invoker
set search_path = public, pg_temp
as $$
declare
  v_profile public.store_profiles%rowtype;
  v_existing public.admin_audit_logs%rowtype;
  v_audit uuid;
  v_before text;
begin
  if p_company is null or p_store_profile is null
    or p_target_status not in ('active', 'suspended')
    or nullif(btrim(p_request_key), '') is null or length(p_request_key) not between 16 and 200
    or nullif(btrim(p_actor_name), '') is null
    then raise exception 'admin_store_status_invalid'; end if;

  perform pg_advisory_xact_lock(hashtextextended(p_company::text || ':' || p_request_key, 0));
  select * into v_existing from public.admin_audit_logs
    where company_id = p_company
      and action in ('admin_store_suspended', 'admin_store_resumed')
      and metadata->>'requestKey' = p_request_key
    order by created_at desc, id desc limit 1;
  if found then
    if v_existing.target_id is distinct from p_store_profile
      or v_existing.metadata->>'afterStatus' is distinct from p_target_status
      then raise exception 'admin_store_status_idempotency_conflict'; end if;
    return jsonb_build_object(
      'companyId', p_company, 'storeProfileId', p_store_profile,
      'status', p_target_status, 'auditLogId', v_existing.id, 'alreadyApplied', true
    );
  end if;

  select p.* into v_profile from public.store_profiles p
    where p.id = p_store_profile
      and exists (
        select 1 from public.store_accounts a
        where a.company_id = p_company and a.store_profile_id = p.id
      )
    for update;
  if not found then raise exception 'admin_store_profile_not_found'; end if;
  if v_profile.status = 'closed' then raise exception 'admin_store_profile_closed'; end if;
  if v_profile.status not in ('active', 'suspended') then raise exception 'admin_store_profile_status_unsupported'; end if;

  v_before := v_profile.status;
  if v_before is distinct from p_target_status then
    update public.store_profiles
      set status = p_target_status, updated_at = clock_timestamp()
      where id = p_store_profile;
  end if;

  insert into public.admin_audit_logs(actor_user_id, company_id, action, target_type, target_id, metadata)
  values (
    case when exists(select 1 from public.app_users where id = p_actor_user) then p_actor_user else null end,
    p_company,
    case when p_target_status = 'suspended' then 'admin_store_suspended' else 'admin_store_resumed' end,
    'store_profile',
    p_store_profile,
    jsonb_build_object(
      'actorName', btrim(p_actor_name), 'actorRole', 'super_admin',
      'requestKey', p_request_key, 'beforeStatus', v_before,
      'afterStatus', p_target_status, 'changed', v_before is distinct from p_target_status
    )
  ) returning id into v_audit;

  return jsonb_build_object(
    'companyId', p_company, 'storeProfileId', p_store_profile,
    'status', p_target_status, 'auditLogId', v_audit, 'alreadyApplied', false
  );
end $$;

revoke all on function public.admin_set_store_profile_status_v1(uuid,uuid,text,text,uuid,text)
  from public, anon, authenticated, service_role;
grant execute on function public.admin_set_store_profile_status_v1(uuid,uuid,text,text,uuid,text)
  to service_role;

commit;
