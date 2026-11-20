import { afterEach, describe, expect, it } from "vitest";
import { isFeatureEnabled } from "../../lib/feature-flags";
import { isVisitPhotoStoragePath, normalizeVisitMaterials, visitRevisitCandidates } from "./visit-materials";

afterEach(() => {
  delete process.env.FEATURE_LEAD_VISIT_MATERIALS;
  delete process.env.FEATURE_LEAD_VISIT_MATERIALS_COMPANY_IDS;
});

describe("CX-85 방문 자료 기록", () => {
  it("기본 OFF이고 회사 allowlist에서만 열린다", () => {
    expect(isFeatureEnabled("LEAD_VISIT_MATERIALS", "company-a")).toBe(false);
    process.env.FEATURE_LEAD_VISIT_MATERIALS_COMPANY_IDS = "company-b,company-a";
    expect(isFeatureEnabled("LEAD_VISIT_MATERIALS", "company-a")).toBe(true);
    expect(isFeatureEnabled("LEAD_VISIT_MATERIALS", "company-c")).toBe(false);
  });

  it("허용 자료만 원래 선택 순서와 무관하게 한 번씩 남긴다", () => {
    expect(normalizeVisitMaterials(["명함", "단가표", "자동 발송", "명함"])).toEqual(["단가표", "명함"]);
  });

  it("마지막 방문 14일이 지난 리드만 경로 추가 시간이 짧은 순서로 추천하고 반응을 붙인다", () => {
    const items = visitRevisitCandidates([
      { leadId: "near", at: "2026-11-01T00:00:00.000Z", materials: ["명함"] },
      { leadId: "far", at: "2026-10-30T00:00:00.000Z", materials: ["단가표"] },
      { leadId: "near", at: "2026-11-02T00:00:00.000Z", materials: ["견적서"] },
      { leadId: "recent", at: "2026-11-10T00:00:00.000Z", materials: ["브로슈어"] }
    ], [
      { leadId: "near", openedAt: "2026-11-03T01:00:00.000Z" },
      { leadId: "far", orderedAt: "2026-11-05T02:00:00.000Z" }
    ], new Date("2026-11-17T00:00:00.000Z"), { near: 2, far: 9 });
    expect(items.map((item) => item.leadId)).toEqual(["near", "far"]);
    expect(items[0]).toMatchObject({ revisitAt: "2026-11-16T00:00:00.000Z", reaction: { openedAt: "2026-11-03T01:00:00.000Z" } });
    expect(items[1].reaction?.orderedAt).toBe("2026-11-05T02:00:00.000Z");
  });

  it("사진은 해당 회사의 저장 경로만 받는다", () => {
    expect(isVisitPhotoStoragePath("company-a", "lead-visits/company-a/photo.jpg")).toBe(true);
    expect(isVisitPhotoStoragePath("company-a", "lead-visits/company-b/photo.jpg")).toBe(false);
    expect(isVisitPhotoStoragePath("company-a", "lead-visits/company-a/../secret")).toBe(false);
  });
});
