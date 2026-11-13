import { describe, expect, it } from "vitest";
import { parseDisplay } from "../domains/pricing/document";

describe("document display autoPromos", () => {
  it("keeps the key only when it is exactly true", () => {
    expect(parseDisplay({ autoPromos: true }).autoPromos).toBe(true);
    expect("autoPromos" in parseDisplay({ autoPromos: "true" })).toBe(false);
    expect("autoPromos" in parseDisplay({})).toBe(false);
    expect("autoPromos" in parseDisplay(null)).toBe(false);
  });
});
