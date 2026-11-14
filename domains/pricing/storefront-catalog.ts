// CC-36a: 매장 화면 "전체 상품" 줄의 가격 표시 규칙. 가격 계산은 서버 함수(margin_template_price_v1) 결과만 쓰고 여기서는 보여 줄 값만 고른다.
export type CatalogLine = {
  productId: string;
  name: string;
  category: string;
  brand: string;
  spec: string;
  unit: string;
  isMarket: boolean;
  /** 과세 구분(주문 금액 미리보기용). 실제 금액은 주문 때 서버가 다시 계산한다. */
  taxType: "taxable" | "exempt";
  /** 일반 품목: 이 매장의 카탈로그 가격(서버 함수 결과). 시세 품목은 항상 null(가격 미정). */
  price: number | null;
  /** 시세 품목: 오늘 날짜 매입가가 있을 때만 그 매장 카탈로그 가격. 없으면 null(표시 안 함). */
  todayBasePrice: number | null;
  /** 시세 품목: 이 매장의 최근 확정 주문 줄 단가와 날짜. 다른 매장 값은 절대 넣지 않는다. */
  lastDispatch: { price: number; date: string } | null;
};

/** 서버 함수 결과(bigint → number|null)를 화면 값으로: 0 이하·숫자가 아닌 값은 가격 없음. */
export const priceOrNull = (value: unknown): number | null => (typeof value === "number" && Number.isFinite(value) && value > 0 ? value : null);

/** 오늘 기준가는 매입가 날짜가 오늘(한국시간)일 때만 보여 준다. */
export const todayBaseOnly = (purchasePriceDate: string | null | undefined, today: string, price: number | null) => (purchasePriceDate === today ? price : null);

/** "11/12 · 5,800원" 형태의 지난 출고 문구. 값이 없으면 빈 문자열. */
export function lastDispatchLabel(x: CatalogLine["lastDispatch"]): string {
  if (!x) return "";
  const [, month, day] = x.date.split("-");
  return `지난 출고 ${Number(month)}/${Number(day)} · ${x.price.toLocaleString("ko-KR")}원`;
}
