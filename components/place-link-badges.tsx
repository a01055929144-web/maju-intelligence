import type { PlaceUrls } from "@/components/map-lead-channel-icons";

// CC-57: 지도 링크 배지 공용 부품 — K(카카오) → N(네이버) → G(구글) 글자 네모. 지도 목록 행·지도 카드·리드 상세가 모두 이 부품을 쓴다(모양·순서 한 곳).
const badgeClass = "grid h-6 w-6 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 place-items-center rounded-md text-xs font-black ring-1 ring-inset transition hover:scale-105 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";

export function PlaceLinkBadges({ places }: { readonly places: PlaceUrls }) {
  return (
    <>
      <a aria-label="카카오맵" className={`${badgeClass} bg-[#FEE500] text-[#3c1e1e] ring-[#FEE500]`} href={places.kakao} rel="noreferrer" target="_blank" title="카카오맵">K</a>
      <a aria-label="네이버 지도" className={`${badgeClass} bg-[#03C75A] text-white ring-[#03C75A]`} href={places.naver} rel="noreferrer" target="_blank" title="네이버 지도">N</a>
      <a aria-label="구글 지도" className={`${badgeClass} bg-white text-[#4285F4] ring-slate-300`} href={places.google} rel="noreferrer" target="_blank" title="구글 지도">G</a>
    </>
  );
}
