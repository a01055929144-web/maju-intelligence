"use client";

import { useState } from "react";
import { Copy, MapPinned, Phone } from "lucide-react";

export function MobileRouteActionPanel({
  address,
  customerName,
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
    <section id="contact-actions">
      <div className="grid grid-cols-2 gap-2">
        <a
          className="flex min-h-14 items-center justify-center gap-2 rounded-xl bg-blue-600 px-3 text-sm font-bold text-white shadow-sm"
          href={mapUrl}
          rel="noreferrer"
          target="_blank"
        >
          <MapPinned className="h-4 w-4" />
          지도 열기
        </a>
        <a
          className={`flex min-h-14 items-center justify-center gap-2 rounded-xl bg-teal-600 px-3 text-sm font-bold text-white shadow-sm ${phone ? "" : "pointer-events-none opacity-45"}`}
          href={phone ? `tel:${phone}` : "#"}
        >
          <Phone className="h-4 w-4" />
          전화하기
        </a>
        <button
          className="mobile-card-raised col-span-2 flex min-h-11 items-center justify-center gap-1.5 rounded-lg border px-2 text-xs font-semibold"
          onClick={copyAddress}
          type="button"
        >
          <Copy className="h-4 w-4" />
          주소복사
        </button>
      </div>
      {copyMessage ? <p className="mt-2 text-xs font-bold text-teal-700">{copyMessage}</p> : null}
    </section>
  );
}
