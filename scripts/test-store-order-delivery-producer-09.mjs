import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import pg from 'pg';

if (process.env.PGHOST !== '127.0.0.1' || process.env.PGDATABASE !== 'store_member_order_test_delivery_09') {
  throw new Error('disposable_delivery_09_loopback_database_required');
}
const up = readFileSync(new URL('../docs/sql-drafts/20261108-09-order-delivery-producer.sql', import.meta.url), 'utf8');
const down = readFileSync(new URL('../docs/sql-drafts/20261108-09-order-delivery-producer.down.sql', import.meta.url), 'utf8');
const clients = [new pg.Client(), new pg.Client(), new pg.Client()];
const [admin, first, second] = clients;
const company = '00000000-0000-4000-8000-000000000001', otherCompany = '00000000-0000-4000-8000-000000000002';
const customer = '20000000-0000-4000-8000-000000000001';
const member = ['30000000-0000-4000-8000-000000000001', '40000000-0000-4000-8000-000000000001', '50000000-0000-4000-8000-000000000001'];
const staff = [member[0], '40000000-0000-4000-8000-000000000004', '50000000-0000-4000-8000-000000000002'];
const foreignMember = ['30000000-0000-4000-8000-000000000003', '40000000-0000-4000-8000-000000000003', '50000000-0000-4000-8000-000000000003'];
const day = '2099-01-05', hash = 'a'.repeat(64);
const lines = [{ productId: '60000000-0000-4000-8000-000000000001', quantity: 1 }];
const snapshot = { deliveryCustomerNameSnapshot: 'synthetic store', deliveryAddressSnapshot: 'synthetic delivery address',
  deliveryAddressDetailSnapshot: '  ', deliveryRecipientPhoneSnapshot: '000-0000-0000', deliveryLoadingPositionSnapshot: ' synthetic front ' };
const normalized = { ...snapshot, deliveryAddressDetailSnapshot: null, deliveryLoadingPositionSnapshot: 'synthetic front' };
const signatures = ['public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)',
  'public.place_store_member_order(text,date,jsonb,uuid,uuid,integer,text,uuid,uuid,uuid)'];
const newSignatures = ['public.place_store_order_with_delivery_snapshot_09(text,date,jsonb,uuid,jsonb,uuid,integer,text,uuid,uuid,uuid)',
  'public.complete_store_order_delivery_09(uuid,uuid,date,uuid[],jsonb,timestamptz,text)'];
const value = async (client, sql, args = []) => (await client.query(sql, args)).rows[0].result;
const definitions = () => admin.query('select oid::text,proacl::text,prosecdef,md5(pg_get_functiondef(oid)) hash from pg_proc where oid=any($1::regprocedure[]) order by oid', [signatures]).then(r => r.rows);
const counts = () => value(admin, `select jsonb_build_object('orders',(select count(*) from store_orders),
  'lines',(select count(*) from store_order_lines),'requests',(select count(*) from store_order_requests),
  'snapshots',(select count(*) from store_order_delivery_requests_09),'completions',(select count(*) from store_order_delivery_completions_09)) result`);
const order = (client, key, options = {}) => value(client,
  'select public.place_store_order_with_delivery_snapshot_09($1,$2,$3::jsonb,$4,$5::jsonb,$6,$7,$8,$9,$10,$11) result',
  [hash, day, JSON.stringify(options.lines || lines), key, JSON.stringify(Object.hasOwn(options, 'snapshot') ? options.snapshot : snapshot),
    options.orderId || null, options.revision || null, '', ...(options.members || member)]);
const storedSnapshot = id => value(admin, `select jsonb_build_object('deliveryCustomerNameSnapshot',delivery_customer_name_snapshot,
  'deliveryAddressSnapshot',delivery_address_snapshot,'deliveryAddressDetailSnapshot',delivery_address_detail_snapshot,
  'deliveryRecipientPhoneSnapshot',delivery_recipient_phone_snapshot,'deliveryLoadingPositionSnapshot',delivery_loading_position_snapshot) result
  from store_orders where id=$1`, [id]);
const completion = (client, input) => value(client, 'select public.complete_store_order_delivery_09($1,$2,$3,$4::uuid[],$5::jsonb,$6,$7) result',
  [input.company || company, input.event, input.day || day, input.ids, JSON.stringify(input.revisions), input.at, input.actor || 'fixture-verified-driver']);
const states = ids => admin.query('select id,status,revision from store_orders where id=any($1::uuid[]) order by id', [ids]).then(r => r.rows);

try {
  await Promise.all(clients.map(client => client.connect()));
  assert.equal((await admin.query('show server_version_num')).rows[0].server_version_num.slice(0, 2), '17');
  await Promise.all([first.query('set role service_role'), second.query('set role service_role')]);
  const original = await definitions();
  await admin.query(up); await admin.query(down); await admin.query(up);
  assert.deepEqual(await definitions(), original);
  for (const signature of newSignatures) {
    for (const role of ['anon', 'authenticated']) {
      assert.equal(await value(admin, 'select has_function_privilege($1,$2,$3) result', [role, signature, 'EXECUTE']), false);
    }
    assert.equal(await value(admin, 'select prosecdef result from pg_proc where oid=$1::regprocedure', [signature]), false);
  }
  for (const table of ['store_order_delivery_requests_09', 'store_order_delivery_completions_09']) {
    assert.equal(await value(admin, 'select relrowsecurity result from pg_class where oid=$1::regclass', [table]), true);
    for (const role of ['anon', 'authenticated']) assert.equal(await value(admin, 'select has_table_privilege($1,$2,$3) result', [role, table, 'SELECT']), false);
    assert.equal(await value(admin, 'select has_table_privilege($1,$2,$3) result', ['service_role', table, 'UPDATE']), false);
  }
  for (const bad of [null, {}, { ...snapshot, deliveryAddressSnapshot: ' ' }, { ...snapshot, deliveryRecipientPhoneSnapshot: 123 }, { ...snapshot, companyId: otherCompany }]) {
    await assert.rejects(order(first, randomUUID(), { snapshot: bad }), /delivery_snapshot_(required|invalid)/);
  }
  await assert.rejects(order(first, randomUUID(), { members: [member[0], null, member[2]] }), /Store member unavailable/);
  assert.equal((await counts()).orders, 0);

  const key = randomUUID();
  await first.query('begin');
  const created = await order(first, key);
  assert.equal((await counts()).orders, 0); assert.equal((await counts()).snapshots, 0);
  await first.query('commit');
  assert.deepEqual(await storedSnapshot(created.id), normalized);
  assert.equal((await counts()).orders, 1);
  await admin.query('update normalized_customers set customer_name=$1,address=$2 where id=$3', ['changed master name', 'changed master address', customer]);
  assert.deepEqual(await order(second, key, { snapshot: normalized }), created);
  assert.deepEqual(await storedSnapshot(created.id), normalized);
  await assert.rejects(order(second, key, { snapshot: { ...snapshot, deliveryRecipientPhoneSnapshot: 'different' } }), /delivery_snapshot_idempotency_conflict/);
  await assert.rejects(order(second, key, { lines: [{ ...lines[0], quantity: 2 }] }), /delivery_snapshot_idempotency_conflict/);
  await admin.query("update store_account_members set status='removed',removed_at=now() where id=$1", [member[1]]);
  await assert.rejects(order(first, key), /Store member unavailable/);
  await admin.query("update store_account_members set status='active',removed_at=null where id=$1", [member[1]]);
  await admin.query('update normalized_customers set customer_name=$1,address=$2 where id=$3', [snapshot.deliveryCustomerNameSnapshot, snapshot.deliveryAddressSnapshot, customer]);
  await assert.rejects(order(first, randomUUID(), { snapshot: { ...snapshot, deliveryCustomerNameSnapshot: 'other store', deliveryAddressSnapshot: 'other synthetic address' } }), /delivery_snapshot_customer_mismatch/);
  await assert.rejects(order(first, randomUUID(), { members: foreignMember }), /Store member unavailable/);

  const legacyKey = randomUUID();
  const legacy = await value(first, 'select public.place_store_order($1,$2,$3::jsonb,$4,null,null,$5) result', [hash, day, JSON.stringify(lines), legacyKey, '']);
  await assert.rejects(order(first, legacyKey), /delivery_snapshot_existing_request/);
  await assert.rejects(order(first, randomUUID(), { orderId: legacy.id, revision: 1 }), /delivery_snapshot_required/);
  assert.equal((await storedSnapshot(legacy.id)).deliveryAddressSnapshot, null);
  const compatible = await order(first, randomUUID(), { members: [null, null, null] });
  assert.deepEqual(await storedSnapshot(compatible.id), normalized);

  const edited = await order(first, randomUUID(), { orderId: created.id, revision: 1, lines: [{ ...lines[0], quantity: 2 }], members: staff });
  assert.equal(edited.revision, 2);
  assert.equal(await value(admin, 'select ordered_by_member_id::text result from store_orders where id=$1', [created.id]), member[1]);
  assert.deepEqual(await storedSnapshot(created.id), normalized);
  await assert.rejects(order(first, randomUUID(), { orderId: created.id, revision: 2, snapshot: { ...snapshot, deliveryLoadingPositionSnapshot: 'changed' } }), /delivery_snapshot_immutable/);
  await assert.rejects(admin.query('update store_orders set delivery_address_snapshot=$1 where id=$2', ['changed', created.id]), /store_order_delivery_snapshot_immutable/);

  const beforeFailure = await counts();
  await admin.query(`create function public.delivery09_fail_request() returns trigger language plpgsql as $$ begin raise exception 'fixture_forced_delivery_request_failure'; end $$;
    create trigger delivery09_fail_request before insert on public.store_order_delivery_requests_09 for each row execute function public.delivery09_fail_request()`);
  await assert.rejects(order(first, randomUUID()), /fixture_forced_delivery_request_failure/);
  assert.deepEqual(await counts(), beforeFailure);
  await admin.query('drop trigger delivery09_fail_request on store_order_delivery_requests_09; drop function public.delivery09_fail_request()');
  const raceKey = randomUUID();
  const [raceFirst, raceSecond] = await Promise.all([order(first, raceKey), order(second, raceKey)]);
  assert.deepEqual(raceFirst, raceSecond);
  assert.equal(Number(await value(admin, 'select count(*) result from store_order_delivery_requests_09 where idempotency_key=$1', [raceKey])), 1);
  const conflictKey = randomUUID();
  const conflicting = await Promise.allSettled([order(first, conflictKey, { snapshot: { ...snapshot, deliveryRecipientPhoneSnapshot: '111' } }),
    order(second, conflictKey, { snapshot: { ...snapshot, deliveryRecipientPhoneSnapshot: '222' } })]);
  assert.equal(conflicting.filter(result => result.status === 'fulfilled').length, 1);
  const rejected = conflicting.find(result => result.status === 'rejected');
  assert.match(rejected.reason.message, /delivery_snapshot_idempotency_conflict/);
  assert.equal(Number(await value(admin, 'select count(*) result from store_order_delivery_requests_09 where idempotency_key=$1', [conflictKey])), 1);

  const cancelled = await order(first, randomUUID());
  await admin.query("update store_orders set status='cancelled' where id=$1", [cancelled.id]);
  const ids = [created.id, compatible.id, raceFirst.id];
  // Synthetic candidate states cover the existing 02 contract; no TMS runtime is called.
  await admin.query("update store_orders set status='received' where id=$1", [compatible.id]);
  await admin.query("update store_orders set status='in_delivery' where id=$1", [raceFirst.id]);
  const previousStates = await states(ids);
  const revisions = Object.fromEntries(previousStates.map(row => [row.id, row.revision]));
  const input = { event: randomUUID(), ids, revisions, at: new Date(Date.now() + 1000).toISOString() };
  const completionCount = async () => (await counts()).completions;
  const rejectCompletion = async (patch, message) => {
    await assert.rejects(completion(first, { ...input, event: randomUUID(), ...patch }), message);
    assert.equal(await completionCount(), 0); assert.deepEqual(await states(ids), previousStates);
  };
  await rejectCompletion({ ids: [] }, /store_order_completion_invalid/);
  await rejectCompletion({ ids: [ids[0], ids[0]], revisions: { [ids[0]]: revisions[ids[0]] } }, /store_order_completion_invalid/);
  await rejectCompletion({ revisions: { ...revisions, [ids[0]]: 999 } }, /store_order_completion_revision_conflict/);
  await rejectCompletion({ company: otherCompany }, /store_order_completion_unavailable/);
  await rejectCompletion({ day: '2099-01-06' }, /store_order_completion_unavailable/);
  await rejectCompletion({ at: '2000-01-01T00:00:00Z' }, /store_order_completion_unavailable/);
  await rejectCompletion({ at: new Date(Date.now() + 600000).toISOString() }, /store_order_completion_invalid/);
  await rejectCompletion({ ids: [legacy.id], revisions: { [legacy.id]: 1 } }, /store_order_completion_snapshot_required/);
  await rejectCompletion({ ids: [ids[0], cancelled.id], revisions: { [ids[0]]: revisions[ids[0]], [cancelled.id]: 1 } }, /store_order_completion_unavailable/);

  await admin.query(`create function public.delivery09_fail_completion() returns trigger language plpgsql as $$ begin
    if new.status='delivered' then raise exception 'fixture_forced_completion_failure'; end if; return new; end $$;
    create trigger delivery09_fail_completion before update on public.store_orders for each row execute function public.delivery09_fail_completion()`);
  await rejectCompletion({}, /fixture_forced_completion_failure/);
  await admin.query('drop trigger delivery09_fail_completion on store_orders; drop function public.delivery09_fail_completion()');
  await first.query('begin');
  const completed = await completion(first, input);
  assert.deepEqual(await states(ids), previousStates); assert.equal(await completionCount(), 0);
  await first.query('commit');
  assert.deepEqual(completed.orderIds, [...ids].sort());
  for (const row of await states(ids)) { assert.equal(row.status, 'delivered'); assert.equal(row.revision, revisions[row.id] + 1); }
  assert.deepEqual(await completion(second, { ...input, ids: [...ids].reverse() }), completed);
  await assert.rejects(completion(second, { ...input, actor: 'different-actor' }), /store_order_completion_idempotency_conflict/);
  await assert.rejects(completion(second, { ...input, ids: ids.slice(1), revisions: Object.fromEntries(ids.slice(1).map(id => [id, revisions[id]])) }), /store_order_completion_idempotency_conflict/);
  await assert.rejects(completion(second, { ...input, event: randomUUID(), revisions: completed.orderRevisions }), /store_order_completion_unavailable/);
  assert.equal(await completionCount(), 1);
  assert.deepEqual(await order(first, key), created);
  assert.deepEqual(await storedSnapshot(created.id), normalized);
  assert.deepEqual(await definitions(), original);

  const concurrentOrder = await order(first, randomUUID());
  const concurrentInput = { event: randomUUID(), ids: [concurrentOrder.id],
    revisions: { [concurrentOrder.id]: 1 }, at: new Date(Date.now() + 1000).toISOString() };
  const [completionFirst, completionSecond] = await Promise.all([completion(first, concurrentInput), completion(second, concurrentInput)]);
  assert.deepEqual(completionFirst, completionSecond);
  assert.deepEqual(await states(concurrentInput.ids), [{ id: concurrentOrder.id, status: 'delivered', revision: 2 }]);
  assert.equal(await completionCount(), 2);

  await assert.rejects(admin.query(down), /store_order_delivery_09_down_refused_data_exists/);
  await admin.query('rollback');
  assert.equal(await completionCount(), 2);
  // Fixture-only discard in the exact guarded database, never an operating rollback procedure.
  await admin.query('truncate public.store_order_delivery_requests_09,public.store_order_delivery_completions_09');
  await admin.query(down);
  assert.deepEqual(await definitions(), original);
  for (const signature of newSignatures) assert.equal(await value(admin, 'select to_regprocedure($1)::text result', [signature]), null);
  assert.equal(await value(admin, "select count(*)::integer result from pg_attribute where attrelid='store_orders'::regclass and attname='delivery_address_snapshot' and not attisdropped"), 1);
  const afterDown = await value(first, 'select public.place_store_order($1,$2,$3::jsonb,$4,null,null,$5) result', [hash, day, JSON.stringify(lines), randomUUID(), '']);
  assert.equal((await storedSnapshot(afterDown.id)).deliveryAddressSnapshot, null);
  console.log('store_order_delivery_09_atomic_snapshot_legacy_member_retry_scope_completion_rollback_down_pg17_pass');
} finally {
  await Promise.allSettled(clients.map(client => client.end()));
}
