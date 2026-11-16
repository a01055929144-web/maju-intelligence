import { describe, expect, it } from "vitest";
import {
  buildLeadEnrichmentEventOutcome,
  filterCustomersByAssignment,
  normalizeBusinessNumber,
  shouldAutoApplyKakaoPhone,
  shouldClearKakaoPhoneOnReject
} from "../lib/store";

describe("normalizeBusinessNumber", () => {
  it("strips all non-digit characters", () => {
    expect(normalizeBusinessNumber("123-45-67890")).toBe("1234567890");
  });

  it("returns an empty string when there are no digits", () => {
    expect(normalizeBusinessNumber("없음")).toBe("");
  });
});

describe("filterCustomersByAssignment", () => {
  it("keeps legacy manager and territory matching after stable assignment IDs are populated", () => {
    const customer = {
      address: "경기도 의정부시",
      assignedStaffMemberId: "member-1",
      assignedStaffName: "현재 직원명",
      assignmentDisplayManager: "현재 직원명",
      customerName: "테스트 거래처",
      deliveryKm: 0,
      deliveryManager: "정두영",
      deliveryVehicle: "의정부",
      deliveryVehicleId: "vehicle-1",
      deliveryVehicleName: "12가 3456",
      grade: "C" as const,
      id: "customer-1",
      industry: "미분류",
      lastOrderDays: 0,
      monthlyRevenue: 0,
      region: "의정부",
      visitCount: 0
    };

    expect(filterCustomersByAssignment([customer], {
      staffMemberId: "member-1",
      legacyManagerKeys: [],
      legacyTerritoryKeys: []
    })).toEqual([customer]);
    expect(filterCustomersByAssignment([customer], {
      staffMemberId: "driver-member",
      legacyManagerKeys: [],
      legacyTerritoryKeys: ["의정부"]
    })).toEqual([customer]);
    expect(filterCustomersByAssignment([customer], {
      legacyManagerKeys: ["현재 직원명"],
      legacyTerritoryKeys: []
    })).toEqual([]);
    expect(filterCustomersByAssignment([customer], {
      legacyManagerKeys: [],
      legacyTerritoryKeys: ["12가 3456"]
    })).toEqual([]);
  });

  it("keeps territory driver B access after salesperson A ID is backfilled", () => {
    const customer = {
      address: "서울 강남구",
      assignedStaffMemberId: "salesperson-a",
      customerName: "강남 거래처",
      deliveryKm: 0,
      deliveryManager: "영업 A",
      deliveryVehicle: "강남",
      grade: "C" as const,
      id: "customer-2",
      industry: "미분류",
      lastOrderDays: 0,
      memoCount: 0,
      monthlyRevenue: 0,
      region: "강남",
      visitCount: 0
    };

    expect(filterCustomersByAssignment([customer], {
      staffMemberId: "driver-b",
      legacyManagerKeys: ["배송 B"],
      legacyTerritoryKeys: ["강남"]
    })).toEqual([customer]);
  });

  it("uses the legacy manager name only while the stable staff assignment is absent", () => {
    const legacyCustomer = {
      address: "인천광역시",
      customerName: "레거시 거래처",
      deliveryKm: 0,
      deliveryManager: "초대 별칭",
      deliveryVehicle: "인천",
      grade: "C" as const,
      id: "customer-legacy",
      industry: "미분류",
      lastOrderDays: 0,
      memoCount: 0,
      monthlyRevenue: 0,
      region: "인천",
      visitCount: 0
    };
    const scope = {
      staffMemberId: "member-other",
      legacyManagerKeys: ["초대 별칭"],
      legacyTerritoryKeys: []
    };

    expect(filterCustomersByAssignment([legacyCustomer], scope)).toEqual([legacyCustomer]);
    expect(filterCustomersByAssignment([{ ...legacyCustomer, assignedStaffMemberId: "member-a" }], scope)).toEqual([]);
  });
});

describe("buildLeadEnrichmentEventOutcome", () => {
  const emptySources = { googleReviews: false, keywordVolume: false, placeLinks: false };

  const kakao = (over: Record<string, unknown>) => ({ documentCount: 1, matched: false, matchDistanceM: null, phoneFound: false, queryVariant: "none", ...over });
  const code = (over: Record<string, unknown>, contact: { afterPhone?: string } = {}) =>
    buildLeadEnrichmentEventOutcome({ ...contact, persisted: true, skippedFields: [], sources: emptySources, kakaoMatch: kakao(over) }).metadata;

  it("46-2⓪ 결과 코드 6종 중 filled·linked·already_complete·not_found·rejected 기록", () => {
    expect(code({ matched: true, queryVariant: "region" }, { afterPhone: "02-000-0000" }).result_code).toBe("filled");
    expect(code({ matched: true, queryVariant: "region" }).result_code).toBe("linked");
    expect(code({ matched: true, queryVariant: "existing" }).result_code).toBe("already_complete");
    expect(code({ resultCode: "not_found" }).result_code).toBe("not_found");
    expect(code({ resultCode: "error" }).result_code).toBe("error");
    const rejected = code({ resultCode: "rejected", rejectReason: "distance_exceeded", nameScore: 0.8, matchDistanceM: 1500 });
    expect(rejected).toMatchObject({ result_code: "rejected", reject_reason: "distance_exceeded", name_score: 0.8, kakao_match_distance_m: 1500 });
  });

  it("marks a cron retry successful only when a previously missing contact field is filled", () => {
    const outcome = buildLeadEnrichmentEventOutcome({
      afterAddress: "서울 강남구 테헤란로 1",
      afterPhone: "02-1234-5678",
      beforeAddress: "서울 강남구 테헤란로 1",
      persisted: true,
      skippedFields: [],
      sources: { ...emptySources, placeLinks: true }
    });

    expect(outcome.retrySucceeded).toBe(true);
    expect(outcome.operationSucceeded).toBe(true);
    expect(outcome.metadata.contact_fields_filled).toBe(1);
    expect(outcome.metadata.event_type).toBe("external_info_enrichment");
  });

  it("records the required event type but treats an attempt with no newly filled contact as retry failure", () => {
    const outcome = buildLeadEnrichmentEventOutcome({
      persisted: true,
      skippedFields: [],
      sources: { ...emptySources, googleReviews: true }
    });

    expect(outcome.retrySucceeded).toBe(false);
    expect(outcome.operationSucceeded).toBe(true);
    expect(outcome.metadata.contact_fields_filled).toBe(0);
    expect(outcome.metadata.event_type).toBe("external_info_enrichment");
  });

  it("records Kakao matching diagnostics separately from fallback place links", () => {
    const outcome = buildLeadEnrichmentEventOutcome({
      persisted: true,
      skippedFields: [],
      sources: { ...emptySources, placeLinks: true },
      kakaoMatch: {
        documentCount: 6,
        matched: true,
        matchDistanceM: 240,
        phoneFound: true,
        queryVariant: "region"
      }
    });

    expect(outcome.metadata).toMatchObject({
      kakao_document_count: 6,
      kakao_match_distance_m: 240,
      kakao_matched: true,
      kakao_phone_found: true,
      kakao_query_variant: "region"
    });
  });

  it("marks an attempt with no saved external signal as failed", () => {
    const outcome = buildLeadEnrichmentEventOutcome({
      persisted: true,
      skippedFields: [],
      sources: emptySources
    });

    expect(outcome.retrySucceeded).toBe(false);
    expect(outcome.operationSucceeded).toBe(false);
  });
});

describe("Kakao lead contact safeguards", () => {
  it("does not auto-apply a phone from a name-only match", () => {
    expect(shouldAutoApplyKakaoPhone("name_only")).toBe(false);
    expect(shouldAutoApplyKakaoPhone("region")).toBe(true);
  });

  it("clears only the phone value previously applied by Kakao", () => {
    expect(shouldClearKakaoPhoneOnReject("02-1234-5678", "02-1234-5678")).toBe(true);
    expect(shouldClearKakaoPhoneOnReject("010-9999-9999", "02-1234-5678")).toBe(false);
    expect(shouldClearKakaoPhoneOnReject("010-9999-9999", null)).toBe(false);
  });
});
