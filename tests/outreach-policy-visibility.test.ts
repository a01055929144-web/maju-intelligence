import { describe, expect, it } from "vitest";
import { isOutreachPolicyPromptVisible } from "../domains/lead/outreach-governance";

describe("outreach policy prompt", () => {
  it("stays hidden while loading and after acknowledgement", () => {
    expect(isOutreachPolicyPromptVisible("loading")).toBe(false);
    expect(isOutreachPolicyPromptVisible("required")).toBe(true);
    expect(isOutreachPolicyPromptVisible("acknowledged")).toBe(false);
  });
});
