/**
 * 영업 자료 키트 (11/4 대표 요청).
 * DM·문자 문구 아래에 붙는 "단가표 · 명함 · 브로슈어 · 카탈로그 · 주문 링크 · 연락처"를 회사가 고르고,
 * 각 링크는 짧은 주소(/m/코드)로 보냅니다. 프레임워크·DB를 모르는 순수 규칙만 둡니다.
 */
export const SALES_MATERIAL_KINDS = ["price_sheet", "business_card", "brochure", "catalog"] as const;
export type SalesMaterialKind = (typeof SALES_MATERIAL_KINDS)[number];
export const SALES_MATERIAL_LABEL: Record<SalesMaterialKind, string> = {
  price_sheet: "단가표",
  business_card: "명함",
  brochure: "브로슈어",
  catalog: "카탈로그"
};

export type SalesMaterial = { code: string; kind: SalesMaterialKind; name: string; uploadedAt: string };

/** 문구 아래에 붙일 수 있는 항목. 순서가 곧 붙는 순서입니다. */
export const SALES_KIT_FIELDS = ["price_sheet", "business_card", "brochure", "catalog", "order_link", "contact"] as const;
export type SalesKitField = (typeof SALES_KIT_FIELDS)[number];
export const SALES_KIT_FIELD_LABEL: Record<SalesKitField, string> = {
  ...SALES_MATERIAL_LABEL,
  order_link: "주문하기",
  contact: "문의"
};

export type SalesKitSettings = {
  materials: SalesMaterial[];
  /** 기본으로 보낼 자료(종류별 1개). 없으면 그 종류의 가장 최근 자료. */
  defaults: Partial<Record<SalesMaterialKind, string>>;
  /** 문구 아래에 기본으로 붙일 항목 */
  fields: SalesKitField[];
  orderUrl: string;
  orderCode: string;
  contactPhone: string;
  contactLabel: string;
};

export const DEFAULT_SALES_KIT: SalesKitSettings = {
  contactLabel: "",
  contactPhone: "",
  defaults: {},
  fields: ["price_sheet", "order_link", "contact"],
  materials: [],
  orderCode: "",
  orderUrl: ""
};

export const SALES_KIT_MAX_MATERIALS = 20;
export const SHORT_CODE_PATTERN = /^[a-z0-9]{7}$/;

export function createShortCode(random: () => number = Math.random) {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  return Array.from({ length: 7 }, () => alphabet[Math.floor(random() * alphabet.length)]).join("");
}

export function parseSalesKit(raw: string | null | undefined): SalesKitSettings {
  if (!raw) return { ...DEFAULT_SALES_KIT };
  try {
    const value = JSON.parse(raw) as Partial<SalesKitSettings>;
    const materials = Array.isArray(value.materials)
      ? value.materials.filter((item): item is SalesMaterial => Boolean(item && SHORT_CODE_PATTERN.test(item.code) && (SALES_MATERIAL_KINDS as readonly string[]).includes(item.kind)))
      : [];
    return {
      contactLabel: typeof value.contactLabel === "string" ? value.contactLabel.slice(0, 30) : "",
      contactPhone: typeof value.contactPhone === "string" ? value.contactPhone.slice(0, 20) : "",
      defaults: value.defaults && typeof value.defaults === "object" ? value.defaults : {},
      fields: Array.isArray(value.fields) ? value.fields.filter((field): field is SalesKitField => (SALES_KIT_FIELDS as readonly string[]).includes(field)) : DEFAULT_SALES_KIT.fields,
      materials,
      orderCode: typeof value.orderCode === "string" && SHORT_CODE_PATTERN.test(value.orderCode) ? value.orderCode : "",
      orderUrl: typeof value.orderUrl === "string" ? value.orderUrl.slice(0, 500) : ""
    };
  } catch {
    return { ...DEFAULT_SALES_KIT };
  }
}

export function validateOrderUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  try {
    const parsed = new URL(trimmed);
    return parsed.protocol === "https:" ? "" : "주문 링크는 https:// 로 시작해야 합니다.";
  } catch {
    return "주문 링크 주소 형식이 올바르지 않습니다.";
  }
}

/** 종류별로 보낼 자료 하나(기본 지정 → 없으면 최근 것). */
export function pickMaterial(settings: SalesKitSettings, kind: SalesMaterialKind) {
  const ofKind = settings.materials.filter((item) => item.kind === kind);
  return ofKind.find((item) => item.code === settings.defaults[kind]) || ofKind.sort((a, b) => b.uploadedAt.localeCompare(a.uploadedAt))[0];
}

export type SalesKitLine = { field: SalesKitField; label: string; text: string };

/** 문구 아래에 붙일 줄들. 값이 없는 항목은 만들지 않습니다. */
export function buildSalesKitLines(settings: SalesKitSettings, input: { origin: string; fallbackPhone?: string; companyName?: string }): SalesKitLine[] {
  const base = input.origin.replace(/\/$/, "");
  const lines: SalesKitLine[] = [];
  for (const field of SALES_KIT_FIELDS) {
    if (field === "order_link") {
      if (settings.orderCode && settings.orderUrl) lines.push({ field, label: SALES_KIT_FIELD_LABEL[field], text: `▶ 주문하기 ${base}/m/${settings.orderCode}` });
      continue;
    }
    if (field === "contact") {
      const phone = settings.contactPhone || input.fallbackPhone || "";
      if (phone) lines.push({ field, label: SALES_KIT_FIELD_LABEL[field], text: `▶ 문의 ${[settings.contactLabel || input.companyName, phone].filter(Boolean).join(" ")}` });
      continue;
    }
    const material = pickMaterial(settings, field);
    if (material) lines.push({ field, label: SALES_KIT_FIELD_LABEL[field], text: `▶ ${SALES_MATERIAL_LABEL[field]} ${base}/m/${material.code}` });
  }
  return lines;
}

export function composeDmWithKit(message: string, lines: SalesKitLine[], selected: SalesKitField[]) {
  const footer = lines.filter((line) => selected.includes(line.field)).map((line) => line.text);
  return footer.length ? `${message.trim()}\n\n${footer.join("\n")}` : message.trim();
}
