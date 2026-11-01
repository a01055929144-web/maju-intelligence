import { expect, it, vi } from "vitest";
import { randomBytes } from "node:crypto";
import {
  checkProtectedFile,
  type ProtectedRecord,
} from "../domains/order/onboarding-protection";
import {
  onboardingVault,
  type VaultPorts,
} from "../application/order/onboarding-vault";
import {
  encryptEntrance,
  decryptEntrance,
} from "../lib/pricing/onboarding-crypto";
const now = new Date("2026-10-30T00:00:00Z");
const record: ProtectedRecord = {
  id: "record",
  companyId: "company",
  customerId: "customer",
  kind: "entrance",
  state: "available",
  collectedAt: "2026-10-29T00:00:00Z",
  expiresAt: "2026-11-28T00:00:00Z",
};
const scope = {
  companyId: "company",
  actorId: "actor",
  role: "driver" as const,
};
function ports(overrides: Partial<VaultPorts> = {}) {
  return {
    find: vi.fn().mockResolvedValue({
      ...record,
      envelope: { version: 1, keyId: "key", iv: "", tag: "", ciphertext: "" },
    }),
    assignedDriver: vi.fn().mockResolvedValue(true),
    audit: vi.fn().mockResolvedValue(undefined),
    readPrivate: vi.fn().mockResolvedValue(new Uint8Array()),
    decrypt: vi.fn().mockReturnValue("synthetic entrance"),
    ...overrides,
  };
}
it("binds authenticated encryption to the company/customer/record and fails closed for tampering or missing keys", () => {
  const key = randomBytes(32),
    ring = new Map([["k1", key]]);
  const envelope = encryptEntrance("synthetic entrance", record, "k1", key);
  expect(JSON.stringify(envelope)).not.toContain("synthetic entrance");
  expect(decryptEntrance(envelope, record, ring)).toBe("synthetic entrance");
  for (const changed of [
    { ...record, companyId: "other" },
    { ...record, customerId: "other" },
    { ...record, id: "other" },
  ])
    expect(() => decryptEntrance(envelope, changed, ring)).toThrow();
  expect(() => decryptEntrance(envelope, record, new Map())).toThrow();
  expect(() =>
    decryptEntrance(
      { ...envelope, tag: Buffer.alloc(16).toString("base64") },
      record,
      ring,
    ),
  ).toThrow();
  expect(encryptEntrance("synthetic entrance", record, "k1", key).iv).not.toBe(
    envelope.iv,
  );
  expect(() =>
    encryptEntrance("value", record, "k1", new Uint8Array(31)),
  ).toThrow();
});
it("persists a minimal audit before decrypting and resolves driver assignment server-side", async () => {
  const calls: string[] = [];
  const p = ports({
    audit: async () => {
      calls.push("audit");
    },
    decrypt: () => {
      calls.push("decrypt");
      return "synthetic";
    },
  });
  await onboardingVault(p).read(scope, record.id, "delivery-access", now);
  expect(calls).toEqual(["audit", "decrypt"]);
  expect(p.assignedDriver).toHaveBeenCalledWith(
    "company",
    "customer",
    "actor",
    "2026-10-30",
  );
});
it("blocks plaintext/object access when audit persistence fails", async () => {
  const p = ports({
    audit: vi.fn().mockRejectedValue(new Error("audit unavailable")),
  });
  await expect(
    onboardingVault(p).read(scope, record.id, "delivery-access", now),
  ).rejects.toThrow("audit unavailable");
  expect(p.decrypt).not.toHaveBeenCalled();
  expect(p.readPrivate).not.toHaveBeenCalled();
});
it("denies cross-company, sales, unassigned, expired, quarantine, deleted and driver registration access", async () => {
  const cases = [
    { s: { ...scope, companyId: "other" }, r: record, assigned: true },
    { s: { ...scope, role: "sales" as const }, r: record, assigned: true },
    { s: scope, r: record, assigned: false },
    ...[
      { ...record, state: "quarantine" as const },
      { ...record, state: "deleted" as const },
      { ...record, expiresAt: now.toISOString() },
      { ...record, kind: "registration" as const },
      { ...record, expiresAt: "2027-01-01" },
    ].map((r) => ({ s: scope, r, assigned: true })),
  ];
  for (const c of cases) {
    const p = ports({
      find: vi.fn().mockResolvedValue({ ...c.r, envelope: { version: 1 } }),
      assignedDriver: vi.fn().mockResolvedValue(c.assigned),
    });
    await expect(
      onboardingVault(p).read(c.s, record.id, "delivery-access", now),
    ).rejects.toThrow();
    expect(p.audit).not.toHaveBeenCalled();
    expect(p.decrypt).not.toHaveBeenCalled();
    expect(p.readPrivate).not.toHaveBeenCalled();
  }
});
it("allows audited manager file streaming only for available records and fixed purpose codes", async () => {
  const p = ports({
    find: vi.fn().mockResolvedValue({
      ...record,
      kind: "registration",
      objectKey: "opaque-private-key",
    }),
  });
  await onboardingVault(p).read(
    { ...scope, role: "manager" },
    record.id,
    "verify-registration",
    now,
  );
  expect(p.readPrivate).toHaveBeenCalledWith("opaque-private-key");
  expect(p.audit).toHaveBeenCalledWith({
    companyId: "company",
    customerId: "customer",
    recordId: "record",
    actorId: "actor",
    purpose: "verify-registration",
    occurredAt: now.toISOString(),
  });
  await expect(
    onboardingVault(p).read(
      { ...scope, role: "manager" },
      record.id,
      "free text secret",
      now,
    ),
  ).rejects.toThrow();
});
it("fails closed for an invalid clock and mismatched repository record", async () => {
  const p = ports();
  await expect(
    onboardingVault(p).read(
      scope,
      record.id,
      "delivery-access",
      new Date("invalid"),
    ),
  ).rejects.toThrow();
  await expect(
    onboardingVault(p).read(scope, "another-record", "delivery-access", now),
  ).rejects.toThrow();
  expect(p.audit).not.toHaveBeenCalled();
  expect(p.decrypt).not.toHaveBeenCalled();
});
it("requires matching file signatures and byte limits, without treating them as an antivirus result", () => {
  expect(() =>
    checkProtectedFile(
      "registration",
      "application/pdf",
      Buffer.from("%PDF-synthetic"),
    ),
  ).not.toThrow();
  expect(() =>
    checkProtectedFile(
      "loading-photo",
      "application/pdf",
      Buffer.from("%PDF-synthetic"),
    ),
  ).toThrow();
  expect(() =>
    checkProtectedFile("loading-photo", "image/png", Buffer.from("<script>")),
  ).toThrow();
  const oversized = new Uint8Array(5 * 1024 * 1024 + 1);
  oversized.set([255, 216, 255]);
  expect(() =>
    checkProtectedFile("loading-photo", "image/jpeg", oversized),
  ).toThrow();
});
