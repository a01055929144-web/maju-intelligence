import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import pg from "pg";

const url = process.env.PRICING_P2_LOCAL_DATABASE_URL;
if (!url)
  throw new Error(
    "Set PRICING_P2_LOCAL_DATABASE_URL to a NEW disposable PG16 database",
  );
const target = new URL(url);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  !target.pathname.startsWith("/pricing_p2_test")
)
  throw new Error("Only loopback pricing_p2_test databases are allowed");

const setup = new pg.Client({ connectionString: url });
await setup.connect();
const ids = Object.fromEntries(
  [
    "companyA",
    "companyB",
    "territory",
    "customerA",
    "customerB",
    "customerC",
    "linkC",
    "plainProduct",
    "promoProduct",
    "promotion",
    "document",
    "version",
    "link",
  ].map((key) => [key, randomUUID()]),
);
const tokenHash = "a".repeat(64);
const orderDate = new Date(Date.now() + 10 * 24 * 60 * 60 * 1000)
  .toISOString()
  .slice(0, 10);
const linkExpiry = new Date(
  Date.now() + 365 * 24 * 60 * 60 * 1000,
).toISOString();

async function callOrder(client, lines, key = randomUUID(), hash = tokenHash) {
  const result = await client.query(
    "select public.place_store_order($1,$2,$3::jsonb,$4) as value",
    [hash, orderDate, JSON.stringify(lines), key],
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
    await setup.query(
      (await readFile(new URL(`../${file}`, import.meta.url), "utf8")).replace(
        /^\uFEFF/,
        "",
      ),
    );
    console.log(`PASS schema ${file}`);
  }
  await setup.query("insert into public.companies(id) values($1),($2)", [
    ids.companyA,
    ids.companyB,
  ]);
  await setup.query(
    "insert into public.delivery_territories(id,company_id) values($1,$2)",
    [ids.territory, ids.companyA],
  );
  await setup.query(
    `insert into public.normalized_customers
    (id,company_id,customer_name,delivery_territory_id) values
    ($1,$3,'매장 A',$5),($2,$4,'매장 B',null)`,
    [ids.customerA, ids.customerB, ids.companyA, ids.companyB, ids.territory],
  );
  for (const [id, name] of [
    [ids.plainProduct, "기본"],
    [ids.promoProduct, "행사"],
  ]) {
    await setup.query(
      `insert into public.product_catalog
      (id,company_id,purchase_product_name,purchase_price,sales_unit)
      values($1,$2,$3,100,'개')`,
      [id, ids.companyA, name],
    );
  }
  await setup.query(
    `insert into public.pricing_promotions
    (id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,
      margin_bp,price,stock,per_store_limit,tax_type,badge,revision)
    values($1,$2,$3,'행사','행사 상품','2020-01-01','2099-12-31',100,
      0,5000,1,1,'exempt','행사',1)`,
    [ids.promotion, ids.companyA, ids.promoProduct],
  );
  const content = {
    title: "공개 단가표",
    companyName: "회사 A",
    footer: "",
    showPrice: true,
    validUntil: "2099-12-31",
    lines: [
      {
        productId: ids.plainProduct,
        promotionId: null,
        displayName: "기본",
        spec: "",
        unit: "개",
        price: 1000,
        taxType: "exempt",
        visible: true,
      },
      {
        productId: ids.promoProduct,
        promotionId: ids.promotion,
        displayName: "행사",
        spec: "",
        unit: "개",
        price: 1200,
        taxType: "exempt",
        visible: true,
      },
    ],
  };
  await setup.query(
    `insert into public.pricing_documents
    (id,company_id,owner_key,kind,revision,content)
    values($1,$2,$3,'sheet',1,$4::jsonb)`,
    [ids.document, ids.companyA, "b".repeat(64), JSON.stringify(content)],
  );
  await setup.query(
    `insert into public.pricing_document_versions
    (id,company_id,document_id,version,revision,content)
    values($1,$2,$3,1,1,$4::jsonb)`,
    [ids.version, ids.companyA, ids.document, JSON.stringify(content)],
  );
  await setup.query(
    `insert into public.store_order_settings(company_id) values($1)`,
    [ids.companyA],
  );
  await setup.query(
    `insert into public.store_order_territory_rules
    (company_id,territory_id,delivery_weekdays,cutoff_days_before,cutoff_time)
    values($1,$2,array[0,1,2,3,4,5,6]::smallint[],0,'23:59')`,
    [ids.companyA, ids.territory],
  );
  const linkInput = [
    {
      customerId: ids.customerA,
      id: ids.link,
      nonce: "c".repeat(32),
      hash: tokenHash,
    },
  ];
  const issued = await setup.query(
    `select * from public.issue_storefront_links
    ($1,$2,$3::jsonb,$4,null)`,
    [ids.companyA, ids.version, JSON.stringify(linkInput), linkExpiry],
  );
  const reused = await setup.query(
    `select * from public.issue_storefront_links
    ($1,$2,$3::jsonb,$4,null)`,
    [
      ids.companyA,
      ids.version,
      JSON.stringify([
        {
          ...linkInput[0],
          id: randomUUID(),
          nonce: "d".repeat(32),
          hash: "e".repeat(64),
        },
      ]),
      linkExpiry,
    ],
  );
  if (
    issued.rows[0]?.issued_link_id !== ids.link ||
    !issued.rows[0]?.was_created ||
    reused.rows[0]?.issued_link_id !== ids.link ||
    reused.rows[0]?.was_created ||
    reused.rows[0]?.issued_token_hash !== tokenHash
  )
    throw new Error("Company-wide retry did not reuse an active store link");

  await setup.query(
    "insert into normalized_customers(id,company_id,customer_name,delivery_territory_id) values($1,$2,'매장 C',$3)",
    [ids.customerC, ids.companyA, ids.territory],
  );
  await setup.query(
    "select * from issue_storefront_links($1,$2,$3::jsonb,$4,null)",
    [
      ids.companyA,
      ids.version,
      JSON.stringify([
        {
          customerId: ids.customerC,
          id: ids.linkC,
          nonce: "d".repeat(32),
          hash: "b".repeat(64),
        },
      ]),
      linkExpiry,
    ],
  );
  const batchCustomers = Array.from({ length: 101 }, () => randomUUID());
  await setup.query(
    "insert into normalized_customers(id,company_id,customer_name) select x,$1,'batch fixture' from unnest($2::uuid[]) x",
    [ids.companyA, batchCustomers],
  );
  const batchRows = batchCustomers
    .sort()
    .map((customerId) => ({
      customerId,
      id: randomUUID(),
      nonce: randomUUID().replaceAll("-", ""),
      hash: randomUUID().replaceAll("-", "") + randomUUID().replaceAll("-", ""),
    }));
  for (let pass = 0; pass < 2; pass++)
    for (let offset = 0; offset < 101; offset += 50) {
      const r = await setup.query(
        "select * from issue_storefront_links($1,$2,$3::jsonb,$4,null)",
        [
          ids.companyA,
          ids.version,
          JSON.stringify(batchRows.slice(offset, offset + 50)),
          linkExpiry,
        ],
      );
      if (
        r.rows.length !== Math.min(50, 101 - offset) ||
        r.rows.some((row) => row.was_created !== (pass === 0))
      )
        throw new Error("Batch resume mismatch");
    }
  console.log("PASS company batch 50/50/1 and resume without duplicates");
  let rejectedTenant = false;
  try {
    await setup.query(
      `insert into public.storefront_links
      (company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at)
      values($1,$2,$3,$4,$5,'2099-12-31')`,
      [
        ids.companyA,
        ids.customerB,
        ids.version,
        "f".repeat(32),
        "e".repeat(64),
      ],
    );
  } catch (error) {
    rejectedTenant = error.code === "23503";
  }
  if (!rejectedTenant)
    throw new Error("Cross-company customer link was accepted");
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
  const count = await setup.query(
    `select count(*)::integer n from public.store_orders
    where company_id=$1 and link_id=$2`,
    [ids.companyA, ids.link],
  );
  if (original.id !== retry.id || count.rows[0].n !== 1)
    throw new Error("Idempotent retry duplicated an order");
  console.log("PASS idempotent retry");
  await setup.query("insert into customer_price_agreements(id,company_id,customer_id,product_catalog_id,sales_unit,unit_price,tax_type,status,effective_from) values($1,$2,$3,$4,'개',900,'exempt','active','2020-01-01'),($5,$2,$3,$4,'박스',50000,'taxable','active','2021-01-01')",[randomUUID(),ids.companyA,ids.customerA,ids.plainProduct,randomUUID()]);
  const contractOrder=await callOrder(setup,plainLines);
  if(contractOrder.knownTotal!==900) throw new Error("Contract did not override published price by matching sales unit");
  await setup.query("delete from customer_price_agreements where company_id=$1",[ids.companyA]);
  let otherStoreRejected=false;
  try { await setup.query("select place_store_order($1,$2,$3::jsonb,$4,$5,1,'')",["b".repeat(64),orderDate,JSON.stringify(plainLines),randomUUID(),original.id]); }
  catch(error) { otherStoreRejected=/Order cannot be edited/.test(error.message); }
  if(!otherStoreRejected) throw new Error("Other store edited order");
  console.log("PASS contract override and cross-store edit denial");

  // Editing must respect the original delivery cutoff, not only the replacement date.
  await setup.query(
    "update store_orders set delivery_date=current_date-3 where id=$1",
    [original.id],
  );
  let closedRejected = false;
  try {
    await setup.query("select place_store_order($1,$2,$3::jsonb,$4,$5,1,'')", [
      tokenHash,
      orderDate,
      JSON.stringify(plainLines),
      randomUUID(),
      original.id,
    ]);
  } catch (error) {
    closedRejected = /Order cannot be edited/.test(error.message);
  }
  if (!closedRejected) throw new Error("Closed order moved to a future date");
  // The DB must also protect another author's quote even if an API check is missed.
  await setup.query("update pricing_documents set kind='quote' where id=$1", [
    ids.document,
  ]);
  let quoteRejected = false;
  try {
    await setup.query(
      "select * from issue_storefront_links($1,$2,$3::jsonb,$4,null,$5)",
      [
        ids.companyA,
        ids.version,
        JSON.stringify(linkInput),
        linkExpiry,
        "f".repeat(64),
      ],
    );
  } catch (error) {
    quoteRejected = /published version unavailable/.test(error.message);
  }
  if (!quoteRejected) throw new Error("Another author's quote link issued");
  const ownQuote=await setup.query("select * from issue_storefront_links($1,$2,$3::jsonb,$4,null,$5)",[ids.companyA,ids.version,JSON.stringify(linkInput),linkExpiry,"b".repeat(64)]);
  if(ownQuote.rows[0]?.issued_link_id!==ids.link) throw new Error("Own quote link unavailable");
  await setup.query("update pricing_documents set kind='sheet' where id=$1", [
    ids.document,
  ]);
  console.log("PASS original cutoff and private quote issuance denial");

  const competing = [
    new pg.Client({ connectionString: url }),
    new pg.Client({ connectionString: url }),
  ];
  await Promise.all(competing.map((client) => client.connect()));
  try {
    const raceCustomer = randomUUID();
    await setup.query(
      "insert into normalized_customers(id,company_id,customer_name) values($1,$2,'race fixture')",
      [raceCustomer, ids.companyA],
    );
    const issuance = await Promise.all(
      competing.map((client) =>
        client.query(
          "select * from issue_storefront_links($1,$2,$3::jsonb,$4,null)",
          [
            ids.companyA,
            ids.version,
            JSON.stringify([
              {
                customerId: raceCustomer,
                id: randomUUID(),
                nonce: randomUUID().replaceAll("-", ""),
                hash:
                  randomUUID().replaceAll("-", "") +
                  randomUUID().replaceAll("-", ""),
              },
            ]),
            linkExpiry,
          ],
        ),
      ),
    );
    if (
      issuance[0].rows[0].issued_link_id !==
        issuance[1].rows[0].issued_link_id ||
      issuance.filter((r) => r.rows[0].was_created).length !== 1
    )
      throw new Error("Concurrent issuance duplicated a link");
    console.log("PASS concurrent link issuance");
    const editSeed=await callOrder(setup,plainLines);
    const edits=await Promise.allSettled(competing.map(client=>client.query("select place_store_order($1,$2,$3::jsonb,$4,$5,1,'')",[tokenHash,orderDate,JSON.stringify(plainLines),randomUUID(),editSeed.id])));
    if(edits.filter(r=>r.status==='fulfilled').length!==1||edits.filter(r=>r.status==='rejected').length!==1) throw new Error("Concurrent edits did not enforce revision");
    const duplicateKey=randomUUID();
    const retries=await Promise.all(competing.map(client=>callOrder(client,plainLines,duplicateKey)));
    if(retries[0].id!==retries[1].id) throw new Error("Concurrent retry duplicated order");
    console.log("PASS concurrent order retry and stale-edit conflict");
    const results = await Promise.allSettled(
      competing.map((client, index) =>
        callOrder(
          client,
          [
            {
              productId: ids.promoProduct,
              promotionId: ids.promotion,
              quantity: 1,
            },
          ],
          randomUUID(),
          index ? "b".repeat(64) : tokenHash,
        ),
      ),
    );
    if (
      results.filter((item) => item.status === "fulfilled").length !== 1 ||
      results.filter((item) => item.status === "rejected").length !== 1
    )
      throw new Error("Promotion stock was oversold or both requests failed");
    const stored = await setup.query(
      `select unit_price from public.store_order_lines
      where company_id=$1 and promotion_id=$2`,
      [ids.companyA, ids.promotion],
    );
    if (stored.rows.length !== 1 || Number(stored.rows[0].unit_price) !== 1200)
      throw new Error("Order did not charge the published 1200 won snapshot");
    const tenantOrders = await setup.query(
      `select count(*)::integer n from public.store_orders
      where company_id=$1`,
      [ids.companyB],
    );
    if (tenantOrders.rows[0].n !== 0)
      throw new Error("Company B received Company A orders");
    console.log("PASS concurrent stock, published price, and tenant isolation");
    await setup.query("update storefront_links set expires_at=clock_timestamp()+interval '1 second' where id=$1",[ids.link]);
    await competing[0].query('begin');
    await competing[0].query("select 1 from pricing_promotions where id=$1 for update",[ids.promotion]);
    const waiting=callOrder(competing[1],[{productId:ids.promoProduct,promotionId:ids.promotion,quantity:1}]).then(()=>null,error=>error);
    await new Promise(resolve=>setTimeout(resolve,1200));
    await competing[0].query('commit');
    const expiredError=await waiting;
    if(!expiredError||!/Link unavailable/.test(expiredError.message)) throw new Error("Order accepted after lock wait crossed link expiry");
    console.log("PASS link expiry after promotional lock wait");

  } finally {
    await Promise.all(competing.map((client) => client.end()));
  }
} finally {
  await setup.end();
}
