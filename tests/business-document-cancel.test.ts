import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ request: vi.fn() }));
vi.mock("../lib/store", () => ({ supabaseRequest: mocks.request }));

import { cancelBusinessDocument, listBusinessDocuments } from "../lib/business-documents";

const row = (sourceType: string | null = null) => ({
  id: "doc-1", company_id: "company-1", document_type: "sale", document_number: "S-2026-1",
  document_date: "2026-11-17", status: "confirmed", customer_id: "customer-1", supplier_id: null,
  source_type: sourceType, source_key: sourceType ? "order:order-1" : null, original_document_id: null,
  partner_name_snapshot: "테스트 거래처", partner_business_number_snapshot: null,
  partner_representative_snapshot: null, partner_address_snapshot: null, partner_contact_snapshot: null,
  memo: null, taxable_supply_amount: 1000, exempt_supply_amount: 0, tax_amount: 100,
  total_amount: 1100, created_at: "2026-11-17T00:00:00Z", confirmed_at: "2026-11-17T00:00:00Z",
  cancelled_at: null,
});

beforeEach(() => {
  vi.clearAllMocks();
  mocks.request.mockImplementation((path: string) => {
    if (path.startsWith("business_document_lines?")) return Promise.resolve([]);
    if (path.startsWith("business_documents?select=id")) return Promise.resolve([]);
    if (path.startsWith("business_documents?select=*&") && path.includes("id=eq.doc-1")) return Promise.resolve([row()]);
    if (path === "rpc/cancel_business_document") return Promise.resolve({});
    return Promise.resolve([]);
  });
});

describe("CX-64 전표 삭제 경계", () => {
  it("목록은 기본으로 취소 전표를 숨기고 명시할 때만 포함한다", async () => {
    await listBusinessDocuments("company-1");
    expect(mocks.request.mock.calls[0][0]).toContain("status=neq.cancelled");
    await listBusinessDocuments("company-1", { includeCancelled: true });
    expect(mocks.request.mock.calls[1][0]).not.toContain("status=neq.cancelled");
  });

  it("빈 사유는 삭제로 기록해 기존 원장·재고 역분개 RPC를 쓴다", async () => {
    await cancelBusinessDocument("company-1", "doc-1", "", { name: "담당" });
    expect(mocks.request).toHaveBeenCalledWith("rpc/cancel_business_document", expect.objectContaining({
      body: expect.stringContaining('"p_reason":"삭제"'),
    }));
  });

  it("주문 원천 전표는 CX-62 원자 계약 전에는 아무 쓰기도 하지 않는다", async () => {
    mocks.request.mockImplementation((path: string) => {
      if (path.startsWith("business_document_lines?")) return Promise.resolve([]);
      if (path.startsWith("business_documents?select=*&") && path.includes("id=eq.doc-1")) return Promise.resolve([row("order")]);
      return Promise.resolve([]);
    });
    await expect(cancelBusinessDocument("company-1", "doc-1", "삭제", { name: "담당" })).rejects.toThrow("원자 취소 계약");
    expect(mocks.request).not.toHaveBeenCalledWith("rpc/cancel_business_document", expect.anything());
  });

  it("확정 반품이 연결되면 개수와 이유를 보여 주고 쓰지 않는다", async () => {
    mocks.request.mockImplementation((path: string) => {
      if (path.startsWith("business_document_lines?")) return Promise.resolve([]);
      if (path.startsWith("business_documents?select=*&") && path.includes("id=eq.doc-1")) return Promise.resolve([row()]);
      if (path.startsWith("business_documents?select=id")) return Promise.resolve([{ id: "return-1" }, { id: "return-2" }]);
      return Promise.resolve([]);
    });
    await expect(cancelBusinessDocument("company-1", "doc-1", "삭제", { name: "담당" })).rejects.toThrow("반품 전표 2건");
    expect(mocks.request).not.toHaveBeenCalledWith("rpc/cancel_business_document", expect.anything());
  });
});
