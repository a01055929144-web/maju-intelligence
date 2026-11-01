import { describe, expect, it, vi } from "vitest";
import { createPartnerPaymentAttempt, findCompanyPartnerPaymentAttempt, getPaymentAttemptStorage, loadPartnerPaymentAttempt, partnerPaymentAttemptStorageKey, removePartnerPaymentAttempt, savePartnerPaymentAttempt } from "../domains/erp/payment-attempt";

class MemoryStorage implements Storage {
  private data = new Map<string, string>();
  get length() { return this.data.size; }
  clear() { this.data.clear(); }
  getItem(key: string) { return this.data.get(key) ?? null; }
  key(index: number) { return [...this.data.keys()][index] ?? null; }
  removeItem(key: string) { this.data.delete(key); }
  setItem(key: string, value: string) { this.data.set(key, value); }
}

describe("partner payment idempotency", () => {
  it("creates one stable key for a logical registration payload", () => {
    const createKey = vi.fn(() => "payment-attempt-1");
    const attempt = createPartnerPaymentAttempt({
      companyId: "company-1",
      partnerType: "customer",
      partnerId: "customer-1",
      entryDate: "2026-11-01",
      amount: 1000,
      paymentMethod: "bank",
    }, createKey);

    expect(createKey).toHaveBeenCalledTimes(1);
    expect(attempt.idempotencyKey).toBe("payment-attempt-1");
    expect(JSON.stringify(attempt)).toContain('"idempotencyKey":"payment-attempt-1"');
  });

  it("restores only the same company and partner attempt after reload", () => {
    const storage = new MemoryStorage();
    const attempt = createPartnerPaymentAttempt({ companyId: "company-1", partnerType: "customer", partnerId: "customer-1", entryDate: "2026-11-01", amount: 1000, paymentMethod: "bank" }, () => "stable-key");
    expect(savePartnerPaymentAttempt(storage, attempt)).toBe(true);
    expect(findCompanyPartnerPaymentAttempt(storage, "company-1")).toEqual(attempt);
    expect(loadPartnerPaymentAttempt(storage, { companyId: "company-1", partnerType: "customer", partnerId: "customer-1" })).toEqual(attempt);
    expect(loadPartnerPaymentAttempt(storage, { companyId: "company-1", partnerType: "customer", partnerId: "customer-2" })).toBeNull();
    expect(findCompanyPartnerPaymentAttempt(storage, "company-2")).toBeNull();

    const stored = JSON.parse(storage.getItem(partnerPaymentAttemptStorageKey(attempt)) || "{}") as Record<string, unknown>;
    expect(Object.keys(stored).sort()).toEqual(["amount", "companyId", "entryDate", "idempotencyKey", "partnerId", "partnerType", "paymentMethod"].sort());
  });

  it("removes only the completed or explicitly cancelled scope", () => {
    const storage = new MemoryStorage();
    const first = createPartnerPaymentAttempt({ companyId: "company-1", partnerType: "customer", partnerId: "customer-1", entryDate: "2026-11-01", amount: 1000, paymentMethod: "bank" }, () => "key-1");
    const second = createPartnerPaymentAttempt({ companyId: "company-1", partnerType: "supplier", partnerId: "supplier-1", entryDate: "2026-11-01", amount: 2000, paymentMethod: "bank" }, () => "key-2");
    savePartnerPaymentAttempt(storage, first); savePartnerPaymentAttempt(storage, second);
    removePartnerPaymentAttempt(storage, first);
    expect(loadPartnerPaymentAttempt(storage, first)).toBeNull();
    expect(loadPartnerPaymentAttempt(storage, second)).toEqual(second);
  });

  it("fails closed when session storage is unavailable", () => {
    const attempt = createPartnerPaymentAttempt({ companyId: "company-1", partnerType: "customer", partnerId: "customer-1", entryDate: "2026-11-01", amount: 1000, paymentMethod: "bank" }, () => "stable-key");
    const blocked = new MemoryStorage();
    blocked.setItem = () => { throw new Error("blocked"); };
    expect(savePartnerPaymentAttempt(blocked, attempt)).toBe(false);
  });

  it("catches a SecurityError thrown while reading the sessionStorage getter", () => {
    const getStorage = vi.fn((): Storage => { throw new DOMException("blocked", "SecurityError"); });
    expect(getPaymentAttemptStorage(getStorage)).toBeNull();
    expect(getStorage).toHaveBeenCalledTimes(1);
  });
});
