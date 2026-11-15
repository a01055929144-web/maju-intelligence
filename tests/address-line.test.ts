import { describe, expect, it } from "vitest";
import { addressLine, joinSavedAddress, stripDetail } from "../domains/customer/address-line";

describe("address-line", () => {
  it("joins road and detail with a middle dot", () => {
    expect(addressLine("서울 가상구 테스트로 1", "3층 301호")).toBe("서울 가상구 테스트로 1 · 3층 301호");
    expect(addressLine("서울 가상구 테스트로 1", "  ")).toBe("서울 가상구 테스트로 1");
    expect(addressLine(null, undefined)).toBe("");
  });
  it("saves base + detail with a space and can split it back", () => {
    const saved = joinSavedAddress("서울 가상구 테스트로 1", "3층");
    expect(saved).toBe("서울 가상구 테스트로 1 3층");
    expect(stripDetail(saved, "3층")).toBe("서울 가상구 테스트로 1");
    expect(stripDetail("서울 가상구 테스트로 1", "")).toBe("서울 가상구 테스트로 1");
  });
});
