"use client";

import { useState } from "react";
import { CheckCircle2, Copy, Loader2, MapPinned, Navigation, Phone } from "lucide-react";

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
  const [loggingAction, setLoggingAction] = useState("");
  const [saveMessage, setSaveMessage] = useState("");
  const routeLabel = `${distanceKm || 0}km · ${durationMinutes || 0}분`;
  const mapUrl = `https://map.kakao.com/link/search/${encodeURIComponent(address || customerName)}`;

  async function logFieldAction(actionLabel: string, nextAction: string) {
    setLoggingAction(actionLabel);
    setSaveMessage("");
    const response = await fetch("/api/customer-operations", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      keepalive: true,
      body: JSON.stringify({
        action: "note",
        customerId,
        memo: `[모바일 현장 액션] ${actionLabel}\n거래처: ${customerName}\n주소: ${address || "주소 확인 필요"}\n예상 이동: ${routeLabel}`,
        nextAction,
        noteType: "route_action"
      })
    }).catch(() => null);

    setLoggingAction("");
    setSaveMessage(response?.ok ? `${actionLabel} 기록됨` : `${actionLabel} 기록 실패`);
    return Boolean(response?.ok);
  }

  async function copyAddress() {
    try {
      await navigator.clipboard.writeText(address || customerName);
      setCopyMessage("주소를 복사했습니다.");
      await logFieldAction("주소 복사", "복사 후 현장 이동");
    } catch {
      setCopyMessage("복사 권한을 받을 수 없습니다.");
      await logFieldAction("주소 복사 실패", "주소 수동 확인");
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
          onClick={() => void logFieldAction("지도 열기", "지도 확인 후 방문")}
          rel="noreferrer"
          target="_blank"
        >
          {loggingAction === "지도 열기" ? <Loader2 className="h-4 w-4 animate-spin" /> : <MapPinned className="h-4 w-4" />}
          지도 열기
        </a>
        <a
          className={`flex h-11 items-center justify-center gap-2 rounded-lg border border-slate-200 bg-white px-3 text-sm font-black ${phone ? "text-slate-800" : "pointer-events-none text-slate-300"}`}
          href={phone ? `tel:${phone}` : "#"}
          onClick={() => {
            if (phone) void logFieldAction("전화 연결", "통화 결과 기록");
          }}
        >
          {loggingAction === "전화 연결" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Phone className="h-4 w-4" />}
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
          onClick={() => void logFieldAction("배송완료 화면 이동", "배송완료 증빙 저장")}
        >
          {loggingAction === "배송완료 화면 이동" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CheckCircle2 className="h-4 w-4" />}
          배송완료
        </a>
      </div>
      {copyMessage ? <p className="mt-2 text-xs font-bold text-teal-700">{copyMessage}</p> : null}
      {saveMessage ? (
        <p className={`mt-2 rounded-lg px-3 py-2 text-xs font-bold ${saveMessage.includes("실패") ? "bg-rose-50 text-rose-700" : "bg-white text-teal-700"}`}>
          {saveMessage}
        </p>
      ) : null}
    </section>
  );
}
