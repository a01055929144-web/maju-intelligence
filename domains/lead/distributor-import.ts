// CC-21: 유통사 리드 엑셀 가져오기 규칙(순수 함수). 개인정보 파일은 저장소에 두지 않고, 화면에서 올린 행만 처리한다.
export const IMPORT_CHUNK = 500;

/** 대표 시트의 영업 상태 → 공통 영업 단계 저장값(domains/lead/lead-status.ts). 모르는 값은 신규. */
const STATUS_MAP: Record<string, string> = {
  계약완료: "전환 진행", 데모완료: "재연락 예정", 제안중: "견적 발송", 검토중: "재연락 예정", 이탈: "제외", 미진행: "신규 수집",
};
export const mapImportStatus = (raw: unknown) => STATUS_MAP[String(raw ?? "").replace(/\s/g, "")] ?? "신규 수집";

/** 번호 한 칸에 여러 개가 들어 있거나 앞 0이 빠진 경우를 정리. 번호가 아니면 null. 첫 번호는 phone, 나머지는 extra. */
export function cleanPhones(raw: unknown): { phone: string | null; extra: string[] } {
  const parts = String(raw ?? "").split(/[,/;\n]| 및 /).map((part) => part.replace(/[^\d]/g, "")).filter(Boolean);
  const fixed = parts.map((digits) => (/^(10|1[16-9])\d{7,8}$/.test(digits) || /^(2|[3-6]\d)\d{7,8}$/.test(digits) ? `0${digits}` : digits)).filter((digits) => /^0\d{8,10}$/.test(digits));
  return { phone: fixed[0] ?? null, extra: fixed.slice(1) };
}

const HEADERS: Record<string, "name" | "region" | "address" | "grade" | "items" | "erp" | "phone" | "tel" | "fax" | "email" | "status" | "nextContact" | "owner"> = {
  상호: "name", 업체명: "name", 유통사: "name", 회사명: "name", 지역: "region", 주소: "address", 등급: "grade", 취급품목: "items", 사용erp: "erp", erp: "erp",
  휴대폰: "phone", 연락처: "phone", 전화: "tel", 전화번호: "tel", 팩스: "fax", 이메일: "email", 상태: "status", 영업상태: "status", 다음연락일: "nextContact", 담당: "owner", 담당자: "owner",
};
export type ImportField = (typeof HEADERS)[string];
export const mapHeaders = (headers: readonly string[]) => headers.map((header) => HEADERS[header.replace(/\s/g, "").toLowerCase()] ?? null);

export type ImportRow = { name: string; region: string; address: string; grade: string; items: string; erp: string; phone: string | null; extraPhones: string[]; fax: string | null; email: string | null; status: string; nextContact: string | null; owner: string };
export type ParsedImport = { rows: ImportRow[]; errors: Array<{ line: number; message: string }> };

const text = (value: unknown) => String(value ?? "").trim().slice(0, 300);
const day = (value: unknown) => { const m = String(value ?? "").match(/(\d{4})[-./](\d{1,2})[-./](\d{1,2})/); return m ? `${m[1]}-${m[2].padStart(2, "0")}-${m[3].padStart(2, "0")}` : null; };

/** headerRow 아래 행들을 읽어 표준 행으로. 상호가 없으면 오류 줄. line은 엑셀 줄 번호(1부터). */
export function parseImportRows(table: readonly (readonly unknown[])[], headerRow: number): ParsedImport {
  const fields = mapHeaders((table[headerRow] ?? []).map(String));
  const rows: ImportRow[] = [], errors: ParsedImport["errors"] = [];
  table.slice(headerRow + 1).forEach((cells, offset) => {
    if (!cells.some((cell) => String(cell ?? "").trim())) return;
    const pick = (field: ImportField) => cells[fields.indexOf(field)];
    const line = headerRow + offset + 2, name = text(pick("name"));
    if (!name) { errors.push({ line, message: "상호가 비어 있습니다." }); return; }
    const mobile = cleanPhones(pick("phone")), tel = cleanPhones(pick("tel"));
    const all = [mobile.phone, ...mobile.extra, tel.phone, ...tel.extra].filter((value): value is string => Boolean(value));
    rows.push({
      name, region: text(pick("region")), address: text(pick("address")) || text(pick("region")), grade: text(pick("grade")), items: text(pick("items")), erp: text(pick("erp")),
      phone: all[0] ?? null, extraPhones: all.slice(1), fax: cleanPhones(pick("fax")).phone, email: /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(text(pick("email"))) ? text(pick("email")).toLowerCase() : null,
      status: mapImportStatus(pick("status")), nextContact: day(pick("nextContact")), owner: text(pick("owner")),
    });
  });
  return { rows, errors };
}

/** 같은 상호(공백·대소문자 무시)이거나 같은 번호면 한 묶음 — 대표가 고르도록 "중복 의심"으로 보여 준다. 묶음마다 줄 번호 순서 index 목록. */
export function groupDuplicates(rows: readonly ImportRow[]): number[][] {
  const parent = rows.map((_, index) => index);
  const find = (i: number): number => (parent[i] === i ? i : (parent[i] = find(parent[i])));
  const seen = new Map<string, number>();
  rows.forEach((row, index) => {
    for (const key of [`n:${row.name.replace(/\s/g, "").toLowerCase()}`, ...[row.phone, ...row.extraPhones].filter(Boolean).map((phone) => `p:${phone}`)]) {
      const first = seen.get(key);
      if (first === undefined) seen.set(key, index); else parent[find(index)] = find(first);
    }
  });
  const groups = new Map<number, number[]>();
  rows.forEach((_, index) => groups.set(find(index), [...(groups.get(find(index)) ?? []), index]));
  return Array.from(groups.values()).filter((group) => group.length > 1);
}

export const chunk = <T,>(list: readonly T[], size = IMPORT_CHUNK) => Array.from({ length: Math.ceil(list.length / size) }, (_, i) => list.slice(i * size, (i + 1) * size));
