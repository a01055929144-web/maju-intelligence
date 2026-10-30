#!/bin/sh
set -eu

: "${PGHOST:=/tmp/pg95sock}"
: "${PGPORT:=55495}"
: "${PGUSER:=postgres}"
: "${PGDATABASE:=postgres}"

psql_cmd="psql -X -q -A -t -v ON_ERROR_STOP=1 -h $PGHOST -p $PGPORT -U $PGUSER -d $PGDATABASE"
a_out=$(mktemp)
b_out=$(mktemp)
trap 'rm -f "$a_out" "$b_out"' EXIT

$psql_cmd -c "delete from public.staff_account_sessions where user_id = '00000000-0000-0000-0000-000000000013'" >/dev/null

$psql_cmd -c "set role service_role; begin; select recorded, active_device_count, concurrent_devices from public.record_staff_session_observation('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', repeat('1', 64), 'application_cookie', repeat('3', 64), clock_timestamp() + interval '1 hour'); select pg_sleep(2); commit" >"$a_out" &
a_pid=$!
sleep 0.2
$psql_cmd -c "set role service_role; select recorded, active_device_count, concurrent_devices from public.record_staff_session_observation('00000000-0000-0000-0000-000000000001', '00000000-0000-0000-0000-000000000013', repeat('2', 64), 'application_cookie', repeat('4', 64), clock_timestamp() + interval '1 hour')" >"$b_out" &
b_pid=$!

wait "$a_pid"
wait "$b_pid"

a_result=$(grep -m1 '|' "$a_out")
b_result=$(grep -m1 '|' "$b_out")
device_count=$($psql_cmd -c "select count(distinct device_hash) from public.staff_account_sessions where user_id = '00000000-0000-0000-0000-000000000013'")

test "$a_result" = "t|1|f"
test "$b_result" = "t|2|t"
test "$device_count" = "2"
printf 'concurrent session observation passed: A=%s B=%s devices=%s\n' "$a_result" "$b_result" "$device_count"
