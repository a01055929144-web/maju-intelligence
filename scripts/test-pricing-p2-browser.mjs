// Isolated public browser -> Next API -> service_role SQL -> disposable PG16.
import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { randomUUID, randomBytes, createHmac, createHash } from "node:crypto";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { setTimeout as delay } from "node:timers/promises";
import pg from "pg";
import { chromium, expect } from "@playwright/test";
const readonlySmoke = process.env.P2_READONLY_PG17_SMOKE === "true";
const db = process.env.PRICING_P2_LOCAL_DATABASE_URL;
if (!db) throw new Error("Initialized disposable PG16 DB required");
const target = new URL(db);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  !(readonlySmoke ? target.pathname === "/readonly_storefront_browser_test" : target.pathname.startsWith("/pricing_p2_test"))
)
  throw new Error("Loopback pricing_p2_test DB only");
// Match PostgREST JSON: int8/numeric values are numbers; DATE stays a KST calendar string.
pg.types.setTypeParser(20, Number);
pg.types.setTypeParser(1700, Number);
pg.types.setTypeParser(1082, (value) => value);
const pool = new pg.Pool({ connectionString: db });
const ids = Object.fromEntries(
  [
    "company",
    "customer",
    "otherCustomer",
    "territory",
    "plain",
    "promoProduct",
    "market",
    "promotion",
    "document",
    "version",
    "expiredVersion",
    "link",
    "otherLink",
    "expiredLink",
  ].map((k) => [k, randomUUID()]),
);
const secret = randomBytes(32).toString("hex"),
  port = 3189,
  bridgePort = 3188,
  base = `http://127.0.0.1:${port}`;
const day = new Intl.DateTimeFormat("en-CA", {
  timeZone: "Asia/Seoul",
  year: "numeric",
  month: "2-digit",
  day: "2-digit",
}).format(new Date());
const tokenFor = (id) => {
  const nonce = randomBytes(16).toString("hex");
  const sig = createHmac("sha256", secret)
    .update(`store-link-v1:${id}:${nonce}`)
    .digest("hex");
  const token = `${id}.${nonce}.${sig}`;
  return {
    nonce,
    token,
    hash: createHash("sha256").update(token).digest("hex"),
  };
};
const tokens = Object.fromEntries(
  ["link", "otherLink", "expiredLink"].map((k) => [k, tokenFor(ids[k])]),
);
const artifacts = resolve(readonlySmoke ? "test-results/readonly-pg17" : "../outputs/pricing-p2-browser");
await mkdir(artifacts, { recursive: true });
await writeFile(
  resolve(artifacts, "result.json"),
  JSON.stringify({ passed: false, status: "running" }),
);
let browser, server, bridge;
let serverLog = "";
const reads = [];
const bridgeErrors = [];
const errors = [];
const tables = new Set([
  "storefront_links",
  "pricing_document_versions",
  "normalized_customers",
  "store_order_settings",
  "product_catalog",
  "pricing_promotions",
  "store_order_territory_rules",
  "store_order_customer_rules",
  "store_order_holidays",
  "customer_price_agreements",
  "store_orders",
  "store_order_lines",
  "store_product_preferences",
]);
const columns = new Map();
function identifier(table, name) {
  if (!columns.get(table)?.has(name))
    throw new Error("Unsupported fixture column");
  return `"${name}"`;
}
try {
  const v = await pool.query("show server_version_num");
  if (Math.floor(Number(v.rows[0].server_version_num) / 10000) !== (readonlySmoke ? 17 : 16))
    throw new Error("Expected disposable PostgreSQL version required");
  await pool.query("insert into companies(id) values($1)", [ids.company]);
  await pool.query(
    "insert into delivery_territories(id,company_id) values($1,$2)",
    [ids.territory, ids.company],
  );
  for (const [id, name] of [
    [ids.customer, "합성 매장 A"],
    [ids.otherCustomer, "합성 매장 B"],
  ].slice(0, readonlySmoke ? 1 : 2))
    await pool.query(
      "insert into normalized_customers(id,company_id,customer_name,address,delivery_territory_id) values($1,$2,$3,'합성 배송지',$4)",
      [id, ids.company, name, ids.territory],
    );
  for (const [id, name, mode] of [
    [ids.plain, "공개 기본 상품", "fixed"],
    [ids.promoProduct, "공개 행사 상품", "fixed"],
    [ids.market, "공개 시세 상품", "market"],
  ])
    await pool.query(
      "insert into product_catalog(id,company_id,purchase_product_name,purchase_price,sales_product_name,sales_unit,tax_type,order_pricing_mode) values($1,$2,'INTERNAL-PURCHASE',18910,$3,'개','exempt',$4)",
      [id, ids.company, name, mode],
    );
  await pool.query(
    "insert into pricing_promotions(id,company_id,product_id,name,display_name,starts_on,ends_on,purchase_cost,margin_bp,price,stock,per_store_limit,tax_type,badge,revision) values($1,$2,$3,'INTERNAL-PROMO','공개 행사 상품','2020-01-01','2099-12-31',100,0,5000,100,10,'exempt','행사',1)",
    [ids.promotion, ids.company, ids.promoProduct],
  );
  const line = (productId, displayName, price, promotionId = null) => ({
    productId,
    promotionId,
    displayName,
    price,
    visible: true,
    unit: "개",
    spec: "1kg",
    brand: "",
    badge: promotionId ? "행사" : "",
    taxType: "exempt",
  });
  const content = {
    kind: readonlySmoke ? "quote" : "sheet",
    title: readonlySmoke ? "합성 PG17 18품목 견적" : "P2 공개 주문",
    companyName: "합성 유통",
    footer: "합성 안내",
    showPrice: true,
    validUntil: "2099-12-31",
    lines: [
      line(ids.plain, "공개 기본 상품", 1000),
      line(ids.promoProduct, "공개 행사 상품", 1200, ids.promotion),
      line(ids.market, "공개 시세 상품", 1500),
    ],
  };
  if (readonlySmoke) for (let i=4;i<=18;i++) {
    const id=randomUUID();
    await pool.query("insert into product_catalog(id,company_id,purchase_product_name,purchase_price,sales_product_name,sales_unit,tax_type,order_pricing_mode) values($1,$2,'INTERNAL-PURCHASE',18910,$3,'개','exempt','fixed')",[id,ids.company,`합성 PG17 품목${i}`]);
    content.lines.push(line(id,`합성 PG17 품목${i}`,1000));
  }
  await pool.query(
    "insert into pricing_documents(id,company_id,owner_key,kind,revision,content) values($1,$2,$3,$4,1,$5)",
    [ids.document, ids.company, "b".repeat(64), content.kind, content],
  );
  for (const [id, c, n] of [
    [ids.version, content, 1],
    [ids.expiredVersion, { ...content, validUntil: "2000-01-01" }, 2],
  ].slice(0, readonlySmoke ? 1 : 2))
    await pool.query(
      "insert into pricing_document_versions(id,company_id,document_id,version,revision,content) values($1,$2,$3,$4,$4,$5)",
      [id, ids.company, ids.document, n, c],
    );
  for (const [key, customerId, versionId] of [
    ["link", ids.customer, ids.version],
    ["otherLink", ids.otherCustomer, ids.version],
    ["expiredLink", ids.customer, ids.expiredVersion],
  ].slice(0, readonlySmoke ? 1 : 3)) {
    if (readonlySmoke) {
      await pool.query("insert into storefront_links(id,company_id,customer_id,document_version_id,token_nonce,token_hash,expires_at,can_order) values($1,$2,$3,$4,$5,$6,$7,false)",[ids[key],ids.company,customerId,versionId,tokens[key].nonce,tokens[key].hash,new Date(Date.now()+86400000).toISOString()]);
      continue;
    }
    await pool.query("select * from issue_storefront_links($1,$2,$3,$4,null)", [
      ids.company,
      versionId,
      JSON.stringify([
        {
          customerId,
          id: ids[key],
          nonce: tokens[key].nonce,
          hash: tokens[key].hash,
        },
      ]),
      new Date(Date.now() + 86400000).toISOString(),
    ]);
  }
  await pool.query(
    "insert into store_order_settings(company_id,minimum_amount,minimum_policy,delivery_fee) values($1,2000,'fee',500)",
    [ids.company],
  );
  await pool.query(
    "insert into store_order_territory_rules(company_id,territory_id,delivery_weekdays,cutoff_days_before,cutoff_time) values($1,$2,array[0,1,2,3,4,5,6]::smallint[],0,'23:59')",
    [ids.company, ids.territory],
  );
  if (!readonlySmoke) await pool.query(
    "insert into customer_price_agreements(id,company_id,customer_id,product_catalog_id,sales_unit,unit_price,tax_type,status,effective_from) values($1,$2,$3,$4,'개',900,'exempt','active','2020-01-01')",
    [randomUUID(), ids.company, ids.customer, ids.plain],
  );
  for (let i = 0; i < (readonlySmoke ? 0 : 11); i++)
    await pool.query("select place_store_order($1,$2,$3,$4)", [
      tokens.link.hash,
      day,
      JSON.stringify([{ productId: ids.plain, quantity: 1 }]),
      randomUUID(),
    ]);
  // Dependency tables mirror the existing service role read privileges, locally only.
  await pool.query(
    "grant select on normalized_customers,delivery_territories,customer_price_agreements,business_documents,business_document_lines to service_role",
  );
  const schema = await pool.query(
    "select table_name,column_name from information_schema.columns where table_schema='public'",
  );
  for (const r of schema.rows) {
    if (!columns.has(r.table_name)) columns.set(r.table_name, new Set());
    columns.get(r.table_name).add(r.column_name);
  }
  bridge = createServer(async (req, res) => {
    if (readonlySmoke && (req.headers.apikey!=="local-test-only" || req.headers.authorization!=="Bearer local-test-only")) {
      res.writeHead(401).end(); return;
    }
    const u = new URL(req.url, "http://127.0.0.1");
    const table = u.pathname.replace(/^\/rest\/v1\//, "");
    reads.push(table);
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (raw.length > 512000) {
        res.writeHead(413).end();
        return;
      }
    }
    const client = await pool.connect();
    try {
      await client.query("begin");
      await client.query("set local role service_role");
      let result;
      if (table.startsWith("rpc/")) {
        const b = JSON.parse(raw || "{}");
        const name = table.slice(4);
        if (readonlySmoke && !["record_storefront_view","store_recent_dispatch_prices"].includes(name)) throw new Error("Readonly smoke forbids mutation RPC");
        const calls = {
          place_store_order: [
            "select place_store_order($1,$2,$3,$4,$5,$6,$7) value",
            [
              b.p_token_hash,
              b.p_delivery_date,
              JSON.stringify(b.p_lines),
              b.p_idempotency_key,
              b.p_order_id,
              b.p_expected_revision,
              b.p_memo,
            ],
          ],
          record_storefront_view: [
            "select record_storefront_view($1,$2) value",
            [b.p_token_hash, b.p_device_class],
          ],
          store_recent_dispatch_prices: [
            "select * from store_recent_dispatch_prices($1,$2,$3)",
            [b.p_company, b.p_customer, b.p_products],
          ],
        };
        if (!calls[name]) throw new Error("Unsupported local RPC");
        const r = await client.query(...calls[name]);
        result =
          name === "store_recent_dispatch_prices" ? r.rows : r.rows[0].value;
      } else {
        if (!tables.has(table)) throw new Error("Unsupported local table");
        const params = [];
        const bind = (v) => {
          params.push(v);
          return `$${params.length}`;
        };
        const predicate = (key, value) => {
          const col = identifier(table, key);
          if (value === "is.null") return `${col} is null`;
          const m = /^(eq|gt|gte|lte|in)\.(.*)$/.exec(value);
          if (!m) throw new Error("Unsupported filter");
          if (m[1] === "in")
            return `${col}=any(${bind(m[2].slice(1, -1).split(","))}::uuid[])`;
          return `${col}${{ eq: "=", gt: ">", gte: ">=", lte: "<=" }[m[1]]}${bind(m[2])}`;
        };
        const filters = [];
        for (const [k, v] of u.searchParams) {
          if (["select", "limit", "offset", "order", "on_conflict"].includes(k))
            continue;
          if (k === "or") {
            filters.push(
              "(" +
                v
                  .slice(1, -1)
                  .split(",")
                  .map((term) => {
                    const i = term.indexOf(".");
                    return predicate(term.slice(0, i), term.slice(i + 1));
                  })
                  .join(" or ") +
                ")",
            );
          } else filters.push(predicate(k, v));
        }
        const where = filters.length ? " where " + filters.join(" and ") : "";
        const selected = u.searchParams.get("select") || "*";
        const projection =
          selected === "*"
            ? "*"
            : selected
                .split(",")
                .map((c) => identifier(table, c))
                .join(",");
        if (req.method === "GET") {
          const order = (u.searchParams.get("order") || "")
            .split(",")
            .filter(Boolean)
            .map((x) => {
              const [c, d] = x.split(".");
              if (!["asc", "desc"].includes(d))
                throw new Error("Order direction");
              return identifier(table, c) + " " + d;
            });
          const limit = Number(u.searchParams.get("limit") || 1000),
            offset = Number(u.searchParams.get("offset") || 0);
          if (
            !Number.isSafeInteger(limit) ||
            limit < 1 ||
            limit > 1000 ||
            !Number.isSafeInteger(offset) ||
            offset < 0
          )
            throw new Error("Invalid fixture page");
          result = (
            await client.query(
              `select ${projection} from "${table}"${where}${order.length ? " order by " + order.join(",") : ""} limit ${limit} offset ${offset}`,
              params,
            )
          ).rows;
        } else if (
          req.method === "POST" &&
          table === "store_product_preferences"
        ) {
          if (readonlySmoke) throw new Error("Readonly smoke forbids preference writes");
          const body = JSON.parse(raw),
            keys = Object.keys(body);
          const conflict = (u.searchParams.get("on_conflict") || "")
            .split(",")
            .map((c) => identifier(table, c));
          result = (
            await client.query(
              `insert into "${table}"(${keys.map((c) => identifier(table, c)).join(",")}) values(${keys.map((k) => bind(body[k])).join(",")}) on conflict(${conflict.join(",")}) do update set ${keys
                .filter(
                  (k) =>
                    !["company_id", "customer_id", "product_id"].includes(k),
                )
                .map(
                  (k) =>
                    `${identifier(table, k)}=excluded.${identifier(table, k)}`,
                )
                .join(",")} returning *`,
              params,
            )
          ).rows;
        } else throw new Error("Unsupported local mutation");
      }
      await client.query("commit");
      res
        .writeHead(200, { "content-type": "application/json" })
        .end(JSON.stringify(result));
    } catch (e) {
      bridgeErrors.push({ table, message: e.message });
      await client.query("rollback");
      res
        .writeHead(400, { "content-type": "application/json" })
        .end(JSON.stringify({ message: e.message }));
    } finally {
      client.release();
    }
  });
  await new Promise((r) => bridge.listen(bridgePort, "127.0.0.1", r));
  server = spawn(
    process.execPath,
    [
      resolve("node_modules/next/dist/bin/next"),
      "start",
      "--hostname",
      "127.0.0.1",
      "--port",
      String(port),
    ],
    {
      cwd: process.cwd(),
      env: {
        ...process.env,
        NODE_ENV: "production",
        PRICE_SHEETS_ENABLED: "true",
        STORE_ORDERING_ENABLED: "true",
        STORE_LINK_SECRET: secret,
        STORE_PUBLIC_BASE_URL: "https://store.example.test",
        FEATURE_PRICING_COMPANY_IDS: ids.company,
        FEATURE_STORE_ORDERING_COMPANY_IDS: ids.company,
        ...(readonlySmoke ? { STORE_MEMBER_SESSION_ENABLED: "false", READ_ONLY_STORE_LINKS_ENABLED: "false", READ_ONLY_STORE_LINKS_COMPANY_IDS: "", CI_LAYOUT_FIXTURES: "disabled" } : {}),
        HOLD_MODULES_ENABLED_COMPANY_IDS: ids.company,
        SUPABASE_URL: `http://127.0.0.1:${bridgePort}`,
        SUPABASE_SERVICE_ROLE_KEY: "local-test-only",
        ADMIN_SESSION_SECRET: randomBytes(32).toString("hex"),
        SESSION_OBSERVATION_ENABLED: "false",
      },
      stdio: ["ignore", "pipe", "pipe"],
      windowsHide: true,
    },
  );
  server.stdout.on("data", (x) => (serverLog += x));
  server.stderr.on("data", (x) => (serverLog += x));
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/store")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (!ready) throw new Error("Next not ready: " + serverLog.slice(-1000));
  browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await context.route("**/*", (route) => {
    const url = new URL(route.request().url());
    return ["127.0.0.1", "localhost"].includes(url.hostname)
      ? route.continue()
      : route.abort();
  });
  const page = await context.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  const requestPaths = [];
  page.on("request", (r) => requestPaths.push(r.url()));
  if (readonlySmoke) {
    await page.goto(base + "/store#" + tokens.link.token);
    await expect(page.getByRole("heading", { name: content.title, exact: true })).toBeVisible();
    const response = await context.request.post(base + "/api/storefront", { headers: { origin: base }, data: { token: tokens.link.token } });
    expect(response.status()).toBe(200);
    const data = await response.json();
    expect(data.store.lines).toHaveLength(18); expect(data.store.canOrder).toBe(false);
    expect(data.store.customerName).toBe("합성 매장 A");
    expect(data.store.lines.find(l=>l.productId===ids.plain).unitPrice).toBe(1000);
    for (const privateValue of ["INTERNAL","18910","purchaseCost","supplier","margin","objectKey","accessPassword"]) expect(JSON.stringify(data)).not.toContain(privateValue);
    for (const width of [1440,390]) {
      await page.setViewportSize({width,height:900});
      await page.getByRole("button",{name:"주문",exact:true}).click();
      await expect(page.getByText("합성 PG17 품목18",{exact:true})).toBeVisible();
      await expect(page.getByRole("button",{name:"후결제로 주문 신청",exact:true})).toBeDisabled();
      expect(await page.evaluate(()=>document.documentElement.scrollWidth>innerWidth+3)).toBe(false);
      await page.screenshot({path:resolve(artifacts,`readonly-pg17-${width}.png`),fullPage:true});
      await page.getByRole("button",{name:"데이터",exact:true}).click();
      await expect(page.getByText("현재 주문 링크에서는 원가 자료를 제공하지 않습니다.",{exact:false})).toBeVisible();
      await expect(page.getByRole("button",{name:"엑셀 원가 업로드",exact:true})).toHaveCount(0);
    }
    const counts=(await pool.query("select (select count(*) from companies) companies,(select count(*) from normalized_customers) customers,(select count(*) from pricing_document_versions) versions,(select count(*) from storefront_links) links,(select count(*) from store_orders) orders,(select count(*) from store_order_requests) requests,(select count(*) from store_order_lines) lines,(select count(*) from store_product_preferences) preferences")).rows[0];
    expect(counts).toEqual({companies:1,customers:1,versions:1,links:1,orders:0,requests:0,lines:0,preferences:0});
    expect(Number((await pool.query('select view_count from storefront_links where id=$1',[ids.link])).rows[0].view_count)).toBeGreaterThan(0);
    expect(requestPaths.some(url=>url.includes('/api/store/costs'))).toBe(false);
    expect(reads.some(name=>/onboarding|supplier|vault/.test(name))).toBe(false);
    expect(requestPaths.some(url=>url.includes(encodeURIComponent(tokens.link.token)))).toBe(false);
    await pool.query('update storefront_links set revoked_at=now(),can_order=false where id=$1',[ids.link]);
    await page.reload();
    await expect(page.getByText("매장 링크를 사용할 수 없습니다.",{exact:false})).toBeVisible();
    expect(errors).toEqual([]); expect(bridgeErrors).toEqual([]);
    await writeFile(resolve(artifacts,'result.json'),JSON.stringify({passed:true,database:'loopback PG17',products:18,widths:[1440,390],orders:0,requests:0,preferences:0,revoked:true,productionChanged:false},null,2));
    console.log('PASS readonly browser -> Next API -> service_role -> PG17: 18 products, PC/390, no orders, revoke');
  } else {
  await page.goto(base + "/store#" + tokens.link.token);
  await expect(
    page.getByRole("heading", { name: "P2 공개 주문", exact: true }),
  ).toBeVisible();
  const publicData = await (
    await context.request.post(base + "/api/storefront", {
      headers: { origin: base },
      data: { token: tokens.link.token },
    })
  ).json();
  const serialized = JSON.stringify(publicData);
  for (const value of [
    "INTERNAL",
    "18910",
    "objectKey",
    "envelope",
    "accessPassword",
    "registrationFile",
    "supplier",
    "margin",
  ])
    if (serialized.includes(value))
      throw new Error("Private data leaked: " + value);
  if (
    publicData.store.lines.find((l) => l.productId === ids.plain).unitPrice !==
      900 ||
    publicData.store.lines.find((l) => l.promotionId === ids.promotion)
      .unitPrice !== 1200
  )
    throw new Error("Published/contract price mismatch");
  await page.getByRole("button", { name: "주문하기", exact: true }).click();
  const plain = page
    .getByRole("listitem")
    .filter({ has: page.getByText("공개 기본 상품", { exact: true }) });
  await plain.getByRole("button", { name: "즐겨찾기", exact: true }).click();
  await expect(
    plain.getByRole("button", { name: "즐겨찾기 해제", exact: true }),
  ).toBeVisible();
  await plain.getByRole("button", { name: "품목 숨기기", exact: true }).click();
  await expect(plain).toHaveCount(0);
  await page.getByRole("button", { name: "숨긴 품목", exact: true }).click();
  await plain.getByRole("button", { name: "다시 표시", exact: true }).click();
  await page.getByRole("button", { name: "전체", exact: true }).click();
  await page
    .getByRole("button", { name: "공개 기본 상품 수량 늘리기", exact: true })
    .click();
  await expect(
    page.getByText("부가세 0원 · 배송비 500원", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "공개 행사 상품 수량 늘리기", exact: true })
    .click();
  await page
    .getByRole("button", { name: "공개 시세 상품 수량 늘리기", exact: true })
    .click();
  await expect(
    page.getByText("확정된 품목 합계 2,100원", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("textbox", { name: "요청 사항", exact: true })
    .fill("합성 주문 요청");
  await page.evaluate(() => window.scrollTo(0, 0));
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Order mobile horizontal overflow");
  await page.screenshot({
    path: resolve(artifacts, "order-mobile.png"),
    fullPage: false,
  });
  await page
    .getByRole("button", { name: "후결제로 주문 신청", exact: true })
    .click();
  await expect(
    page.getByText("주문을 받았습니다. 주문 내역에서 확인해 주세요.", {
      exact: true,
    }),
  ).toBeVisible();
  await expect(page.getByRole("article").first()).toContainText(
    "2,100원 + 시세 품목 가격 미정",
  );
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "마감 전 수정", exact: true })
    .click();
  await page
    .getByRole("button", { name: "공개 기본 상품 수량 늘리기", exact: true })
    .click();
  await expect(
    page.getByRole("textbox", { name: "요청 사항", exact: true }),
  ).toHaveValue("합성 주문 요청");
  await page.getByRole("button", { name: "수정 저장", exact: true }).click();
  await expect(page.getByRole("article").first()).toContainText("3,000원");
  await page.getByRole("button", { name: "다음", exact: true }).click();
  await expect(page.getByText("2페이지", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "이전", exact: true }).click();
  await expect(page.getByText("1페이지", { exact: true })).toBeVisible();
  await page
    .getByRole("article")
    .first()
    .getByRole("button", { name: "다시 담기", exact: true })
    .click();
  await expect(
    page.getByRole("button", { name: "후결제로 주문 신청", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "내 정보", exact: true }).click();
  await expect(
    page.locator('input[type="file"],input[type="password"]'),
  ).toHaveCount(0);
  if (
    await page.evaluate(() => document.documentElement.scrollWidth > innerWidth)
  )
    throw new Error("Mobile horizontal overflow");
  await page.setViewportSize({ width: 1440, height: 1000 });
  await page.screenshot({
    path: resolve(artifacts, "store-desktop.png"),
    fullPage: true,
  });
  const other = await (
    await context.request.post(base + "/api/storefront", {
      headers: { origin: base },
      data: { token: tokens.otherLink.token },
    })
  ).json();
  if (other.orders.length || other.store.customerName !== "합성 매장 B")
    throw new Error("Cross-store history leak");
  const cross = await context.request.put(base + "/api/storefront", {
    headers: { origin: base },
    data: {
      token: tokens.otherLink.token,
      deliveryDate: day,
      idempotencyKey: randomUUID(),
      orderId: publicData.orders[0].id,
      expectedRevision: 1,
      memo: "",
      lines: [{ productId: ids.plain, quantity: 1 }],
    },
  });
  if (cross.status() !== 409) throw new Error("Cross-store edit allowed");
  const expired = await context.newPage();
  await expired.goto(base + "/store#" + tokens.expiredLink.token);
  await expect(expired.getByText(/문서 유효기간이 지났습니다/)).toBeVisible();
  await expired.getByRole("button", { name: "주문하기", exact: true }).click();
  await expect(
    expired.getByRole("button", { name: "후결제로 주문 신청", exact: true }),
  ).toBeDisabled();
  await expect(
    expired.getByText("가격 문의", { exact: true }).first(),
  ).toBeVisible();
  await pool.query(
    "update storefront_links set revoked_at=clock_timestamp() where id=$1",
    [ids.link],
  );
  await page.reload();
  await expect(page.getByRole("status")).toContainText(
    "매장 링크를 사용할 수 없습니다",
  );
  const bad = await context.request.post(base + "/api/storefront", {
    headers: { origin: base },
    data: { token: tokens.link.token.slice(0, -1) + "x" },
  });
  if (bad.status() !== 404) throw new Error("Tampered token accepted");
  if (errors.length) throw new Error(errors.join("; "));
  if (reads.some((x) => x.includes("onboarding")))
    throw new Error("Public request reached private vault");
  if (
    requestPaths.some((url) =>
      url.includes(encodeURIComponent(tokens.link.token)),
    )
  )
    throw new Error("Token leaked into URL");
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify(
      {
        passed: true,
        flows: [
          "mobile/desktop",
          "contract and published promo price",
          "fee/market pending",
          "favorites/hide",
          "postpay order/edit/reorder",
          "history pages",
          "cross-store denial",
          "expired/revoked/tampered links",
          "private vault never queried",
        ],
        database: "loopback PG16",
        productionChanged: false,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS public browser -> API -> service_role -> PG16: order/edit/reorder, privacy, tenant, mobile, expiry",
  );
  }
} catch (e) {
  let safeMessage=e.message;
  for (const value of Object.values(tokens)) safeMessage=safeMessage.replaceAll(value.token,"[redacted]");
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify({ passed: false, error: safeMessage, bridgeErrors }),
  );
  throw readonlySmoke ? new Error(safeMessage) : e;
} finally {
  if (browser) await browser.close();
  if (server) {
    const exited = new Promise((r) => server.once("exit", r));
    server.kill();
    await Promise.race([exited, delay(5000)]);
  }
  if (bridge) await new Promise((r) => bridge.close(r));
  await pool
    .query("delete from companies where id=$1", [ids.company])
    .catch(() => {});
  await pool.end();
}
