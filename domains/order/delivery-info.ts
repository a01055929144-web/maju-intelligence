// CX-152: 점주가 반드시 넣어야 배송되는 "배송 정보" 항목과 빠진 항목 판정(순수 함수 — 화면·서버·고객사 화면이 같이 쓴다).
export const DELIVERY_RECEIVE_METHODS = [["door", "문 앞"], ["inside", "매장 안"], ["dawn", "새벽 배송"]] as const;
export type DeliveryInfoKey = "baseAddress" | "addressDetail" | "receiveMethod" | "accessNote" | "deliveryContactPhone" | "accessPassword";
export const DELIVERY_INFO_LABELS: Record<DeliveryInfoKey, string> = {
  baseAddress: "배송 주소", addressDetail: "상세 주소", receiveMethod: "받는 방법", accessNote: "적치 위치", deliveryContactPhone: "배송 연락처", accessPassword: "출입 비밀번호",
};
export type DeliveryInfoInput = {
  baseAddress?: string | null; addressDetail?: string | null;
  /** 매장 프로필(점주 계정)이 있을 때만 채워 보낸다. 없으면 주소·상세 주소만 필수. */
  profile?: { accessNote?: string | null; deliveryContactPhone?: string | null; receiveMethod?: string | null; hasAccessPassword?: boolean } | null;
  /** profile: 프로필 설정이 켜진 회사(적치 위치·연락처 필수). receiveMethod: 배송 설정까지 켜진 회사(받는 방법, 새벽이면 비밀번호 필수). */
  required: { profile: boolean; receiveMethod: boolean };
};
export type MissingDeliveryInfo = { key: DeliveryInfoKey; label: string };

const blank = (value?: string | null) => !value || !value.trim();

/** 빠진 항목. 값은 담지 않는다 — 비밀번호는 "있음/없음"만 본다. */
export function missingDeliveryInfo(input: DeliveryInfoInput): MissingDeliveryInfo[] {
  const keys: DeliveryInfoKey[] = [];
  if (blank(input.baseAddress)) keys.push("baseAddress");
  if (blank(input.addressDetail)) keys.push("addressDetail");
  const profile = input.profile;
  if (profile && input.required.profile) {
    if (input.required.receiveMethod && blank(profile.receiveMethod)) keys.push("receiveMethod");
    if (blank(profile.accessNote)) keys.push("accessNote");
    if (blank(profile.deliveryContactPhone)) keys.push("deliveryContactPhone");
    if (input.required.receiveMethod && profile.receiveMethod === "dawn" && !profile.hasAccessPassword) keys.push("accessPassword");
  }
  return keys.map((key) => ({ key, label: DELIVERY_INFO_LABELS[key] }));
}
