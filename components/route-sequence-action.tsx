"use client";

import { useMemo, useState } from "react";
import { AlertCircle, CheckCircle2, GitBranch, Loader2, RotateCcw } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker, KakaoRoutePoint } from "@/components/kakao-address-map";
import { Button } from "@/components/ui/button";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

type RouteSequenceActionProps = {
  readonly buttonLabel?: string;
  readonly destinations: readonly string[];
  readonly onSequenceChange?: (sequence: RouteSequence | null) => void;
  readonly originAddress?: string;
  readonly resultTitle?: string;
  readonly showMap?: boolean;
};

type RouteLeg = {
  distanceKm: number;
  durationMinutes: number;
  fromAddress: string;
  order: number;
  provider: string;
  toAddress: string;
};

export type GeoPoint = { lat: number; lng: number };

export type RouteSequence = {
  legs: RouteLeg[];
  originAddress: string;
  originPoint?: GeoPoint | null;
  path: KakaoRoutePoint[];
  stops: string[];
  stopPoints?: Array<GeoPoint | null>;
  totalDistanceKm: number;
  totalDurationMinutes: number;
};

export function RouteSequenceAction({
  buttonLabel = "경유 동선 연결",
  destinations,
  onSequenceChange,
  originAddress,
  resultTitle = "티맵 실제 도로 경로",
  showMap = true
}: RouteSequenceActionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sequence, setSequence] = useState<RouteSequence | null>(null);
  const uniqueDestinations = useMemo(() => Array.from(new Set(destinations.filter(Boolean))).slice(0, 15), [destinations]);
  const routeMarkers = useMemo(() => (sequence ? createRouteMarkers(sequence) : []), [sequence]);
  const hasError = message === "경유 계산 실패";

  async function calculateSequence() {
    if (!uniqueDestinations.length) return;

    setIsLoading(true);
    setMessage("");

    const response = await fetchWithTimeout("/api/routes/sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinations: uniqueDestinations, originAddress })
    }, 20000).catch(() => null);

    if (!response?.ok) {
      setMessage("경유 계산 실패");
      setSequence(null);
      onSequenceChange?.(null);
      setIsLoading(false);
      return;
    }

    const payload = await response.json().catch(() => null);
    const nextSequence = payload?.routeSequence || null;
    setSequence(nextSequence);
    onSequenceChange?.(nextSequence);
    const routePathCount = countFiniteRoutePoints(payload?.routeSequence?.path || []);
    setMessage(routePathCount ? "티맵 도로 경로 계산됨" : "거리/시간 계산됨 · 도로 좌표 없음");
    setIsLoading(false);
  }

  return (
    <div className="space-y-3 rounded-lg border border-border bg-white p-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="min-w-0">
          <p className="text-sm font-black text-foreground">
            {sequence ? "2. 최적 순서 확인" : `1. 경유지 ${uniqueDestinations.length}곳 선택됨`}
          </p>
          <p className="mt-0.5 text-xs font-semibold text-muted-foreground">
            {sequence ? "거리와 방문 순서를 확인한 뒤 아래에서 코스를 확정하세요." : uniqueDestinations.length ? "선택한 경유지로 실제 도로 순서를 계산합니다." : "먼저 오늘 배송할 매장을 선택하세요."}
          </p>
        </div>
        <Button size="sm" variant={sequence ? "outline" : "default"} className="gap-2" disabled={!uniqueDestinations.length || isLoading} onClick={calculateSequence}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : hasError ? <RotateCcw className="h-4 w-4" /> : <GitBranch className="h-4 w-4" />}
          {isLoading ? "최적 순서 계산 중" : hasError ? "다시 계산" : sequence ? "순서 다시 계산" : buttonLabel}
        </Button>
      </div>
      {isLoading ? (
        <div className="flex items-center gap-2 rounded-md bg-blue-50 px-3 py-2 text-xs font-bold text-blue-800" role="status">
          <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
          선택한 {uniqueDestinations.length}곳의 거리와 최적 순서를 계산하고 있습니다.
        </div>
      ) : hasError ? (
        <div className="flex items-start gap-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs font-bold leading-5 text-rose-800" role="alert">
          <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
          <span>계산하지 못했습니다. 연결 상태를 확인한 뒤 <strong>다시 계산</strong>을 눌러주세요. 선택한 경유지는 유지됩니다.</span>
        </div>
      ) : sequence ? (
        <div className="flex items-center gap-2 rounded-md bg-emerald-50 px-3 py-2 text-xs font-bold text-emerald-800" role="status">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          최적 순서 계산 완료 · 결과가 맞으면 코스를 확정하세요.
        </div>
      ) : null}

      {sequence ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-md bg-muted px-2 py-1">총 {sequence.totalDistanceKm.toLocaleString()}km</span>
            <span className="rounded-md bg-muted px-2 py-1">총 {formatMinutes(sequence.totalDurationMinutes)}</span>
            <span className="rounded-md bg-muted px-2 py-1">경유 {sequence.stops.length}곳 · {sequence.legs.length}개 구간</span>
            <span className="rounded-md bg-muted px-2 py-1">도로 좌표 {countFiniteRoutePoints(sequence.path).toLocaleString()}개</span>
          </div>
          <div className="space-y-1">
            {sequence.legs.map((leg) => (
              <div key={`${leg.order}-${leg.toAddress}`} className="rounded-md bg-muted/45 p-2 text-xs leading-5">
                <span className="font-black">{leg.order}구간</span>
                <span className="text-muted-foreground">
                  {" "}
                  {shortenAddress(leg.fromAddress)} → {shortenAddress(leg.toAddress)}
                </span>
                <span className="font-bold"> · {leg.distanceKm}km · {formatMinutes(leg.durationMinutes)}</span>
                {leg.provider === "estimated" ? <span className="font-bold text-amber-700"> · 티맵 계산 전</span> : null}
              </div>
            ))}
          </div>
          {showMap && sequence.path.length ? (
            <div className="pt-2">
              <p className="mb-2 text-xs font-black text-muted-foreground">{resultTitle}</p>
              <KakaoAddressMap markers={routeMarkers} routePath={sequence.path} showList={false} />
            </div>
          ) : !sequence.path.length ? (
            <div className="space-y-2 rounded-md border border-amber-200 bg-amber-50 p-3">
              <p className="text-xs font-bold text-amber-800">티맵 도로 좌표가 없어 구간 거리/시간만 표시합니다.</p>
              <p className="text-xs text-amber-800">순서와 거리·시간은 확인할 수 있으며, 선택한 배송지는 유지됩니다.</p>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}

function formatMinutes(minutes: number) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

function shortenAddress(address: string) {
  const words = address.split(/\s+/).filter(Boolean);
  return words.slice(0, 3).join(" ") || address;
}

function countFiniteRoutePoints(path: KakaoRoutePoint[]) {
  return path.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)).length;
}

function createRouteMarkers(sequence: RouteSequence): KakaoMapMarker[] {
  const stopMarkers = sequence.stops.map((address, index) => ({
    address,
    label: String(index + 1),
    name: `경유 ${index + 1}`,
    tone: "customer" as const,
    x: 24 + ((index * 13) % 58),
    y: 28 + ((index * 17) % 44)
  }));

  return [
    {
      address: sequence.originAddress,
      label: "출발",
      name: "물류 출발지",
      tone: "origin",
      x: 72,
      y: 62
    },
    ...stopMarkers
  ];
}
