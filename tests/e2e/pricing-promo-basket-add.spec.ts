import { expect, test } from "@playwright/test";
import { lineFromCatalog, type DocumentContent } from "../../domains/pricing/document";

// CC-35: 행사·임박 탭에서 3개 체크 → 선택 3개 담기 하면 종이에 행사 줄 3개가 모두 남는다(앞 줄이 덮어써지지 않는다).
const id = "10000000-0000-4000-8000-000000000001";
const product = { id: "20000000-0000-4000-8000-000000000001", name: "합성 아주 긴 이름의 냉동 감자튀김 슈스트링 대용량", displayName: "합성 아주 긴 이름의 냉동 감자튀김 슈스트링 대용량", brand: "", spec: "2.5kg×4입 / 냉동 보관 / 재포장 불가", unit: "박스", price: 1234567, taxType: "exempt" as const };
const content: DocumentContent = { kind: "sheet", title: "행사 담기 문서", companyName: "합성", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, display: { columns: 1, promoLayout: "cards", info: [] }, lines: [] };
const day = (offset: number) => new Date(Date.now() + 9 * 3600000 + offset * 86400000).toISOString().slice(0, 10);
const products = [1, 2, 3].map((n) => ({ ...product, id: `20000000-0000-4000-8000-00000000000${n}`, name: `합성 행사 상품 ${n}`, displayName: `합성 행사 상품 ${n}` }));
const promotions = products.map((p, i) => ({ id: `30000000-0000-4000-8000-00000000000${i + 1}`, productId: p.id, name: p.name, displayName: p.displayName, startsOn: day(-1), endsOn: day(5), price: 1000 + i, stock: null, perStoreLimit: null, allowSheet: true, badge: "행사" as const, revision: 1, taxType: "exempt" as const }));

test("promotion tab: checking 3 and adding puts all 3 promotion lines on the paper", async ({ page }) => {
  page.setDefaultTimeout(15_000);
  await page.setViewportSize({ width: 1440, height: 1000 });
  expect((await page.request.post("/api/customer/login", { data: { email: "ci-owner@example.test", password: "ci-owner-layout-password-2026" } })).ok()).toBeTruthy();
  await page.route("**/api/pricing-documents*", async (route) => {
    const url = new URL(route.request().url());
    const action = url.searchParams.get("action") || "list";
    let result: unknown = [];
    if (action === "list") result = { items: [{ id, revision: 1, content, updatedAt: "2026-11-06T00:00:00Z", recalculation: { publishedAt: null, needsRecalculation: false, changedProductCount: 0 } }], total: 1 };
    if (action === "profile") result = { revision: 0, content: { companyName: "합성", contact: "", footer: "" } };
    if (action === "promotions") result = promotions;
    if (action === "catalog") { const wanted = (url.searchParams.get("productIds") || "").split(","); result = { items: products.filter((p) => !wanted[0] || wanted.includes(p.id)), total: 3 }; }
    return route.fulfill({ json: { result, manager: true } });
  });
  await page.goto("/revenue/pricing/documents");
  await page.getByRole("button", { name: "행사 담기 문서", exact: true }).click();
  await page.getByRole("tab", { name: /행사/ }).click();
  for (const p of products) await page.getByRole("checkbox", { name: `${p.displayName} 선택` }).check();
  await page.getByRole("button", { name: "선택 3개 담기" }).click();
  for (const p of products) await expect(page.getByText(p.displayName).first()).toBeVisible();
  await expect(page.getByText("담김")).toHaveCount(3);
});
