import { describe, expect, it } from "vitest";
import { chunk, cleanPhones, groupDuplicates, mapImportStatus, parseImportRows } from "../domains/lead/distributor-import";

describe("distributor import", () => {
  it("maps sheet statuses to lead stages", () => {
    expect(["계약완료", "데모완료", "제안중", "검토중", "이탈", "미진행", "", "기타"].map(mapImportStatus)).toEqual(["전환 진행", "재연락 예정", "견적 발송", "재연락 예정", "제외", "신규 수집", "신규 수집", "신규 수집"]);
  });
  it("restores a lost leading zero and splits several numbers", () => {
    expect(cleanPhones("10-1234-5678")).toEqual({ phone: "01012345678", extra: [] });
    expect(cleanPhones("02-123-4567 / 010-9999-8888")).toEqual({ phone: "021234567", extra: ["01099998888"] });
    expect(cleanPhones("없음")).toEqual({ phone: null, extra: [] });
  });
  it("parses rows below the header and reports a missing name", () => {
    const table = [["메모"], ["상호", "지역", "상태", "휴대폰", "이메일", "다음 연락일"], ["가나유통", "서울", "계약완료", "010-1111-2222", "A@B.com", "2026.12.5"], ["", "부산", "", "", "", ""], ["", "", "", "", "", ""]];
    const { rows, errors } = parseImportRows(table, 1);
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({ name: "가나유통", status: "전환 진행", phone: "01011112222", email: "a@b.com", nextContact: "2026-12-05", address: "서울" });
    expect(errors).toEqual([{ line: 4, message: "상호가 비어 있습니다." }]);
  });
  it("groups same name or same phone as suspected duplicates", () => {
    const base = { region: "", address: "", grade: "", items: "", erp: "", extraPhones: [], fax: null, email: null, status: "신규 수집", nextContact: null, owner: "" };
    const rows = [{ ...base, name: "가나 유통", phone: "01011112222" }, { ...base, name: "다라", phone: "01011112222" }, { ...base, name: "가나유통", phone: null }, { ...base, name: "마바", phone: null }];
    expect(groupDuplicates(rows)).toEqual([[0, 1, 2]]);
  });
  it("splits into 500-row chunks", () => { expect(chunk(Array.from({ length: 1001 }, (_, i) => i)).map((c) => c.length)).toEqual([500, 500, 1]); });
});
