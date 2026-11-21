#!/usr/bin/env bash
set -euo pipefail
[[ ${PGHOST:-} == 127.0.0.1 && ${PGDATABASE:-} == cx93_industry_guard_test ]] || exit 2
cd "$(dirname "$0")/.."
psql -X -v ON_ERROR_STOP=1 -f docs/sql-drafts/2026-11-21-CX-93-store-industry-guard.pg17.test.sql
q() { psql -X -v ON_ERROR_STOP=1 -Atqc "$1"; }
# The marker proves the guarded write has acquired its locks before the competing call.
q "begin; select cx93_fixture_connect('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003'); select pg_advisory_xact_lock(93001); select pg_sleep(4); commit;" >/tmp/cx93-first.log &
first=$!
ready=false
for i in {1..100}; do
  if [[ $(q 'select not pg_try_advisory_lock(93001)') == t ]]; then ready=true; break; fi
  sleep .03
done
[[ $ready == true ]]
if q "select cx93_fixture_connect('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004');" 2>/tmp/cx93-rejected.log; then exit 1; fi
wait "$first"
grep -q same_industry_connection /tmp/cx93-rejected.log
[[ $(q "select count(*) from store_accounts where store_profile_id='20000000-0000-4000-8000-000000000003'") == 1 ]]
# An aborted connection releases its lock and leaves no phantom rejection or partial row.
q "delete from store_accounts where store_profile_id='20000000-0000-4000-8000-000000000003'"
q "begin; select cx93_fixture_connect('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000003'); select pg_advisory_xact_lock(93003); select pg_sleep(4); rollback;" >/tmp/cx93-rollback.log &
rollbacker=$!
ready=false
for i in {1..100}; do
  if [[ $(q 'select not pg_try_advisory_lock(93003)') == t ]]; then ready=true; break; fi
  sleep .03
done
[[ $ready == true ]]
q "select cx93_fixture_connect('10000000-0000-4000-8000-000000000003','20000000-0000-4000-8000-000000000003','50000000-0000-4000-8000-000000000003','30000000-0000-4000-8000-000000000004');"
wait "$rollbacker"
[[ $(q "select count(*) from store_accounts where store_profile_id='20000000-0000-4000-8000-000000000003'") == 1 ]]
if q "begin isolation level repeatable read; select check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001');" 2>/tmp/cx93-isolation.log; then exit 1; fi
grep -q cx93_read_committed_required /tmp/cx93-isolation.log
# Parent #1240 assignment changes must wait for the verdict transaction's company lock.
q "begin; select assert_store_distributor_industry_v1('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001'); select pg_advisory_xact_lock(93002); select pg_sleep(4); commit;" >/tmp/cx93-check.log &
checker=$!
ready=false
for i in {1..100}; do
  if [[ $(q 'select not pg_try_advisory_lock(93002)') == t ]]; then ready=true; break; fi
  sleep .03
done
[[ $ready == true ]]
PGAPPNAME=cx93-admin-race q "select admin_set_company_distributor_industries('10000000-0000-4000-8000-000000000001',array['40000000-0000-4000-8000-000000000002'::uuid],'synthetic admin','a-race');" >/tmp/cx93-admin.log &
writer=$!
blocked=false
for i in {1..100}; do
  if [[ $(q "select exists(select 1 from pg_stat_activity where application_name='cx93-admin-race' and wait_event_type='Lock')") == t ]]; then blocked=true; break; fi
  sleep .03
done
[[ $blocked == true ]]
wait "$checker"
wait "$writer"
[[ $(q "select check_store_distributor_industry_v1('10000000-0000-4000-8000-000000000002','20000000-0000-4000-8000-000000000001','50000000-0000-4000-8000-000000000001')") == same_industry_connection ]]
psql -X -v ON_ERROR_STOP=1 -c 'drop function cx93_fixture_connect(uuid,uuid,uuid,uuid)'
psql -X -v ON_ERROR_STOP=1 -f docs/sql-drafts/2026-11-21-CX-93-store-industry-guard.down.sql
[[ $(q "select to_regprocedure('public.check_store_distributor_industry_v1(uuid,uuid,uuid)') is null and (select count(*) from store_accounts)=3 and to_regclass('public.company_distributor_industries') is not null") == t ]]
echo 'CX93 PG17: verdicts, isolation, concurrent connection, no partial write, down PASS'
