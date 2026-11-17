import { afterEach, beforeEach, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), createReturn: vi.fn() }));
vi.mock("@/lib/auth", () => ({
  getRequestAuthScope: mocks.auth,
  scopeHasCapability: () => true,
}));
vi.mock("@/lib/business-documents", () => ({
  cancelBusinessDocument: vi.fn(),
  confirmBusinessDocument: vi.fn(),
  copyBusinessDocumentLines: vi.fn(),
  createReturnDraft: mocks.createReturn,
  moveBusinessDocumentLines: vi.fn(),
}));

import { POST } from "../app/api/business-documents/[id]/actions/route";

const company = "00000000-0000-4000-8000-000000000001";
const oldEnabled = process.env.FEATURE_ERP_ORDER_DOCUMENTS;
const oldCompanies = process.env.FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS;

beforeEach(() => {
  vi.clearAllMocks();
  mocks.auth.mockResolvedValue({ ok: true, companyId: company, customerSession: { name: "담당" } });
});

afterEach(() => {
  if (oldEnabled === undefined) delete process.env.FEATURE_ERP_ORDER_DOCUMENTS;
  else process.env.FEATURE_ERP_ORDER_DOCUMENTS = oldEnabled;
  if (oldCompanies === undefined) delete process.env.FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS;
  else process.env.FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS = oldCompanies;
});

const request = () => POST(new NextRequest("http://localhost/api/business-documents/doc-1/actions", {
  method: "POST",
  body: JSON.stringify({ action: "return", returnLines: [{ lineId: "line-1", quantity: 2 }] }),
}), { params: Promise.resolve({ id: "doc-1" }) });

it("기능이 꺼지면 반품 초안 쓰기를 시작하지 않는다", async () => {
  delete process.env.FEATURE_ERP_ORDER_DOCUMENTS;
  delete process.env.FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS;
  expect((await request()).status).toBe(404);
  expect(mocks.createReturn).not.toHaveBeenCalled();
});

it("회사 allowlist에 있을 때 선택 줄을 전달한다", async () => {
  process.env.FEATURE_ERP_ORDER_DOCUMENTS_COMPANY_IDS = company;
  mocks.createReturn.mockResolvedValue({ id: "return-1" });
  expect((await request()).status).toBe(200);
  expect(mocks.createReturn).toHaveBeenCalledWith(company, "doc-1", [{ lineId: "line-1", quantity: 2 }], expect.objectContaining({ name: "담당" }));
});
