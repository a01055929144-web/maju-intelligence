import { describe, expect, it, vi } from "vitest";
import { managePriceSheets, parseBulkCommand } from "../application/pricing/manage-price-sheets";

const id = "10000000-0000-4000-8000-000000000001";
describe("bulk margin", () => {
  it("parses margin and clear commands", () => {
    expect(parseBulkCommand({ action: "bulk-margin", productIds: [id, id], margin: 15.555 })).toEqual({ action: "bulk-margin", productIds: [id], margin: 15.56 });
    expect(parseBulkCommand({ action: "bulk-margin", productIds: [id], margin: null })?.action).toBe("bulk-margin");
    expect(parseBulkCommand({ action: "group" })).toBeNull();
    expect(() => parseBulkCommand({ action: "bulk-margin", productIds: ["x"], margin: 1 })).toThrow();
    expect(() => parseBulkCommand({ action: "bulk-margin", productIds: [id], margin: 2000 })).toThrow();
    expect(() => parseBulkCommand({ action: "bulk-direct", productIds: [id], price: 100 })).toThrow();
  });
  it("runs one item command per product", async () => {
    const execute = vi.fn().mockResolvedValue(undefined);
    const app = managePriceSheets({ read: vi.fn(), execute });
    await app.bulk("c", { action: "bulk-margin", productIds: [id], margin: 10 }, async (items, task) => { for (const i of items) await task(i); });
    expect(execute).toHaveBeenCalledWith("c", { action: "item-margin", productId: id, margin: 10 });
  });
});
