export type DriverDaySummaryStop = {
  customer_id: string | null;
  id: string;
  status: string;
  stop_type: "delivery" | "sales";
};

export type DriverDaySummary = { completed: number; failed: number; photos: number; sales: number };

export function summarizeDriverDay(stops: readonly DriverDaySummaryStop[], legacyCompletedCustomerIds: ReadonlySet<string>, photos: number): DriverDaySummary {
  const completedCustomers = new Set(legacyCompletedCustomerIds);
  let failed = 0;
  let sales = 0;
  for (const stop of stops) {
    if (stop.stop_type === "sales") {
      if (stop.status === "completed") sales += 1;
      if (stop.status === "not_delivered") failed += 1;
      continue;
    }
    if (stop.status === "not_delivered") failed += 1;
    if (stop.customer_id && ["completed", "partial", "problem"].includes(stop.status)) completedCustomers.add(stop.customer_id);
  }
  return { completed: completedCustomers.size, failed, photos: Math.max(0, photos), sales };
}
