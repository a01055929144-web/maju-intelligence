import { beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  authorize: vi.fn(),
  enabled: true,
  hold: true,
}));
vi.mock("../lib/auth", () => ({ getRequestAuthScope: mocks.auth }));
vi.mock("../lib/feature-modules", () => ({
  areHoldModulesEnabled: () => mocks.hold,
}));
vi.mock("../lib/pricing/feature", () => ({
  priceSheetsEnabled: () => mocks.enabled,
}));
vi.mock("../lib/pricing/store-order-feature", () => ({
  storeOrderingEnabled: () => mocks.enabled,
}));
vi.mock("../lib/pricing/onboarding-repository", () => ({
  onboardingAuthorizationRepository: () => ({ authorize: mocks.authorize }),
}));
import { onboardingStaffReader } from "../lib/pricing/onboarding-staff-access";
const request = new NextRequest("https://example.test/internal", {
  method: "POST",
  body: JSON.stringify({
    companyId: "forged-company",
    userId: "forged-user",
    role: "owner",
    assigned: true,
  }),
});
const resources = () => ({
  ready: true,
  readPrivate: vi.fn().mockResolvedValue(new Uint8Array([1])),
  decrypt: vi.fn().mockReturnValue("synthetic"),
});
beforeEach(() => {
  vi.clearAllMocks();
  mocks.enabled = true;
  mocks.hold = true;
});
it("rejects missing approved resources and dormant flags before authentication or SQL", async () => {
  await expect(
    onboardingStaffReader().read(request, "record", "delivery-location"),
  ).rejects.toThrow();
  mocks.enabled = false;
  await expect(
    onboardingStaffReader(resources()).read(
      request,
      "record",
      "delivery-location",
    ),
  ).rejects.toThrow();
  expect(mocks.auth).not.toHaveBeenCalled();
  expect(mocks.authorize).not.toHaveBeenCalled();
});
it("does not accept a public store token or an unapproved company as staff credentials", async () => {
  const r = resources();
  mocks.auth.mockResolvedValue({ ok: false });
  await expect(
    onboardingStaffReader(r).read(request, "record", "delivery-location"),
  ).rejects.toThrow();
  mocks.auth.mockResolvedValue({
    ok: true,
    companyId: "company",
    customerSession: { userId: "user" },
  });
  mocks.hold = false;
  await expect(
    onboardingStaffReader(r).read(request, "record", "delivery-location"),
  ).rejects.toThrow();
  expect(mocks.authorize).not.toHaveBeenCalled();
  expect(r.readPrivate).not.toHaveBeenCalled();
});
it("uses central verified identity and ignores all forged body claims", async () => {
  mocks.auth.mockResolvedValue({
    ok: true,
    companyId: "verified-company",
    customerSession: { userId: "verified-user" },
  });
  mocks.authorize.mockRejectedValue(new Error("SQL denial"));
  await expect(
    onboardingStaffReader(resources()).read(
      request,
      "record",
      "delivery-location",
    ),
  ).rejects.toThrow("SQL denial");
  expect(mocks.authorize).toHaveBeenCalledWith(
    { companyId: "verified-company", userId: "verified-user" },
    "record",
    "delivery-location",
  );
});
