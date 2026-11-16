// CC-48-2: 거래처 주소 한 줄 표시와 주소 검색 결과 타입. 기본 주소(도로명)와 상세 주소(층·호)를 " · "로 이어 보여 준다.
export type PickedAddress = { address: string; latitude?: number; longitude?: number; postalCode?: string };

/** 기본 주소 + 상세 주소를 `도로명 · 상세` 한 줄로. 상세가 없으면 기본 주소만, 둘 다 없으면 빈 문자열. */
export function addressLine(base: string | null | undefined, detail: string | null | undefined) {
  return [base, detail].map((part) => (part ?? "").trim()).filter(Boolean).join(" · ");
}

/** 저장용 주소(`normalized_customers.address`): 기본 + 공백 + 상세. 매장 주소 관리(07-store-address-management)와 같은 형식. */
export function joinSavedAddress(base: string, detail: string) {
  return [base, detail].map((part) => part.trim()).filter(Boolean).join(" ");
}

/** 저장된 전체 주소에서 상세 주소를 떼어 기본 주소만 돌려준다(상세가 끝에 붙어 있을 때만). */
export function stripDetail(saved: string, detail: string | null | undefined) {
  const tail = (detail ?? "").trim();
  const text = saved.trim();
  return tail && text.endsWith(` ${tail}`) ? text.slice(0, -tail.length - 1).trim() : text;
}

/**
 * CC-54: 지도 마커·경로·상세가 쓰는 배송 주소 한 곳. 배송 기본 주소(`delivery_base_address`)가 있으면 그것, 없으면 저장된 `address`.
 * `search` = 지도가 좌표를 찾는 주소(상세 주소는 빼 정확도를 지킨다), `display` = 사람이 읽는 한 줄(기본 + 상세).
 */
export function resolveDeliveryAddress(input: { address?: string | null; deliveryBaseAddress?: string | null; deliveryAddressDetail?: string | null }) {
  const base = (input.deliveryBaseAddress ?? "").trim();
  if (!base) {
    const address = (input.address ?? "").trim();
    return { search: address, display: address, detail: "" };
  }
  const detail = (input.deliveryAddressDetail ?? "").trim();
  return { search: base, display: joinSavedAddress(base, detail), detail };
}
