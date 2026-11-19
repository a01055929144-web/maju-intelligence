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
setup() {
 unset PGOPTIONS
 db="promotion_tax_backup_test_$1"; createdb "$db"; run -f tests/sql/fixtures/promotion-tax-private-backup.sql
 # Fixed synthetic identity, independently of the candidate selector and document revision.
 guard=$(psql -d "$db" -At -v ON_ERROR_STOP=1 -c "select encode(sha256(convert_to(jsonb_build_object(
  'company_id',md5('synthetic-company-1')::uuid,'document_id',md5('synthetic-document')::uuid,
  'promotion_ids',(select jsonb_agg(id order by id) from (select md5('synthetic-promotion-'||n)::uuid id from generate_series(1,3) n) ids)
 )::text,'UTF8')),'hex');")
 export PGOPTIONS="-c maju.promotion_tax_scope_hash=$guard"
}
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
echo 'revision22_28_lines_three_rows_price_zero_publications_acl_restore_PASS'

setup revision20
run -c "update public.pricing_documents set revision=20,content=jsonb_set(content,'{lines}',(select jsonb_agg(l order by n) from jsonb_array_elements(content->'lines') with ordinality a(l,n) where n<=20));"
run -f "$up"
run -f "$down"
echo 'revision20_20_lines_compatibility_PASS'

setup revision19
run -c "update public.pricing_documents set revision=19;"
run -f "$up"
run -c "do \$\$ begin assert (select count(*) from promotion_tax_backup_20261119.promotion_rows where after_row->>'tax_type'='exempt')=3; end \$\$;"
run -f "$down"
echo 'revision19_compatibility_PASS'

setup missing_guard
unset PGOPTIONS
reject "$up"; assert_untouched
grep -q 'promotion_tax_private_scope_guard_required' /tmp/expected.log
echo 'missing_private_scope_guard_rollback_PASS'

setup wrong_guard
export PGOPTIONS="-c maju.promotion_tax_scope_hash=$(printf '%064d' 0)"
reject "$up"; assert_untouched
grep -q 'promotion_tax_candidate_count_mismatch' /tmp/expected.log
echo 'wrong_private_scope_guard_rollback_PASS'

setup swapped_target
run -c "insert into public.pricing_promotions select md5('synthetic-swapped-promotion')::uuid,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,allow_sheet,badge,revision from public.pricing_promotions where id=md5('synthetic-promotion-1')::uuid; update public.pricing_documents set content=jsonb_set(content,'{lines,2,promotionId}',to_jsonb(md5('synthetic-swapped-promotion')::uuid));"
reject "$up"; assert_untouched
grep -q 'promotion_tax_candidate_count_mismatch' /tmp/expected.log
echo 'same_count_swapped_target_scope_rollback_PASS'

setup ambiguous
run -c "insert into public.pricing_documents(id,company_id,owner_key,kind,revision,content) select md5('synthetic-other-document')::uuid,company_id,owner_key,kind,21,content from public.pricing_documents;"
run -f "$up"
run -c "do \$\$ begin assert (select count(*) from promotion_tax_backup_20261119.promotion_rows)=3; assert (select revision from public.pricing_documents where id=md5('synthetic-other-document')::uuid)=21; end \$\$;"
run -f "$down"
echo 'private_scope_excludes_other_matching_document_PASS'

setup changed_while_locking
sed "s/-- SYNTHETIC_DOCUMENT_LOCK_INJECTION_POINT./update public.pricing_documents set revision=revision+1 where id=document_id;/" "$up" >/tmp/document-changed.sql
reject /tmp/document-changed.sql; assert_untouched
grep -q 'promotion_tax_document_changed_while_locking' /tmp/expected.log
run -c "do \$\$ begin assert (select revision from public.pricing_documents)=22; end \$\$;"
echo 'document_change_before_lock_atomic_rollback_PASS'

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
