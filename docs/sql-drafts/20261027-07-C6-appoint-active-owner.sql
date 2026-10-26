-- REVIEW ONLY. 대표 승인 전 운영 실행 금지.
-- 목적: 본사(04ebb7bb...)에 활성 대표가 0명인 상태에서 정두영 소속 1건을 대표로 지정.
-- 근거: companies.owner_name='정두영'; 정두영 app_users는 active/customer_member,
--       company_members는 active/driver + permission_role=staff + duties={delivery},
--       수락된 초대도 driver/staff/{delivery}. 기존 대표 정동규 소속은 inactive로 유지.
-- 적용 전마다 이 조건을 다시 검사하며 하나라도 달라지면 전체 트랜잭션을 중단한다.
-- 중요: C6 RPC는 legacy company_members.role도 driver→owner로 바꾼다.
-- STAFF_ACCESS_V2_ENABLED가 OFF인 현재 /mobile 진입은 legacy role='driver'만
-- /mobile/today로 보내므로, 이 SQL을 단독 적용하면 정두영의 기본 화면이
-- /mobile/sales로 바뀔 수 있다. permission_role만 owner로 바꾸는 대안은
-- getCustomerSession/getActiveCustomerMembership의 실제 권한이 legacy role을
-- 사용하므로 대표 권한을 주지 못한다.
-- 따라서 운영 적용 전 모바일 기본 진입/기사 접근 코드를 보완하고 배포 순서를
-- 확정해야 한다. 이 파일만 승인·실행해서는 안 된다. 플래그는 현재 OFF로 유지.

begin;
set transaction isolation level serializable;
set local lock_timeout = '5s';

do $$
declare
  v_company constant uuid := '04ebb7bb-8da0-4723-8211-f2a947939344';
  v_user constant uuid := 'c14166d1-52e5-4d0c-b900-97c7b11a812a';
  v_member constant uuid := '6005b2ae-8168-4470-ad23-60009fcddca8';
  v_invitation constant uuid := '8c84e4ab-b904-4677-9763-88ef1030b17a';
  v_previous_owner constant uuid := '795af880-d944-4302-8c4a-8a9890689c04';
  v_vehicle text;
begin
  if not exists (
    select 1 from public.companies
     where id = v_company and status = 'active' and owner_name = '정두영'
  ) then raise exception 'C6 owner appointment: company precondition changed'; end if;

  if not exists (
    select 1 from public.app_users
     where id = v_user and name = '정두영' and status = 'active'
  ) then raise exception 'C6 owner appointment: user precondition changed'; end if;

  if not exists (
    select 1 from public.company_members
     where id = v_member and company_id = v_company and user_id = v_user
       and status = 'active' and role = 'driver' and permission_role = 'staff'
       and duties = array['delivery']::text[]
  ) then raise exception 'C6 owner appointment: target membership changed'; end if;

  if not exists (
    select 1 from public.company_members
     where id = v_previous_owner and company_id = v_company
       and status = 'inactive' and role = 'owner' and permission_role = 'owner'
  ) then raise exception 'C6 owner appointment: previous owner record changed'; end if;

  if (
    select count(*) from public.company_members
     where company_id = v_company and status = 'active'
       and (role = 'owner' or permission_role = 'owner')
  ) <> 0 then raise exception 'C6 owner appointment: an active owner already exists'; end if;

  select assigned_vehicle into v_vehicle
    from public.staff_invitations
   where id = v_invitation and company_id = v_company and accepted_by = v_user
     and status = 'accepted' and employee_name = '정두영'
     and role = 'driver' and permission_role = 'staff'
     and duties = array['delivery']::text[] and membership_expires_at is null
   for update;
  if not found or v_vehicle is distinct from '의정부' then
    raise exception 'C6 owner appointment: accepted invitation changed';
  end if;

  -- 기존 C6 RPC를 사용하므로 초대·소속을 함께 바꾸고 관리자 감사 로그도 남긴다.
  -- app_users.role, 두 소속의 status, 기존 대표, 차량/권역 연결은 변경하지 않는다.
  perform public.update_staff_access_v2(
    v_company, v_invitation, null, true,
    'owner', array['sales', 'delivery']::text[], null, v_vehicle
  );

  if not exists (
    select 1 from public.company_members
     where id = v_member and company_id = v_company and user_id = v_user
       and status = 'active' and role = 'owner' and permission_role = 'owner'
       and duties = array['sales', 'delivery']::text[]
  ) or (
    select count(*) from public.company_members
     where company_id = v_company and status = 'active'
       and (role = 'owner' or permission_role = 'owner')
  ) <> 1 then raise exception 'C6 owner appointment: postcondition failed'; end if;
end;
$$;

select company_id, role, permission_role, duties, status, count(*) as members
  from public.company_members
 where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344'
 group by company_id, role, permission_role, duties, status
 order by status, role;

commit;

-- 롤백: COMMIT 전 오류는 자동으로 전체 롤백된다. COMMIT 후 역할 되돌리기는
-- 먼저 다른 활성 대표를 지정한 뒤 별도 승인 SQL로 수행해야 한다. 현재 기존 대표 소속은
-- inactive이므로 정두영을 바로 driver로 되돌리면 다시 활성 대표 0명이 된다.
-- 운영 검증에는 대표 설정 접근뿐 아니라 /mobile 기본 진입·오늘 코스·기사 업무를 포함한다.

