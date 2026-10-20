import { describe, expect, it } from "vitest";
import {
  buildLeadCanonicalFingerprint,
  buildLeadSourceRecordKey,
  isClosedPermitRecord
} from "../domains/lead/canonical-identity";

describe("lead canonical identity", () => {
  it("uses a business number before normalized name and address", () => {
    expect(buildLeadCanonicalFingerprint({
      businessName: "마주 식자재",
      businessNumber: "123-45-67890",
      address: "서울특별시 강남구 테헤란로 1"
    })).toBe("business:1234567890");
  });

  it("matches cross-source records by normalized name and address when no business number exists", () => {
    const first = buildLeadCanonicalFingerprint({ businessName: "농가의 식탁", address: "서울 강남구 역삼동 10-1" });
    const second = buildLeadCanonicalFingerprint({ businessName: "농가의식탁", address: "서울  강남구 역삼동 10-1" });
    expect(second).toBe(first);
  });

  it("keeps source record identifiers separate from the cross-source fingerprint", () => {
    expect(buildLeadSourceRecordKey({ businessName: "가게", address: "서울 강남구", sourceRecordKey: "MGT-001" }))
      .toBe("source:mgt001");
  });

  it.each(["폐업", "영업취소", "직권말소"])("recognizes inactive source event: %s", (status) => {
    expect(isClosedPermitRecord(status)).toBe(true);
  });
});
