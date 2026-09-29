"use client";

import { useEffect, useState } from "react";
import { Loader2, RotateCcw, X } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker, KakaoRoutePoint } from "@/components/kakao-address-map";

type FullscreenMapPayload = {
  focusedMarkerId?: string;
  markers?: KakaoMapMarker[];
  routePath?: KakaoRoutePoint[];
};

export default function FullscreenMapPage() {
  const [payload, setPayload] = useState<FullscreenMapPayload | null>(null);
  const [isReady, setIsReady] = useState(false);

  useEffect(() => {
    const mapId = new URLSearchParams(window.location.search).get("mapId");
    if (!mapId) {
      setIsReady(true);
      return;
    }

    const raw = window.localStorage.getItem(mapId) || window.sessionStorage.getItem(mapId);
    if (!raw) {
      setIsReady(true);
      return;
    }

    try {
      setPayload(JSON.parse(raw) as FullscreenMapPayload);
      window.localStorage.removeItem(mapId);
      window.sessionStorage.removeItem(mapId);
    } catch {
      setPayload(null);
    } finally {
      setIsReady(true);
    }
  }, []);

  const markers = payload?.markers || [];

  return (
    <main className="flex h-screen flex-col bg-slate-950 text-white">
      <header className="flex h-14 shrink-0 items-center justify-between border-b border-white/10 px-4">
        <div className="min-w-0">
          <h1 className="truncate text-base font-black">MAJU 전체화면 지도</h1>
          <p className="mt-0.5 truncate text-xs font-bold text-slate-400">
            {!isReady ? "지도 데이터를 불러오는 중" : markers.length ? `경유지 ${markers.length}곳${payload?.routePath?.length ? " · 경로 표시 중" : ""}` : "지도 데이터 없음"}
          </p>
        </div>
        <button
          className="inline-flex h-11 items-center gap-2 rounded-md bg-white px-3 text-sm font-black text-slate-900 hover:bg-slate-100"
          onClick={() => window.close()}
          type="button"
        >
          <X className="h-4 w-4" />
          닫기
        </button>
      </header>
      <section className="min-h-0 flex-1 bg-white">
        {!isReady ? (
          <div className="grid h-full place-items-center bg-slate-50 text-slate-700" role="status">
            <div className="flex items-center gap-2 text-sm font-black"><Loader2 className="h-5 w-5 animate-spin" />지도를 불러오는 중입니다.</div>
          </div>
        ) : markers.length ? (
          <KakaoAddressMap
            focusedMarkerId={payload?.focusedMarkerId}
            mapClassName="h-[calc(100vh-56px)] rounded-none border-0"
            markers={markers}
            routePath={payload?.routePath || []}
            showList={false}
          />
        ) : (
          <div className="grid h-full place-items-center bg-slate-50 p-4 text-center text-slate-900">
            <div className="max-w-md rounded-lg border border-slate-200 bg-white p-4 shadow-sm">
              <p className="text-lg font-black">표시할 지도 데이터가 없습니다.</p>
              <p className="mt-2 text-sm font-bold leading-6 text-slate-500">원래 지도 화면으로 돌아가 전체화면 버튼을 다시 눌러주세요.</p>
              <button className="mt-4 inline-flex h-11 items-center gap-2 rounded-md bg-slate-900 px-4 text-sm font-black text-white hover:bg-slate-800" onClick={() => window.location.reload()} type="button">
                <RotateCcw className="h-4 w-4" /> 다시 불러오기
              </button>
            </div>
          </div>
        )}
      </section>
    </main>
  );
}
