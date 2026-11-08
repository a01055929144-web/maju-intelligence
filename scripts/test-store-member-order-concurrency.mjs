import assert from 'node:assert/strict';
import { spawnSync } from 'node:child_process';
import { Client } from 'pg';

assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'store_member_order_test');
const a = new Client(), b = new Client();
await a.connect(); await b.connect();
try {
  assert.equal((await a.query('show server_version_num')).rows[0].server_version_num.slice(0,2), '17');
  const member = '40000000-0000-4000-8000-000000000001';
  await a.query('begin');
  await a.query("update store_account_members set status='removed',removed_at=now() where id=$1", [member]);
  const pid = (await b.query('select pg_backend_pid() pid')).rows[0].pid;
  // Start order while revocation is uncommitted. Detect the real lock wait, not a timed guess.
  const pending = b.query('select member_order_test_call()').then(() => 'unexpected success', error => error.message);
  let blocked = false;
  const deadline = Date.now() + 10000;
  while (Date.now() < deadline) {
    blocked = (await a.query("select wait_event_type='Lock' blocked from pg_stat_activity where pid=$1", [pid])).rows[0]?.blocked;
    if (blocked) break;
    await new Promise(resolve => setTimeout(resolve, 20));
  }
  assert.equal(blocked, true);
  await a.query('commit');
  assert.match(await pending, /Store member unavailable/);
  assert.equal((await a.query('select count(*) n from store_orders')).rows[0].n, '0');
  await a.query("update store_account_members set status='active',removed_at=null where id=$1", [member]);
  const key = 'a0000000-0000-4000-8000-000000000002';
  const sql = 'select member_order_test_call(k=>$1::uuid) result';
  const [left, right] = await Promise.all([a.query(sql, [key]), b.query(sql, [key])]);
  assert.deepEqual(left.rows[0], right.rows[0]);
  const counts = (await a.query('select (select count(*) from store_orders) orders,(select count(*) from store_order_requests) requests,(select count(*) from store_order_lines) lines')).rows[0];
  assert.deepEqual(counts, { orders: '1', requests: '1', lines: '1' });
  const actor = (await a.query('select ordered_by_member_id from store_orders')).rows[0];
  assert.equal(actor.ordered_by_member_id, member);
  const down = spawnSync('psql', ['--set=ON_ERROR_STOP=1', '--file=docs/sql-drafts/20261108-09-store-member-order.down.sql'], { encoding: 'utf8', env: process.env });
  assert.notEqual(down.status, 0);
  assert.match(down.stderr, /member_order_down_refused_data_exists/);
  assert((await a.query("select to_regprocedure('public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)') f")).rows[0].f);
  assert((await a.query("select to_regprocedure('public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)') f")).rows[0].f);
  console.log('store_member_order_revocation_race_and_idempotency_pg17_pass');
} finally {
  await a.query('rollback').catch(() => {});
  await a.end(); await b.end();
}
