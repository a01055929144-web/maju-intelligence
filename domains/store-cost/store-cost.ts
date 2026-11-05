export const STORE_COST_IMPORT_FIELDS = [
  { key: "effectiveOn", label: "적용일", required: true, aliases: ["적용일", "원가일", "기준일", "날짜"] },
  { key: "productName", label: "품목", required: true, aliases: ["품목", "품목명", "상품명", "제품명"] },
  { key: "specification", label: "규격", required: false, aliases: ["규격", "상품규격"] },
  { key: "unit", label: "단위", required: true, aliases: ["단위", "원가단위"] },
  { key: "costKrw", label: "원가(원)", required: true, aliases: ["원가", "원가(원)", "단가", "금액"] },
] as const;

export type StoreCostField = (typeof STORE_COST_IMPORT_FIELDS)[number]["key"];
export type StoreCostColumnMapping = Partial<Record<StoreCostField, number>>;

export type StoreCostInput = {
  effectiveOn: string;
  productName: string;
  specification?: string;
  unit: string;
  costKrw: number;
};

const normalized = (value: unknown) => String(value ?? "").normalize("NFKC").trim();
const keyPart = (value: unknown) => normalized(value).toLocaleLowerCase("ko").replace(/[\s_\-./()[\]]/g, "");

export function storeCostProductKey(input: Pick<StoreCostInput, "productName" | "specification" | "unit">) {
  return [input.productName, input.specification, input.unit].map(keyPart).join("|");
}

export function suggestStoreCostMapping(headers: readonly unknown[]): StoreCostColumnMapping {
  const mapping: StoreCostColumnMapping = {};
  headers.forEach((header, index) => {
    const value = keyPart(header);
    const field = STORE_COST_IMPORT_FIELDS.find(candidate => candidate.aliases.some(alias => keyPart(alias) === value));
    if (field && mapping[field.key] === undefined) mapping[field.key] = index;
  });
  return mapping;
}

export function validateStoreCostInput(input: StoreCostInput, rowNumber?: number): StoreCostInput {
  const prefix = rowNumber ? `${rowNumber}행의 ` : "";
  const date = /^\d{4}-\d{2}-\d{2}$/.test(input.effectiveOn) ? new Date(`${input.effectiveOn}T00:00:00Z`) : null;
  if (!date || date.toISOString().slice(0, 10) !== input.effectiveOn) {
    throw new Error(`${prefix}적용일을 YYYY-MM-DD로 입력해 주세요.`);
  }
  if (!input.productName.trim() || input.productName.length > 200 || !input.unit.trim() || input.unit.length > 40) {
    throw new Error(`${prefix}품목명·단위를 확인해 주세요.`);
  }
  if ((input.specification?.length ?? 0) > 200) throw new Error(`${prefix}규격은 200자 이하로 입력해 주세요.`);
  if (!Number.isSafeInteger(input.costKrw) || input.costKrw < 0 || input.costKrw > 1_000_000_000) {
    throw new Error(`${prefix}원가는 0~10억원 사이의 원 단위 정수로 입력해 주세요.`);
  }
  return { ...input, productName: input.productName.trim(), specification: input.specification?.trim() ?? "", unit: input.unit.trim() };
}

export function parseStoreCostRows(rows: readonly unknown[][], mapping: StoreCostColumnMapping): StoreCostInput[] {
  const missing = STORE_COST_IMPORT_FIELDS.filter(field => field.required && mapping[field.key] === undefined);
  if (missing.length) throw new Error(`필수 열을 골라 주세요: ${missing.map(field => field.label).join(", ")}`);
  return rows.filter(row => row.some(cell => normalized(cell))).map((row, index) => {
    const read = (field: StoreCostField) => normalized(row[mapping[field] ?? -1]);
    const costText = read("costKrw").replace(/[,원\s]/g, "");
    const costKrw = Number(costText);
    const effectiveOn = read("effectiveOn");
    const productName = read("productName");
    const unit = read("unit");
    return validateStoreCostInput({ costKrw, effectiveOn, productName, specification: read("specification"), unit }, index + 2);
  });
}

export function collapseStoreCostDuplicates(rows: readonly StoreCostInput[]) {
  const latest = new Map<string, StoreCostInput>();
  for (const row of rows) latest.set(`${row.effectiveOn}|${storeCostProductKey(row)}`, row);
  return Array.from(latest.values());
}
