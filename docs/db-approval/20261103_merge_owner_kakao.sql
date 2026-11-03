-- 11/3 22:21 대표 요청: 운영 아이디(admin)와 대표 카카오를 한 계정으로 연결.
-- 현재: admin 계정(5681adcd, 아이디 로그인) 소속이 21:56 '연결 해제'로 비활성 → 로그인 불가.
--       대표 카카오 계정(c14166d1)은 별도 계정으로 같은 회사 대표 소속.
-- 조치: 카카오 식별자를 admin 계정으로 옮기고, admin 소속 재활성화, 카카오 전용 계정 소속은 비활성(백업 후).
begin;
create table if not exists backup_20261103.merge_owner_kakao_users as
  select * from public.app_users where id in ('5681adcd-d19e-48ed-984b-5548a59081f4','c14166d1-52e5-4d0c-b900-97c7b11a812a');
create table if not exists backup_20261103.merge_owner_kakao_members as
  select * from public.company_members where user_id in ('5681adcd-d19e-48ed-984b-5548a59081f4','c14166d1-52e5-4d0c-b900-97c7b11a812a');

update public.app_users set kakao_user_id = null, status = 'inactive'
 where id = 'c14166d1-52e5-4d0c-b900-97c7b11a812a';
update public.app_users u
   set kakao_user_id = b.kakao_user_id, avatar_url = coalesce(u.avatar_url, b.avatar_url), session_version = u.session_version + 1
  from backup_20261103.merge_owner_kakao_users b
 where u.id = '5681adcd-d19e-48ed-984b-5548a59081f4' and b.id = 'c14166d1-52e5-4d0c-b900-97c7b11a812a';
update public.company_members set status = 'active', updated_at = now()
 where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344' and user_id = '5681adcd-d19e-48ed-984b-5548a59081f4';
update public.company_members set status = 'inactive', updated_at = now()
 where company_id = '04ebb7bb-8da0-4723-8211-f2a947939344' and user_id = 'c14166d1-52e5-4d0c-b900-97c7b11a812a';
commit;
