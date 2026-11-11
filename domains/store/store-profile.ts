import { isValidBusinessRegistrationNumber, normalizeBusinessNumber } from "../../lib/business-number";

// CX-11: 매장 직접 가입 입력 검증. DB 제약(store_profiles)과 같은 한도를 서버에서 먼저 확인한다.
export const STORE_TERMS_VERSION = "2026-11-11";

export type StoreProfileInput = {
  storeName: string;
  businessNumber: string;
  /** 개업 예정: 사업자번호 없이 가입(번호가 없으면 확인 대기 상태로만 저장된다). */
  openingSoon: boolean;
  baseAddress: string;
  addressDetail: string;
  termsAccepted: boolean;
};

export type ParsedStoreProfile = {
  storeName: string;
  businessRegistrationNumber: string | null;
  baseAddress: string;
  addressDetail: string | null;
};

export type StoreProfileField = "storeName" | "businessNumber" | "baseAddress" | "addressDetail" | "termsAccepted";

export function parseStoreProfileInput(raw: unknown): { ok: true; value: ParsedStoreProfile } | { ok: false; field: StoreProfileField; message: string } {
  const body = raw && typeof raw === "object" && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");
  const storeName = text(body.storeName);
  if (storeName.length < 1 || storeName.length > 100) return { ok: false, field: "storeName", message: "매장 이름을 1~100자로 입력해 주세요." };

  const openingSoon = body.openingSoon === true;
  const numberText = text(body.businessNumber);
  let businessRegistrationNumber: string | null = null;
  if (!openingSoon) {
    if (!isValidBusinessRegistrationNumber(numberText)) return { ok: false, field: "businessNumber", message: "사업자등록번호 10자리를 확인해 주세요. 아직 없으면 '개업 예정'을 선택하세요." };
    businessRegistrationNumber = normalizeBusinessNumber(numberText);
  }

  const baseAddress = text(body.baseAddress);
  if (baseAddress.length < 1 || baseAddress.length > 300) return { ok: false, field: "baseAddress", message: "매장 주소를 검색해서 선택해 주세요." };
  const addressDetail = text(body.addressDetail);
  if (addressDetail.length > 200) return { ok: false, field: "addressDetail", message: "상세 주소는 200자 이하로 입력해 주세요." };
  if (body.termsAccepted !== true) return { ok: false, field: "termsAccepted", message: "이용 약관에 동의해 주세요." };

  return { ok: true, value: { storeName, businessRegistrationNumber, baseAddress, addressDetail: addressDetail || null } };
}
