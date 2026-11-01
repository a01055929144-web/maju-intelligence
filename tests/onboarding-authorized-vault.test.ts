import { expect, it, vi } from "vitest";
import {
  authorizedVault,
  type AuditedRecord,
} from "../application/order/authorized-vault";
vi.mock("../lib/store", () => ({ supabaseRequest: vi.fn() }));
import { onboardingAuthorizationRepository } from "../lib/pricing/onboarding-repository";
const staff = { companyId: "company", userId: "user" };
const instant = new Date("2026-10-30T01:00:00Z");
const approved: AuditedRecord = {
  auditId: "audit",
  actorId: "user",
  authorizedAt: instant.toISOString(),
  readUntil: "2026-10-30T01:00:05Z",
  record: {
    id: "record",
    companyId: "company",
    customerId: "customer",
    kind: "loading-photo",
    state: "available",
    collectedAt: "2026-10-29",
    expiresAt: "2026-10-31",
    objectKey: "private-key",
  },
};
function setup(value = approved) {
  return {
    ready: true,
    authorize: vi.fn().mockResolvedValue(value),
    readPrivate: vi.fn().mockResolvedValue(new Uint8Array([1])),
    decrypt: vi.fn().mockReturnValue("synthetic"),
    now: () => instant,
  };
}
it("blocks an unconfigured resource boundary before any SQL or object read", async () => {
  const p = setup();
  p.ready = false;
  await expect(
    authorizedVault(p).read(staff, "record", "delivery-location"),
  ).rejects.toThrow();
  expect(p.authorize).not.toHaveBeenCalled();
  expect(p.readPrivate).not.toHaveBeenCalled();
});
it("reads only after an atomic authorization/audit result", async () => {
  const p = setup();
  expect(
    await authorizedVault(p).read(staff, "record", "delivery-location"),
  ).toMatchObject({ kind: "file" });
  expect(p.authorize).toHaveBeenCalledWith(
    staff,
    "record",
    "delivery-location",
  );
  expect(p.readPrivate).toHaveBeenCalledWith("private-key");
});
it("denies missing audit, mismatched identity/company/record and overlong/replayed approvals", async () => {
  for (const value of [
    { ...approved, auditId: "" },
    { ...approved, actorId: "other" },
    { ...approved, record: { ...approved.record, companyId: "other" } },
    { ...approved, record: { ...approved.record, id: "other" } },
    { ...approved, readUntil: "2026-10-30T01:00:06Z" },
    { ...approved, readUntil: instant.toISOString() },
  ]) {
    const p = setup(value);
    await expect(
      authorizedVault(p).read(staff, "record", "delivery-location"),
    ).rejects.toThrow();
    expect(p.readPrivate).not.toHaveBeenCalled();
    expect(p.decrypt).not.toHaveBeenCalled();
  }
});
it("discards private bytes when the approval expires during object retrieval", async () => {
  let current = instant;
  const p = setup();
  p.now = () => current;
  p.readPrivate.mockImplementation(async () => {
    current = new Date("2026-10-30T01:00:05Z");
    return new Uint8Array([1]);
  });
  await expect(
    authorizedVault(p).read(staff, "record", "delivery-location"),
  ).rejects.toThrow();
});
it("does not decrypt or fetch files when SQL authorization/audit fails", async () => {
  const p = setup();
  p.authorize.mockRejectedValue(new Error("denied"));
  await expect(
    authorizedVault(p).read(staff, "record", "delivery-location"),
  ).rejects.toThrow("denied");
  expect(p.readPrivate).not.toHaveBeenCalled();
  expect(p.decrypt).not.toHaveBeenCalled();
});

it("discards plaintext if approval expires during decryption", async () => {
  let current = instant;
  const p = setup({
    ...approved,
    record: {
      ...approved.record,
      kind: "entrance",
      envelope: { version: 1, keyId: "key", iv: "", tag: "", ciphertext: "" },
    },
  });
  p.now = () => current;
  p.decrypt.mockImplementation(() => {
    current = new Date("2026-10-30T01:00:05Z");
    return "synthetic";
  });
  await expect(
    authorizedVault(p).read(staff, "record", "delivery-access"),
  ).rejects.toThrow();
});

it("the internal repository forwards identity only, never caller roles or assignment claims", async () => {
  const request = vi.fn().mockResolvedValue(approved);
  const input = { ...staff, role: "owner", assigned: true };
  await onboardingAuthorizationRepository(request).authorize(
    input,
    "record",
    "delivery-location",
  );
  expect(request.mock.calls[0][0]).toBe("rpc/authorize_store_onboarding_read");
  expect(JSON.parse(request.mock.calls[0][1].body)).toEqual({
    p_company: "company",
    p_user: "user",
    p_record: "record",
    p_purpose: "delivery-location",
  });
});
