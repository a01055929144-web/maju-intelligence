import { createServer } from "node:http";
import { spawn } from "node:child_process";
import { createHash, randomBytes } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { resolve } from "node:path";
import pg from "pg";
import { chromium, expect } from "@playwright/test";
const db = process.env.PRICING_P1_LOCAL_DATABASE_URL;
if (!db)
  throw new Error(
    "Set PRICING_P1_LOCAL_DATABASE_URL for an already initialized local P1 test database",
  );
const target = new URL(db);
if (
  !["127.0.0.1", "localhost", "[::1]"].includes(target.hostname) ||
  !target.pathname.startsWith("/pricing_p1_test")
)
  throw new Error("Disposable loopback DB required");
const company = "00000000-0000-4000-8000-000000000011",
  product = "10000000-0000-4000-8000-000000000011";
const pool = new pg.Pool({ connectionString: db });
await pool.query("insert into companies(id) values($1)", [company]);
await pool.query(
  "insert into product_catalog(id,company_id,product_code,canonical_name,purchase_product_name,sales_product_name,purchase_price,tax_type,sales_spec,sales_unit) values($1,$2,'A11','INTERNAL-MANAGEMENT-A','INTERNAL-PURCHASE-A','공개 상품 A',18910,'exempt','1kg','개')",
  [product, company],
);
await pool.query("select pricing_p0_command($1,$2)", [
  company,
  { action: "defaults", margin: 12, rounding: 10 },
]);
const longIds = Array.from(
  { length: 21 },
  (_, i) => `11000000-0000-4000-8000-${String(i + 100).padStart(12, "0")}`,
);
for (const [i, id] of longIds.entries())
  await pool.query(
    "insert into product_catalog(id,company_id,product_code,canonical_name,purchase_product_name,sales_product_name,purchase_price,tax_type) values($1,$2,$3,'합성 관리 상품','합성 매입 상품',$4,1000,'exempt')",
    [id, company, "L" + i, "공개 긴 상품 " + i],
  );
const unknownId = "13000000-0000-4000-8000-000000000011";
await pool.query(
  "insert into product_catalog(id,company_id,product_code,canonical_name,purchase_product_name,sales_product_name,purchase_price,tax_type) values($1,$2,'UNKNOWN','과세 미확정 상품','합성 매입 상품','공개 과세 미확정',1000,null)",
  [unknownId, company],
);
const bridge = createServer(async (req, res) => {
  if (req.method !== "POST" || req.url !== "/rest/v1/rpc/pricing_p1") {
    res.writeHead(404).end();
    return;
  }
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
    const b = JSON.parse(raw);
    await client.query("begin");
    await client.query("set local role service_role");
    const r = await client.query("select pricing_p1($1,$2,$3,$4,$5) result", [
      b.p_company,
      b.p_actor,
      b.p_manager,
      b.p_action,
      b.p_payload,
    ]);
    await client.query("commit");
    res
      .writeHead(200, { "Content-Type": "application/json" })
      .end(JSON.stringify(r.rows[0].result));
  } catch (e) {
    await client.query("rollback");
    res
      .writeHead(400, { "Content-Type": "application/json" })
      .end(JSON.stringify({ message: e.message }));
  } finally {
    client.release();
  }
});
await new Promise((resolve) => bridge.listen(3178, "127.0.0.1", resolve));
const secret = randomBytes(32).toString("hex");
const port = 3179,
  base = `http://127.0.0.1:${port}`;
const server = spawn(
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
      HOLD_MODULES_ENABLED_COMPANY_IDS: company,
      ADMIN_SESSION_SECRET: secret,
      SUPABASE_URL: "http://127.0.0.1:3178",
      SUPABASE_SERVICE_ROLE_KEY: "local-test-only",
      SESSION_OBSERVATION_ENABLED: "false",
    },
    stdio: ["ignore", "pipe", "pipe"],
    windowsHide: true,
  },
);
let serverLog = "";
server.stdout.on("data", (x) => {
  serverLog += x;
});
server.stderr.on("data", (x) => {
  serverLog += x;
});
let browser;
const artifacts = resolve("../outputs/pricing-p1-browser");
await mkdir(artifacts, { recursive: true });
await writeFile(
  resolve(artifacts, "result.json"),
  JSON.stringify({ passed: false, status: "running" }),
);
function cookie(email, workspaceRole) {
  const session = {
    appRole: "customer_user",
    companyId: company,
    companyName: "합성 테스트 회사",
    email,
    name: "합성 사용자",
    role: workspaceRole === "owner" ? "owner" : "member",
    workspaceRole,
    workspaceType: "company",
  };
  const payload = Buffer.from(JSON.stringify(session)).toString("base64url");
  const signature = createHash("sha256")
    .update(`${payload}.${secret}`)
    .digest("hex");
  return {
    name: "maju_customer_session",
    value: `${payload}.${signature}`,
    url: base,
  };
}
try {
  let ready = false;
  for (let i = 0; i < 100; i++) {
    try {
      if ((await fetch(base + "/dashboard/login")).ok) {
        ready = true;
        break;
      }
    } catch {}
    await delay(500);
  }
  if (!ready)
    throw new Error("Local Next server not ready: " + serverLog.slice(-1200));
  browser = await chromium.launch({ headless: true });
  const owner = await browser.newContext({
    viewport: { width: 1440, height: 1000 },
    acceptDownloads: true,
  });
  await owner.addCookies([cookie("owner-fixture@example.test", "owner")]);
  const page = await owner.newPage();
  page.on("dialog", (dialog) => dialog.accept());
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto(base + "/revenue/pricing/documents?companyId=" + company);
  await page.getByRole("button", { name: "+ 단가표", exact: true }).click();
  await page.getByLabel("회사명", { exact: true }).fill("합성 유통 회사");
  await page
    .getByLabel("문서 제목", { exact: true })
    .fill("P1 브라우저 단가표");
  await page.getByRole("button", { name: /INTERNAL-MANAGEMENT-A.*\+/ }).click();
  await expect(page.getByLabel("품목 1 노출 상품명")).toHaveValue(
    "공개 상품 A",
  );
  await expect(page.getByLabel("품목 1 판매가")).toHaveValue("21180");
  await page.getByRole("button", { name: /과세 미확정 상품.*\+/ }).click();
  await expect(page.getByText(/과세 미확정 1개/)).toBeVisible();
  await expect(
    page.getByRole("button", { name: "초안 저장", exact: true }),
  ).toBeDisabled();
  await page.getByLabel("품목 2 과세").selectOption("exempt");
  await expect(
    page.getByRole("button", { name: "초안 저장", exact: true }),
  ).toBeEnabled();
  await page
    .getByRole("row")
    .filter({ has: page.getByLabel("품목 2 과세") })
    .getByRole("button", { name: "삭제", exact: true })
    .click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(
    page.getByText("초안을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "판매가 버전 확정", exact: true })
    .click();
  await expect(
    page.getByText("버전 1을 확정했습니다.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#pricing-print-root")).toContainText(
    "공개 상품 A",
  );
  await expect(page.locator("#pricing-print-root")).not.toContainText(
    "INTERNAL",
  );
  await expect(page.locator("#pricing-print-root")).not.toContainText("18,910");
  await page.screenshot({
    path: resolve(artifacts, "documents-desktop.png"),
    fullPage: true,
  });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "1쪽 PNG 저장", exact: true }).click();
  const image = await download;
  await image.saveAs(resolve(artifacts, "page-1.png"));
  const png = await readFile(resolve(artifacts, "page-1.png"));
  if (png.subarray(1, 4).toString() !== "PNG" || png.length < 10000)
    throw new Error("PNG export invalid");
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: resolve(artifacts, "document.pdf"),
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  const overflow = await page
    .locator(".pricing-paper")
    .evaluateAll((papers) =>
      papers.some((p) => p.scrollHeight > p.clientHeight + 2),
    );
  if (overflow) throw new Error("A4 content overflow");
  await page.getByLabel("품목 1 판매가").fill("23000");
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(
    page.getByText("초안을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "판매가 버전 확정", exact: true })
    .click();
  await expect(
    page.getByText("버전 2을 확정했습니다.", { exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
  await expect(page.locator("#pricing-print-root")).toContainText("21,180원");
  await expect(page.locator("#pricing-print-root")).not.toContainText(
    "23,000원",
  );
  // Full P1 library flow: common/private sets, current-price reload and linked promotion.
  await page
    .getByRole("button", { name: "행사·묶음·템플릿", exact: true })
    .click();
  await page
    .getByRole("button", { name: "현재 문서의 품목 담기", exact: true })
    .click();
  await page.getByLabel("이름", { exact: true }).fill("브라우저 묶음");
  await page.getByLabel("우리 회사 공용", { exact: true }).check();
  await page.getByRole("button", { name: "새로 저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "브라우저 묶음", exact: true }),
  ).toBeVisible();
  const setCard = page.getByRole("article").filter({
    has: page.getByRole("heading", { name: "브라우저 묶음", exact: true }),
  });
  await setCard
    .getByRole("button", { name: "복사해서 만들기", exact: true })
    .click();
  await page.getByLabel("이름", { exact: true }).fill("브라우저 템플릿");
  await page.getByLabel("종류", { exact: false }).selectOption("template");
  await page.getByRole("button", { name: "새로 저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "브라우저 템플릿", exact: true }),
  ).toBeVisible();
  const XLSX = (await import("xlsx")).default;
  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    XLSX.utils.aoa_to_sheet([["상품코드"], ["A11"]]),
    "묶음",
  );
  const excelPath = resolve(artifacts, "bundle-import.xlsx");
  await writeFile(
    excelPath,
    XLSX.write(workbook, { type: "buffer", bookType: "xlsx" }),
  );
  await page.getByLabel("엑셀에서 상품 코드 읽기").setInputFiles(excelPath);
  await expect(page.getByText("1개 품목", { exact: true })).toBeVisible();
  await page.getByLabel("이름", { exact: true }).fill("엑셀 묶음");
  await page.getByRole("button", { name: "새로 저장", exact: true }).click();
  await expect(
    page.getByRole("heading", { name: "엑셀 묶음", exact: true }),
  ).toBeVisible();
  await pool.query(
    "update product_catalog set purchase_price=20000 where company_id=$1 and id=$2",
    [company, product],
  );
  await page.getByRole("button", { name: "문서 작성", exact: true }).click();
  await page.getByRole("button", { name: "+ 견적서", exact: true }).click();
  await page.getByLabel("회사명", { exact: true }).fill("합성 유통 회사");
  await page
    .getByRole("button", { name: "브라우저 묶음 불러오기", exact: true })
    .click();
  await expect(page.getByLabel("품목 1 판매가")).toHaveValue("22400");
  await page
    .getByRole("button", { name: "행사·묶음·템플릿", exact: true })
    .click();
  await page
    .getByLabel("연결할 일반 상품", { exact: false })
    .selectOption(product);
  await page
    .getByLabel("관리 상품명(직원용)", { exact: true })
    .fill("INTERNAL-EVENT");
  await page
    .getByLabel("노출 상품명(매장용)", { exact: true })
    .fill("공개 행사 A");
  await page.getByLabel("행사 매입가", { exact: true }).fill("100");
  await page.locator('select[name="taxType"]').selectOption("exempt");
  await page.getByLabel("행사 재고(선택)", { exact: true }).fill("3");
  await page.getByRole("button", { name: "행사 등록", exact: true }).click();
  const promoRow = page.getByRole("row").filter({
    has: page.getByRole("cell", { name: "공개 행사 A", exact: true }),
  });
  await expect(promoRow).toBeVisible();
  await promoRow.getByRole("button", { name: "미리보기", exact: true }).click();
  await expect(page.locator("#pricing-print-root")).toContainText(
    "공개 행사 A",
  );
  await expect(page.locator("#pricing-print-root")).not.toContainText(
    "INTERNAL-EVENT",
  );
  await promoRow
    .getByRole("button", { name: "문서에 추가", exact: true })
    .click();
  await page.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(
    page.getByText("초안을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "판매가 버전 확정", exact: true })
    .click();
  await expect(
    page.getByText("버전 1을 확정했습니다.", { exact: true }),
  ).toBeVisible();
  await expect(page.locator("#pricing-print-root")).toContainText(
    "공개 행사 A",
  );
  const promoList = await (
    await owner.request.get(base + "/api/pricing-documents?action=promotions")
  ).json();
  const promo = promoList.result.find((p) => p.displayName === "공개 행사 A");
  const reduced = await owner.request.post(base + "/api/pricing-documents", {
    data: {
      action: "save-promotion",
      id: promo.id,
      expected: promo.revision,
      content: { ...promo, stock: 1 },
    },
  });
  if (!reduced.ok()) throw new Error("Promotion stock reduction failed");
  promo.revision += 1;
  const stockDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "1쪽 PNG 저장", exact: true }).click();
  await (await stockDownload).saveAs(resolve(artifacts, "live-stock-page.png"));
  await expect(page.locator("#pricing-print-root")).toContainText(
    "남은 수량 1",
  );
  const changed = await owner.request.post(base + "/api/pricing-documents", {
    data: {
      action: "save-promotion",
      id: promo.id,
      expected: promo.revision,
      content: { ...promo, stock: 0 },
    },
  });
  if (!changed.ok()) throw new Error("Promotion stock update failed");
  const soldDownload = page.waitForEvent("download");
  await page.getByRole("button", { name: "1쪽 PNG 저장", exact: true }).click();
  await (await soldDownload).saveAs(resolve(artifacts, "sold-out-page.png"));
  await expect(page.locator("#pricing-print-root")).not.toContainText(
    "공개 행사 A",
  );
  const sales = await browser.newContext({
    viewport: { width: 390, height: 844 },
  });
  await sales.addCookies([cookie("sales-fixture-a@example.test", "sales")]);
  const sp = await sales.newPage();
  await sp.goto(base + "/revenue/pricing/documents?companyId=" + company);
  const catalog = await sales.request.get(
    base + "/api/pricing-documents?action=catalog",
  );
  const catalogBody = await catalog.json();
  if (
    JSON.stringify(catalogBody).includes("INTERNAL") ||
    "cost" in catalogBody.result.items[0]
  )
    throw new Error("Sales cost/management name leak");
  await sp.getByRole("button", { name: "+ 견적서", exact: true }).click();
  await sp.getByLabel("회사명", { exact: true }).fill("합성 유통 회사");
  await sp.getByLabel("문서 제목", { exact: true }).fill("작성자 A 전용 견적");
  await sp.getByRole("button", { name: /공개 상품 A.*\+/ }).click();
  await sp.getByRole("button", { name: "초안 저장", exact: true }).click();
  await expect(
    sp.getByText("초안을 저장했습니다.", { exact: true }),
  ).toBeVisible();
  await sp
    .getByRole("button", { name: "판매가 버전 확정", exact: true })
    .click();
  await expect(
    sp.getByText("버전 1을 확정했습니다.", { exact: true }),
  ).toBeVisible();
  await sp.screenshot({
    path: resolve(artifacts, "quote-mobile.png"),
    fullPage: true,
  });
  const listed = await (
    await sales.request.get(base + "/api/pricing-documents")
  ).json();
  const quote = listed.result.items.find(
    (d) => d.content.title === "작성자 A 전용 견적",
  );
  if (!quote) throw new Error("Own quote missing");
  const other = await browser.newContext();
  await other.addCookies([cookie("sales-fixture-b@example.test", "sales")]);
  const otherList = await (
    await other.request.get(base + "/api/pricing-documents")
  ).json();
  if (otherList.result.items.some((d) => d.id === quote.id))
    throw new Error("Other author quote listed");
  if (
    (
      await other.request.get(
        base + "/api/pricing-documents?action=versions&id=" + quote.id,
      )
    ).status() !== 404
  )
    throw new Error("Other author version read accepted");
  // Exercise the actual A4 renderer with worst-length titles/footers and 21 long rows.
  const longTitle = "긴 문서 " + "가".repeat(95);
  const longContent = {
    kind: "sheet",
    title: longTitle,
    companyName: "나".repeat(100),
    contact: "다".repeat(100),
    recipient: "라".repeat(100),
    footer: "마".repeat(400),
    validUntil: "2099-01-01",
    theme: "mono",
    layout: "table",
    showPrice: true,
    showBrand: true,
    showSpec: true,
    lines: longIds.map((id) => ({
      productId: id,
      displayName: "긴 상품 " + "가".repeat(115),
      brand: "나".repeat(80),
      spec: "다".repeat(80),
      unit: "라".repeat(20),
      price: 12345,
      taxType: "exempt",
      visible: true,
      promotionId: null,
      startsOn: null,
      endsOn: null,
      remaining: null,
      badge: "",
    })),
  };
  const longId = "20000000-0000-4000-8000-000000000099";
  const savedLong = await owner.request.post(base + "/api/pricing-documents", {
    data: { action: "save", id: longId, expected: 0, content: longContent },
  });
  if (!savedLong.ok()) throw new Error("Long document save failed");
  const publishedLong = await owner.request.post(
    base + "/api/pricing-documents",
    { data: { action: "publish", id: longId, expected: 1 } },
  );
  if (!publishedLong.ok()) throw new Error("Long document publish failed");
  await page.getByRole("button", { name: "문서 작성", exact: true }).click();
  await page
    .getByRole("button", { name: "목록 새로고침", exact: true })
    .click();
  await page.getByRole("button", { name: new RegExp(longTitle) }).click();
  await page.getByRole("button", { name: /버전 1 미리보기/ }).click();
  const papers = page.locator(".pricing-paper");
  expect(await papers.count()).toBeGreaterThan(1);
  const longOverflow = await papers.evaluateAll((elements) =>
    elements.some((p) => p.scrollHeight > p.clientHeight + 2),
  );
  if (longOverflow) throw new Error("Long A4 rows overflow");
  await papers
    .first()
    .screenshot({ path: resolve(artifacts, "long-document-page.png") });
  await page.emulateMedia({ media: "print" });
  await page.pdf({
    path: resolve(artifacts, "document-multipage.pdf"),
    format: "A4",
    printBackground: true,
  });
  await page.emulateMedia({ media: "screen" });
  const pdf = await readFile(resolve(artifacts, "document-multipage.pdf"));
  const pdfPages = (pdf.toString("latin1").match(/\/Type\s*\/Page\b/g) || [])
    .length;
  if (pdfPages !== (await papers.count()))
    throw new Error(
      `PDF pagination mismatch ${pdfPages}/${await papers.count()}`,
    );
  if (errors.length) throw new Error("Browser errors: " + errors.join(";"));
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify(
      {
        passed: true,
        flows: [
          "sheet save/publish/immutable versions",
          "PNG",
          "A4 PDF/no overflow",
          "sales quote author isolation",
          "sales safe catalog",
          "mobile render",
          "unknown-tax confirmation",
          "Excel bundle import",
          "long A4/PDF pagination",
          "common/private bundle/template create/copy/use and current-price reload",
          "promotion create/quote/preview/live stock/sold-out PNG exclusion",
        ],
        pngBytes: png.length,
      },
      null,
      2,
    ),
  );
  console.log(
    "PASS browser -> API -> local PG16 -> response: documents, versions, PNG/A4, sales quote ownership",
  );
} catch (e) {
  const last = browser?.contexts()[0]?.pages()[0];
  if (last)
    await last
      .screenshot({ path: resolve(artifacts, "failure.png"), fullPage: true })
      .catch(() => {});
  await writeFile(
    resolve(artifacts, "result.json"),
    JSON.stringify({ passed: false, error: e.message }, null, 2),
  );
  console.error(serverLog.slice(-2000));
  throw e;
} finally {
  await browser?.close();
  server.kill();
  await new Promise((resolve) => bridge.close(resolve));
  await pool.query("delete from companies where id=$1", [company]);
  await pool.end();
}
