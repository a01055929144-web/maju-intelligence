import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ db: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.db }));
import { readSourceFunnelMetrics } from "../lib/store/06-source-funnel";

describe("readSourceFunnelMetrics", () => {
  beforeEach(() => mocks.db.mockReset());

  it("reads only company-scoped source IDs and preserves unavailable downstream stages", async () => {
    mocks.db
      .mockResolvedValueOnce([{ id: "send-1", company_id: "company-1", document_version_id: "version-1", acceptance_status: "viewed" }])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([])
      .mockResolvedValueOnce([]);

    await expect(readSourceFunnelMetrics("company-1")).resolves.toMatchObject({
      documentsSent: { state: "available", value: 1 },
      documentsViewed: { state: "available", value: 1 },
      documentsAccepted: { state: "available", value: 0 },
      firstOrders: { state: "available", value: 0 },
      repeatOrders: { state: "available", value: 0 },
      deliveriesCompleted: { state: "unavailable" },
      revenueRecorded: { state: "unavailable" }
    });
    expect(mocks.db).toHaveBeenCalledTimes(4);
    for (const [path] of mocks.db.mock.calls) expect(path).toContain("company_id=eq.company-1");
  });
});
