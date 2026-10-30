import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import pg from "pg";

const { Client } = pg;
const connectionString = process.env.PG_VERIFY_URL;
if (!connectionString) throw new Error("PG_VERIFY_URL is required");
const verifyUrl = new URL(connectionString);
const loopbackHosts = new Set(["127.0.0.1", "localhost", "::1", "[::1]"]);
if (!loopbackHosts.has(verifyUrl.hostname) || verifyUrl.port !== "55432") {
  throw new Error("refusing non-isolated database: PG_VERIFY_URL must use loopback port 55432");
}
if (process.env.PG_VERIFY_CONFIRM !== "isolated-structured-rpc-fixture") {
  throw new Error("PG_VERIFY_CONFIRM=isolated-structured-rpc-fixture is required because the fixture resets public schema");
}

const companyId = "11111111-1111-1111-1111-111111111111";
const otherCompanyId = "22222222-2222-2222-2222-222222222222";
const actorId = "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa";
const otherActorId = "bbbbbbbb-bbbb-bbbb-bbbb-bbbbbbbbbbbb";
const customerId = "33333333-3333-3333-3333-333333333333";
const leadId = "44444444-4444-4444-4444-444444444444";

const fixtureSql = `
create extension if not exists pgcrypto;
do $$ begin
  create role anon nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role authenticated nologin;
exception when duplicate_object then null; end $$;
do $$ begin
  create role service_role nologin;
exception when duplicate_object then null; end $$;

create table public.companies (id uuid primary key);
create table public.app_users (id uuid primary key);
create table public.company_members (
  company_id uuid not null,
  user_id uuid not null,
  status text not null,
  primary key (company_id, user_id)
);
create table public.normalized_customers (
  company_id uuid not null,
  id uuid not null,
  primary key (company_id, id)
);
create table public.customer_notes (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  note_type text not null,
  memo text,
  created_by_name text,
  idempotency_key text,
  unique (company_id, customer_id, id)
);
create unique index uq_customer_notes_delivery_idempotency
  on public.customer_notes(company_id, customer_id, idempotency_key)
  where idempotency_key is not null;

create table public.delivery_events (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  customer_id uuid not null,
  customer_note_id uuid not null,
  recorded_by_user_id uuid,
  recorded_by_name text,
  event_type text not null check (event_type in ('arrived','partial','return','replenishment','exchange','damage','missing','other')),
  cause_code text,
  occurrence_stage text,
  action_code text,
  action_amount numeric check (action_amount is null or action_amount >= 0),
  status text not null check (status in ('received','in_progress','completed')),
  occurred_at timestamptz not null default now(),
  resolved_at timestamptz,
  memo text,
  updated_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, customer_note_id),
  foreign key (company_id, customer_id, customer_note_id)
    references public.customer_notes(company_id, customer_id, id) on delete cascade,
  check ((status = 'completed' and resolved_at is not null) or (status <> 'completed' and resolved_at is null))
);
create table public.delivery_event_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  delivery_event_id uuid not null,
  line_number integer not null check (line_number > 0),
  product_id uuid,
  item_name text not null check (length(btrim(item_name)) > 0),
  quantity numeric check (quantity is null or quantity > 0),
  quantity_unit text,
  supplier_id uuid,
  supplier_name text,
  unique (company_id, delivery_event_id, line_number),
  foreign key (company_id, delivery_event_id) references public.delivery_events(company_id, id) on delete cascade
);

create table public.business_permit_leads (
  company_id uuid not null,
  id uuid not null,
  primary key (company_id, id)
);
create table public.lead_actions (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  action_type text,
  result text,
  memo text,
  actor_name text,
  follow_up_at timestamptz,
  collateral_types text[] not null default '{}',
  metadata jsonb not null default '{}',
  unique (company_id, lead_id, id)
);
create table public.sales_offers (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  lead_id uuid not null,
  lead_action_id uuid not null,
  recorded_by_user_id uuid,
  recorded_by_name text,
  memo text,
  offered_at timestamptz not null default now(),
  unique (company_id, id),
  unique (company_id, lead_action_id),
  foreign key (company_id, lead_id, lead_action_id)
    references public.lead_actions(company_id, lead_id, id) on delete cascade
);
create table public.sales_offer_items (
  id uuid primary key default gen_random_uuid(),
  company_id uuid not null,
  sales_offer_id uuid not null,
  line_number integer not null check (line_number > 0),
  product_id uuid,
  item_name text not null check (length(btrim(item_name)) > 0),
  offered_price numeric check (offered_price is null or offered_price >= 0),
  currency_code text not null default 'KRW' check (currency_code ~ '^[A-Z]{3}$'),
  valid_until date,
  sample_provided boolean not null default false,
  sample_quantity numeric check (sample_quantity is null or sample_quantity > 0),
  sample_unit text,
  unique (company_id, sales_offer_id, line_number),
  foreign key (company_id, sales_offer_id) references public.sales_offers(company_id, id) on delete cascade,
  check (sample_provided or (sample_quantity is null and sample_unit is null))
);

grant usage on schema public to service_role;
grant select on public.companies, public.company_members, public.normalized_customers, public.business_permit_leads to service_role;
grant select, insert, update, delete on public.customer_notes, public.delivery_events, public.delivery_event_items,
  public.lead_actions, public.sales_offers, public.sales_offer_items to service_role;
`;

async function connect() {
  const client = new Client({ connectionString });
  await client.connect();
  return client;
}

async function asService(client, sql, params) {
  await client.query("set role service_role");
  try {
    return await client.query(sql, params);
  } finally {
    await client.query("reset role");
  }
}

async function delivery(client, { key, memo, status = "received", itemName = "상품", actor = actorId }) {
  const result = await asService(client, `
    select public.record_delivery_event_atomic($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb) as value
  `, [
    companyId, customerId, memo, actor, "기사", key,
    JSON.stringify({ eventType: "damage", causeCode: "damage", status }),
    JSON.stringify([{ itemName, quantity: "1", quantityUnit: "박스" }])
  ]);
  return result.rows[0].value;
}

async function sales(client, { key, memo, itemName = "견적상품", items, actor = actorId }) {
  const result = await asService(client, `
    select public.record_lead_sales_offer_atomic($1,$2,$3::jsonb,$4,$5,$6,$7,$8::jsonb) as value
  `, [
    companyId, leadId, JSON.stringify({ actionType: "quote", result: "sent" }), actor, "영업", key, memo,
    items === undefined ? JSON.stringify([{ itemName, offeredPrice: "1000", currencyCode: "KRW" }]) : items
  ]);
  return result.rows[0].value;
}

async function expectError(work, pattern, code) {
  try {
    await work();
    assert.fail("expected query to fail");
  } catch (error) {
    assert.match(String(error.message), pattern);
    if (code) assert.equal(error.code, code);
  }
}

const owner = await connect();
try {
  await owner.query("drop schema if exists public cascade; create schema public; grant all on schema public to postgres; grant usage on schema public to public");
  await owner.query(fixtureSql);
  const rpcSql = readFileSync("docs/sql-drafts/20261027-structured-field-record-rpc.sql", "utf8");
  await owner.query(rpcSql);
  await owner.query("insert into public.companies(id) values ($1),($2)", [companyId, otherCompanyId]);
  await owner.query("insert into public.app_users(id) values ($1),($2)", [actorId, otherActorId]);
  await owner.query(
    "insert into public.company_members(company_id,user_id,status) values ($1,$2,'active'),($3,$4,'active')",
    [companyId, actorId, otherCompanyId, otherActorId]
  );
  await owner.query("insert into public.normalized_customers(company_id,id) values ($1,$2)", [companyId, customerId]);
  await owner.query("insert into public.business_permit_leads(company_id,id) values ($1,$2)", [companyId, leadId]);

  for (const role of ["anon", "authenticated"]) {
    await owner.query(`set role ${role}`);
    await expectError(() => owner.query(
      "select public.record_delivery_event_atomic($1,$2,'x',null,'x','permission', '{}'::jsonb, '[]'::jsonb)",
      [companyId, customerId]
    ), /permission denied for function record_delivery_event_atomic/i, "42501");
    await owner.query("reset role");
  }

  const completed = await delivery(owner, { key: "completed", memo: "완료", status: "completed" });
  const completedRow = await owner.query("select status, resolved_at from public.delivery_events where id=$1", [completed.eventId]);
  assert.equal(completedRow.rows[0].status, "completed");
  assert.ok(completedRow.rows[0].resolved_at);

  const inProgress = await delivery(owner, { key: "progress", memo: "진행", status: "in_progress" });
  const progressRow = await owner.query("select resolved_at from public.delivery_events where id=$1", [inProgress.eventId]);
  assert.equal(progressRow.rows[0].resolved_at, null);

  await expectError(
    () => delivery(owner, { key: "cross-actor", memo: "거부", actor: otherActorId }),
    /actor_not_company_member/
  );
  assert.equal((await owner.query("select count(*)::int as n from public.customer_notes where idempotency_key='cross-actor'" )).rows[0].n, 0);

  await expectError(
    () => delivery(owner, { key: "rollback", memo: "롤백", itemName: "   " }),
    /delivery_event_items_item_name_check/
  );
  assert.equal((await owner.query("select count(*)::int as n from public.customer_notes where idempotency_key='rollback'" )).rows[0].n, 0);
  assert.equal((await owner.query("select count(*)::int as n from public.delivery_events where memo='롤백'" )).rows[0].n, 0);

  const deliveryA = await connect();
  const deliveryB = await connect();
  const [retryA, retryB] = await Promise.all([
    delivery(deliveryA, { key: "delivery-concurrent", memo: "A 최초", itemName: "A 상품" }),
    delivery(deliveryB, { key: "delivery-concurrent", memo: "B 최초", itemName: "B 상품" })
  ]);
  await deliveryA.end();
  await deliveryB.end();
  assert.equal(retryA.noteId, retryB.noteId);
  assert.equal(retryA.eventId, retryB.eventId);
  assert.equal([retryA.replayed, retryB.replayed].filter(Boolean).length, 1);
  assert.equal((await owner.query("select count(*)::int as n from public.customer_notes where idempotency_key='delivery-concurrent'" )).rows[0].n, 1);
  assert.equal((await owner.query("select count(*)::int as n from public.delivery_event_items where delivery_event_id=$1", [retryA.eventId])).rows[0].n, 1);

  const salesA = await connect();
  const salesB = await connect();
  const [offerA, offerB] = await Promise.all([
    sales(salesA, { key: "sales-concurrent", memo: "A 견적", itemName: "A 견적상품" }),
    sales(salesB, { key: "sales-concurrent", memo: "B 견적", itemName: "B 견적상품" })
  ]);
  await salesA.end();
  await salesB.end();
  assert.equal(offerA.actionId, offerB.actionId);
  assert.equal(offerA.offerId, offerB.offerId);
  assert.equal([offerA.replayed, offerB.replayed].filter(Boolean).length, 1);
  assert.equal((await owner.query("select count(*)::int as n from public.lead_actions where metadata->>'structuredIdempotencyKey'='sales-concurrent'" )).rows[0].n, 1);
  assert.equal((await owner.query("select count(*)::int as n from public.sales_offer_items where sales_offer_id=$1", [offerA.offerId])).rows[0].n, 1);

  await expectError(
    () => sales(owner, { key: "null-items", memo: "null 거부", items: null }),
    /offer_items_required/
  );
  assert.equal((await owner.query("select count(*)::int as n from public.lead_actions where metadata->>'structuredIdempotencyKey'='null-items'" )).rows[0].n, 0);

  console.log("structured field record RPC PG16 assertions passed");
} finally {
  await owner.end();
}
