// CC-70: 같은 사업자번호를 쓰는 매출처가 이미 있을 때의 안내·저장 규칙(화면용). 서버의 저장 검사(hasSubBusinessNumberConflict)와 같은 기준이다. React·DB를 모른다.
export type IdentityPeer = { readonly id?: string; readonly customerName: string; readonly businessNumber?: string; readonly subBusinessNumber?: string };

export type IdentityNotice =
  | { kind: "none" }
  /** 종사업장번호가 서로 달라 저장 가능 — 안내만. */
  | { kind: "info"; peerName: string }
  /** 종사업장번호가 같거나 둘 다 비어 저장 불가 — 중복 허용 사업자번호 링크를 보인다. */
  | { kind: "blocked"; peerName: string };

const digits = (value?: string) => (value ?? "").replace(/\D/g, "");

/** 사업자번호가 10자리로 같은 다른 매출처를 찾아 안내. 종사업장이 모두 다르면 info, 하나라도 같거나 비면 blocked. */
export function businessIdentityNotice(draft: { id?: string; businessNumber?: string; subBusinessNumber?: string }, peers: readonly IdentityPeer[]): IdentityNotice {
  const number = digits(draft.businessNumber);
  if (number.length !== 10) return { kind: "none" };
  const same = peers.filter((peer) => peer.id !== draft.id && digits(peer.businessNumber) === number);
  if (!same.length) return { kind: "none" };
  const sub = (draft.subBusinessNumber ?? "").trim();
  const peerSub = (peer: IdentityPeer) => (peer.subBusinessNumber ?? "").trim();
  const clash = same.find((peer) => sub && peerSub(peer) === sub) ?? same.find((peer) => !sub || !peerSub(peer));
  return clash ? { kind: "blocked", peerName: clash.customerName } : { kind: "info", peerName: same[0].customerName };
}

/** 법인등록번호는 숫자 13자리(하이픈은 무시). 비우면 통과. */
export function isValidCorporateRegistrationNumber(value?: string): boolean {
  const text = digits(value);
  return !text || text.length === 13;
}
