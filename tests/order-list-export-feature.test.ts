import { afterEach, describe, expect, it, vi } from "vitest";
import { orderListExportEnabled } from "@/lib/order-list-export-feature";

describe("CX-109 order list export gate", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("requires both the global switch and an exact company allowlist match", () => {
    vi.stubEnv("FEATURE_ORDER_LIST_EXPORT_COMPANY_IDS", "company-b");
    expect(orderListExportEnabled("company-b")).toBe(false);
    vi.stubEnv("ORDER_LIST_EXPORT_ENABLED", "true");
    expect(orderListExportEnabled("company-a")).toBe(false);
    expect(orderListExportEnabled("company-b")).toBe(true);
  });
});
