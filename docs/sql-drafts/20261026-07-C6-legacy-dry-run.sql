-- 읽기 전용 드라이런. 기존 직원과 수락된 초대의 권한/업무 변환 예상치만 확인한다.
-- 이 파일에는 UPDATE가 없다. 미분류 역할은 자동으로 쓰지 않고 검토 대상으로 남긴다.
with legacy as (
  select 'company_members'::text as source, company_id, role, permission_role, duties
    from public.company_members
  union all
  select 'staff_invitations'::text as source, company_id, role, permission_role, duties
    from public.staff_invitations
   where status = 'accepted'
), proposed as (
  select source, company_id, role, permission_role, duties,
    case
      when role = 'owner' then 'owner'
      when role = 'manager' then 'manager'
      when role = 'temporary' then 'temporary'
      when role in ('driver', 'sales', 'member') then 'staff'
      else null
    end as proposed_permission_role,
    case
      when role = 'driver' then array['delivery']::text[]
      when role = 'sales' then array['sales']::text[]
      when role in ('owner', 'manager') then array['sales', 'delivery']::text[]
      else null
    end as proposed_duties
  from legacy
)
select company_id, source, role, proposed_permission_role, proposed_duties,
       count(*) as row_count,
       count(*) filter (where proposed_permission_role is null or proposed_duties is null) as needs_manual_review,
       count(*) filter (where permission_role is not null or cardinality(duties) > 0) as already_set
  from proposed
 group by company_id, source, role, proposed_permission_role, proposed_duties
 order by company_id, source, role;
