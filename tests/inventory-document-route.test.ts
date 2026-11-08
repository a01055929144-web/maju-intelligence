import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  capability: vi.fn(),
  reapply: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getRequestAuthScope: mocks.auth, scopeHasCapability: mocks.capability }));
vi.mock("@/lib/inventory", () => ({ getDocumentInventoryStatus: vi.fn(), reapplyDocumentInventory: mocks.reapply }));

import { POST } from "../app/api/inventory/documents/[id]/route";

describe("inventory document API", () => {
  beforeEach(() => {
    mocks.auth.mockReset().mockResolvedValue({ ok: true, companyId: "company-1", customerSession: { name: "운영자" } });
    mocks.capability.mockReset().mockReturnValue(true);
    mocks.reapply.mockReset();
  });

  it("returns 400 when unresolved lines block inventory reapplication", async () => {
    mocks.reapply.mockRejectedValue(new Error("상품 연결과 단위 환산을 먼저 확인해 주세요."));

    const response = await POST(new NextRequest("http://localhost/api/inventory/documents/document-1", {
      method: "POST",
      body: JSON.stringify({ companyId: "company-1" }),
      headers: { "content-type": "application/json" },
    }), { params: Promise.resolve({ id: "document-1" }) });

    expect(response.status).toBe(400);
    await expect(response.json()).resolves.toEqual({ message: "상품 연결과 단위 환산을 먼저 확인해 주세요." });
    expect(mocks.reapply).toHaveBeenCalledWith("company-1", "document-1", "운영자");
  });
});
