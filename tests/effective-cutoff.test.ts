import { describe, expect, it } from "vitest";
import { effectiveCutoff, type DeliveryCutoffRule } from "../domains/order/effective-cutoff";

const company: DeliveryCutoffRule & { weekdays: readonly number[] } = { weekdays: [1, 2, 3, 4, 5, 6], cutoffDaysBefore: 1, cutoffTime: "22:00" };

describe("effectiveCutoff", () => {
  it("returns the earliest applicable rule and its source across midnight", () => {
    expect(effectiveCutoff(company,
      { cutoffDaysBefore: 2, cutoffTime: "23:59" },
      { cutoffDaysBefore: 1, cutoffTime: "21:00" },
      { cutoffDaysBefore: 2, cutoffTime: "00:05" },
      "2026-11-23"
    )).toEqual({ cutoffAtKst: "2026-11-21T00:05:00+09:00", source: "product" });
  });

  it("supports a same-day product cutoff with zero days before", () => {
    expect(effectiveCutoff(
      { ...company, cutoffDaysBefore: 0, cutoffTime: "23:59" }, null, null,
      { cutoffDaysBefore: 0, cutoffTime: "12:00" }, "2026-11-23"
    )).toEqual({ cutoffAtKst: "2026-11-23T12:00:00+09:00", source: "product" });
  });

  it("ignores a missing product rule and retains the company cutoff", () => {
    expect(effectiveCutoff(company, null, null, null, "2026-11-23"))
      .toEqual({ cutoffAtKst: "2026-11-22T22:00:00+09:00", source: "company" });
  });

  it("returns no cutoff for a delivery day outside the store weekdays", () => {
    expect(effectiveCutoff(company, null, { cutoffDaysBefore: 0, cutoffTime: "23:00", weekdays: [2] }, null, "2026-11-23"))
      .toBeNull();
  });
});

