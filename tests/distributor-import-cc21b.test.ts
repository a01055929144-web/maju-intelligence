import iconv from "iconv-lite";
import * as XLSX from "xlsx";
import { describe, expect, it } from "vitest";
import { detectHeaderRow, headerLabels, mapHeaders, parseImportRows } from "../domains/lead/distributor-import";
import { decodeCsvText } from "../lib/csv-text";

// 합성 시트(실데이터 아님): 제목 4줄 + 그룹 헤더 줄 + 칸 이름 줄(같은 이름 ×3) + 데이터.
const group = ["", "", "", "", "", "", "① 주문톡 SaaS", "", "② 매칭서비스", "", "③ B2B 중개", ""];
const header = ["유통사명", "상호명", "대표자명", "주문톡상태", "ICP등급", "다음액션일", "최근진행일", "메모", "최근진행일", "메모", "최근진행일", "메모"];
const table: string[][] = [
  ["합성 유통사 영업 현황"], ["작성일", "2026-11-12"], ["담당", "합성 담당"], [],
  group, header,
  ["가나유통", "중개상대 상호A", "홍길동", "계약완료", "A", "2026-11-20", "11/1", "메모1", "11/2", "메모2", "11/3", "메모3"],
  ["다라유통", "중개상대 상호B", "김철수", "제안중", "B", "", "", "", "", "", "", ""],
  ["", "중개상대 상호C", "", "", "", "", "", "", "", "", "", ""],
];

describe("CC-21 import: header detection and labels", () => {
  it("finds the header row below the title lines and the group row", () => {
    expect(detectHeaderRow(table)).toBe(5);
  });
  it("still finds it when a data row has more filled cells than the header (blank header cell)", () => {
    const withBlank = [...table.slice(0, 5), [...header.slice(0, 11), ""], ["가나유통", "x", "y", "계약완료", "A", "2026-11-20", "1", "2", "3", "4", "5", "6"]];
    expect(detectHeaderRow(withBlank)).toBe(5);
  });
  it("prefixes repeated names with the group name above (merged group cells carry to the right)", () => {
    const labels = headerLabels(table, 5);
    expect(labels.slice(0, 6)).toEqual(["유통사명", "상호명", "대표자명", "주문톡상태", "ICP등급", "다음액션일"]);
    expect(labels.slice(6)).toEqual([
      "① 주문톡 SaaS 최근진행일", "① 주문톡 SaaS 메모", "② 매칭서비스 최근진행일", "② 매칭서비스 메모", "③ B2B 중개 최근진행일", "③ B2B 중개 메모",
    ]);
    expect(new Set(labels).size).toBe(labels.length);
  });
  it("numbers repeated names when there is no group row", () => {
    expect(headerLabels([["메모", "메모", "상호", "메모"]], 0)).toEqual(["메모", "메모 (2)", "상호", "메모 (3)"]);
  });
});

describe("CC-21 import: aliases and rows", () => {
  it("maps the alias names and keeps 상호명 and 대표자명 unmapped", () => {
    expect(mapHeaders(headerLabels(table, 5)).slice(0, 6)).toEqual(["name", null, null, "status", "grade", "nextContact"]);
    expect(mapHeaders(["ICP", " icp 등급 ", "유통사 명"])).toEqual(["grade", "grade", "name"]);
    expect(mapHeaders(["constructor", "toString"])).toEqual([null, null]);
  });
  it("saves rows named by 유통사명 (not 상호명) and reports the empty-name line", () => {
    const { rows, errors } = parseImportRows(table, 5);
    expect(rows.map((row) => row.name)).toEqual(["가나유통", "다라유통"]);
    expect(rows[0]).toMatchObject({ status: "전환 진행", grade: "A", nextContact: "2026-11-20", owner: "" });
    expect(rows[1]).toMatchObject({ status: "견적 발송", grade: "B", nextContact: null });
    expect(errors).toEqual([{ line: 9, message: "상호가 비어 있습니다." }]);
  });
  it("a wrongly detected header row saves nothing, a picked row works (the 3,714-line symptom)", () => {
    expect(parseImportRows(table, 4).rows).toHaveLength(0);
    expect(parseImportRows(table, 5).rows).toHaveLength(2);
  });
});

describe("CC-21 import: CSV text encoding", () => {
  const csv = table.map((row) => row.join(",")).join("\r\n");
  const utf8 = new TextEncoder().encode(csv);
  const asBuffer = (bytes: Uint8Array) => bytes.buffer.slice(bytes.byteOffset, bytes.byteOffset + bytes.byteLength) as ArrayBuffer;
  const rowsOf = (text: string) => { const wb = XLSX.read(text, { type: "string" }); return XLSX.utils.sheet_to_json(wb.Sheets[wb.SheetNames[0]], { header: 1, defval: "" }) as unknown[][]; };

  it("reads UTF-8 without BOM (Google Sheets CSV) as Korean", () => {
    expect(decodeCsvText(asBuffer(utf8))).toBe(csv);
    const rows = rowsOf(decodeCsvText(asBuffer(utf8)));
    expect(detectHeaderRow(rows)).toBe(5);
    expect(parseImportRows(rows, 5).rows.map((row) => row.name)).toEqual(["가나유통", "다라유통"]);
  });
  it("reads UTF-8 with BOM", () => {
    expect(decodeCsvText(asBuffer(new Uint8Array([0xef, 0xbb, 0xbf, ...utf8])))).toBe(csv);
  });
  it("falls back to cp949 when the bytes are not valid UTF-8 (Excel Korean CSV)", () => {
    const cp949 = iconv.encode(csv, "cp949");
    expect(decodeCsvText(asBuffer(new Uint8Array(cp949)))).toBe(csv);
  });
});
