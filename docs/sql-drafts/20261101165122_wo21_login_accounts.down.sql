-- Review only. Removing login columns destroys account credentials and session state.
begin;
drop index if exists public.app_users_login_id_unique;
alter table public.app_users
  drop constraint if exists app_users_login_id_format,
  drop constraint if exists app_users_session_version_positive,
  drop column if exists login_id,
  drop column if exists password_hash,
  drop column if exists session_version,
  drop column if exists must_change_password,
  drop column if exists login_locked_until;
commit;
