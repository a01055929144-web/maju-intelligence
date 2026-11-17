import { describe, expect, it } from "vitest";
import { summarizeDriverDay } from "../domains/delivery/driver-day-summary";

describe("driver day summary", () => {
  it("deduplicates legacy and stop completions and counts actual failed, sales, and photos", () => {
    const summary = summarizeDriverDay([
      { customer_id: "customer-a", id: "delivery-a", status: "completed", stop_type: "delivery" },
      { customer_id: "customer-b", id: "delivery-b", status: "problem", stop_type: "delivery" },
      { customer_id: "customer-c", id: "delivery-c", status: "not_delivered", stop_type: "delivery" },
      { customer_id: null, id: "sales-a", status: "completed", stop_type: "sales" },
      { customer_id: null, id: "sales-b", status: "not_delivered", stop_type: "sales" }
    ], new Set(["customer-a"]), 4);
    expect(summary).toEqual({ completed: 2, failed: 2, photos: 4, sales: 1 });
  });
});
