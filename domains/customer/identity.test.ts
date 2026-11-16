import { describe, expect, it } from "vitest";
import { makeCustomerKey, normalizeNameForDuplicateCheck } from "./identity";

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

  it("keeps the current behavior for names that differ only by spacing", () => {
    expect(makeCustomerKey("성수 온반", "")).toBe(makeCustomerKey("성수온반", ""));
  });
});

describe("normalizeNameForDuplicateCheck", () => {
  it("normalizes case and whitespace for near-duplicate names", () => {
    expect(normalizeNameForDuplicateCheck("성수 온반")).toBe(normalizeNameForDuplicateCheck("성수온반"));
    expect(normalizeNameForDuplicateCheck("Cafe ABC")).toBe(normalizeNameForDuplicateCheck("cafe abc"));
  });

  it("keeps genuinely different names distinct", () => {
    expect(normalizeNameForDuplicateCheck("성수 온반")).not.toBe(normalizeNameForDuplicateCheck("성수 국밥집"));
  });
});
