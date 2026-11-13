import { readFileSync } from "node:fs";
import { describe, expect, it, vi } from "vitest";

let failWith = "";
vi.mock("../lib/store", () => ({ supabaseRequest: async () => { if (failWith) throw new Error(`Supabase request failed: 400 ${failWith}`); return { customerId: "c", movedOrders: 2 }; } }));

describe("store customer review (CC-08)", () => {
  it("turns database refusals into plain messages with the right status", async () => {
    const { linkExistingCustomer, StoreReviewError } = await import("../lib/pricing/store-customer-review");
    failWith = "store_review_placeholder_in_use: delivery_events";
    await expect(linkExistingCustomer("co", "a", "c", { name: "합성" })).rejects.toMatchObject({ status: 409, message: expect.stringContaining("다른 기록") });
    failWith = "store_account_not_pending_review";
    await expect(linkExistingCustomer("co", "a", "c", { name: "합성" })).rejects.toBeInstanceOf(StoreReviewError);
    failWith = "boom";
    await expect(linkExistingCustomer("co", "a", "c", { name: "합성" })).rejects.not.toBeInstanceOf(StoreReviewError);
    failWith = "";
    await expect(linkExistingCustomer("co", "a", "c", { name: "합성" })).resolves.toMatchObject({ movedOrders: 2 });
  });
  it("the orders API flags unconfirmed stores, routes the review actions and maps the guard error to a 409", () => {
    const api = readFileSync("app/api/orders/route.ts", "utf8");
    expect(api).toContain("customer_review_status=eq.needs_review");
    expect(api).toContain("storeAccountId:");
    expect(api).toContain('"link_customer"');
    expect(api).toContain("store_customer_review_required");
  });
  it("the inbox swaps 확인 for 거래처 확인 on unconfirmed stores and asks before linking", () => {
    const ui = readFileSync("components/order-inbox-workspace.tsx", "utf8");
    expect(ui).toContain("row.storeAccountId && canConfirmStoreOrder");
    expect(ui).toContain("window.confirm");
    expect(ui).toContain("새 거래처로 확인");
  });
});

describe("customer list hides duplicates (CC-08)", () => {
  it("every customer master list query skips rows marked duplicate_of (the auto-created customer after a link)", () => {
    const src = readFileSync("lib/store.ts", "utf8");
    const lines = src.split(/\r?\n/).filter((l) => l.includes("normalized_customers?select=") && l.includes("order=created_at.desc") && l.includes("CUSTOMER_MASTER_FETCH_LIMIT"));
    expect(lines.length).toBeGreaterThanOrEqual(6);
    for (const l of lines) expect(l).toContain("duplicate_of=is.null");
  });
});
