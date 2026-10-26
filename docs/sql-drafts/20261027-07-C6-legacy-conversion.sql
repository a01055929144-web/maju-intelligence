-- 운영 적용 완료(2026-10-27 00:45 KST). 재실행 금지.\n-- 승인된 실행 결과: company_members 5행, 수락된 staff_invitations 3행 변환.
-- 2026-10-27 읽기 전용 드라이런: company_members 5행, 수락된 staff_invitations 3행.
-- 기존 role/status/차량/만료일은 변경하지 않고 C6의 permission_role/duties만 채웁니다.
-- C6 스키마 적용 후, STAFF_ACCESS_V2_ENABLED를 켜기 전에 실행하는 별도 데이터 변환입니다.

begin;
set local lock_timeout = '5s';

do $$
declare
  v_members integer;
  v_invitations integer;
begin
  -- 드라이런 후 직원/초대가 바뀌었다면 전체를 중단하고 다시 집계합니다.
  select count(*) into v_members from public.company_members;
  select count(*) into v_invitations from public.staff_invitations where status = 'accepted';
  if v_members <> 5 or v_invitations <> 3 then
    raise exception 'C6 dry-run counts changed: members %, accepted invitations %', v_members, v_invitations;
  end if;

  if exists (
    select 1 from public.company_members
     where role not in ('owner', 'manager', 'driver', 'sales')
        or permission_role is not null
        or cardinality(duties) <> 0
  ) then
    raise exception 'C6 member roles or access fields changed; rerun the dry-run';
  end if;

  if exists (
    select 1
      from public.staff_invitations si
      left join public.company_members cm
        on cm.company_id = si.company_id and cm.user_id = si.accepted_by
     where si.status = 'accepted'
       and (si.role not in ('owner', 'manager', 'driver', 'sales')
         or si.permission_role is not null
         or cardinality(si.duties) <> 0
         or cm.id is null
         or cm.role is distinct from si.role)
  ) then
    raise exception 'C6 accepted invitations do not match active conversion plan';
  end if;

  update public.company_members
     set permission_role = case role
           when 'owner' then 'owner'
           when 'manager' then 'manager'
           else 'staff'
         end,
         duties = case role
           when 'driver' then array['delivery']::text[]
           when 'sales' then array['sales']::text[]
           else array['sales', 'delivery']::text[]
         end
   where role in ('owner', 'manager', 'driver', 'sales')
     and permission_role is null
     and cardinality(duties) = 0;
  get diagnostics v_members = row_count;
  if v_members <> 5 then raise exception 'C6 member conversion changed % rows, expected 5', v_members; end if;

  -- 이 UPDATE는 C6 동기화 트리거를 호출합니다. 대응하는 회사 소속에도 같은 값이 기록됩니다.
  update public.staff_invitations
     set permission_role = case role
           when 'owner' then 'owner'
           when 'manager' then 'manager'
           else 'staff'
         end,
         duties = case role
           when 'driver' then array['delivery']::text[]
           when 'sales' then array['sales']::text[]
           else array['sales', 'delivery']::text[]
         end
   where status = 'accepted'
     and role in ('owner', 'manager', 'driver', 'sales')
     and permission_role is null
     and cardinality(duties) = 0;
  get diagnostics v_invitations = row_count;
  if v_invitations <> 3 then raise exception 'C6 invitation conversion changed % rows, expected 3', v_invitations; end if;
end;
$$;

select company_id, status, role, permission_role, duties, count(*) as members
  from public.company_members
 group by company_id, status, role, permission_role, duties
 order by company_id, role;

commit;

-- 플래그 ON 선행 점검: 회사마다 active owner가 있는지 조회해야 합니다.
-- 현재 본사(04ebb7bb-8da0-4723-8211-f2a947939344)는 owner 소속이 inactive입니다.
-- 이 스크립트는 해당 상태를 바꾸지 않으며, 활성화 여부는 별도 운영 판단이 필요합니다.
