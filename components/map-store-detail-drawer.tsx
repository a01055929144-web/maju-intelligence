"use client";

import { useEffect, type ReactNode } from "react";
import { ExternalLink, Instagram, MessageCircle, Navigation } from "lucide-react";
import { isMobilePhoneNumber } from "@/domains/lead/contact-channels";

const RELATIONSHIP_STAGE_OPTIONS = ["거래중", "거래종료"] as const;

export function MapStoreDetailDrawer({ children, onClose }: { readonly children: ReactNode; readonly onClose: () => void }) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);
  return <><button aria-label="거래처 상세 닫기" className="fixed inset-0 z-30 bg-slate-950/45" onClick={onClose} type="button" /><aside aria-label="매장 상세" className="fixed right-0 top-0 z-40 flex h-screen w-full flex-col border-l border-slate-200 bg-white shadow-2xl md:w-[62%]">{children}</aside></>;
}

type ActionsProps = { readonly address: string; readonly currentStage: string; readonly email: string; readonly name: string; readonly onDm: () => void; readonly onStageChange: (stage: string) => void; readonly openHref: string; readonly phone: string };

export function MapStoreDetailActions({ address, currentStage, email, name, onDm, onStageChange, openHref, phone }: ActionsProps) {
  const actionClassName = "maju-button-secondary inline-flex h-11 items-center gap-2 px-3 text-sm";
  const cleanPhone = phone.replace(/[^0-9+]/g, "");
  const canSms = isMobilePhoneNumber(phone);
  return (
    <section aria-label="연락하기" className="border-b border-slate-200 bg-white px-4 py-3"><div className="flex flex-wrap items-center gap-2">
      {canSms ? <a aria-label={`${name}에게 문자 보내기`} className="maju-button-primary inline-flex h-11 items-center gap-2 px-4 text-sm" href={`sms:${cleanPhone}`} title="문자"><MessageCircle aria-hidden="true" className="h-4 w-4" />문자</a> : null}
      {phone ? <a aria-label={`${name}에게 전화하기`} className={actionClassName} href={`tel:${cleanPhone}`} title="매장전화">매장전화</a> : null}
      {email ? <a aria-label={`${name}에게 이메일 보내기`} className={actionClassName} href={`mailto:${email}`} title="이메일">이메일</a> : null}
      <button aria-label={`${name} DM 문안 준비`} className={actionClassName} onClick={onDm} title="DM 문안 준비" type="button"><Instagram aria-hidden="true" className="h-4 w-4" />DM 문안</button>
      <a aria-label={`${name} 길안내`} className={actionClassName} href={`https://map.kakao.com/link/search/${encodeURIComponent(address || name)}`} rel="noreferrer" target="_blank" title="길안내"><Navigation aria-hidden="true" className="h-4 w-4" />길안내</a>
      <label className="sr-only" htmlFor="map-store-stage">영업 단계</label><select className="h-11 rounded-md border border-slate-300 bg-white px-3 text-sm font-bold text-slate-700" id="map-store-stage" onChange={(event) => onStageChange(event.target.value)} title="단계" value={currentStage}>{RELATIONSHIP_STAGE_OPTIONS.some((stage) => stage === currentStage) ? null : <option value={currentStage}>{currentStage}</option>}{RELATIONSHIP_STAGE_OPTIONS.map((stage) => <option key={stage} value={stage}>{stage}</option>)}</select>
      <a aria-label={`${name} 새 창에서 열기`} className={`${actionClassName} ml-auto`} href={openHref} rel="noreferrer" target="_blank" title="새 창"><ExternalLink aria-hidden="true" className="h-4 w-4" />새 창</a>
    </div></section>
  );
}
