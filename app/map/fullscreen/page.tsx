"use client";

import { useEffect, useState } from "react";
import { X } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker, KakaoRoutePoint } from "@/components/kakao-address-map";

type FullscreenMapPayload = {
  focusedMarkerId?: string;
  markers?: KakaoMapMarker[];
  routePath?: KakaoRoutePoint[];
};

export default function FullscreenMapPage() {
  const [payload, setPayload] = useState<FullscreenMapPayload | null>(null);

  useEffect(() => {
    const mapId = new URLSearchParams(window.location.search).get("mapId");
    if (!mapId) return;

    const raw = window.sessionStorage.getItem(mapId);
    if (!raw) return;

    try {
      setPayload(JSON.parse(raw) as FullscreenMapPayload);
    } catch {
      setPayload(null);
    }
  }, []);

  const markers = payload?.markers || [];

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-black">MAJU 내부 큰 지도</h1>
          <p className="mt-0.5 truncate text-xs font-bold text-slate-400">현재 화면의 마커와 경로를 그대로 크게 표시합니다.</p>
        </div>
        <button
          className="inline-flex h-9 items-center gap-2 rounded-md bg-white px-3 text-sm font-black text-slate-900 hover:bg-slate-100"
          onClick={() => window.close()}
          type="button"
        >
          <X className="h-4 w-4" />
          닫기
        </button>
      </header>
      <section className="min-h-0 flex-1 bg-white">
        {markers.length ? (
          <KakaoAddressMap
            focusedMarkerId={payload?.focusedMarkerId}
            mapClassName="h-[calc(100vh-56px)] rounded-none border-0"
            markers={markers}
            routePath={payload?.routePath || []}
            showList={false}
          />
        ) : (
          <div className="grid h-full place-items-center bg-slate-50 p-6 text-center text-slate-900">
            <div className="max-w-md rounded-lg border border-slate-200 bg-white p-6 shadow-sm">
              <p className="text-lg font-black">표시할 지도 데이터가 없습니다.</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">
                원래 지도 화면에서 큰 지도 버튼을 다시 눌러주세요. 브라우저가 임시 지도 데이터를 차단한 경우 새창에 전달되지 않을 수 있습니다.
              </p>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
