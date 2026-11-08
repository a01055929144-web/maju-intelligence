export type StageEPurchaseInventoryInput = {
  companyId: string;
  receiptId: string;
  receiptRevision: number;
  supplierId: string;
  receivedOn: string;
  idempotencyKey: string;
  lines: Array<{
    receiptLineId: string;
    productId: string;
    purchaseUnit: string;
    inventoryUnit: string;
    purchaseQuantity: string;
    inventoryQuantity: string;
    unitCostExVat: string;
    conversion: { id: string; revision: number; confirmed: true };
  }>;
};

export type StageEPurchaseInventoryOutput = {
  companyId: string;
  receiptId: string;
  idempotencyKey: string;
  status: "committed";
  purchaseDocumentId: string;
  purchaseDocumentRevision: number;
  inventoryMovementIds: string[];
  supplierLedgerEntryId: string;
};

export const stageEPurchaseInventoryFixture: {
  input: StageEPurchaseInventoryInput;
  output: StageEPurchaseInventoryOutput;
} = {
  input: {
    companyId: "00000000-0000-4000-8000-000000000001",
    receiptId: "10000000-0000-4000-8000-000000000001",
    receiptRevision: 3,
    supplierId: "20000000-0000-4000-8000-000000000001",
    receivedOn: "2026-11-08",
    idempotencyKey: "30000000-0000-4000-8000-000000000001",
    lines: [{
      receiptLineId: "40000000-0000-4000-8000-000000000001",
      productId: "50000000-0000-4000-8000-000000000001",
      purchaseUnit: "BOX",
      inventoryUnit: "EA",
      purchaseQuantity: "2",
      inventoryQuantity: "20",
      unitCostExVat: "18910.00",
      conversion: { id: "60000000-0000-4000-8000-000000000001", revision: 2, confirmed: true },
    }],
  },
  output: {
    companyId: "00000000-0000-4000-8000-000000000001",
    receiptId: "10000000-0000-4000-8000-000000000001",
    idempotencyKey: "30000000-0000-4000-8000-000000000001",
    status: "committed",
    purchaseDocumentId: "70000000-0000-4000-8000-000000000001",
    purchaseDocumentRevision: 1,
    inventoryMovementIds: ["80000000-0000-4000-8000-000000000001"],
    supplierLedgerEntryId: "90000000-0000-4000-8000-000000000001",
  },
};
