import { describe, expect, it, vi } from "vitest";
import { existsSync, readFileSync } from "node:fs";
import { pricingDocuments, type DocumentScope } from "../application/pricing/documents";
import { DocumentSendError } from "../domains/pricing/document-send";

const scope: DocumentScope = { companyId: "c", actor: "a", manager: true };

describe("CC-35-3 묶음·템플릿 removed", () => {
  it("calling the removed set actions returns 404", () => {
    const request = vi.fn();
    const docs = pricingDocuments({ request });
    for (const run of [() => docs.read(scope, "sets", {}), () => docs.execute(scope, { action: "save-set", id: "x", expected: 0, content: {} }), () => docs.execute(scope, { action: "delete-set", id: "x", expected: 0 })]) {
      try { run(); throw new Error("should have thrown"); } catch (e) { expect(e).toBeInstanceOf(DocumentSendError); expect((e as DocumentSendError).status).toBe(404); }
    }
    expect(request).not.toHaveBeenCalled();
  });
  it("the library screen and every 묶음·템플릿 string are gone; the old ?tab=library address falls back to the document list", () => {
    expect(existsSync("components/pricing-document-library.tsx")).toBe(false);
    const ws = readFileSync("components/pricing-documents-workspace.tsx", "utf8");
    expect(ws).not.toContain("PricingDocumentLibrary");
    expect(ws).toContain('requestedTab === "profile"');
    expect(readFileSync("components/pricing-start-gallery.tsx", "utf8")).not.toContain("템플릿·묶음");
  });
});
