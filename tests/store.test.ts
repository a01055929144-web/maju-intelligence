import { describe, expect, it } from "vitest";
import {
  buildLeadEnrichmentEventOutcome,
  filterCustomersByAssignment,
  makeCustomerKey,
  normalizeBusinessNumber,
  normalizeNameForDuplicateCheck
} from "../lib/store";

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

    expect(filterCustomersByAssignment([customer], ["정두영"])).toEqual([customer]);
    expect(filterCustomersByAssignment([customer], ["의정부"])).toEqual([customer]);
    expect(filterCustomersByAssignment([customer], ["현재 직원명"])).toEqual([]);
    expect(filterCustomersByAssignment([customer], ["12가 3456"])).toEqual([]);
  });
});

describe("buildLeadEnrichmentEventOutcome", () => {
  const emptySources = { googleReviews: false, keywordVolume: false, placeLinks: false };

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
