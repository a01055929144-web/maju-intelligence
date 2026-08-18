"use client";

import { useState } from "react";
import { CheckCircle2, Copy, MapPinned, Navigation, Phone } from "lucide-react";

export function MobileRouteActionPanel({
  address,
  customerId,
  customerName,
  distanceKm,
  durationMinutes,
  phone
}: {
  address: string;
  customerId: string;
  customerName: string;
  distanceKm?: number;
  durationMinutes?: number;
  phone?: string;
}) {
  const [copyMessage, setCopyMessage] = useState("");
  const routeLabel = `${distanceKm || 0}km · ${durationMinutes || 0}분`;
  const mapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(address || customerName)}`;

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address || customerName);
      setCopyMessage("주소를 복사했습니다.");
    } catch {
      setCopyMessage("복사 권한을 받을 수 없습니다.");
    }
  }

  return (
    <section className="rounded-xl border border-teal-200 bg-teal-50/70 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-700 text-white">
          <Navigation className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-black text-slate-950">현장 바로가기</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">{customerName} · {routeLabel}</p>
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-2">
        <a
          className="flex h-11 items-center justify-center gap-2 rounded-lg bg-teal-700 px-3 text-sm font-black text-white"
          href={mapUrl}
          rel="noreferrer"
          target="_blank"
        >
          <MapPinned className="h-4 w-4" />
          지도 열기
        </a>
        <a
          className={`flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black ${phone ? "text-slate-800" : "pointer-events-none text-slate-300"}`}
          href={phone ? `tel:${phone}` : "#"}
        >
          <Phone className="h-4 w-4" />
          전화
        </a>
        <button
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black text-slate-800"
          onClick={copyAddress}
          type="button"
        >
          <Copy className="h-4 w-4" />
          주소 복사
        </button>
        <a
          className="flex h-11 items-center justify-center gap-2 rounded-lg border border-blue-200 bg-white px-3 text-sm font-black text-blue-800"
          href={`/mobile/today?customer=${encodeURIComponent(customerId)}#delivery-proof`}
        >
          <CheckCircle2 className="h-4 w-4" />
          배송완료
        </a>
      </div>
      {copyMessage ? <p className="mt-2 text-xs font-bold text-teal-700">{copyMessage}</p> : null}
    </section>
  );
}
