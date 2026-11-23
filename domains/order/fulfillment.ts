export type FulfillmentMode = "inventory" | "purchase" | "market";
export type FulfillmentSourceLine = {
  orderId: string; customerName: string; deliveryDate: string; territory: string; vehicle: string; requestMemo: string;
  productId: string; productName: string; specification: string; unit: string; quantity: number; marketPrice: boolean;
  trackingEnabled?: boolean; supplierNames: string[]; storageLocation?: string;
};
export type FulfillmentLine = FulfillmentSourceLine & { mode: FulfillmentMode; supplier: string };

export function fulfillmentMode(line: Pick<FulfillmentSourceLine, "marketPrice" | "trackingEnabled">): FulfillmentMode {
  if (line.marketPrice) return "market";
  return line.trackingEnabled === true ? "inventory" : "purchase";
}

export function buildFulfillmentLines(lines: FulfillmentSourceLine[]): FulfillmentLine[] {
  return lines.map((line) => ({ ...line, mode: fulfillmentMode(line), supplier: line.supplierNames[0] || "매입처 미등록" }));
}

export function aggregateFulfillment(lines: FulfillmentLine[]) {
  const grouped = new Map<string, { key: string; productName: string; specification: string; unit: string; deliveryDate: string; territory: string; vehicle: string; mode: FulfillmentMode; supplier: string; quantity: number; storeCount: number }>();
  const stores = new Map<string, Set<string>>();
  for (const line of lines) {
    const key = [line.deliveryDate, line.territory, line.vehicle, line.productId, line.mode, line.supplier].join("|");
    const row = grouped.get(key) || { key, productName: line.productName, specification: line.specification, unit: line.unit, deliveryDate: line.deliveryDate, territory: line.territory, vehicle: line.vehicle, mode: line.mode, supplier: line.supplier, quantity: 0, storeCount: 0 };
    row.quantity += line.quantity;
    const names = stores.get(key) || new Set<string>(); names.add(line.customerName); stores.set(key, names); row.storeCount = names.size;
    grouped.set(key, row);
  }
  return Array.from(grouped.values()).sort((a, b) => `${a.deliveryDate}|${a.territory}|${a.vehicle}|${a.productName}`.localeCompare(`${b.deliveryDate}|${b.territory}|${b.vehicle}|${b.productName}`, "ko"));
}
