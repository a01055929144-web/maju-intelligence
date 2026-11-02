import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

describe("backend contract invariants", () => {
  for (const id of ["I-1", "I-2", "I-3", "I-4", "I-5", "I-6", "I-7", "I-8", "I-9", "I-11", "I-12"]) {
    it.skip(`${id}: implementation gap documented in docs/backend/04_GAPS.md`, () => {});
  }

  it("I-10: new migrations require a project-specific approval line", () => {
    const workflow = readFileSync(".github/workflows/ci.yml", "utf8");
    expect(workflow).toContain('select(.status == "added" and (.filename | startswith("supabase/migrations/")))');
    expect(workflow).toContain("DB-APPROVED: fcmdvveqmcgtioelzqun");
  });
});
