"use client";

import { useMemo, useState } from "react";
import { GitBranch, Loader2 } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker, KakaoRoutePoint } from "@/components/kakao-address-map";
import { Button } from "@/components/ui/button";

type RouteSequenceActionProps = {
  readonly buttonLabel?: string;
  readonly destinations: readonly string[];
  readonly onSequenceChange?: (sequence: RouteSequence | null) => void;
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

export type RouteSequence = {
  legs: RouteLeg[];
  originAddress: string;
  path: KakaoRoutePoint[];
  stops: string[];
  totalDistanceKm: number;
  totalDurationMinutes: number;
};

export function RouteSequenceAction({
  buttonLabel = "경유 동선 연결",
  destinations,
  onSequenceChange,
  resultTitle = "티맵 실제 도로 경로"
  ,
  showMap = true
}: RouteSequenceActionProps) {
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const [sequence, setSequence] = useState<RouteSequence | null>(null);
  const uniqueDestinations = useMemo(() => Array.from(new Set(destinations.filter(Boolean))).slice(0, 15), [destinations]);
  const routeMarkers = useMemo(() => (sequence ? createRouteMarkers(sequence) : []), [sequence]);

  async function calculateSequence() {
    if (!uniqueDestinations.length) return;

    setIsLoading(true);
    setMessage("");

    const response = await fetch("/api/routes/sequence", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinations: uniqueDestinations })
    }).catch(() => null);

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
    const routePathCount = Number(payload?.routeSequence?.path?.length || 0);
    setMessage(routePathCount ? "티맵 도로 경로 계산됨" : "거리/시간 계산됨 · 도로 좌표 없음");
    setIsLoading(false);
  }

  return (
    <div className="space-y-3 rounded-md border border-border bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant="outline" className="gap-2" disabled={!uniqueDestinations.length || isLoading} onClick={calculateSequence}>
          {isLoading ? <Loader2 className="h-4 w-4 animate-spin" /> : <GitBranch className="h-4 w-4" />}
          {isLoading ? "경유 계산 중" : buttonLabel}
        </Button>
        {message ? <span className="text-xs font-bold text-muted-foreground">{message}</span> : null}
      </div>
      {!sequence ? (
        <p className="text-xs font-bold text-muted-foreground">
          선택한 배송지 {uniqueDestinations.length}곳을 출발지 기준 가까운 경유지부터 재정렬합니다. 버튼을 누르면 티맵 거리·시간과 실제 도로 경로를 계산합니다.
        </p>
      ) : null}

      {sequence ? (
        <div className="space-y-2">
          <div className="flex flex-wrap gap-2 text-xs font-black">
            <span className="rounded-md bg-muted px-2 py-1">총 {sequence.totalDistanceKm.toLocaleString()}km</span>
            <span className="rounded-md bg-muted px-2 py-1">총 {formatMinutes(sequence.totalDurationMinutes)}</span>
            <span className="rounded-md bg-muted px-2 py-1">최적 순서 {sequence.legs.length}개 구간</span>
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
                {leg.provider === "estimated" ? <span className="font-bold text-amber-700"> · 추정</span> : null}
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
              <p className="text-xs text-amber-800">
                이 경우는 티맵 키/주소 지오코딩/요청 제한 중 하나로 실제 도로 geometry가 반환되지 않은 상태입니다. 주소 목록과 선택 배송지는 유지됩니다.
              </p>
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
