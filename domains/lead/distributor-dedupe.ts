// CC-23: 유통사 리드 중복 판정(순수 함수). CC-21 가져오기의 같은 상호·번호 묶음과 같은 정규화를 쓴다.
export type DedupeRecord = { id?: string; name: string; address?: string; phone?: string | null; kakaoPlaceUrl?: string | null };
export type DuplicateReason = "place" | "phone" | "name_address";

/** 상호 비교용: 공백·(주)·㈜ 제거, 소문자. */
export const normalizeName = (name: string) => name.replace(/㈜|\(주\)|\(유\)|\s/g, "").toLowerCase();
const normalizeAddress = (address: string) => address.replace(/\s/g, "").toLowerCase();
export const digitsOnly = (phone: string | null | undefined) => String(phone ?? "").replace(/\D/g, "");

/** 카카오맵 장소 주소에서 장소 번호만 뽑는다(`https://place.map.kakao.com/123`). 형식이 다르면 null. */
export function kakaoPlaceId(url: string | null | undefined): string | null {
  const match = String(url ?? "").trim().match(/^https?:\/\/place\.map\.kakao\.com\/(\d{3,})\/?$/);
  return match ? match[1] : null;
}

/** 우선순위: 같은 카카오 장소 번호 → 같은 번호 → 같은 상호+주소. 없으면 null. */
export function findDuplicate(candidate: DedupeRecord, existing: readonly DedupeRecord[]): { id?: string; reason: DuplicateReason } | null {
  const place = kakaoPlaceId(candidate.kakaoPlaceUrl);
  const phone = digitsOnly(candidate.phone);
  const name = normalizeName(candidate.name);
  const address = normalizeAddress(candidate.address ?? "");
  const byPlace = place ? existing.find((e) => kakaoPlaceId(e.kakaoPlaceUrl) === place) : undefined;
  if (byPlace) return { id: byPlace.id, reason: "place" };
  const byPhone = phone.length >= 8 ? existing.find((e) => digitsOnly(e.phone) === phone) : undefined;
  if (byPhone) return { id: byPhone.id, reason: "phone" };
  const byName = name && address ? existing.find((e) => normalizeName(e.name) === name && normalizeAddress(e.address ?? "") === address) : undefined;
  return byName ? { id: byName.id, reason: "name_address" } : null;
}
