import { beforeEach, afterEach, expect, it, vi } from "vitest";
import { resolveDocumentEntry } from "../application/pricing/document-entry";
const mocks = vi.hoisted(() => ({ identity: vi.fn() }));
vi.mock("../lib/store", () => ({ getPermitLeadIdentityForCompany: mocks.identity }));
import { findDocumentEntryLead } from "../lib/pricing/document-entry";
const companyId = "00000000-0000-4000-8000-000000000001", leadId = "20000000-0000-4000-8000-000000000001";
const scope = { companyId, manager: true, preview: false };
beforeEach(() => {
  vi.clearAllMocks(); vi.stubEnv("CI_LAYOUT_FIXTURES", ""); vi.stubEnv("VERCEL_ENV", "production");
  mocks.identity.mockResolvedValue({ id: leadId, businessName: "합성 매장", address: "반환하지 않을 주소", industry: "반환하지 않을 업종" });
});
afterEach(() => vi.unstubAllEnvs());
it.each(["sheet", "quote"])("resolves %s entry with only the verified company and minimal lead context", async start => {
  const entry = await resolveDocumentEntry(scope, { start, leadId }, findDocumentEntryLead);
  expect(mocks.identity).toHaveBeenCalledWith(companyId, leadId);
  expect(entry).toEqual({ initialStartKind: start, leadContext: { id: leadId, name: "합성 매장", backHref: `/leads/${leadId}` } });
});
it("preserves ordinary and generic starts without a lead query", async () => {
  expect(await resolveDocumentEntry(scope, {}, findDocumentEntryLead)).toEqual({});
  expect(await resolveDocumentEntry(scope, { start: "quote" }, findDocumentEntryLead)).toEqual({ initialStartKind: "quote" });
  expect(mocks.identity).not.toHaveBeenCalled();
});
it.each([{ start: "bad", leadId }, { start: ["sheet", "quote"], leadId }, { start: "quote", leadId: "bad" },
  { start: "quote", leadId: [leadId] }, { leadId }])("rejects malformed or partial entry before reading a lead: %j", async query => {
  expect(await resolveDocumentEntry(scope, query, findDocumentEntryLead)).toBeNull(); expect(mocks.identity).not.toHaveBeenCalled();
});
it("rejects missing, merged and foreign-company leads returned as absent by the scoped read", async () => {
  mocks.identity.mockResolvedValue(null);
  expect(await resolveDocumentEntry(scope, { start: "quote", leadId }, findDocumentEntryLead)).toBeNull();
});
it("preserves sales quote access and manager-only sheet creation", async () => {
  const sales = { ...scope, manager: false };
  expect((await resolveDocumentEntry(sales, { start: "quote", leadId }, findDocumentEntryLead))?.initialStartKind).toBe("quote");
  mocks.identity.mockClear();
  expect(await resolveDocumentEntry(sales, { start: "sheet", leadId }, findDocumentEntryLead)).toBeNull(); expect(mocks.identity).not.toHaveBeenCalled();
});
it("fails visibly on read errors instead of fabricating lead context", async () => {
  mocks.identity.mockRejectedValue(new Error("synthetic unavailable"));
  await expect(resolveDocumentEntry(scope, { start: "quote", leadId }, findDocumentEntryLead)).rejects.toThrow("synthetic unavailable");
});
it("builds an internal scoped admin return URL", async () => {
  expect((await resolveDocumentEntry({ ...scope, preview: true }, { start: "sheet", leadId }, findDocumentEntryLead))?.leadContext?.backHref).toBe(`/leads/${leadId}?companyId=${companyId}`);
});
it("uses CI fixtures only for their tenant and never in production", async () => {
  vi.stubEnv("CI_LAYOUT_FIXTURES", "enabled"); vi.stubEnv("VERCEL_ENV", "preview");
  expect(await findDocumentEntryLead(companyId, leadId)).toMatchObject({ id: leadId, businessName: "테스트 매장 01" });
  expect(await findDocumentEntryLead("other-company", leadId)).toBeNull(); expect(mocks.identity).not.toHaveBeenCalled();
  vi.stubEnv("VERCEL_ENV", "production"); await findDocumentEntryLead(companyId, leadId); expect(mocks.identity).toHaveBeenCalledWith(companyId, leadId);
});
