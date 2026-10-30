\set ON_ERROR_STOP on

do $$ begin
  assert not exists (
    select 1 from information_schema.columns
     where table_schema = 'public'
       and table_name = 'staff_account_sessions'
       and column_name in ('session_source', 'session_hash', 'expires_at')
  ), 'review-only columns remained after rollback';
  assert to_regprocedure(
    'public.record_staff_session_observation(uuid,uuid,text,text,text,timestamptz)'
  ) is null, 'review-only function remained after rollback';
  assert (select count(*) from public.staff_security_alerts) = 1,
    'alert sentinel changed during rollback test';
end $$;

select 'session observation rollback passed' as result;
