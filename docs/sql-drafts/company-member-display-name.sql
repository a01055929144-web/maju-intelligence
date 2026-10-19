-- REVIEW ONLY. 운영 DB 실행 금지. 회사별 직원 표시 이름의 장기 모델 초안입니다.
begin;

alter table public.company_members
  add column if not exists display_name text;

do $$
begin
  if not exists (
    select 1 from pg_constraint where conname = 'company_members_display_name_length_ck'
  ) then
    alter table public.company_members
      add constraint company_members_display_name_length_ck
      check (display_name is null or char_length(btrim(display_name)) between 1 and 80);
  end if;
end $$;

comment on column public.company_members.display_name is
  '회사별 직원 표시 이름. app_users.name은 소셜 프로필 원본으로 유지하며 회사 업무 화면은 이 값을 우선 사용한다.';

-- 적용 시 별도 승인 후 수행할 백필 예시. 현재 운영 데이터는 수정하지 않는다.
-- update public.company_members cm
-- set display_name = source.employee_name
-- from lateral (
--   select si.employee_name
--   from public.staff_invitations si
--   where si.company_id = cm.company_id
--     and si.accepted_by = cm.user_id
--     and si.status = 'accepted'
--     and nullif(btrim(si.employee_name), '') is not null
--   order by si.accepted_at desc nulls last, si.created_at desc
--   limit 1
-- ) source
-- where cm.display_name is null;

commit;

-- 롤백(승인 후 별도 실행):
-- alter table public.company_members drop constraint if exists company_members_display_name_length_ck;
-- alter table public.company_members drop column if exists display_name;
