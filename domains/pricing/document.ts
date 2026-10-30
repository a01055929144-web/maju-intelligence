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
};
export type DocumentDraft = {
  id: string;
  revision: number;
  content: DocumentContent;
  updatedAt: string;
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
export function field(value: unknown, max: number, required = false) {
  if (
    typeof value !== "string" ||
    value.trim().length > max ||
    (required && !value.trim())
  )
    throw new Error("필수 항목과 입력 길이를 확인해 주세요.");
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
  if (!Array.isArray(d.lines) || d.lines.length < 1 || d.lines.length > 100)
    throw new Error("품목은 1~100개를 선택해 주세요.");
  const lines = d.lines.map((value) => {
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
      displayName: field(l.displayName, 120, true),
      brand: field(l.brand, 80),
      spec: field(l.spec, 80),
      unit: field(l.unit, 20),
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
    title: field(d.title, 100, true),
    companyName: field(d.companyName, 100, true),
    contact: field(d.contact, 100),
    recipient: field(d.recipient, 100),
    footer: field(d.footer, 400),
    validUntil: dateField(d.validUntil),
    theme: d.theme as DocumentContent["theme"],
    layout: d.layout as DocumentContent["layout"],
    showPrice: d.showPrice === true,
    showBrand: d.showBrand === true,
    showSpec: d.showSpec === true,
    lines,
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
    const limit = output.layout === "cards" ? 4 : 26;
    if (lines.length && (weight + next > limit || lines.length >= 18)) {
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
    displayName: item.displayName,
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
