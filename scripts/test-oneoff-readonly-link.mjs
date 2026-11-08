import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
import { Client } from 'pg';
import { issueStoreLinkToken, verifyStoreLinkToken } from '../lib/pricing/store-link-token.ts';

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'oneoff_readonly_link_test');
process.env.STORE_LINK_SECRET = 'synthetic-oneoff-link-test-secret-not-for-production';
const a = new Client(), b = new Client();
await a.connect(); await b.connect();
const company = '00000000-0000-4000-8000-000000000001';
const customer = '20000000-0000-4000-8000-000000000001';
const version = '80000000-0000-4000-8000-000000000001';
const expiry = new Date(Date.now() + 86_400_000).toISOString();
const sql = await readFile(new URL('../docs/sql-drafts/20261108-09-oneoff-readonly-link.sql', import.meta.url), 'utf8');
const [issue, disable] = sql.split('-- TEST_BOUNDARY_AFTER_ISSUE: another connection must see no newly inserted link.');
assert(disable);
const makeInput = () => {
  const id = randomUUID(), signed = issueStoreLinkToken(id);
  return [{ id, customerId: customer, nonce: signed.nonce, hash: signed.hash, canOrder: false }];
};
async function run(links, failAt) {
  await a.query('begin');
  try {
    await a.query('create temporary table oneoff_readonly_link_input(company_id uuid,document_version_id uuid,links jsonb,expires_at timestamptz,actor_user_id uuid,actor_key text) on commit drop');
    await a.query('insert into oneoff_readonly_link_input values($1,$2,$3,$4,null,$5)', [company, version, JSON.stringify(links), expiry, 'b'.repeat(64)]);
    await a.query(issue);
    const outside = (await b.query('select can_order from storefront_links where id=$1', [links[0].id])).rows;
    assert(outside.length === 0 || (outside.length === 1 && outside[0].can_order === false));
    if (failAt === 'issue') throw new Error('synthetic_failure_after_issue');
    await a.query(disable);
    if (failAt === 'update') throw new Error('synthetic_failure_after_update');
    const result = (await a.query('select issued_link_id,was_created from oneoff_readonly_link_result')).rows[0];
    await a.query('commit');
    return result; // Never release a result or URL before COMMIT succeeds.
  } catch (error) { await a.query('rollback'); throw error; }
}
try {
  assert.equal((await a.query('show server_version_num')).rows[0].server_version_num.slice(0,2), '17');
  const identitySql = "select oid::text,proacl::text,md5(pg_get_functiondef(oid)) hash,prosecdef from pg_proc where oid='public.issue_storefront_links(uuid,uuid,jsonb,timestamptz,uuid,text)'::regprocedure";
  const before = (await a.query(identitySql)).rows;
  await a.query('set role service_role');
  const normal = makeInput(); delete normal[0].canOrder;
  normal[0].customerId = '20000000-0000-4000-8000-000000000003';
  await a.query('select * from issue_storefront_links($1,$2,$3,$4,null,$5)', [company, version, JSON.stringify(normal), expiry, 'b'.repeat(64)]);
  assert.equal((await b.query('select can_order from storefront_links where id=$1', [normal[0].id])).rows[0].can_order, true);
  const conflicting = makeInput(); conflicting[0].customerId = normal[0].customerId;
  await assert.rejects(run(conflicting), /oneoff_existing_link_conflict/);
  assert.equal((await b.query('select can_order from storefront_links where id=$1', [normal[0].id])).rows[0].can_order, true);
  await a.query('update storefront_links set revoked_at=now(),can_order=false where id=$1', [normal[0].id]);
  await assert.rejects(run(conflicting), /oneoff_existing_link_conflict/);
  for (const failAt of ['issue', 'update']) {
    const input = makeInput();
    await assert.rejects(run(input, failAt), /synthetic_failure_after_/);
    assert.equal((await b.query('select count(*) n from storefront_links where id=$1', [input[0].id])).rows[0].n, '0');
  }
  const wrongCompany = makeInput(); wrongCompany[0].customerId = '20000000-0000-4000-8000-000000000002';
  await assert.rejects(run(wrongCompany), /Duplicate or cross-company customer/);
  assert.equal((await b.query('select count(*) n from storefront_links where id=$1', [wrongCompany[0].id])).rows[0].n, '0');
  const input = makeInput();
  const first = await run(input); assert.equal(first.was_created, true);
  const retry = await run(input); assert.equal(retry.was_created, false); assert.equal(first.issued_link_id, retry.issued_link_id);
  const rows = (await b.query('select id,token_nonce,token_hash,can_order from storefront_links where id=$1', [first.issued_link_id])).rows;
  assert.equal(rows.length, 1); assert.equal(rows[0].can_order, false);
  const recovered = issueStoreLinkToken(rows[0].id, rows[0].token_nonce);
  assert.equal(recovered.hash, rows[0].token_hash); assert.equal(verifyStoreLinkToken(recovered.token)?.id, first.issued_link_id);
  await a.query('update storefront_links set revoked_at=now(),can_order=false where id=$1', [first.issued_link_id]);
  assert.equal((await a.query('select record_storefront_view($1,$2) recorded', [recovered.hash, 'desktop'])).rows[0].recorded, false);
  assert.equal((await b.query('select count(*) n from store_orders')).rows[0].n, '0');
  assert.equal((await b.query('select count(*) n from storefront_link_events')).rows[0].n, '0');
  assert.deepEqual((await a.query(identitySql)).rows, before);
  console.log('oneoff_readonly_link_default_true_atomic_false_rollback_isolation_retry_revoke_pg17_pass');
} finally {
  await a.query('rollback').catch(() => {});
  await a.end(); await b.end();
}
