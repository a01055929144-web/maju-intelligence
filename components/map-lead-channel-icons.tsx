"use client";

import { Instagram, Mail, MessageCircle, Phone, Printer, Smartphone } from "lucide-react";
import { buildInstagramDmUrl, extractInstagramHandle, getSafeNaverTalktalkUrl, isMobilePhoneNumber } from "@/domains/lead/contact-channels";
import type { PermitLeadItem } from "@/lib/store";

type Props = { readonly lead: Pick<PermitLeadItem, "businessName" | "email" | "fax" | "instagramUrl" | "naverTalktalkUrl" | "phone"> };
const iconClassName = "grid h-[26px] w-[26px] place-items-center rounded-md border border-slate-300 bg-white text-slate-700 transition hover:border-teal-500 hover:bg-teal-50 hover:text-teal-800 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-600";
const cleanPhone = (value: string) => value.replace(/[^0-9+]/g, "");

export function MapLeadChannelIcons({ lead }: Props) {
  const mobile = isMobilePhoneNumber(lead.phone) ? lead.phone || "" : "";
  const storePhone = lead.phone && !mobile ? lead.phone : "";
  const instagramHandle = extractInstagramHandle(lead.instagramUrl);
  const talktalkUrl = getSafeNaverTalktalkUrl(lead.naverTalktalkUrl);
  return (
    <div aria-label={`${lead.businessName} 연락 채널`} className="flex items-center gap-1">
      {mobile ? <a aria-label="휴대폰 문자" className={iconClassName} href={`sms:${cleanPhone(mobile)}`} title="휴대폰"><Smartphone aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {instagramHandle ? <a aria-label="인스타그램 DM" className={iconClassName} href={buildInstagramDmUrl(instagramHandle)} rel="noreferrer" target="_blank" title="인스타"><Instagram aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {talktalkUrl ? <a aria-label="네이버 톡톡" className={iconClassName} href={talktalkUrl} rel="noreferrer" target="_blank" title="톡톡"><MessageCircle aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {lead.email ? <a aria-label="이메일" className={iconClassName} href={`mailto:${lead.email}`} title="이메일"><Mail aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
      {lead.fax ? <button aria-label="팩스 번호 복사" className={iconClassName} onClick={() => void navigator.clipboard?.writeText(lead.fax || "")} title="팩스" type="button"><Printer aria-hidden="true" className="h-3.5 w-3.5" /></button> : null}
      {storePhone ? <a aria-label="매장전화" className={iconClassName} href={`tel:${cleanPhone(storePhone)}`} title="매장전화"><Phone aria-hidden="true" className="h-3.5 w-3.5" /></a> : null}
    </div>
  );
}
