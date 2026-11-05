import { calculatePrice } from "./price-rules";
export type DocumentKind = "sheet" | "quote";
export type PrintLine = {
  productId: string;
  displayName: string;
  brand: string;
  spec: string;
  unit: string;
  price: number;
  taxType: "taxable" | "exempt" | "unknown";
  visible: boolean;
  promotionId: string | null;
  startsOn: string | null;
  endsOn: string | null;
  remaining: number | null;
  badge: "" | "행사" | "임박";
};
/** 11/4: 회사 정보에서 골라 넣는 줄(위쪽/아래쪽). 확정 시점 값으로 고정됩니다. */
export type DocumentInfoItem = { key: string; label: string; value: string; place: "header" | "footer" };
/** 11/4: 문서 보기 표시 — 품목 격자 열 수, 행사 블록 모양, 회사 정보 줄 */
export type DocumentDisplay = { columns: 1 | 2 | 3; promoLayout: "cards" | "table"; info: DocumentInfoItem[] };
export const DEFAULT_DISPLAY: DocumentDisplay = { columns: 1, promoLayout: "cards", info: [] };
export const MAX_DOCUMENT_LINES = 300;
export function parseDisplay(value: unknown): DocumentDisplay {
  if (!value || typeof value !== "object" || Array.isArray(value)) return { ...DEFAULT_DISPLAY, info: [] };
  const d = value as Record<string, unknown>;
  const columns = d.columns === 2 || d.columns === 3 ? d.columns : 1;
  const promoLayout = d.promoLayout === "table" ? "table" : "cards";
  const info = Array.isArray(d.info)
    ? d.info.slice(0, 24).flatMap((item) => {
        if (!item || typeof item !== "object") return [];
        const i = item as Record<string, unknown>;
        const label = typeof i.label === "string" ? i.label.trim() : "";
        const text = typeof i.value === "string" ? i.value.trim() : "";
        if ((i.place !== "header" && i.place !== "footer") || !label || label.length > 30 || !text || text.length > 200) return [];
        return [{ key: typeof i.key === "string" ? i.key.slice(0, 40) : "", label, value: text, place: i.place as "header" | "footer" }];
      })
    : [];
  return { columns, promoLayout, info };
}
export type DocumentContent = {
  kind: DocumentKind;
  title: string;
  companyName: string;
  contact: string;
  recipient: string;
  footer: string;
  validUntil: string;
  theme: "blue" | "green" | "mono";
  layout: "auto" | "table" | "cards";
  showPrice: boolean;
  showBrand: boolean;
  showSpec: boolean;
  lines: PrintLine[];
  display?: DocumentDisplay;
};
export type DocumentDraft = {
  id: string;
  revision: number;
  content: DocumentContent;
  updatedAt: string;
  recalculation?: import("./document-recalculation").DocumentRecalculation;
};
export type DocumentVersion = {
  id: string;
  documentId: string;
  version: number;
  revision: number;
  publishedAt: string;
  content: DocumentContent;
  unavailablePromotions: string[];
  promotionStock?: Record<string, number | null>;
};
export type CatalogChoice = {
  id: string;
  productCode?: string;
  name: string;
  displayName: string;
  brand: string;
  spec: string;
  unit: string;
  price: number;
  cost?: number;
  taxType: "taxable" | "exempt" | "unknown";
};

/** 판매 규격을 우선하고, 비어 있으면 상품 원장의 값·단위를 사용합니다. */
export function catalogDisplaySpec(row: {
  sales_spec?: string | null;
  spec_value?: number | string | null;
  spec_unit?: string | null;
}): string {
  const salesSpec = row.sales_spec?.trim();
  if (salesSpec) return salesSpec;
  return row.spec_value == null ? "" : `${row.spec_value}${row.spec_unit || ""}`;
}

/** 기존 문서의 스냅샷은 보존하고 비어 있는 초안 규격만 명시적으로 채웁니다. */
export function fillBlankDocumentSpecs(lines: readonly PrintLine[], catalog: readonly CatalogChoice[]): PrintLine[] {
  const specs = new Map(catalog.map((item) => [item.id, item.spec]));
  return lines.map((line) => (line.spec || "").trim() ? line : { ...line, spec: specs.get(line.productId) || "" });
}
export type Promotion = {
  id: string;
  productId: string;
  name: string;
  displayName: string;
  startsOn: string;
  endsOn: string;
  cost?: number;
  regularCost?: number;
  margin?: number;
  price: number;
  stock: number | null;
  perStoreLimit: number | null;
  allowSheet: boolean;
  badge: "행사" | "임박";
  revision: number;
  taxType: "taxable" | "exempt";
};
export type ProductSet = {
  id: string;
  name: string;
  kind: "bundle" | "template";
  shared: boolean;
  productIds: string[];
  editable: boolean;
  revision: number;
};
export function koreaDay(now = new Date()) {
  return new Date(now.getTime() + 32400000).toISOString().slice(0, 10);
}
/** Refresh availability and stock while keeping the draft's selected prices. */
export function withLivePromotions(
  version: DocumentVersion,
  promotions: readonly Promotion[],
  day = koreaDay(),
): DocumentVersion {
  const byId = new Map(promotions.map((promotion) => [promotion.id, promotion]));
  const promotionIds = version.content.lines
    .map((line) => line.promotionId)
    .filter((id): id is string => id !== null);
  return {
    ...version,
    promotionStock: Object.fromEntries(
      promotions.map((promotion) => [promotion.id, promotion.stock]),
    ),
    unavailablePromotions: promotionIds.filter((id) => {
      const promotion = byId.get(id);
      return (
        !promotion ||
        promotion.stock === 0 ||
        day < promotion.startsOn ||
        day > promotion.endsOn
      );
    }),
  };
}
export function isId(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value,
    )
  );
}
export function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value))
    throw new Error("입력 내용을 확인해 주세요.");
  return value as Record<string, unknown>;
}
export function field(value: unknown, max: number, required = false, label = "") {
  if (typeof value !== "string" || (required && !value.trim()))
    throw new Error(label ? `'${label}' 칸을 입력해 주세요.` : "필수 항목과 입력 길이를 확인해 주세요.");
  if (value.trim().length > max)
    throw new Error(label ? `'${label}' 칸은 ${max}자까지 입력할 수 있습니다.` : "필수 항목과 입력 길이를 확인해 주세요.");
  return value.trim();
}
export function dateField(value: unknown) {
  const day = field(value, 10, true);
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(day) ||
    Number.isNaN(Date.parse(day)) ||
    new Date(day).toISOString().slice(0, 10) !== day
  )
    throw new Error("날짜를 확인해 주세요.");
  return day;
}
export function money(value: unknown): number {
  if (
    typeof value !== "number" ||
    !Number.isSafeInteger(value) ||
    value < 0 ||
    value > 1e12
  )
    throw new Error("단가는 0~1조원의 정수 원으로 입력해 주세요.");
  return value;
}
/** A strict whitelist shared by storage and output. Never spread staff/catalog records. */
export function parseDocument(value: unknown): DocumentContent {
  const d = object(value);
  if (d.kind !== "sheet" && d.kind !== "quote")
    throw new Error("문서 종류를 확인해 주세요.");
  if (!Array.isArray(d.lines) || d.lines.length < 1 || d.lines.length > MAX_DOCUMENT_LINES)
    throw new Error(`품목은 1~${MAX_DOCUMENT_LINES}개를 선택해 주세요.`);
  const lines = d.lines.map((value, index) => {
    const l = object(value);
    if (l.taxType === "unknown")
      throw new Error(
        "과세 미확정 품목이 있습니다. 과세·면세를 확인한 후 저장해 주세요.",
      );
    if (
      !isId(l.productId) ||
      typeof l.visible !== "boolean" ||
      (l.taxType !== "taxable" && l.taxType !== "exempt") ||
      (l.promotionId !== null && !isId(l.promotionId))
    )
      throw new Error("품목을 확인해 주세요.");
    const promotional = l.promotionId !== null;
    return {
      productId: l.productId,
      displayName: field(l.displayName, 120, true, `${index + 1}번째 품목 이름`),
      brand: field(l.brand, 80, false, `${index + 1}번째 품목 브랜드`),
      spec: field(l.spec ?? "", 80, false, `${index + 1}번째 품목 규격`),
      unit: field(l.unit, 20, false, `${index + 1}번째 품목 단위`),
      price: money(l.price),
      taxType: l.taxType as "taxable" | "exempt",
      visible: l.visible,
      promotionId: l.promotionId,
      startsOn: promotional ? dateField(l.startsOn) : null,
      endsOn: promotional ? dateField(l.endsOn) : null,
      remaining:
        promotional && l.remaining !== null ? money(l.remaining) : null,
      badge:
        promotional && l.badge === "임박"
          ? ("임박" as const)
          : promotional
            ? ("행사" as const)
            : ("" as const),
    };
  });
  const keys = lines.map((l) => `${l.productId}:${l.promotionId}`);
  if (new Set(keys).size !== keys.length || !lines.some((l) => l.visible))
    throw new Error("중복 품목을 제거하고 표시할 품목을 선택해 주세요.");
  if (
    !["blue", "green", "mono"].includes(String(d.theme)) ||
    !["auto", "table", "cards"].includes(String(d.layout)) ||
    [d.showPrice, d.showBrand, d.showSpec].some((v) => typeof v !== "boolean")
  )
    throw new Error("표시 설정을 확인해 주세요.");
  return {
    kind: d.kind,
    title: field(d.title, 100, true, "문서 제목"),
    companyName: field(d.companyName, 100, true, "회사명"),
    contact: field(d.contact, 100, false, "담당·연락처"),
    recipient: field(d.recipient, 100, false, "받는 곳"),
    footer: field(d.footer, 400, false, "하단 안내"),
    validUntil: dateField(d.validUntil),
    theme: d.theme as DocumentContent["theme"],
    layout: d.layout as DocumentContent["layout"],
    showPrice: d.showPrice === true,
    showBrand: d.showBrand === true,
    showSpec: d.showSpec === true,
    lines,
    display: parseDisplay(d.display),
  };
}
export function documentOutput(version: DocumentVersion, day = koreaDay()) {
  const d = parseDocument(version.content),
    expired = day > d.validUntil;
  const currentStock = (line: PrintLine) =>
    line.promotionId &&
    version.promotionStock &&
    Object.prototype.hasOwnProperty.call(
      version.promotionStock,
      line.promotionId,
    )
      ? version.promotionStock[line.promotionId]
      : line.remaining;
  const visible = d.lines.filter(
    (l) =>
      l.visible &&
      (!l.promotionId ||
        (!version.unavailablePromotions.includes(l.promotionId) &&
          day >= l.startsOn! &&
          day <= l.endsOn! &&
          currentStock(l) !== 0)),
  );
  return {
    title: d.title,
    companyName: d.companyName,
    contact: d.contact,
    recipient: d.recipient,
    footer: d.footer,
    validUntil: d.validUntil,
    version: version.version,
    publishedAt: version.publishedAt,
    expired,
    theme: d.theme,
    kind: d.kind,
    display: d.display || DEFAULT_DISPLAY,
    layout:
      d.layout === "auto"
        ? visible.length > 20
          ? "table"
          : "cards"
        : d.layout,
    lines: visible.map((l) => ({
      displayName: l.displayName,
      brand: d.showBrand ? l.brand : "",
      spec: d.showSpec ? l.spec : "",
      unit: d.showSpec ? l.unit : "",
      price: d.showPrice && !expired ? l.price : null,
      taxType: l.taxType,
      badge: l.badge,
      endsOn: l.endsOn,
      remaining: currentStock(l),
    })),
  };
}
export type DocumentOutput = ReturnType<typeof documentOutput>;
export function printPages(output: DocumentOutput) {
  const pages: DocumentOutput[] = [];
  let lines: DocumentOutput["lines"] = [],
    weight = 0;
  for (const line of output.lines) {
    const next =
      output.layout === "cards"
        ? 1
        : Math.max(
            2,
            Math.ceil(line.displayName.length / 18) +
              Math.ceil(line.brand.length / 18),
            Math.ceil((line.spec + line.unit).length / 10),
          ) + 1;
    const columns = output.display?.columns || 1;
    const limit = output.layout === "cards" ? 4 * columns : 26 * columns;
    if (lines.length && (weight + next > limit || lines.length >= 18 * columns)) {
      pages.push({ ...output, lines });
      lines = [];
      weight = 0;
    }
    lines.push(line);
    weight += next;
  }
  if (lines.length || !pages.length) pages.push({ ...output, lines });
  return pages;
}
export function lineFromCatalog(item: CatalogChoice): PrintLine {
  return {
    productId: item.id,
    // 11/4: 노출 상품명이 비어 있으면 상품명으로 채워 둡니다(문서에서 바로 고칠 수 있음).
    displayName: (item.displayName || item.name || "").slice(0, 120),
    brand: item.brand,
    spec: item.spec,
    unit: item.unit,
    price: item.price,
    taxType: item.taxType,
    visible: true,
    promotionId: null,
    startsOn: null,
    endsOn: null,
    remaining: null,
    badge: "",
  };
}
export function withMargin(
  line: PrintLine,
  cost: number,
  margin: number,
  rounding = 10,
): PrintLine {
  return { ...line, price: calculatePrice(cost, margin, rounding) };
}
