import fs from "node:fs";
import path from "node:path";
import { describe, expect, it } from "vitest";
import {
  buildLeadSourceDisclosure,
  leadSourceLabel,
  normalizeDoNotContactValue,
  requiresAfterHoursConfirmation
} from "../domains/lead/outreach-governance";

describe("lead outreach governance", () => {
  it("explains known lead sources without overstating collection details", () => {
    expect(leadSourceLabel("kakao_keyword_search")).toBe("카카오 장소 검색");
    expect(buildLeadSourceDisclosure({ businessName: "면볶당", collectedAt: "2026-10-27T01:00:00.000Z", source: "localdata_api" })).toContain(
      "지방행정 인허가 공개데이터에서 2026. 10. 27. 확인했습니다"
    );
    expect(leadSourceLabel("unknown")).toBe("확인 중인 공개·직접 수집 정보");
  });

  it("requires confirmation during the Seoul quiet hours", () => {
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T12:00:00.000Z"))).toBe(true); // 21:00 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T22:59:00.000Z"))).toBe(true); // 07:59 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T23:00:00.000Z"))).toBe(false); // 08:00 KST
    expect(requiresAfterHoursConfirmation(new Date("2026-10-27T11:59:00.000Z"))).toBe(false); // 20:59 KST
  });

  it("normalizes contact values for a company do-not-contact registry", () => {
    expect(normalizeDoNotContactValue("sms", "10-3306-4790")).toBe("01033064790");
    expect(normalizeDoNotContactValue("email", "MAILTO:Owner@Example.COM")).toBe("owner@example.com");
    expect(normalizeDoNotContactValue("instagram", "https://instagram.com/My.Shop/")).toBe("my.shop");
    expect(normalizeDoNotContactValue("talktalk", "HTTPS://TALK.NAVER.COM/ct/ABC/")).toBe("https://talk.naver.com/ct/abc");
  });

  it("requires a confirmed audit row before reporting source disclosure success", () => {
    const storeSource = fs.readFileSync(path.join(process.cwd(), "lib/store.ts"), "utf8");
    expect(storeSource).toContain('Array<{ id: string }>>("lead_actions?select=id"');
    expect(storeSource).toContain('Prefer: "return=representation"');
    expect(storeSource).toContain('if (!rows[0]?.id) throw new Error("출처 안내 감사 기록 저장을 확인하지 못했습니다.")');
  });

  it("keeps tenant ownership and direct client access controls in the SQL draft", () => {
    const sql = fs.readFileSync(path.join(process.cwd(), "docs/sql-drafts/lead-contact-governance.sql"), "utf8");
    expect(sql).toContain("key_columns.columns = array['company_id', 'id']::name[]");
    expect(sql).not.toContain("business_permit_leads_company_id_id_unique");
    expect(sql).toContain("foreign key (company_id, lead_id)");
    expect(sql).toContain("foreign key (company_id, source_lead_id)");
    expect(sql.match(/enable row level security/g)).toHaveLength(3);
    expect(sql.match(/from public, anon, authenticated/g)).toHaveLength(3);
    expect(sql.indexOf("begin;")).toBeLessThan(sql.indexOf("create table"));
    expect(sql.lastIndexOf("commit;")).toBeGreaterThan(sql.lastIndexOf("grant select"));
  });

  it("records source disclosure before writing to the clipboard", () => {
    const panel = fs.readFileSync(path.join(process.cwd(), "components/lead-contact-channels-panel.tsx"), "utf8");
    const disclosureHandler = panel.slice(panel.indexOf("async function copySourceDisclosure"), panel.indexOf("function confirmAfterHoursSms"));
    expect(disclosureHandler.indexOf("fetchWithTimeout")).toBeLessThan(disclosureHandler.indexOf("navigator.clipboard.writeText"));
    expect(disclosureHandler).toContain("출처 안내 기록을 남기지 못해 문구를 복사하지 않았습니다.");
    expect(disclosureHandler).toContain("if (recordingSourceDisclosure) return");
    expect(disclosureHandler).toContain("setRecordingSourceDisclosure(false)");
  });
});
