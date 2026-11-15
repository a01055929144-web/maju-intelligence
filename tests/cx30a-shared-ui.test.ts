import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("CX-30a shared UI migration", () => {
  it("uses shared search and state components for customer upload history", () => {
    const source = readFileSync("app/customers/data/page.tsx", "utf8");
    expect(source).toContain('<SearchInput aria-label="업로드 이력 검색"');
    expect(source).toContain('<LoadingState className="min-h-40"');
    expect(source).toContain('<ErrorState className="m-4"');
    expect(source).toContain("<EmptyState action=");
  });

  it("uses shared search, empty state and won formatting in CRM", () => {
    const summary = readFileSync("app/crm/summary/page.tsx", "utf8");
    const timeline = readFileSync("app/crm/timeline/page.tsx", "utf8");
    expect(summary).toContain('<SearchInput aria-label="거래처 검색"');
    expect(summary).toContain('<LoadingState className="m-3"');
    expect(summary).toContain("<EmptyState action=");
    expect(timeline).toContain("formatWon(sum?.monthSales ?? 0)");
  });
});
