import { readFile } from 'node:fs/promises';
import pg from 'pg';
import { checkConcurrency } from './test-pricing-p0-concurrency.mjs';
// Dedicated disposable cluster only. No .env loading and no production fallback.
const connectionString = process.env.PRICING_P0_LOCAL_DATABASE_URL;
if (!connectionString) throw new Error('Set PRICING_P0_LOCAL_DATABASE_URL for a disposable PG16 cluster');
const target = new URL(connectionString);
if (!['localhost','127.0.0.1','[::1]'].includes(target.hostname) || !target.pathname.startsWith('/pricing_p0_test')) throw new Error('Only loopback pricing_p0_test databases are allowed');
const client = new pg.Client({ connectionString });
await client.connect();
try {
  const version = await client.query('show server_version_num');
  if (Math.floor(Number(version.rows[0].server_version_num)/10000)!==16) throw new Error('PG16 required');
  for (const path of ['tests/sql/pricing-p0-fixture.sql','docs/sql-drafts/20261030-pricing-p0.sql','tests/sql/pricing-p0.sql']) {
    await client.query((await readFile(new URL('../'+path,import.meta.url),'utf8')).replace(/^\uFEFF/,''));
  }
  console.log('PASS PostgreSQL16: company isolation, numeric boundaries, duplicate recalculation, restore idempotency/conflict, role denial, company cascade');
} finally { await client.end(); }
await checkConcurrency(connectionString);
