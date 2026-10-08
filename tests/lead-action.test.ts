import { describe, expect, it } from "vitest";
import { normalizeLeadActionLimit, resolveLeadContactActorName } from "../domains/lead/lead-action";

describe("lead contact history", () => {
  it("uses the first trusted non-empty display name", () => {
    expect(resolveLeadContactActorName([" ", " 정동규 ", "카카오 닉네임"])).toBe("정동규");
  });

  it("keeps history query limits within a safe range", () => {
    expect(normalizeLeadActionLimit(undefined)).toBe(20);
    expect(normalizeLeadActionLimit(0)).toBe(1);
    expect(normalizeLeadActionLimit(200)).toBe(50);
  });
});
