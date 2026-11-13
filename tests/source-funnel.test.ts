import { describe, expect, it } from "vitest";
import { joinSourceFunnel, summarizeSourceFunnel, type SourceFunnelInput } from "../application/analytics/source-funnel";

const complete: SourceFunnelInput = {
  sends: [{ id: "send-1", companyId: "company-1", documentVersionId: "version-1", acceptanceStatus: "accepted" }],
  acceptances: [{ id: "accept-1", companyId: "company-1", sendId: "send-1", customerId: "customer-1", documentVersionId: "version-1" }],
  links: [{ id: "link-1", companyId: "company-1", acceptanceRequestId: "accept-1", customerId: "customer-1", documentVersionId: "version-1" }],
  orders: [{ id: "order-1", companyId: "company-1", linkId: "link-1", customerId: "customer-1", documentVersionId: "version-1", status: "submitted", submittedAt: "2026-11-08T00:00:00Z" }]
};

describe("joinSourceFunnel", () => {
  it("joins the explicit send, acceptance, link, and order source IDs", () => {
    expect(joinSourceFunnel(complete)).toEqual([{
      companyId: "company-1",
      sendId: "send-1",
      sendStatus: "accepted",
      acceptanceRequestId: "accept-1",
      customerId: "customer-1",
      linkId: "link-1",
      orders: [{ id: "order-1", submittedAt: "2026-11-08T00:00:00Z" }]
    }]);
  });

  it("does not infer a funnel step across company, customer, or document boundaries", () => {
    expect(joinSourceFunnel({
      ...complete,
      links: complete.links.map((row) => ({ ...row, customerId: "customer-2" })),
      orders: complete.orders.map((row) => ({ ...row, companyId: "company-2" }))
    })).toEqual([{
      companyId: "company-1",
      sendId: "send-1",
      sendStatus: "accepted",
      acceptanceRequestId: "accept-1",
      orders: []
    }]);
  });

  it("does not choose an acceptance when a send has ambiguous source rows", () => {
    expect(joinSourceFunnel({
      ...complete,
      acceptances: [...complete.acceptances, { ...complete.acceptances[0], id: "accept-2" }]
    })).toEqual([{ companyId: "company-1", sendId: "send-1", sendStatus: "accepted", orders: [] }]);
  });

  it("counts only joined source IDs and leaves delivery unavailable", () => {
    const rows = joinSourceFunnel(complete);
    expect(summarizeSourceFunnel([...rows, rows[0]])).toEqual({
      documentsSent: { state: "available", value: 1 },
      documentsViewed: { state: "available", value: 1 },
      documentsAccepted: { state: "available", value: 1 },
      firstOrders: { state: "available", value: 1 },
      repeatOrders: { state: "available", value: 0 },
      deliveriesCompleted: { state: "unavailable", reason: "delivery_source_id_missing" },
      revenueRecorded: { state: "unavailable", reason: "revenue_source_id_missing" }
    });
  });

  it("separates the first order from repeat orders and ignores cancelled orders", () => {
    const rows = joinSourceFunnel({
      ...complete,
      orders: [
        complete.orders[0],
        { ...complete.orders[0], id: "order-2", submittedAt: "2026-11-09T00:00:00Z" },
        { ...complete.orders[0], id: "order-3", status: "cancelled", submittedAt: "2026-11-10T00:00:00Z" }
      ]
    });
    expect(summarizeSourceFunnel(rows)).toMatchObject({
      firstOrders: { state: "available", value: 1 },
      repeatOrders: { state: "available", value: 1 }
    });
  });
});
