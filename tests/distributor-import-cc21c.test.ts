import { NextRequest } from "next/server";
import { afterEach, describe, expect, it, vi } from "vitest";
import { mapHeaders, headerLabels, parseImportRows } from "../domains/lead/distributor-import";

// 합성 시트(실데이터 아님): 표준 칸 + 표준에 안 맞는 칸(리드소스·미팅수·매칭상태·등록일·그룹별 메모 ×2) + 비어 있는 칸.
const group = ["", "", "", "", "", "", "", "", "", "", "", "① 주문톡", "② 매칭"];
const header = ["유통사명", "구분", "리드소스", "최근접촉일", "다음액션내용", "다음액션일", "미팅수", "매칭상태", "등록일", "빈칸", "영업상태", "메모", "메모"];
const table: string[][] = [
  ["합성 제목"], [], group, header,
  ["가나유통", "공산품", "지인소개", "2026-11-01", "견적 보내기", "2026-11-20", "3", "매칭중", "2026-10-05", "", "제안중", "첫 메모", "둘째 메모"],
  ["다라유통", "농산", "", "", "", "", "", "", "2026/10/6", "", "", "", ""],
];

describe("CC-21 import: custom columns (no column is dropped)", () => {
  it("maps the new aliases", () => {
    expect(mapHeaders(["구분", "최근접촉일", "다음액션내용", "ICP", "주문톡상태", "유통사명"])).toEqual(["items", "lastContact", "nextAction", "grade", "status", "name"]);
  });
  it("saves standard columns and turns every other filled column into a custom column with its type", () => {
    const { rows, columns, errors } = parseImportRows(table, 3);
    expect(errors).toEqual([]);
    expect(rows[0]).toMatchObject({ name: "가나유통", items: "공산품", lastContact: "2026-11-01", nextAction: "견적 보내기", nextContact: "2026-11-20", status: "견적 발송" });
    expect(columns).toEqual([
      { label: "리드소스", type: "text" }, { label: "미팅수", type: "text" }, { label: "매칭상태", type: "text" }, { label: "등록일", type: "date" },
      { label: "① 주문톡 메모", type: "text" }, { label: "② 매칭 메모", type: "text" },
    ]);
    expect(rows[0].extras).toEqual({ 리드소스: "지인소개", 미팅수: "3", 매칭상태: "매칭중", 등록일: "2026-10-05", "① 주문톡 메모": "첫 메모", "② 매칭 메모": "둘째 메모" });
    expect(rows[1].extras).toEqual({ 등록일: "2026-10-06" }); // 날짜 칸은 한 가지 모양으로, 빈 값은 넣지 않음
  });
  it("keeps a second column that maps to an already-used standard field instead of dropping it", () => {
    const sheet = [["상호", "상태", "영업상태"], ["가나", "계약완료", "검토중"]];
    const { rows, columns } = parseImportRows(sheet, 0);
    expect(rows[0].status).toBe("전환 진행");
    expect(columns).toEqual([{ label: "영업상태", type: "text" }]);
    expect(rows[0].extras).toEqual({ 영업상태: "검토중" });
  });
  it("uses the same labels the preview shows (group prefix for repeated names)", () => {
    expect(headerLabels(table, 3).slice(11)).toEqual(["① 주문톡 메모", "② 매칭 메모"]);
  });
});

// ---- API: 칸 만들기·저장·이력 ----
const calls: Array<{ path: string; method: string; body: any }> = [];
const existingFields = [{ key: "f_items", label: "취급 품목" }, { key: "f_erp", label: "사용 ERP" }, { key: "f_next", label: "다음 연락일" }];
vi.mock("@/lib/distributor-gate", () => ({ distributorGate: async () => ({ scope: { customerSession: { userId: "u1", name: "합성" } }, companyId: "c1" }) }));
vi.mock("@/lib/run-limited", () => ({ runLimited: async <T, R>(items: T[], _n: number, task: (item: T) => Promise<R>) => Promise.all(items.map(task)) }));
vi.mock("@/domains/lead/distributor-import", async () => await import("../domains/lead/distributor-import"));
vi.mock("@/lib/kakao-address-geocode", () => ({ geocodeAddress: async () => null }));
vi.mock("@/lib/store", () => ({
  supabaseRequest: async (path: string, init?: { method?: string; body?: string }) => {
    const method = init?.method || "GET", body = init?.body ? JSON.parse(init.body) : undefined;
    calls.push({ path, method, body });
    if (path === "lead_import_batches?select=id") return [{ id: "00000000-0000-4000-8000-0000000000b1" }];
    if (path.startsWith("lead_import_batches?select=id,file_name")) return [{ id: "b1", file_name: "합성.csv", sheet_name: "시트1", row_count: 2, created_at: "2026-11-12T01:00:00Z" }];
    if (path.startsWith("lead_import_batch_items?select=lead_id")) return [{ lead_id: "l1" }, { lead_id: "l2" }];
    if (path.startsWith("company_lead_fields?select=key,label")) return existingFields;
    if (path.startsWith("business_permit_leads?select=phone")) return [];
    if (path.startsWith("business_permit_leads?select=id")) return body.map((_: unknown, i: number) => ({ id: `lead-${i}` }));
    return [];
  },
}));

const row = (extra: Record<string, unknown> = {}) => ({ name: "가나유통", region: "", address: "", grade: "A", items: "공산품", erp: "", phone: "01011112222", extraPhones: [], fax: null, email: null, status: "신규 수집", nextContact: null, owner: "", lastContact: "2026-11-01", nextAction: "견적 보내기", extras: { 리드소스: "지인소개", 등록일: "2026-10-05", 모르는칸: "무시" }, ...extra });

describe("CC-21 import API: custom columns and history", () => {
  afterEach(() => { calls.length = 0; });
  it("creates missing custom fields (hidden in the list), reuses existing ones, and stores values + last contact + next action", async () => {
    const { POST } = await import("../app/api/leads/import-distributors/route");
    const columns = [{ label: "리드소스", type: "text" }, { label: "등록일", type: "date" }, { label: "취급 품목", type: "text" }];
    const response = await POST(new NextRequest("http://localhost/api/leads/import-distributors", { method: "POST", body: JSON.stringify({ fileName: "합성.csv", sheetName: "시트1", total: 1, columns, rows: [row()] }) }));
    const result = await response.json();
    expect(result).toMatchObject({ created: 1, fieldsCreated: 2 });
    const createdFields = calls.filter((c) => c.path === "company_lead_fields" && c.method === "POST").map((c) => c.body);
    expect(createdFields.map((f) => [f.label, f.field_type, f.show_in_list, f.filterable])).toEqual([["리드소스", "text", false, false], ["등록일", "date", false, false]]);
    const insert = calls.find((c) => c.path.startsWith("business_permit_leads?select=id") && c.method === "POST")!.body[0];
    const keyOf = (label: string) => createdFields.find((f) => f.label === label).key;
    expect(insert.custom_values[keyOf("리드소스")]).toBe("지인소개");
    expect(insert.custom_values[keyOf("등록일")]).toBe("2026-10-05");
    expect(Object.values(insert.custom_values)).not.toContain("무시"); // 선언하지 않은 칸 이름은 저장하지 않음
    expect(insert).toMatchObject({ next_action: "견적 보내기", last_contact_at: "2026-11-01T00:00:00+09:00", target_type: "distributor", grade: "A" });
  });
  it("drops a malformed date for a date column and a malformed last-contact value", async () => {
    const { POST } = await import("../app/api/leads/import-distributors/route");
    await POST(new NextRequest("http://localhost/api/leads/import-distributors", { method: "POST", body: JSON.stringify({ fileName: "합성.csv", total: 1, columns: [{ label: "등록일", type: "date" }], rows: [row({ lastContact: "내일", extras: { 등록일: "곧" } })] }) }));
    const insert = calls.find((c) => c.path.startsWith("business_permit_leads?select=id") && c.method === "POST")!.body[0];
    expect(insert.last_contact_at).toBeNull();
    expect(Object.values(insert.custom_values)).not.toContain("곧");
  });
  it("lists the batches that can still be undone with their saved counts", async () => {
    const { GET } = await import("../app/api/leads/import-distributors/route");
    const body = await (await GET(new NextRequest("http://localhost/api/leads/import-distributors?list=1"))).json();
    expect(body.batches).toEqual([{ id: "b1", fileName: "합성.csv", sheetName: "시트1", createdAt: "2026-11-12T01:00:00Z", saved: 2 }]);
    expect(calls[0].path).toContain("undone_at=is.null");
    expect(calls[0].path).toContain("company_id=eq.c1");
  });
});
