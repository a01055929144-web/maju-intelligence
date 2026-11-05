import { expect, it, vi } from "vitest";
const db = vi.hoisted(() => vi.fn());
vi.mock("../lib/store", () => ({ supabaseRequest: db }));
import { pricingDocumentsRepository } from "../lib/pricing/documents-repository";
import { documentOutput, fillBlankDocumentSpecs, lineFromCatalog, parseDocument, printPages, type CatalogChoice, type DocumentContent, type DocumentVersion } from "../domains/pricing/document";

for (const missingSpec of ["", " ", null, undefined]) it.each(["sheet", "quote"] as const)(`carries fallback specs from the catalog to a new %s and A4 without rewriting 16 published lines (${String(missingSpec)})`, async (kind) => {
  const id = "20000000-0000-4000-8000-000000000001";
  const catalog: CatalogChoice = { id, name: "합성 미림", displayName: "합성 미림", brand: "", spec: " ", unit: "통", price: 1000, taxType: "taxable" };
  const items = Array.from({ length: 16 }, (_, i) => ({ ...catalog, id: `20000000-0000-4000-8000-${String(i + 1).padStart(12, "0")}` }));
  db.mockImplementation(async (path: string) => path === "rpc/pricing_p1" ? { items: items.map(item => ({ ...item, spec: missingSpec })), total: 16 } : items.map(item => ({ id: item.id, sales_spec: " ", spec_value: 18, spec_unit: "L" })));
  const result = await pricingDocumentsRepository.request<{ items: CatalogChoice[] }>({ companyId: "company", actor: "owner", manager: true }, "catalog", {});
  expect(result.items[0].spec).toBe("18L");
  expect(db.mock.calls.at(-1)?.[0]).toContain("company_id=eq.company");
  const content: DocumentContent = { kind, title: "합성 문서", companyName: "합성 유통", contact: "", recipient: "", footer: "", validUntil: "2099-12-31", theme: "blue", layout: "table", showPrice: true, showBrand: true, showSpec: true, lines: items.map(item => lineFromCatalog({ ...item, spec: "" })) };
  const original: DocumentVersion = { id, documentId: id, version: 1, revision: 1, publishedAt: "2026-11-05T00:00:00Z", content, unavailablePromotions: [] };
  const snapshot = JSON.stringify(original);
  const fresh = { ...original, content: { ...content, lines: result.items.map(lineFromCatalog) } };
  expect(printPages(documentOutput(fresh)).flatMap(page => page.lines).map(line => line.spec)).toEqual(Array(16).fill("18L"));
  const legacyContent = { ...content, lines: content.lines.map(line => ({ ...line, spec: null })) };
  expect(parseDocument(legacyContent).lines.every(line => line.spec === "")).toBe(true);
  expect(legacyContent.lines.every(line => line.spec === null)).toBe(true);
  const repaired = fillBlankDocumentSpecs(original.content.lines, result.items);
  const published = { ...original, version: 2, content: { ...content, lines: repaired } };
  expect(printPages(documentOutput(published)).flatMap((page) => page.lines).map((line) => line.spec)).toEqual(Array(16).fill("18L"));
  expect(documentOutput(original).lines.map((line) => line.spec)).toEqual(Array(16).fill(""));
  expect(JSON.stringify(original)).toBe(snapshot);
  expect(lineFromCatalog(result.items[0]).spec).toBe("18L");
});
