import { describe, expect, it } from "vitest";
import {
  buildLeadCanonicalFingerprint,
  buildLeadSourceRecordKey,
  isCanonicalPlaceMatchSafe,
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

  it("rebuilds the canonical key when a business number is added or removed", () => {
    const identity = { businessName: "농가의 식탁", address: "서울 강남구 역삼동 10-1" };
    expect(buildLeadCanonicalFingerprint({ ...identity, businessNumber: "220-81-62517" })).toBe("business:2208162517");
    expect(buildLeadCanonicalFingerprint({ ...identity, businessNumber: undefined })).toBe(
      buildLeadCanonicalFingerprint(identity)
    );
  });

  it("keeps source record identifiers separate from the cross-source fingerprint", () => {
    expect(buildLeadSourceRecordKey({ businessName: "가게", address: "서울 강남구", sourceRecordKey: "MGT-001" }))
      .toBe("source:mgt001");
  });

  it.each(["폐업", "영업취소", "직권말소"])("recognizes inactive source event: %s", (status) => {
    expect(isClosedPermitRecord(status)).toBe(true);
  });

  it("does not merge the same normalized place when floor, opening date, or industry differs", () => {
    expect(isCanonicalPlaceMatchSafe({
      existingAddress: "경기도 성남시 분당구 판교로 1 2층",
      incomingAddress: "경기도 성남시 분당구 판교로 1 3층"
    })).toBe(false);
    expect(isCanonicalPlaceMatchSafe({
      existingAddress: "경기도 성남시 분당구 판교로 1",
      incomingAddress: "경기도 성남시 분당구 판교로 1",
      existingOpenDate: "2026-01-01",
      incomingOpenDate: "2026-10-20"
    })).toBe(false);
    expect(isCanonicalPlaceMatchSafe({
      existingAddress: "경기도 성남시 분당구 판교로 1",
      incomingAddress: "경기도 성남시 분당구 판교로 1",
      existingIndustry: "한식",
      incomingIndustry: "일식"
    })).toBe(false);
  });

  it("allows a place match when known identity details agree", () => {
    expect(isCanonicalPlaceMatchSafe({
      existingAddress: "서울특별시 강남구 테헤란로 1 2층",
      incomingAddress: "서울특별시 강남구 테헤란로 1 2층",
      existingOpenDate: "2026-10-20",
      incomingOpenDate: "2026-10-20",
      existingIndustry: "한식",
      incomingIndustry: "한식"
    })).toBe(true);
  });
});
