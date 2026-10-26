import { describe, expect, it } from "vitest";
import { getAdjacentLeadIds } from "../domains/lead/detail-navigation";

describe("getAdjacentLeadIds", () => {
  it("returns adjacent leads without wrapping", () => {
    expect(getAdjacentLeadIds(["a", "b", "c"], "b")).toEqual({ previousId: "a", nextId: "c" });
    expect(getAdjacentLeadIds(["a", "b", "c"], "a")).toEqual({ previousId: undefined, nextId: "b" });
    expect(getAdjacentLeadIds(["a", "b", "c"], "c")).toEqual({ previousId: "b", nextId: undefined });
  });

  it("returns no navigation for a lead outside the visible list", () => {
    expect(getAdjacentLeadIds(["a", "b"], "missing")).toEqual({ previousId: undefined, nextId: undefined });
  });
});
