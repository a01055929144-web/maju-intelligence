\set ON_ERROR_STOP on

set role service_role;

do $$
declare
  v_result record;
begin
  select * into v_result from public.record_staff_session_observation(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
    repeat('a', 64), 'application_cookie', repeat('c', 64), clock_timestamp() + interval '1 hour'
  );
  assert v_result.recorded and v_result.active_device_count = 1 and not v_result.concurrent_devices;

  select * into v_result from public.record_staff_session_observation(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
    repeat('a', 64), 'application_cookie', repeat('c', 64), clock_timestamp() + interval '1 hour'
  );
  assert not v_result.recorded and v_result.active_device_count = 1;

  -- 같은 세션 해시를 다른 기기에서 재사용해도 기기별로 관찰한다.
  select * into v_result from public.record_staff_session_observation(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
    repeat('b', 64), 'application_cookie', repeat('c', 64), clock_timestamp() + interval '1 hour'
  );
  assert v_result.recorded and v_result.active_device_count = 2 and v_result.concurrent_devices;
  assert (select count(*) from public.staff_account_sessions where user_id = '00000000-0000-0000-0000-000000000011') = 2;

  -- 만료된 비철회 행은 유효한 새 만료 시각으로 관찰을 재개한다.
  update public.staff_account_sessions
     set expires_at = clock_timestamp() - interval '1 minute'
   where device_hash = repeat('a', 64);
  select * into v_result from public.record_staff_session_observation(
    '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
    repeat('a', 64), 'application_cookie', repeat('c', 64), clock_timestamp() + interval '1 hour'
  );
  assert v_result.recorded;

  begin
    perform public.record_staff_session_observation(
      '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
      null, 'application_cookie', repeat('d', 64), clock_timestamp() + interval '1 hour'
    );
    assert false, 'NULL device hash was accepted';
  exception when sqlstate '22023' then null;
  end;

  begin
    perform public.record_staff_session_observation(
      '00000000-0000-0000-0000-000000000002', '00000000-0000-0000-0000-000000000011',
      repeat('d', 64), 'application_cookie', repeat('d', 64), clock_timestamp() + interval '1 hour'
    );
    assert false, 'cross-company observation was accepted';
  exception when sqlstate '42501' then null;
  end;

  begin
    perform public.record_staff_session_observation(
      '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000012',
      repeat('e', 64), 'application_cookie', repeat('e', 64), clock_timestamp() + interval '1 hour'
    );
    assert false, 'inactive member observation was accepted';
  exception when sqlstate '42501' then null;
  end;

  update public.company_members
     set permission_role = 'temporary', membership_expires_at = clock_timestamp() - interval '1 second'
   where user_id = '00000000-0000-0000-0000-000000000011';
  begin
    perform public.record_staff_session_observation(
      '00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000011',
      repeat('f', 64), 'application_cookie', repeat('f', 64), clock_timestamp() + interval '1 hour'
    );
    assert false, 'expired temporary member observation was accepted';
  exception when sqlstate '42501' then null;
  end;

end;
$$;

reset role;

do $$ begin
  assert (select count(*) from public.staff_security_alerts) = 1;
  assert (select marker from public.staff_security_alerts limit 1) = 'sentinel';
end $$;

select 'session observation PG16 assertions passed' as result;
