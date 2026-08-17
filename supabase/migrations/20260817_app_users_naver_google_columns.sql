-- 네이버/구글 소셜 로그인을 카카오와 동일한 방식으로 추가하기 위한 컬럼입니다.
-- 20260817_app_users_kakao_unique_constraint.sql에서 확인한 것처럼 PostgREST의
-- on_conflict=컬럼명 upsert는 조건 없는(non-partial) 유니크 인덱스가 있어야 동작하므로
-- 처음부터 partial 조건 없이 만듭니다.

alter table public.app_users
  add column if not exists naver_user_id text,
  add column if not exists google_user_id text;

create unique index if not exists idx_app_users_naver_user_id
  on public.app_users(naver_user_id);

create unique index if not exists idx_app_users_google_user_id
  on public.app_users(google_user_id);

notify pgrst, 'reload schema';
