"use client";

import { copyText } from "@/lib/copy-text";
import { Instagram, Mail, MessageCircle, Phone, Printer, Smartphone } from "lucide-react";
import { PlaceLinkBadges } from "@/components/place-link-badges";
import { isGenericNaverSearchLink } from "@/components/map/map-row-helpers";
import { buildInstagramDmUrl, extractInstagramHandle, getSafeNaverTalktalkUrl, isMobilePhoneNumber } from "@/domains/lead/contact-channels";
import { buildPlaceSearchLinks } from "@/lib/place-links";
import type { PermitLeadItem } from "@/lib/store";

// CC-48-3: 목록 행과 지도 카드가 같이 쓰는 채널 아이콘 한 부품. 순서 = 네이버·카카오·구글·인스타·톡톡 다음 문자·이메일·팩스·전화, 크기·색은 한 곳.
export type PlaceUrls = { readonly google: string; readonly kakao: string; readonly naver: string };
type PlaceSource = { readonly address?: string | null; readonly googleMapUrl?: string | null; readonly kakaoPlaceUrl?: string | null; readonly name: string; readonly naverPlaceUrl?: string | null };
type Props = {
  readonly lead?: Pick<PermitLeadItem, "businessName" | "email" | "fax" | "instagramUrl" | "naverTalktalkUrl" | "phone">;
  readonly name?: string;
  readonly places?: PlaceUrls;
};
const iconClassName = "grid h-6 w-6 [@media(pointer:coarse)]:h-11 [@media(pointer:coarse)]:w-11 shrink-0 place-items-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-teal-500 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
const cleanPhone = (value: string) => value.replace(/[^0-9+]/g, "");

/** 저장된 장소 링크가 없거나 네이버 검색 링크뿐이면 상호·주소로 만든 검색 링크를 쓴다. */
export function resolvePlaceUrls(source: PlaceSource): PlaceUrls {
  const search = buildPlaceSearchLinks({ address: source.address ?? undefined, customerName: source.name });
  const saved = source.naverPlaceUrl?.trim();
  return {
    google: source.googleMapUrl?.trim() || search.googleMapUrl,
    kakao: source.kakaoPlaceUrl?.trim() || search.kakaoPlaceUrl,
    naver: !saved || isGenericNaverSearchLink(saved) ? search.naverPlaceUrl : saved
  };
}

export function MapLeadChannelIcons({ lead, name, places }: Props) {
  const mobile = isMobilePhoneNumber(lead?.phone) ? lead?.phone || "" : "";
  const storePhone = lead?.phone && !mobile ? lead.phone : "";
  const instagramHandle = extractInstagramHandle(lead?.instagramUrl);
  const talktalkUrl = getSafeNaverTalktalkUrl(lead?.naverTalktalkUrl);
  return (
    <div aria-label={`${lead?.businessName ?? name ?? ""} 연락 채널`} className="flex items-center gap-1">
      {places ? <PlaceLinkBadges places={places} /> : null}
      {instagramHandle ? <a aria-label="인스타그램 DM" className={iconClassName} href={buildInstagramDmUrl(instagramHandle)} rel="noreferrer" target="_blank" title="인스타"><Instagram aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {talktalkUrl ? <a aria-label="네이버 톡톡" className={iconClassName} href={talktalkUrl} rel="noreferrer" target="_blank" title="톡톡"><MessageCircle aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {mobile ? <a aria-label="휴대폰 문자" className={iconClassName} href={`sms:${cleanPhone(mobile)}`} title="휴대폰"><Smartphone aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {lead?.email ? <a aria-label="이메일" className={iconClassName} href={`mailto:${lead.email}`} title="이메일"><Mail aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {lead?.fax ? <button aria-label="팩스 번호 복사" className={iconClassName} onClick={() => void copyText(lead.fax || "")} title="팩스" type="button"><Printer aria-hidden="true" className="h-3.5 w-3.5" /></button> : null}
      {storePhone ? <a aria-label="매장전화" className={iconClassName} href={`tel:${cleanPhone(storePhone)}`} title="매장전화"><Phone aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
    </div>
  );
}
