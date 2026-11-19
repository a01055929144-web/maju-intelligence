#!/usr/bin/env bash
# Run only inside a fresh, network-disabled postgres:17 container, /repo mounted read-only.
set -euo pipefail
test "${PGDATA:-}" = /tmp/promotion-tax-backup-data
test ! -e "$PGDATA"
export PGHOST=/tmp PGPORT=5432 PGUSER=postgres
initdb -A trust >/tmp/init.log
pg_ctl -D "$PGDATA" -o '-k /tmp' -l /tmp/postgres.log start >/tmp/start.log
trap 'pg_ctl -D "$PGDATA" -m immediate stop >/dev/null' EXIT
cd /repo
up=docs/sql-drafts/2026-11-19-promotion-tax-private-backup.sql
down=docs/sql-drafts/2026-11-19-promotion-tax-private-backup.down.sql
run() { psql -d "$db" -v ON_ERROR_STOP=1 "$@" >/tmp/test.log 2>&1 || { tail -20 /tmp/test.log; exit 1; }; }
setup() { db="promotion_tax_backup_test_$1"; createdb "$db"; run -f tests/sql/fixtures/promotion-tax-private-backup.sql; }
reject() { if psql -d "$db" -v ON_ERROR_STOP=1 -f "$1" >/tmp/expected.log 2>&1; then echo 'unexpected_success'; exit 1; fi; }
assert_untouched() {
 run -c "do \$\$ begin
  assert to_regnamespace('promotion_tax_backup_20261119') is null;
  assert not exists(select 1 from public.test_before_rows b join public.pricing_promotions p using(id) where b.kind='promotion' and b.body<>to_jsonb(p));
 end \$\$;"
}

setup success
run -f "$up"
run -c "do \$\$ declare r text; begin
 assert (select count(*) from promotion_tax_backup_20261119.promotion_rows)=3;
 assert (select count(*) from promotion_tax_backup_20261119.promotion_rows b join public.pricing_promotions p on p.company_id=b.company_id and p.id=b.promotion_id where p.tax_type='exempt' and p.revision=2 and p.price=(b.before_row->>'price')::bigint)=3;
 assert (select relrowsecurity from pg_class where oid='promotion_tax_backup_20261119.promotion_rows'::regclass);
 foreach r in array array['anon','authenticated','service_role'] loop
  assert not has_schema_privilege(r,'promotion_tax_backup_20261119','usage');
  assert not has_table_privilege(r,'promotion_tax_backup_20261119.promotion_rows','select');
 end loop;
 assert not exists(select 1 from public.test_before_rows b join public.pricing_document_versions v using(id) where b.kind='publication' and b.body<>to_jsonb(v));
 assert not exists(select 1 from public.test_before_rows b join public.pricing_documents d using(id) where b.kind='draft' and b.body<>to_jsonb(d));
 assert not exists(select 1 from public.test_before_rows b join public.pricing_promotions p using(id) where b.kind='promotion' and p.id not in(select promotion_id from promotion_tax_backup_20261119.promotion_rows) and b.body<>to_jsonb(p));
 end \$\$;"
run -f "$down"
run -c "do \$\$ begin
 assert (select count(*) from promotion_tax_backup_20261119.promotion_rows where restored_at is not null)=3;
 assert not exists(select 1 from public.test_before_rows b join public.pricing_promotions p using(id) where b.kind='promotion' and b.body-array['revision','updated_at']<>to_jsonb(p)-array['revision','updated_at']);
 assert (select count(*) from public.pricing_promotions where revision=3)=3;
 end \$\$;"
echo 'three_rows_price_zero_publications_acl_restore_PASS'

setup count
run -c "update public.pricing_documents set content=jsonb_set(content,'{lines,0,promotionId}','null');"
reject "$up"; assert_untouched
echo 'target_count_mismatch_atomic_rollback_PASS'

setup price
run -c "update public.pricing_promotions set price=price+1 where id=md5('synthetic-promotion-1')::uuid; update public.test_before_rows b set body=to_jsonb(p) from public.pricing_promotions p where b.kind='promotion' and b.id=p.id;"
reject "$up"; assert_untouched
echo 'price_mismatch_atomic_rollback_PASS'

setup failure
sed "s/-- SYNTHETIC_FAILURE_INJECTION_POINT (isolated tests only)./raise exception 'synthetic_after_write_failure';/" "$up" >/tmp/injected.sql
reject /tmp/injected.sql; assert_untouched
grep -q 'synthetic_after_write_failure' /tmp/expected.log
echo 'failure_after_backup_and_write_atomic_rollback_PASS'

setup conflict
run -f "$up"
run -c "update public.pricing_promotions set revision=revision+1 where id=md5('synthetic-promotion-1')::uuid;"
reject "$down"
run -c "do \$\$ begin
 assert (select count(*) from promotion_tax_backup_20261119.promotion_rows where restored_at is null)=3;
 assert (select count(*) from public.pricing_promotions where tax_type='exempt')=3;
 end \$\$;"
grep -q 'promotion_tax_restore_refused_later_change' /tmp/expected.log
echo 'restore_refuses_later_change_PASS'
