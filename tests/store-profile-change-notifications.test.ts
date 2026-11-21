import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { storeProfileChangeNotificationsEnabled } from "../lib/store/03-profile-change-notification-feature";

const mocks = vi.hoisted(() => ({ capability: vi.fn(), feature: vi.fn(), ignore: vi.fn(), list: vi.fn(), process: vi.fn(), read: vi.fn(), session: vi.fn() }));
vi.mock("@/lib/auth", () => ({ customerHasCapability: mocks.capability, getCustomerSession: mocks.session }));
vi.mock("@/lib/feature-flags", () => ({ isFeatureEnabled: mocks.feature }));
vi.mock("@/lib/store/07-company-notifications", () => ({
  ignoreStoreProfileNotification: mocks.ignore, listCompanyStoreNotifications: mocks.list,
  markCompanyNotificationRead: mocks.read, processCompanyStoreNotification: mocks.process,
}));

import { GET, PATCH } from "../app/api/customer/store-notifications/route";

const companyId = "00000000-0000-4000-8000-000000000001";
const request = (body: unknown, origin = "https://test") => new NextRequest("https://test/api/customer/store-notifications", {
  method: "PATCH", headers: { "Content-Type": "application/json", origin }, body: JSON.stringify(body),
});

beforeEach(() => {
  vi.clearAllMocks();
  delete process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS;
  delete process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS_COMPANY_IDS;
  mocks.capability.mockReturnValue(true);
  mocks.feature.mockReturnValue(true);
  mocks.list.mockResolvedValue([{ id: "profile", notificationType: "store_profile_changed" }, { id: "order", notificationType: "new_order" }]);
  mocks.session.mockResolvedValue({ companyId, name: "담당자", operationalDisplayName: "현장 담당자", userId: "user-1" });
});

describe("CX-94 store profile change notifications", () => {
  it("requires both the global switch and exact company allowlist", () => {
    process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS_COMPANY_IDS = companyId;
    expect(storeProfileChangeNotificationsEnabled(companyId)).toBe(false);
    process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS = "true";
    expect(storeProfileChangeNotificationsEnabled(companyId)).toBe(true);
    expect(storeProfileChangeNotificationsEnabled("company-b")).toBe(false);
  });

  it("hides only profile changes while preserving the existing inbox", async () => {
    const response = await GET();
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ items: [{ id: "order", notificationType: "new_order" }] });
    expect(mocks.list).toHaveBeenCalledWith(companyId);
  });

  it("ignores only the authenticated company's profile notification without applying it", async () => {
    process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS = "true";
    process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS_COMPANY_IDS = companyId;
    expect((await PATCH(request({ action: "ignore", id: "notification-1", type: "store_profile_changed" }))).status).toBe(200);
    expect(mocks.ignore).toHaveBeenCalledWith(companyId, "notification-1", "user-1");
    expect(mocks.process).not.toHaveBeenCalled();
  });

  it("requires customer-management permission and same origin for writes", async () => {
    process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS = "true";
    process.env.FEATURE_STORE_PROFILE_CHANGE_NOTIFICATIONS_COMPANY_IDS = companyId;
    mocks.capability.mockReturnValue(false);
    expect((await PATCH(request({ action: "process", id: "notification-1", type: "store_profile_changed" }))).status).toBe(403);
    expect((await PATCH(request({ action: "ignore", id: "notification-1", type: "store_profile_changed" }, "https://other"))).status).toBe(403);
    expect(mocks.ignore).not.toHaveBeenCalled();
    expect(mocks.process).not.toHaveBeenCalled();
  });
});
