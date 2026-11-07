import assert from 'node:assert/strict';
import { readFileSync, appendFileSync } from 'node:fs';
import { Client } from 'pg';

assert.equal(process.env.STAGE_A_INTEGRATION, 'isolated');
assert.equal(process.env.PGHOST, '127.0.0.1');
assert.equal(process.env.PGDATABASE, 'maju_stage_a_integration');
const db = new Client();
await db.connect();
try {
  const version = Number((await db.query('show server_version_num')).rows[0].server_version_num);
  assert(version >= 170000 && version < 180000, 'Disposable PG17 required');
  await db.query(`do $$ begin create role anon; exception when duplicate_object then null; end $$;
    do $$ begin create role authenticated; exception when duplicate_object then null; end $$;
    do $$ begin create role service_role bypassrls; exception when duplicate_object then null; end $$;`);
  const sql = path => readFileSync(path, 'utf8');
  await db.query(sql('supabase/schema.sql'));
  // Reuse the canonical production-record table definition, without unrelated quote DDL.
  const catalog = sql('supabase/migrations/20261009012401_sales_quote_operations.sql');
  const start = catalog.indexOf('create table if not exists public.product_catalog (');
  const end = catalog.indexOf('\n);', start);
  assert(start >= 0 && end > start);
  await db.query(catalog.slice(start, end + 4));
  await db.query('create unique index stage_a_customer_scope on public.normalized_customers(company_id,id)');
  for (const path of [
    'supabase/migrations/20261015132054_quote_product_mapping.sql',
    'supabase/migrations/20261015183000_product_management_phase_a.sql',
    'docs/sql-drafts/20261102-WO-03-product-catalog-schema.sql',
    'docs/sql-drafts/20261030-pricing-p0.sql',
    'docs/sql-drafts/20261030-pricing-p1.sql',
    'docs/db-approval/20261104_purchase_receipt_lines.sql',
    'docs/sql-drafts/20261105-purchase-receipt-corrections.sql',
    'docs/sql-drafts/20261107-purchase-cost-date-v2.sql'
  ]) await db.query(sql(path));
  await db.query(`alter table public.app_users add column if not exists password_hash text;
    create table if not exists public.auth_credentials(id text primary key,admin_email text,admin_password text,
      customer_email text,customer_password text,customer_company_id uuid,updated_at timestamptz default now());
    create table if not exists public.login_throttle_attempts(identifier text primary key,failures integer not null default 0,
      first_failure_at timestamptz not null default now(),locked_until timestamptz);
    create table public.stage_a_failure_control(company_id uuid primary key,fail_recalculation boolean not null default false);
    create function public.stage_a_fail_recalculation() returns trigger language plpgsql as $$ begin
      if exists(select 1 from public.stage_a_failure_control where company_id=new.company_id and fail_recalculation)
      then raise exception 'stage_a_isolated_recalculation_failure'; end if;
      return new;
    end $$;
    create trigger stage_a_failure before update on public.pricing_items for each row execute function public.stage_a_fail_recalculation();
    grant usage on schema public to service_role;
    grant all on all tables in schema public to service_role;
    grant usage,select on all sequences in schema public to service_role;
    notify pgrst, 'reload schema';`);
  assert(process.env.GITHUB_ENV, 'Use only in the isolated CI job');
  appendFileSync(process.env.GITHUB_ENV, `STAGE_A_TEST_DATE=${new Date().toISOString().slice(0,10)}\n`);
  console.log(JSON.stringify({ pgMajor: 17, canonicalContractsLoaded: true, operatingDatabase: false }));
} finally { await db.end(); }
