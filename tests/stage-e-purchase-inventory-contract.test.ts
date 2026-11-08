import { describe, expect, it } from "vitest";
import { stageEPurchaseInventoryFixture } from "./fixtures/stage-e-purchase-inventory";

describe("04 Stage E purchase inventory candidate contract", () => {
  it("keeps the result tied to the same company, receipt and idempotency key", () => {
    const { input, output } = stageEPurchaseInventoryFixture;
    expect(output).toMatchObject({
      companyId: input.companyId,
      receiptId: input.receiptId,
      idempotencyKey: input.idempotencyKey,
      status: "committed",
    });
    expect(output.inventoryMovementIds).toHaveLength(input.lines.length);
  });

  it("uses exact decimal strings and only confirmed conversion evidence", () => {
    for (const line of stageEPurchaseInventoryFixture.input.lines) {
      expect(line.purchaseQuantity).toMatch(/^\d+(?:\.\d+)?$/);
      expect(line.inventoryQuantity).toMatch(/^\d+(?:\.\d+)?$/);
      expect(line.unitCostExVat).toMatch(/^\d+\.\d{2}$/);
      expect(line.conversion.confirmed).toBe(true);
      expect(line.conversion.revision).toBeGreaterThan(0);
    }
  });

  it("contains no runtime endpoint, feature flag or operating database instruction", () => {
    const serialized = JSON.stringify(stageEPurchaseInventoryFixture);
    expect(serialized).not.toContain("fcmdvveqmcgtioelzqun");
    expect(serialized).not.toContain("http");
    expect(serialized).not.toContain("service_role");
  });
});
