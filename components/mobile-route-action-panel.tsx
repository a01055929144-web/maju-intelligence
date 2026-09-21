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
    <section className="p-3" id="contact-actions">
      <div className="grid grid-cols-3 gap-2">
        <a
          className="mobile-card-raised flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black"
          href={mapUrl}
          rel="noreferrer"
          target="_blank"
        >
          <MapPinned className="h-4 w-4" />
          지도
        </a>
        <a
          className={`mobile-card-raised flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black ${phone ? "" : "pointer-events-none opacity-45"}`}
          href={phone ? `tel:${phone}` : "#"}
        >
          <Phone className="h-4 w-4" />
          전화
        </a>
        <button
          className="mobile-card-raised flex min-h-14 flex-col items-center justify-center gap-1 rounded-xl border px-2 text-xs font-black"
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
