import { describe, expect, it } from "vitest";
import { joinSourceFunnel, type SourceFunnelInput } from "../application/analytics/source-funnel";

const complete: SourceFunnelInput = {
  sends: [{ id: "send-1", companyId: "company-1", documentVersionId: "version-1" }],
  acceptances: [{ id: "accept-1", companyId: "company-1", sendId: "send-1", customerId: "customer-1", documentVersionId: "version-1" }],
  links: [{ id: "link-1", companyId: "company-1", acceptanceRequestId: "accept-1", customerId: "customer-1", documentVersionId: "version-1" }],
  orders: [{ id: "order-1", companyId: "company-1", linkId: "link-1", customerId: "customer-1", documentVersionId: "version-1" }]
};

describe("joinSourceFunnel", () => {
  it("joins the explicit send, acceptance, link, and order source IDs", () => {
    expect(joinSourceFunnel(complete)).toEqual([{
      companyId: "company-1",
      sendId: "send-1",
      acceptanceRequestId: "accept-1",
      linkId: "link-1",
      orderIds: ["order-1"]
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
      acceptanceRequestId: "accept-1",
      orderIds: []
    }]);
  });

  it("does not choose an acceptance when a send has ambiguous source rows", () => {
    expect(joinSourceFunnel({
      ...complete,
      acceptances: [...complete.acceptances, { ...complete.acceptances[0], id: "accept-2" }]
    })).toEqual([{ companyId: "company-1", sendId: "send-1", orderIds: [] }]);
  });
});
