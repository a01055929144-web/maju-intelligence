-- DRAFT ONLY. CX-144 U0b: MAJU 관리자 "강제 연결" — 이미 카카오로 로그인한 사용자(app_users)를 초대 없이 매장의 점주/관리자/직원으로 바로 연결. 운영 적용은 대표 승인 문구 후 컨트롤타워.
-- 새 계정은 만들지 않는다(kakao_user_id가 있는 활성 app_users만). 사유 필수(2~500자), 이벤트에 관리자 키와 함께 기록. 점주가 이미 있으면 교체를 명시(p_replace_owner)해야 한다.
-- 선행: CX-144 U0 초안(admin_change_store_connection_v1 등). 기존 행·함수는 바꾸지 않는다(새 함수 1개).
begin;
set local lock_timeout='3s';
set local statement_timeout='20s';

do $$ begin
  if to_regprocedure('public.admin_change_store_connection_v1(uuid,uuid,text,text,uuid)') is null
    or not exists(select 1 from information_schema.columns where table_schema='public' and table_name='app_users' and column_name='kakao_user_id')
  then raise exception 'cx144_u0b_prerequisites_required'; end if;
  if to_regprocedure('public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean)') is not null then raise exception 'cx144_u0b_already_applied'; end if;
end $$;

create function public.admin_link_store_member_v1(
  p_company_id uuid,p_store_account_id uuid,p_admin_key text,p_auth_user_id uuid,p_role text,p_reason text,p_replace_owner boolean default false
) returns jsonb language plpgsql security invoker set search_path=public,pg_temp as $$
declare a public.store_accounts%rowtype; v_old public.store_account_members%rowtype; v_member public.store_account_members%rowtype;
  v_reason text:=btrim(coalesce(p_reason,'')); v_replaced uuid;
begin
  if p_admin_key is null or p_admin_key !~ '^[0-9a-f]{64}$' then raise exception 'admin_key_invalid'; end if;
  if p_role is null or p_role not in ('owner','manager','staff') then raise exception 'store_connection_invalid'; end if;
  if char_length(v_reason) not between 2 and 500 then raise exception 'store_link_reason_required'; end if;
  select * into a from public.store_accounts where company_id=p_company_id and id=p_store_account_id for update;
  if a.id is null or a.status<>'active' then raise exception 'store_connection_unavailable'; end if;
  -- 이미 카카오로 로그인한 적이 있는 활성 사용자만(새 계정 생성 금지)
  perform 1 from public.app_users where id=p_auth_user_id and status='active' and kakao_user_id is not null for share;
  if not found then raise exception 'store_link_user_unavailable'; end if;
  if exists(select 1 from public.store_account_members where company_id=p_company_id and store_account_id=a.id and auth_user_id=p_auth_user_id and status='active')
    then raise exception 'active_store_member_exists'; end if;
  if p_role='owner' then
    select * into v_old from public.store_account_members where company_id=p_company_id and store_account_id=a.id and role='owner' and status='active' for update;
    if found then
      if p_replace_owner is not true then raise exception 'active_store_owner_exists'; end if;
      update public.store_account_members set status='removed',removed_at=clock_timestamp(),invite_token_hash=null
        where company_id=p_company_id and store_account_id=a.id and id=v_old.id;
      insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key,reason)
        values(p_company_id,a.id,v_old.id,'remove','maju-admin:'||p_admin_key,left('admin_owner_replaced: '||v_reason,500));
      v_replaced:=v_old.id;
    end if;
  end if;
  insert into public.store_account_members(company_id,store_account_id,auth_user_id,role,status,joined_at)
    values(p_company_id,a.id,p_auth_user_id,p_role,'active',clock_timestamp()) returning * into v_member;
  insert into public.store_account_member_events(company_id,store_account_id,member_id,event_type,actor_user_key,reason)
    values(p_company_id,a.id,v_member.id,'join','maju-admin:'||p_admin_key,left('admin_force_link: '||v_reason,500));
  return jsonb_build_object('id',v_member.id,'role',v_member.role,'status',v_member.status,'replacedOwnerMemberId',v_replaced);
end $$;

revoke all on function public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean) from public,anon,authenticated,service_role;
grant execute on function public.admin_link_store_member_v1(uuid,uuid,text,uuid,text,text,boolean) to service_role;
notify pgrst,'reload schema';
commit;
