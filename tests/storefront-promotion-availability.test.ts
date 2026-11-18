import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { promotionAvailabilityFromRow, promotionAvailabilityLabels } from "../domains/order/promotion-availability";
import { StorefrontPromotionAvailability } from "../components/storefront-promotion-availability";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { readStorePromotionAvailability } from "../lib/pricing/storefront-promotion-availability";

const company = "00000000-0000-4000-8000-000000000001";
const id = "00000000-0000-4000-8000-000000000101";
const other = "00000000-0000-4000-8000-000000000201";
const row = { promotion_id: id, stock: 10, reserved_quantity: 3.125, remaining_quantity: 6.875, per_store_limit: 4 };
beforeEach(() => { mocks.db.mockReset(); vi.stubEnv("STORE_PROMOTION_AVAILABILITY_ENABLED", "true"); vi.stubEnv("STORE_PROMOTION_AVAILABILITY_COMPANY_IDS", company); });
afterEach(() => vi.unstubAllEnvs());

it("shows the RPC remaining quantity, not raw stock, and labels the store limit as a total", () => {
  const value = promotionAvailabilityFromRow(row);
  expect(value).toEqual({ state: "known", remaining: 6.875, storeLimit: 4 });
  expect(promotionAvailabilityLabels(value, "BOX")).toEqual({ remaining: "행사 남은 수량 6.875BOX", limit: "매장당 총 한도 4BOX · 기존 주문 포함" });
  expect(renderToStaticMarkup(createElement(StorefrontPromotionAvailability, { availability: value, unit: "BOX" }))).toContain("6.875BOX");
});

it("distinguishes sold out, unlimited stock, and failed reads", () => {
  const zero = promotionAvailabilityFromRow({ ...row, reserved_quantity: 10, remaining_quantity: 0 });
  const unlimited = promotionAvailabilityFromRow({ ...row, stock: null, remaining_quantity: null, per_store_limit: null });
  expect(promotionAvailabilityLabels(zero, "개").remaining).toBe("행사 남은 수량 0개");
  expect(promotionAvailabilityLabels(unlimited, "개").remaining).toBe("행사 수량 제한 없음");
  const html = renderToStaticMarkup(createElement(StorefrontPromotionAvailability, { availability: { state: "unavailable" }, unit: "개", onRetry: () => undefined }));
  expect(html).toContain("행사 잔량 확인 필요"); expect(html).toContain("행사 잔량 다시 확인");
  expect(html).not.toContain("행사 남은 수량 0"); expect(html).not.toContain("제한 없음");
});

it.each([{}, { ...row, remaining_quantity: null }, { ...row, remaining_quantity: -1 }, { ...row, remaining_quantity: Infinity },
  { ...row, remaining_quantity: 11 }, { ...row, remaining_quantity: 0.0001 }, { ...row, per_store_limit: NaN }])("does not turn malformed data into a known quantity", invalid => {
  expect(promotionAvailabilityFromRow(invalid)).toEqual({ state: "unavailable" });
});

it("does no RPC when disabled, unallowlisted, or there are no valid promotion IDs", async () => {
  vi.stubEnv("STORE_PROMOTION_AVAILABILITY_ENABLED", "");
  expect(await readStorePromotionAvailability(company, [id])).toBeUndefined();
  vi.stubEnv("STORE_PROMOTION_AVAILABILITY_ENABLED", "true");
  expect(await readStorePromotionAvailability("other-company", [id])).toBeUndefined();
  expect(await readStorePromotionAvailability(company, ["not-an-id"])).toBeUndefined();
  expect(mocks.db).not.toHaveBeenCalled();
});

it("deduplicates and scopes reads, and never exposes the RPC raw stock/reservation fields", async () => {
  mocks.db.mockResolvedValue([row]);
  const values = await readStorePromotionAvailability(company, [id, id]);
  expect(mocks.db).toHaveBeenCalledTimes(1);
  expect(JSON.parse(mocks.db.mock.calls[0][1].body)).toEqual({ p_company: company, p_promotion_ids: [id] });
  expect(values?.[id]).toEqual({ state: "known", remaining: 6.875, storeLimit: 4 });
  expect(JSON.stringify(values)).not.toMatch(/stock|reserved_quantity/);
});

it("keeps missing, foreign, duplicate or failed batch results unknown", async () => {
  for (const rows of [[], [{ ...row, promotion_id: other }], [row, row], null]) {
    mocks.db.mockResolvedValue(rows);
    expect((await readStorePromotionAvailability(company, [id]))?.[id]).toEqual({ state: "unavailable" });
  }
  mocks.db.mockRejectedValue(new Error("synthetic RPC unavailable"));
  expect((await readStorePromotionAvailability(company, [id]))?.[id]).toEqual({ state: "unavailable" });
});

it("chunks the existing SQL contract at 100 IDs and bounds a document at 300", async () => {
  const ids = Array.from({ length: 125 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`);
  mocks.db.mockImplementation(async (_path: string, init: RequestInit) => JSON.parse(String(init.body)).p_promotion_ids.map((promotion_id: string) => ({ ...row, promotion_id })));
  const values = await readStorePromotionAvailability(company, ids);
  expect(Object.keys(values || {})).toHaveLength(125);
  expect(mocks.db.mock.calls.map(call => JSON.parse(call[1].body).p_promotion_ids.length)).toEqual([100, 25]);
  mocks.db.mockClear();
  await readStorePromotionAvailability(company, Array.from({ length: 301 }, (_, i) => `00000000-0000-4000-8000-${String(i).padStart(12, "0")}`));
  expect(mocks.db).not.toHaveBeenCalled();
});
