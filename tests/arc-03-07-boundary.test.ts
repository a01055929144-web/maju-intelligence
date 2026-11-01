import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(new URL(`../${path}`, import.meta.url), "utf8");
const erpStore = read("lib/business-documents.ts");
const legacyStore = read("lib/store.ts");
const continuitySql = read("docs/sql-drafts/20261029-lead-customer-continuity.sql");
const boundary = read("docs/specs/2026-11-01-arc-03-07-customer-ledger-boundary.md");
const conversionFinalizeDraft = read("docs/sql-drafts/20261101-lead-customer-conversion-finalize.sql");
const documentWorkspace = read("components/business-document-workspace.tsx");

describe("ARC-03 / ARC-07 ownership boundary", () => {
  it("keeps lead-to-customer continuity on the company-scoped matched_customer_id link", () => {
    expect(continuitySql).toMatch(/foreign key \(company_id, matched_customer_id\)/i);
    expect(continuitySql).toMatch(/set matched_customer_id = p_customer_id/i);
    expect(boundary).toContain("`matched_customer_id`");
  });

  it("keeps legacy imports out of the document and partner-ledger write module", () => {
    expect(legacyStore).toContain("sales_transactions?select=");
    expect(erpStore).not.toContain("sales_transactions");
    expect(boundary).toContain("레거시 분석·수입 자료");
  });

  it("routes document and payment ledger writes through database RPCs", () => {
    expect(erpStore).toContain('supabaseRpc("save_business_document"');
    expect(erpStore).toContain('supabaseRpc("confirm_business_document"');
    expect(erpStore).toContain('supabaseRpc("cancel_business_document"');
    expect(erpStore).toContain('supabaseRpc("record_partner_payment"');
    expect(erpStore).toContain("입금·지급 재시도 키를 확인해 주세요.");
  });

  it("records the confirmed ERP 1-B v2 conflict instead of treating the old design as current", () => {
    expect(boundary).toContain("ERP 1-B v2 우선");
    expect(boundary).toContain("확정 후 헤더·라인 불변");
    expect(boundary).toContain("완전한 단일 트랜잭션이 아니다");
  });

  it("records the overlapping ARC-03 implementation without duplicating it", () => {
    expect(boundary).toContain("미병합 PR #109와의 관계");
    expect(boundary).toContain("#111은 해당 코드를 중복 수정하지 않는다");
  });

  it("keeps the atomic conversion proposal as a non-applying, company-scoped draft", () => {
    expect(conversionFinalizeDraft).toContain("운영 DB 적용 금지");
    expect(conversionFinalizeDraft).toMatch(/where lead\.company_id = p_company_id[\s\S]*for update/i);
    expect(conversionFinalizeDraft).toMatch(/customer\.company_id = p_company_id[\s\S]*for key share/i);
    expect(conversionFinalizeDraft).toContain("lead_already_linked_to_another_customer");
    expect(conversionFinalizeDraft).toContain("from public, anon, authenticated");
    expect(conversionFinalizeDraft).toMatch(/rollback;[\s\S]*재현 시나리오 A/);
  });

  it("reuses a pending payment payload until success or explicit reset", () => {
    expect(documentWorkspace).toContain("let attempt = pendingPayment.current");
    expect(documentWorkspace).toContain("pendingPayment.current = attempt");
    expect(documentWorkspace).toContain("const storage = getPaymentAttemptStorage()");
    expect(documentWorkspace).not.toContain("window.sessionStorage");
    expect(documentWorkspace).toContain("savePartnerPaymentAttempt(storage, attempt)");
    expect(documentWorkspace).toMatch(/await api\("\/api\/partner-ledger"[\s\S]*discardPayment\(\);[\s\S]*await load\(\)/);
    expect(documentWorkspace).toContain("이 등록을 취소하고 새로 시작");
    expect(documentWorkspace).toMatch(/pendingAttempt[\s\S]*미완료/);
    expect(documentWorkspace).not.toMatch(/idempotencyKey:\s*crypto\.randomUUID\(\)/);
  });
});
