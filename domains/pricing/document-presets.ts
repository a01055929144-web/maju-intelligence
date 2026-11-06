import { DEFAULT_DISPLAY, type DocumentContent, type DocumentDisplay, type DocumentKind } from "./document";

/**
 * 11/4: 새 문서 시작 화면의 'MAJU 추천' 4종. 품목은 담지 않고 모양(열·형식·표시 항목·테마)만 정합니다.
 */
export type DocumentPreset = {
  readonly id: string;
  readonly kind: DocumentKind;
  readonly name: string;
  readonly description: string;
  readonly title: string;
  readonly patch: Pick<DocumentContent, "layout" | "theme" | "showPrice" | "showBrand" | "showSpec">;
  readonly display: Pick<DocumentDisplay, "columns" | "promoLayout">;
};

export const DOCUMENT_PRESETS: readonly DocumentPreset[] = [
  { id: "sheet-basic", kind: "sheet", name: "기본 단가표", description: "한 줄에 한 품목 · 규격·단가", title: "단가표", patch: { layout: "table", theme: "blue", showPrice: true, showBrand: false, showSpec: true }, display: { columns: 1, promoLayout: "cards" } },
  { id: "sheet-many", kind: "sheet", name: "품목 많은 단가표", description: "3열 격자 · 한 장에 최대한 많이", title: "전체 단가표", patch: { layout: "table", theme: "mono", showPrice: true, showBrand: false, showSpec: true }, display: { columns: 3, promoLayout: "table" } },
  { id: "sheet-promo", kind: "sheet", name: "행사 전단", description: "행사·임박 카드를 크게 · 녹색", title: "이번 주 행사", patch: { layout: "cards", theme: "green", showPrice: true, showBrand: true, showSpec: true }, display: { columns: 2, promoLayout: "cards" } },
  { id: "quote-simple", kind: "quote", name: "간단 견적서", description: "매장 한 곳에 보내는 견적 · 브랜드 표시", title: "식자재 견적서", patch: { layout: "table", theme: "blue", showPrice: true, showBrand: true, showSpec: true }, display: { columns: 1, promoLayout: "table" } }
];

/** 추천 모양을 빈 문서에 입힙니다(회사 정보 줄은 그대로 둠). */
export function applyPreset(base: DocumentContent, preset: DocumentPreset): DocumentContent {
  return {
    ...base,
    ...preset.patch,
    kind: base.kind,
    title: preset.title,
    display: { ...DEFAULT_DISPLAY, ...base.display, ...preset.display, info: base.display?.info || [] }
  };
}
