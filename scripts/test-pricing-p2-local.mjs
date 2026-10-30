import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.PRICING_P2_LOCAL_DATABASE_URL;
if (!url) throw new Error("Set PRICING_P2_LOCAL_DATABASE_URL to a NEW disposable PG16 database");
const target = new URL(url);
if (!["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  !target.pathname.startsWith("/pricing_p2_test"))
  throw new Error("Only loopback pricing_p2_test databases are allowed");

const setup = new pg.Client({ connectionString: url });
await setup.connect();
const ids = Object.fromEntries(["companyA", "companyB", "territory", "customerA", "customerB",
  "plainProduct", "promoProduct", "promotion", "document", "version", "link"].map((key) =>
  [key, randomUUID()]));
const tokenHash = "a".repeat(64);
const orderDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
const linkExpiry = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

async function callOrder(client, lines, key = randomUUID()) {
  const result = await client.query(
    "select public.place_store_order($1,$2,$3::jsonb,$4) as value",
    [tokenHash, orderDate, JSON.stringify(lines), key],
  );
  return result.rows[0].value;
}

try {
  const version = await setup.query("show server_version_num");
  if (Math.floor(Number(version.rows[0].server_version_num) / 10000) !== 16)
    throw new Error("PG16 required");
  for (const file of [
    "tests/sql/pricing-p1-fixture.sql",
    "docs/sql-drafts/20261030-pricing-p0.sql",
    "docs/sql-drafts/20261030-pricing-p1.sql",
    "tests/sql/pricing-p2-fixture.sql",
    "docs/sql-drafts/20261030-pricing-p2-store-ordering.sql",
  ]) {
    await setup.query((await readFile(new URL(`../${file}`, import.meta.url), "utf8"))
      .replace(/^\uFEFF/, ""));
    console.log(`PASS schema ${file}`);
  }
  await setup.query("insert into public.companies(id) values($1),($2)",
    [ids.companyA, ids.companyB]);
  await setup.query("insert into public.delivery_territories(id,company_id) values($1,$2)",
    [ids.territory, ids.companyA]);
  await setup.query(`insert into public.normalized_customers
    (id,company_id,customer_name,delivery_territory_id) values
    ($1,$3,'매장 A',$5),($2,$4,'매장 B',null)`,
  [ids.customerA, ids.customerB, ids.companyA, ids.companyB, ids.territory]);
  for (const [id, name] of [[ids.plainProduct, "기본"], [ids.promoProduct, "행사"]]) {
    await setup.query(`insert into public.product_catalog
      (id,company_id,purchase_product_name,purchase_price,sales_unit)
      values($1,$2,$3,100,'개')`, [id, ids.companyA, name]);
  }
  await setup.query(`insert into public.pricing_promotions
    (id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,
      margin_bp,price,stock,per_store_limit,tax_type,badge,revision)
    values($1,$2,$3,'행사','행사 상품','2020-01-01','2099-12-31',100,
      0,5000,1,1,'exempt','행사',1)`,
  [ids.promotion, ids.companyA, ids.promoProduct]);
  const content = { title: "공개 단가표", companyName: "회사 A", footer: "",
    showPrice: true, validUntil: "2099-12-31", lines: [
      { productId: ids.plainProduct, promotionId: null, displayName: "기본", spec: "",
        unit: "개", price: 1000, taxType: "exempt", visible: true },
      { productId: ids.promoProduct, promotionId: ids.promotion, displayName: "행사", spec: "",
        unit: "개", price: 1200, taxType: "exempt", visible: true },
    ] };
  await setup.query(`insert into public.pricing_documents
    (id,company_id,owner_key,kind,revision,content)
    values($1,$2,$3,'sheet',1,$4::jsonb)`,
  [ids.document, ids.companyA, "b".repeat(64), JSON.stringify(content)]);
  await setup.query(`insert into public.pricing_document_versions
    (id,company_id,document_id,version,revision,content)
    values($1,$2,$3,1,1,$4::jsonb)`,
  [ids.version, ids.companyA, ids.document, JSON.stringify(content)]);
  await setup.query(`insert into public.store_order_settings(company_id) values($1)`, [ids.companyA]);
  await setup.query(`insert into public.store_order_territory_rules
    (company_id,territory_id,delivery_weekdays,cutoff_days_before,cutoff_time)
    values($1,$2,array[0,1,2,3,4,5,6]::smallint[],0,'23:59')`,
  [ids.companyA, ids.territory]);
  const linkInput = [{ customerId: ids.customerA, id: ids.link,
    nonce: "c".repeat(32), hash: tokenHash }];
  const issued = await setup.query(`select * from public.issue_storefront_links
    ($1,$2,$3::jsonb,$4,null)`,
  [ids.companyA, ids.version, JSON.stringify(linkInput), linkExpiry]);
  const reused = await setup.query(`select * from public.issue_storefront_links
    ($1,$2,$3::jsonb,$4,null)`,
  [ids.companyA, ids.version, JSON.stringify([{ ...linkInput[0], id: randomUUID(),
    nonce: "d".repeat(32), hash: "e".repeat(64) }]), linkExpiry]);
  if (issued.rows[0]?.issued_link_id !== ids.link || !issued.rows[0]?.was_created ||
    reused.rows[0]?.issued_link_id !== ids.link || reused.rows[0]?.was_created ||
    reused.rows[0]?.issued_token_hash !== tokenHash)
    throw new Error("Company-wide retry did not reuse an active store link");

  let rejectedTenant = false;
  try {
    await setup.query(`insert into public.storefront_links
      (company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at)
      values($1,$2,$3,$4,$5,'2099-12-31')`,
    [ids.companyA, ids.customerB, ids.version, "f".repeat(32), "e".repeat(64)]);
  } catch (error) { rejectedTenant = error.code === "23503"; }
  if (!rejectedTenant) throw new Error("Cross-company customer link was accepted");
  const permissions = await setup.query(`select
    has_function_privilege('anon','public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)','EXECUTE') as anon,
    has_function_privilege('authenticated','public.place_store_order(text,date,jsonb,uuid,uuid,integer,text)','EXECUTE') as authenticated`);
  if (permissions.rows[0].anon || permissions.rows[0].authenticated)
    throw new Error("Public order RPC execute permission remains");
  console.log("PASS link retry, company FK, and public role denial");

  const plainLines = [{ productId: ids.plainProduct, quantity: 1 }];
  const requestKey = randomUUID();
  const original = await callOrder(setup, plainLines, requestKey);
  const retry = await callOrder(setup, plainLines, requestKey);
  const count = await setup.query(`select count(*)::integer n from public.store_orders
    where company_id=$1 and link_id=$2`, [ids.companyA, ids.link]);
  if (original.id !== retry.id || count.rows[0].n !== 1)
    throw new Error("Idempotent retry duplicated an order");
  console.log("PASS idempotent retry");

  const competing = [new pg.Client({ connectionString: url }), new pg.Client({ connectionString: url })];
  await Promise.all(competing.map((client) => client.connect()));
  try {
    const results = await Promise.allSettled(competing.map((client) =>
      callOrder(client, [{ productId: ids.promoProduct, promotionId: ids.promotion, quantity: 1 }])),
    );
    if (results.filter((item) => item.status === "fulfilled").length !== 1 ||
      results.filter((item) => item.status === "rejected").length !== 1)
      throw new Error("Promotion stock was oversold or both requests failed");
    const stored = await setup.query(`select unit_price from public.store_order_lines
      where company_id=$1 and promotion_id=$2`, [ids.companyA, ids.promotion]);
    if (stored.rows.length !== 1 || Number(stored.rows[0].unit_price) !== 1200)
      throw new Error("Order did not charge the published 1200 won snapshot");
    const tenantOrders = await setup.query(`select count(*)::integer n from public.store_orders
      where company_id=$1`, [ids.companyB]);
    if (tenantOrders.rows[0].n !== 0) throw new Error("Company B received Company A orders");
    console.log("PASS concurrent stock, published price, and tenant isolation");
  } finally { await Promise.all(competing.map((client) => client.end())); }
} finally { await setup.end(); }
