import { describe, expect, it } from "vitest";
import { planLeadFingerprintBackfill } from "../domains/lead/fingerprint-backfill";

describe("lead fingerprint backfill", () => {
  it("uses the canonical domain implementation and separates unfillable rows", () => {
    const result = planLeadFingerprintBackfill([
      { id: "1", businessName: "농가의 식탁", address: "서울 강남구 역삼동 10-1" },
      { id: "2", businessName: "사업자 매장", businessNumber: "123-45-67890" },
      { id: "3", businessName: "", address: "" }
    ]);
    expect(result.fillable).toEqual([
      { id: "1", fingerprint: "place:농가의식탁:서울강남구역삼동101" },
      { id: "2", fingerprint: "business:1234567890" }
    ]);
    expect(result.unfillableIds).toEqual(["3"]);
  });
});
