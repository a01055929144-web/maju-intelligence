import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => {
  class CompletionError extends Error {}
  return {
    auth: vi.fn(),
    complete: vi.fn(),
    CompletionError,
    feature: vi.fn(),
    repository: vi.fn()
  };
});

vi.mock("@/application/delivery/complete-order-delivery", () => ({
  completeOrderDelivery: mocks.complete,
  DeliveryCompletionError: mocks.CompletionError
}));
vi.mock("@/domains/organization/staff-access", () => ({ isLegacyDeliveryOwner: () => false }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/auth", () => ({
  getCustomerAssignmentKeys: () => ({ legacyManagerKeys: ["기사 A"], staffMemberId: "staff-a" }),
  getCustomerOperationalName: () => "기사 A",
  getRequestAuthScope: mocks.auth
}));
vi.mock("@/lib/store", () => ({ supabaseRequest: mocks.repository }));
vi.mock("@/lib/workspace", () => ({ normalizeWorkspaceRole: (role: string) => role }));

import { DeliveryCompletionError } from "@/application/delivery/complete-order-delivery";
import { POST } from "../app/api/routes/delivery-completions/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const command = {
  companyId,
  customerId: "20000000-0000-4000-8000-000000000001",
  deliveryDate: "2026-11-09",
  completionEventId: "40000000-0000-4000-8000-000000000001",
  idempotencyKey: "40000000-0000-4000-8000-000000000001",
  completedAt: "2026-11-09T03:00:00.000Z",
  orders: [{ orderId: "30000000-0000-4000-8000-000000000001", orderRevision: 3 }],
  proof: {
    noteId: "50000000-0000-4000-8000-000000000001",
    attachmentIds: ["60000000-0000-4000-8000-000000000001"]
  }
};

function request() {
  return new NextRequest("https://test/api/routes/delivery-completions", {
    body: JSON.stringify(command),
    headers: { "Content-Type": "application/json" },
    method: "POST"
  });
}

describe("delivery completion route", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.feature.mockReturnValue(true);
    mocks.auth.mockResolvedValue({
      companyId,
      customerSession: {
        assignedVehicle: "1호차",
        companyMemberId: "member-a",
        duties: ["delivery"],
        role: "staff",
        routeUnitName: "1호차",
        userId: "user-a",
        vehicleDisplayName: "1호차",
        workspaceRole: "staff"
      },
      ok: true,
      role: "customer"
    });
    mocks.complete.mockResolvedValue({ completionEventId: command.completionEventId });
  });

  afterEach(() => vi.unstubAllEnvs());

  it("returns 404 while the company feature is off without calling the use case", async () => {
    mocks.feature.mockReturnValue(false);

    expect((await POST(request())).status).toBe(404);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("requires an authenticated delivery worker", async () => {
    mocks.auth.mockResolvedValueOnce({ ok: false, role: "anonymous" });
    expect((await POST(request())).status).toBe(401);

    mocks.auth.mockResolvedValueOnce({
      companyId,
      customerSession: { companyMemberId: "member-a", duties: [], workspaceRole: "staff" },
      ok: true,
      role: "customer"
    });
    expect((await POST(request())).status).toBe(403);
    expect(mocks.complete).not.toHaveBeenCalled();
  });

  it("passes the session actor and command to the completion use case", async () => {
    const response = await POST(request());

    expect(response.status).toBe(200);
    expect(mocks.complete).toHaveBeenCalledWith(command, {
      actorKey: "member-a",
      companyId,
      driverKeys: ["기사 A"],
      staffMemberId: "staff-a",
      vehicleKeys: ["1호차"]
    }, mocks.repository);
  });

  it("maps safe completion conflicts to 409 and unexpected failures to 500", async () => {
    mocks.complete.mockRejectedValueOnce(new DeliveryCompletionError("기존 완료 정보와 다릅니다."));
    const conflict = await POST(request());
    expect(conflict.status).toBe(409);
    expect(await conflict.json()).toEqual({ message: "기존 완료 정보와 다릅니다." });

    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    mocks.complete.mockRejectedValueOnce(new Error("database detail"));
    const failure = await POST(request());
    expect(failure.status).toBe(500);
    expect(await failure.json()).toEqual({ message: "배송 완료 요청을 처리하지 못했습니다." });
    consoleError.mockRestore();
  });
});
