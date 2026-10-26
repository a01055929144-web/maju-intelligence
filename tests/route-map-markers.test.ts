import { describe, expect, it } from "vitest";
import { operationalMarkerPersonIcon } from "../lib/route-map-markers";

describe("operational staff map marker", () => {
  it("shows a person when an on-duty employee has no assigned vehicle", () => {
    expect(operationalMarkerPersonIcon(undefined)).toBe("person");
    expect(operationalMarkerPersonIcon("  ")).toBe("person");
    expect(operationalMarkerPersonIcon("1호차")).toBeUndefined();
  });
});
