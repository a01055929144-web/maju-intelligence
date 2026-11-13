// CC-30b: 매장 가격 화면의 순수 규칙. 출처 배지는 `기본`(이 매장 가격 없음) · `매장`(직접 정한 가격) · `견적`(견적 수락으로 생긴 가격).
export type StorePriceSource = "기본" | "매장" | "견적";

export function storePriceSource(agreement: { fromQuote: boolean } | null): StorePriceSource {
  return !agreement ? "기본" : agreement.fromQuote ? "견적" : "매장";
}

/** 이 매장 가격 − 기본 판매가. 이 매장 가격이 없으면 null. */
export function priceDifference(basePrice: number, storePrice: number | null): number | null {
  return storePrice === null ? null : storePrice - basePrice;
}

/** 칸 입력 → 저장할 값. 빈 칸 = 끝내기(null), 숫자 = 가격, 그 밖 = 오류(undefined). 쉼표·원은 무시, 0은 허용. */
export function parseStorePriceInput(raw: string): number | null | undefined {
  const text = raw.replace(/[,\s원]/g, "");
  if (text === "") return null;
  if (!/^\d{1,13}$/.test(text)) return undefined;
  return Number(text);
}
