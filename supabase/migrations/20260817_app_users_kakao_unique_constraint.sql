-- 20260724_staff_kakao_mobile.sql에서 만든 idx_app_users_kakao_user_id는
-- "where kakao_user_id is not null" 조건이 붙은 부분(partial) 유니크 인덱스입니다.
-- 카카오 로그인 콜백(app/api/auth/kakao/callback -> lib/store.ts)이
-- app_users?on_conflict=kakao_user_id 로 upsert를 보내면, PostgREST는
-- 조건 없는 일반 ON CONFLICT (kakao_user_id)를 생성합니다.
-- Postgres는 조건부(partial) 인덱스를 조건 없는 ON CONFLICT 대상으로 매칭할 수 없어
-- "42P10 there is no unique or exclusion constraint matching the ON CONFLICT specification"
-- 오류로 카카오 가입/로그인이 실패합니다.
--
-- 일반 유니크 인덱스는 NULL 값끼리는 서로 다른 값으로 취급되어 여러 행이 kakao_user_id
-- NULL이어도 문제가 없으므로, partial 조건 없이 다시 만들면 안전하게 동일한 효과를 냅니다.

drop index if exists public.idx_app_users_kakao_user_id;

create unique index if not exists idx_app_users_kakao_user_id
  on public.app_users(kakao_user_id);

-- 스키마 변경 후 PostgREST가 새 인덱스를 인식하도록 캐시를 갱신합니다.
notify pgrst, 'reload schema';
