// CC-73: 매출처 · 매입처가 같은 틀(PartnerDirectory)을 쓰기 위한 순수 규칙. React·DB를 모른다. 비즈니스 규칙(원장·전표)은 각 domain에 있다.
export type PartnerType = "customer" | "supplier";

export const PARTNER_LABELS: Record<PartnerType, { name: string; balance: string; itemsTab: string }> = {
  customer: { name: "매출처", balance: "미수금", itemsTab: "품목/단가" },
  supplier: { name: "매입처", balance: "미지급금", itemsTab: "품목/단가" }
};

/** 상세 탭 공통 순서. 매출처의 영업 기능(타임라인·지도·영업 단계)은 이 뒤에 추가 탭으로 붙는다. */
export const PARTNER_TABS = [["info", "기본 정보"], ["items", "품목/단가"], ["documents", "전표"], ["ledger", "원장"], ["memo", "메모"]] as const;
export type PartnerTabId = (typeof PARTNER_TABS)[number][0];

/** 목록 한 줄(두 화면 공통). 없는 값은 비워 두면 "-"로 보인다. */
export type PartnerRow = {
  readonly id: string;
  /** 표시 상호 — 목록·지도·주문에 보이는 이름(매출처 customer_name / 매입처 name). */
  readonly displayName: string;
  readonly businessName?: string;
  readonly businessNumber?: string;
  readonly subBusinessNumber?: string;
  readonly representativeName?: string;
  readonly phone?: string;
  readonly lastTradeDate?: string;
  readonly monthAmount?: number | null;
  /** 매출처 = 미수금, 매입처 = 미지급금. */
  readonly balance?: number | null;
  readonly status: string;
};

/** 사업자등록번호 10자리를 000-00-00000로. 모자라면 있는 만큼만. */
export function formatBusinessNumber(value?: string | null): string {
  const digits = (value ?? "").replace(/\D/g, "").slice(0, 10);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

/** 종사업장번호: 숫자 4자리, 비우면 없음(`company_profiles.sub_business_number`와 같은 규칙). */
export function parseSubBusinessNumber(value?: string | null): { ok: true; value: string } | { ok: false } {
  const text = (value ?? "").trim();
  if (!text) return { ok: true, value: "" };
  return /^\d{4}$/.test(text) ? { ok: true, value: text } : { ok: false };
}

/** [전표 쓰기]: 전표 화면을 그 거래처로 연다(회사 미리보기면 companyId 유지). */
export function partnerDocumentHref(type: PartnerType, partnerId: string, companyId = ""): string {
  const query = new URLSearchParams({ ...(companyId ? { companyId } : {}), partnerType: type, partnerId });
  return `/operations/documents?${query.toString()}`;
}

/** 목록 검색: 표시 상호 · 사업자 상호 · 사업자번호(숫자만 비교) · 대표자 · 연락처. */
export function filterPartnerRows<T extends PartnerRow>(rows: readonly T[], query: string): T[] {
  const text = query.trim().toLocaleLowerCase("ko");
  if (!text) return [...rows];
  const digits = text.replace(/\D/g, "");
  return rows.filter((row) => [row.displayName, row.businessName, row.representativeName, row.phone].some((v) => (v ?? "").toLocaleLowerCase("ko").includes(text))
    || (digits.length >= 3 && (row.businessNumber ?? "").replace(/\D/g, "").includes(digits)));
}
