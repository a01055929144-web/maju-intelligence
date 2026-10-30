#!/bin/sh
set -eu

case "$(postgres --version)" in
  *"PostgreSQL) 16."*) ;;
  *) echo "PostgreSQL 16 is required" >&2; exit 2 ;;
esac

test_file=${1:?"pass the absolute fixture path"}
data_root=$(mktemp -d /run/shm/maju-dnc-pg16.XXXXXX)
case "$data_root" in
  /run/shm/maju-dnc-pg16.*) ;;
  *) echo "unexpected temporary path" >&2; exit 2 ;;
esac

cleanup() {
  runuser -u postgres -- pg_ctl -D "$data_root/data" -m fast stop >/dev/null 2>&1 || true
  case "$data_root" in
    /run/shm/maju-dnc-pg16.*) rm -rf -- "$data_root" ;;
  esac
}
trap cleanup EXIT HUP INT TERM

mkdir -p "$data_root/data" "$data_root/socket"
chown -R postgres:postgres "$data_root"
runuser -u postgres -- initdb -D "$data_root/data" -A trust -U postgres >/dev/null
runuser -u postgres -- pg_ctl -D "$data_root/data" -o "-F -p 55435 -k $data_root/socket" -w start >/dev/null
runuser -u postgres -- psql \
  -h "$data_root/socket" \
  -p 55435 \
  -U postgres \
  -d postgres \
  -v ON_ERROR_STOP=1 \
  -f "$test_file"
