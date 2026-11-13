/**
 * 매입가 엑셀 읽기 규칙 (11/4 대표 요청).
 * - 제목 줄이 위에 있어도 실제 머리글 줄을 찾아 씁니다(빈 머리글은 'A열'처럼 표시).
 * - 필수는 품목·단가. 수량·공급가액·부가세·합계도 받아 두면 매입 기록으로 남길 수 있습니다.
 * - 단가가 부가세 포함인지 별도인지 행마다 정할 수 있고, 저장되는 매입가는 항상 '부가세 별도' 기준입니다.
 * - 같은 품목이 매일 새로 만들어지지 않도록 비교 키(이름+규격, 괄호·띄어쓰기 무시)를 씁니다.
 */
export const PURCHASE_IMPORT_FIELDS = [
  { key: "name", label: "품목", required: true, aliases: ["품목", "품목명", "상품명", "품명", "제품명", "품목명(규격)", "상품명(규격)"] },
  { key: "cost", label: "단가", required: true, aliases: ["단가", "매입가", "매입단가", "원가", "원가(원)"] },
  { key: "spec", label: "규격", aliases: ["규격", "상품규격"] },
  { key: "unit", label: "단위", aliases: ["단위", "원가단위"] },
  { key: "quantity", label: "수량", aliases: ["수량", "입고수량", "매입수량"] },
  { key: "supplyAmount", label: "공급가액", aliases: ["공급가액", "공급가", "공급액"] },
  { key: "vatAmount", label: "부가세", aliases: ["부가세", "세액", "vat"] },
  { key: "totalAmount", label: "합계", aliases: ["합계", "합계금액", "총액", "금액"] },
  { key: "code", label: "ERP 코드", aliases: ["erp코드", "기본코드", "상품코드", "품목코드", "코드"] },
  { key: "supplier", label: "매입처", aliases: ["매입처", "유통사", "공급처", "거래처"] },
  { key: "purchaseDate", label: "구매일", aliases: ["구매일", "매입일", "입고일", "거래일", "일자", "날짜"] }
] as const;
export type PurchaseImportFieldKey = (typeof PURCHASE_IMPORT_FIELDS)[number]["key"];
export type PurchaseImportMapping = Partial<Record<PurchaseImportFieldKey, number>>;
export type VatMode = "auto" | "included" | "excluded";

const norm = (value: unknown) => String(value ?? "").normalize("NFKC").toLowerCase().replace(/[\s_\-./()[\]]/g, "");

const CAPACITY_TOKEN = /\d+(?:[.,]\d+)?\s*(?:ml|kg|l|g)\b/gi;
const GRADE_TOKEN = /b\s*급|정상|정품|특급|상급/gi;

/** 상품명·규격에 섞인 용량과 등급을 같은 비교 형식으로 만듭니다. */
export function purchaseSpecification(name: string, spec = "", unit = "") {
  const source = `${name} ${spec} ${unit}`.normalize("NFKC");
  const tokens = (source.match(CAPACITY_TOKEN) || []).map((raw) => {
    const match = raw.replace(",", ".").match(/([\d.]+)\s*(ml|kg|l|g)/i)!;
    const amount = Number(match[1]);
    const measure = match[2].toLowerCase();
    return measure === "l" ? `${amount * 1000}ml` : measure === "kg" ? `${amount * 1000}g` : `${amount}${measure}`;
  });
  for (const raw of source.match(GRADE_TOKEN) || []) tokens.push(raw.replace(/\s/g, "").toLowerCase());
  const withoutKnown = name.normalize("NFKC").replace(CAPACITY_TOKEN, " ").replace(GRADE_TOKEN, " ");
  const singleGrade = withoutKnown.match(/(?:^|[\s()[\]{}_/.-])([특상])(?:$|[\s()[\]{}_/.-])|([특상])$/);
  if (singleGrade) tokens.push(singleGrade[1] || singleGrade[2]);
  return {
    baseName: norm(singleGrade ? withoutKnown.replace(singleGrade[0], " ") : withoutKnown),
    key: Array.from(new Set(tokens)).sort().join("|")
  };
}

export function columnLetter(index: number) {
  let n = index + 1;
  let out = "";
  while (n > 0) {
    const r = (n - 1) % 26;
    out = String.fromCharCode(65 + r) + out;
    n = Math.floor((n - 1) / 26);
  }
  return out;
}

function fieldForHeader(header: unknown): PurchaseImportFieldKey | null {
  const value = norm(header);
  if (!value) return null;
  for (const field of PURCHASE_IMPORT_FIELDS) if (field.aliases.some((alias) => norm(alias) === value)) return field.key;
  return null;
}

/** 위 10줄 안에서 알려진 머리글이 2개 이상인 첫 줄을 머리글로 봅니다. 없으면 -1(머리글 없음). */
export function detectHeaderRow(matrix: readonly unknown[][]) {
  for (let index = 0; index < Math.min(matrix.length, 10); index++) {
    const hits = (matrix[index] || []).filter((cell) => fieldForHeader(cell)).length;
    if (hits >= 2) return index;
  }
  return -1;
}

export type PurchaseSheet = { columns: Array<{ index: number; letter: string; header: string }>; headerRowNumber: number; rows: Array<{ rowNumber: number; cells: string[] }> };

export function buildPurchaseSheet(matrix: readonly unknown[][]): PurchaseSheet {
  const headerIndex = detectHeaderRow(matrix);
  const width = Math.max(0, ...matrix.slice(0, 200).map((row) => row.length));
  const header = headerIndex >= 0 ? matrix[headerIndex] : [];
  const columns = Array.from({ length: width }, (_, index) => ({ header: String(header[index] ?? "").trim(), index, letter: columnLetter(index) }));
  const rows = matrix
    .map((row, index) => ({ cells: Array.from({ length: width }, (_, column) => String(row[column] ?? "").trim()), rowNumber: index + 1 }))
    .slice(headerIndex + 1)
    .filter((row) => row.cells.some(Boolean));
  return { columns, headerRowNumber: headerIndex + 1, rows };
}

export function suggestPurchaseMapping(sheet: PurchaseSheet): PurchaseImportMapping {
  const mapping: PurchaseImportMapping = {};
  for (const column of sheet.columns) {
    const key = fieldForHeader(column.header);
    if (key && mapping[key] === undefined) mapping[key] = column.index;
  }
  return mapping;
}

const toNumber = (value: string | undefined) => {
  if (value === undefined) return undefined;
  const raw = value.trim();
  if (!raw) return undefined;
  const n = Number(raw.replace(/[,원\s]/g, ""));
  return Number.isFinite(n) ? n : undefined;
};

const toPurchaseDate = (value: string | undefined) => {
  const raw = value?.trim();
  if (!raw) return undefined;
  if (/^\d{5}(?:\.\d+)?$/.test(raw)) return new Date((Number(raw) - 25569) * 86400000).toISOString().slice(0, 10);
  const monthFirst = raw.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  const normalized = monthFirst
    ? `${monthFirst[3]}-${monthFirst[1]}-${monthFirst[2]}`
    : raw.replace(/\s/g, "").replace(/[.일]$/, "").replace(/[년월./]/g, "-");
  const match = normalized.match(/^(\d{4})-(\d{1,2})-(\d{1,2})$/);
  if (!match) return undefined;
  const date = `${match[1]}-${match[2].padStart(2, "0")}-${match[3].padStart(2, "0")}`;
  const parsed = new Date(Date.UTC(Number(match[1]), Number(match[2]) - 1, Number(match[3])));
  return parsed.toISOString().slice(0, 10) === date ? date : undefined;
};

/** 11/4: 자주 쓰는 단위. 고객사마다 다른 말은 직접 입력하면 됩니다. */
export const COMMON_UNITS = ["EA", "개", "BOX", "박스", "PACK", "팩", "KG", "G", "L", "ML", "통", "봉", "병", "캔", "판", "단", "망", "포", "미", "마리", "SET", "롤", "장"];
const UNIT_WORDS = new Set(COMMON_UNITS.map((unit) => unit.toLowerCase()).concat(["ea", "box", "pack", "pk", "kg", "g", "l", "ml", "pcs", "set", "bag", "can", "btl"]));

export function isUnitWord(value: string) {
  return UNIT_WORDS.has(value.trim().toLowerCase());
}

/**
 * "냉동오징어 [EA]" → 이름 냉동오징어 · 단위 EA
 * "껍질가리비 [180G*10EA]" → 이름 껍질가리비 · 규격 180G*10EA (단위는 확인 필요)
 * 대괄호 안이 단위 낱말이면 단위, 숫자가 섞여 있으면 규격으로 봅니다.
 */
export function splitNameSpec(name: string, spec: string, unit = "") {
  const trimmed = name.trim();
  const match = trimmed.match(/^(.*?)\s*\[([^\]]+)\]\s*$/);
  if (!match) return { name: trimmed, spec: spec.trim(), unit: unit.trim() };
  const inner = match[2].trim();
  if (isUnitWord(inner)) return { name: match[1].trim(), spec: spec.trim(), unit: unit.trim() || inner };
  return { name: match[1].trim(), spec: spec.trim() || inner, unit: unit.trim() };
}

/** 품목 비교 키: 이름+규격, 대소문자·띄어쓰기·괄호 무시. 같은 키는 같은 품목으로 봅니다. */
export function purchaseLineKey(name: string, spec: string) {
  return norm(`${name}${spec}`);
}

/** 단가가 부가세 포함인지 추정. 수량·합계·공급가액이 있을 때만 판단하고, 모르면 별도로 봅니다. */
export function inferVatIncluded(input: { cost: number; quantity?: number; supplyAmount?: number; vatAmount?: number; totalAmount?: number }) {
  if (input.vatAmount === 0) return false;
  const qty = input.quantity && input.quantity > 0 ? input.quantity : undefined;
  if (!qty) return false;
  const amount = input.cost * qty;
  const near = (a: number, b?: number) => b !== undefined && b > 0 && Math.abs(a - b) / b <= 0.01;
  if (near(amount, input.supplyAmount)) return false;
  if (near(amount, input.totalAmount) && input.supplyAmount !== undefined && input.totalAmount !== undefined && input.totalAmount > input.supplyAmount) return true;
  return false;
}

export function costExcludingVat(cost: number, included: boolean) {
  return included ? Math.round((cost / 1.1) * 100) / 100 : cost;
}

export type PurchaseImportLine = {
  rowNumber: number;
  code: string;
  name: string;
  spec: string;
  unit: string;
  supplier: string;
  rawCost: number;
  quantity?: number;
  supplyAmount?: number;
  vatAmount?: number;
  totalAmount?: number;
  vatIncluded: boolean;
  /** 부가세 열을 골랐을 때만: 금액 있음=과세, 0·빈칸=면세. 부가세가 따로 적힌 파일은 단가가 '별도' 금액입니다. */
  taxType?: "taxable" | "exempt";
  cost: number;
  lineKey: string;
  raw: string[];
  /** 엑셀 원문 상품명(대괄호 포함 그대로). 원문 연결(별칭)에 씁니다. */
  rawName: string;
  /** 파일에 구매일 열이 있을 때만 설정됩니다. 없으면 업로드 화면의 날짜를 사용합니다. */
  purchaseDate?: string;
};

export function parsePurchaseLines(sheet: PurchaseSheet, mapping: PurchaseImportMapping, vatMode: VatMode): { lines: PurchaseImportLine[]; skipped: number[]; dateIssues: number[] } {
  if (mapping.name === undefined || mapping.cost === undefined) throw new Error("필수 열(품목·단가)을 골라 주세요.");
  const lines: PurchaseImportLine[] = [];
  const skipped: number[] = [];
  const dateIssues: number[] = [];
  const read = (cells: string[], key: PurchaseImportFieldKey) => (mapping[key] === undefined ? "" : cells[mapping[key]!] || "");
  for (const row of sheet.rows) {
    const rawName = read(row.cells, "name");
    const rawCost = toNumber(read(row.cells, "cost"));
    if (!rawName || rawCost === undefined || rawCost < 0 || rawCost > 1_000_000_000) {
      skipped.push(row.rowNumber);
      continue;
    }
    const { name, spec, unit } = splitNameSpec(rawName, read(row.cells, "spec"), read(row.cells, "unit"));
    const purchaseDate = toPurchaseDate(read(row.cells, "purchaseDate"));
    if (mapping.purchaseDate !== undefined && !purchaseDate) {
      dateIssues.push(row.rowNumber);
      continue;
    }
    const quantity = toNumber(read(row.cells, "quantity"));
    const supplyAmount = toNumber(read(row.cells, "supplyAmount"));
    const vatAmount = toNumber(read(row.cells, "vatAmount"));
    const totalAmount = toNumber(read(row.cells, "totalAmount"));
    const vatIncluded = vatMode === "auto" ? inferVatIncluded({ cost: rawCost, quantity, supplyAmount, totalAmount, vatAmount }) : vatMode === "included";
    const taxType = mapping.vatAmount === undefined ? undefined : vatAmount && vatAmount > 0 ? "taxable" as const : "exempt" as const;
    lines.push({
      code: read(row.cells, "code"),
      cost: costExcludingVat(rawCost, vatIncluded),
      lineKey: purchaseLineKey(name, `${spec}${unit}`),
      name,
      purchaseDate,
      quantity,
      raw: row.cells,
      rawName,
      rawCost,
      rowNumber: row.rowNumber,
      spec,
      supplier: read(row.cells, "supplier"),
      supplyAmount,
      taxType,
      totalAmount,
      unit,
      vatAmount,
      vatIncluded
    });
  }
  return { lines, skipped, dateIssues };
}

export type PurchasePriceConflict = {
  key: string;
  purchaseDate?: string;
  name: string;
  spec: string;
  unit: string;
  supplier: string;
  candidates: PurchaseImportLine[];
};

export type PurchaseImportMergeResult = PurchaseImportLine[] & { conflicts: PurchasePriceConflict[] };

/** 같은 품목·구매일·단가만 합치고, 가격이 다르면 자동 선택하지 않고 후보를 반환합니다. */
export function mergeDuplicateLines(lines: readonly PurchaseImportLine[]): PurchaseImportMergeResult {
  const groups = new Map<string, PurchaseImportLine[]>();
  for (const line of lines) {
    const key = `${line.code ? `code:${norm(line.code)}` : line.lineKey}|${norm(line.supplier)}|${line.purchaseDate || "undated"}`;
    groups.set(key, [...(groups.get(key) || []), line]);
  }
  const merged: PurchaseImportLine[] = [];
  const conflicts: PurchasePriceConflict[] = [];
  for (const [key, candidates] of Array.from(groups.entries())) {
    if (new Set(candidates.map((line) => line.cost)).size > 1) {
      const first = candidates[0];
      conflicts.push({ key, purchaseDate: first.purchaseDate, name: first.name, spec: first.spec, unit: first.unit, supplier: first.supplier, candidates: [...candidates] });
      continue;
    }
    merged.push(candidates.slice(1).reduce((line, next) => ({
      ...next,
      quantity: (line.quantity || 0) + (next.quantity || 0) || undefined
    }), candidates[0]));
  }
  return Object.assign(merged, { conflicts });
}
