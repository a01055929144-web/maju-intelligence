"use client";

import { Notice, type NoticeKind } from "@/components/ui/notice";
import { useState } from "react";
import { Camera, CheckCircle2, Copy, MapPinned, Phone } from "lucide-react";
import { copyText } from "@/lib/copy-text";
import { startKakaoNavi, type GeoPoint } from "@/lib/navigation-links";

export function MobileRouteActionPanel({
  address,
  customerName,
  phone,
  point
}: {
  address: string;
  customerId: string;
  customerName: string;
  distanceKm?: number;
  durationMinutes?: number;
  phone?: string;
  point?: GeoPoint | null;
}) {
  const [copyMessage, setCopyMessage] = useState<{ kind: NoticeKind; text: string } | null>(null);

  async function openNavigation() {
    const result = await startKakaoNavi({ address, name: customerName, point: point || null });
    if (result === "map-link") setCopyMessage({ kind: "success", text: "좌표를 확인하지 못해 카카오맵 길찾기를 열었습니다." });
  }

  async function copyAddress() {
    setCopyMessage((await copyText(address || customerName))
      ? { kind: "success", text: "주소를 복사했습니다." }
      : { kind: "error", text: "복사 권한을 받을 수 없습니다." });
  }

  return (
    <section id="contact-actions">
      <div className="grid grid-cols-[1fr_1fr_44px] gap-2">
        <button
          className="mobile-primary-action flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold shadow-sm"
          onClick={() => void openNavigation()}
          type="button"
        >
          <MapPinned className="h-4 w-4" />
          카카오내비 길 안내
        </button>
        <a
          className={`mobile-primary-action flex min-h-14 items-center justify-center gap-2 rounded-xl px-2 text-sm font-bold shadow-sm ${phone ? "" : "pointer-events-none opacity-45"}`}
          href={phone ? `tel:${phone}` : "#"}
        >
          <Phone className="h-4 w-4" />
          전화하기
        </a>
        <button
          aria-label="주소 복사"
          className="mobile-card-raised grid min-h-14 place-items-center rounded-xl border"
          onClick={copyAddress}
          type="button"
        >
          <Copy className="h-4 w-4" />
        </button>
        <a
          className="mobile-card-raised col-span-1 flex min-h-12 items-center justify-center gap-2 rounded-xl border px-3 text-sm font-bold"
          href="#loading-position"
        >
          <Camera className="h-4 w-4" />
          적재위치
        </a>
        <a
          className="mobile-primary-action col-span-2 flex min-h-12 items-center justify-center gap-2 rounded-xl px-3 text-sm font-bold shadow-sm"
          href="#delivery-proof"
        >
          <CheckCircle2 className="h-4 w-4" />
          배송 완료
        </a>
      </div>
      {copyMessage ? <Notice className="mt-2" kind={copyMessage.kind}>{copyMessage.text}</Notice> : null}
    </section>
  );
}
