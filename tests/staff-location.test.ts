import { describe, expect, it } from "vitest";
import { getStaffLocationVisibilityCutoff, STAFF_LOCATION_VISIBILITY_HOURS } from "../lib/staff-location";

describe("staff live-location visibility", () => {
  it("keeps the live snapshot window separate from long-term GPS history", () => {
    const now = Date.parse("2026-10-08T00:00:00.000Z");

    expect(STAFF_LOCATION_VISIBILITY_HOURS).toBe(24);
    expect(getStaffLocationVisibilityCutoff(now)).toBe("2026-10-07T00:00:00.000Z");
  });
});
