import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");

describe("CX-30b shared UI migration", () => {
  it("moves document destructive actions to the shared confirm dialog", () => {
    for (const path of ["components/business-document-workspace.tsx", "components/category-health-card.tsx", "components/import-row-editor.tsx"]) {
      const source = read(path);
      expect(source).toContain("useConfirm()");
      expect(source).not.toContain("window.confirm(");
    }
  });

  it("uses shared search, state and copy components", () => {
    const mapping = read("components/excel-mapping-preview.tsx");
    expect(mapping.match(/<SearchInput/g)).toHaveLength(3);
    expect(mapping).toContain("<EmptyState");
    expect(read("components/company-profile-form.tsx")).toContain("<CopyTextButton");
  });
});
