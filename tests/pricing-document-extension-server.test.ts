import { afterEach, expect, it, vi } from "vitest";
import { pricingDocuments, type PricingDocumentsRepository } from "../application/pricing/documents";
import { documentExtensionServerEnabled } from "../lib/pricing/document-extension-server";

const scope = { companyId: "10000000-0000-4000-8000-000000000001", actor: "a".repeat(64), manager: true };
const content = {
  kind: "sheet", title: "연장 단가표", companyName: "합성 유통", contact: "", recipient: "합성 매장", footer: "",
  validUntil: "2026-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true,
  customerId: "20000000-0000-4000-8000-000000000001",
  lines: [{ productId: "30000000-0000-4000-8000-000000000001", displayName: "양파", brand: "", spec: "1망", unit: "망",
    price: 1200, taxType: "exempt", visible: true, promotionId: null, startsOn: null, endsOn: null, remaining: null, badge: "" }],
};

afterEach(() => vi.unstubAllEnvs());

it("keeps the server extension gate off unless flag and company both match", () => {
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_ENABLED", "true");
  vi.stubEnv("PRICING_DOCUMENT_EXTENSION_COMPANY_IDS", scope.companyId);
  expect(documentExtensionServerEnabled(scope.companyId)).toBe(true);
  expect(documentExtensionServerEnabled("20000000-0000-4000-8000-000000000002")).toBe(false);
});

it("normalizes all four extension actions before the repository boundary", async () => {
  const request = vi.fn(async (_scope, action, payload) => ({ action, payload }));
  const documents = pricingDocuments({ request } as PricingDocumentsRepository);
  await documents.execute(scope, { action: "extension-review", id: "40000000-0000-4000-8000-000000000001", expected: 2,
    mode: "latest", validUntil: "2026-12-31", stage: "review", content });
  await documents.execute(scope, { action: "extension-catalog", id: "40000000-0000-4000-8000-000000000001", expected: 2,
    mode: "latest", productIds: ["30000000-0000-4000-8000-000000000001"] });
  await documents.execute(scope, { action: "extension-save", id: "40000000-0000-4000-8000-000000000001", expected: 2, mode: "latest", content });
  await documents.execute(scope, { action: "extension-publish", id: "40000000-0000-4000-8000-000000000001", expected: 2,
    mode: "latest", token: "A".repeat(43), idempotencyKey: "80000000-0000-4000-8000-000000000001" });
  expect(request.mock.calls.map(call => call[1])).toEqual(["extension-review", "extension-catalog", "extension-save", "extension-publish"]);
  expect(request.mock.calls[0][2]).toMatchObject({ stage: "review", mode: "latest", content: { customerId: content.customerId } });
});

it("rejects a missing mode, malformed token and non-UUID retry key before storage", async () => {
  const request = vi.fn();
  const documents = pricingDocuments({ request } as PricingDocumentsRepository);
  expect(() => documents.execute(scope, { action: "extension-review", id: "40000000-0000-4000-8000-000000000001", expected: 2,
    validUntil: "2026-12-31", stage: "start" })).toThrow("연장 방법");
  expect(() => documents.execute(scope, { action: "extension-publish", id: "40000000-0000-4000-8000-000000000001", expected: 2,
    mode: "keep", token: "raw", idempotencyKey: "retry" })).toThrow();
  expect(request).not.toHaveBeenCalled();
});
