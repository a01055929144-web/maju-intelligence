import { execFile } from "node:child_process";
import { promisify } from "node:util";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";

// Disposable CI PostgreSQL only. Never load .env files or accept an operating URL.
if (process.env.PGHOST !== "127.0.0.1" || process.env.PGPORT !== "5432") throw new Error("Loopback PG17 CI fixture required");
const exec = promisify(execFile);
async function query(sql) {
  const { stdout } = await exec("psql", ["--dbname=lead_share_runtime_test", "--no-psqlrc", "--no-align", "--tuples-only", "--set=ON_ERROR_STOP=1", "--command", sql]);
  return stdout.trim();
}
const key = randomUUID(), linkIds = [randomUUID(), randomUUID()], sendIds = [randomUUID(), randomUUID()];
const c = "00000000-0000-4000-8000-000000000001", d = "10000000-0000-4000-8000-000000000001", lead = "30000000-0000-4000-8000-000000000001";
assert.equal(await query("select current_setting('server_version_num')::integer/10000"), "17");
await Promise.all(linkIds.map(id => query(`set role service_role; begin;
  insert into pricing_document_share_links(id,company_id,document_id,document_version_id,lead_id,idempotency_key,created_by_key,token_nonce,token_hash)
  select '${id}','${c}','${d}',id,'${lead}','${key}',repeat('a',64),repeat('c',32),repeat('d',64)
  from pricing_document_versions where company_id='${c}' and document_id='${d}'
  on conflict(company_id,idempotency_key) do nothing;
  select pg_sleep(0.2); commit;`)));
assert.equal(await query(`select count(*) from pricing_document_share_links where company_id='${c}' and idempotency_key='${key}' and send_id is null`), "1");
await Promise.all(sendIds.map(id => query(`set role service_role; begin;
  insert into pricing_document_sends(id,company_id,document_id,document_version_id,lead_id,template_id,layout,channel,idempotency_key,sent_by_key)
  select '${id}',company_id,document_id,document_version_id,lead_id,'pricing-doc-paper-v1','table','link',idempotency_key,created_by_key
  from pricing_document_share_links where company_id='${c}' and idempotency_key='${key}'
  on conflict(company_id,idempotency_key) do nothing;
  select pg_sleep(0.2); commit;`)));
const send = await query(`select id from pricing_document_sends where company_id='${c}' and idempotency_key='${key}'`);
assert(sendIds.includes(send));
await Promise.all([0, 1].map(() => query(`set role service_role;
  update pricing_document_share_links set send_id='${send}' where company_id='${c}' and idempotency_key='${key}' and send_id is null;`)));
assert.equal(await query(`select count(*) from pricing_document_share_links l join pricing_document_sends s on s.id=l.send_id
  where l.company_id='${c}' and l.idempotency_key='${key}' and s.idempotency_key=l.idempotency_key and s.sent_by_key=l.created_by_key`), "1");
console.log("pricing_lead_share_concurrent_prepare_delivery_pg17_pass");
