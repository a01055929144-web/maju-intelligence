import { readFileSync } from "node:fs";
import { expect, it } from "vitest";

it("CC-35-2: the document editor's 행사·임박 등록 button opens the promotions screen (not the 묶음·템플릿 tab) and refreshes on focus", () => {
  const doc = readFileSync("components/pricing-documents-workspace.tsx", "utf8");
  expect(doc).toContain('window.open("/revenue/pricing/promotions?add=1"');
  expect(doc).not.toContain('onOpenLibrary={() => window.open("/revenue/pricing/documents?tab=library"');
  expect(doc).toContain('window.addEventListener("focus", refresh)');
  expect(readFileSync("components/pricing-promotions-workspace.tsx", "utf8")).toContain('query.get("add") === "1"');
});
