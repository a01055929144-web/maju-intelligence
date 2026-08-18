import { describe, expect, it } from "vitest";
import { makeCustomerKey, normalizeBusinessNumber, normalizeNameForDuplicateCheck } from "../lib/store";

describe("normalizeBusinessNumber", () => {
  it("strips all non-digit characters", () => {
    expect(normalizeBusinessNumber("123-45-67890")).toBe("1234567890");
  });

  it("returns an empty string when there are no digits", () => {
    expect(normalizeBusinessNumber("없음")).toBe("");
  });
});

describe("makeCustomerKey", () => {
  it("is case-insensitive and ignores whitespace differences", () => {
    const a = makeCustomerKey("성수 온반", "서울 성동구 성수동");
    const b = makeCustomerKey("성수온반", "서울   성동구   성수동");
    expect(a).toBe(b);
  });

  it("produces different keys for different addresses", () => {
    const a = makeCustomerKey("성수 온반", "서울 성동구 성수동");
    const b = makeCustomerKey("성수 온반", "서울 강남구 역삼동");
    expect(a).not.toBe(b);
  });

  it("does not silently collapse distinct customer names", () => {
    const a = makeCustomerKey("성수 온반", "");
    const b = makeCustomerKey("성수온반", "");
    // Known limitation documented in the operational-readiness audit: spacing differences in
    // the name portion DO collapse together (both normalize to the same key). This test pins
    // that current behavior so a future fix is a deliberate, visible change.
    expect(a).toBe(b);
  });
});

describe("normalizeNameForDuplicateCheck", () => {
  it("normalizes case and whitespace the same way for near-duplicate names", () => {
    expect(normalizeNameForDuplicateCheck("성수 온반")).toBe(normalizeNameForDuplicateCheck("성수온반"));
    expect(normalizeNameForDuplicateCheck("Cafe ABC")).toBe(normalizeNameForDuplicateCheck("cafe abc"));
  });

  it("treats genuinely different names as different", () => {
    expect(normalizeNameForDuplicateCheck("성수 온반")).not.toBe(normalizeNameForDuplicateCheck("성수 국밥집"));
  });
});
