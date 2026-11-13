import { describe, expect, it } from "vitest";
import { gradeNameKey, parseGradeInput } from "../domains/pricing/store-grade";

describe("store grade input", () => {
  it("trims the name and defaults the color and order", () => {
    expect(parseGradeInput({ name: "  VIP " })).toEqual({ name: "VIP", color: "slate", sortOrder: 0 });
  });
  it("rejects empty, too long, unknown color and bad order", () => {
    expect(parseGradeInput({ name: "   " })).toBeNull();
    expect(parseGradeInput({ name: "가".repeat(41) })).toBeNull();
    expect(parseGradeInput({ name: "VIP", color: "red" })).toBeNull();
    expect(parseGradeInput({ name: "VIP", sortOrder: 1.5 })).toBeNull();
    expect(parseGradeInput({ name: 5 })).toBeNull();
  });
  it("compares names ignoring case and edge spaces like the database", () => {
    expect(gradeNameKey(" Vip ")).toBe(gradeNameKey("VIP"));
  });
});
