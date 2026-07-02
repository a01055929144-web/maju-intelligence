"use client";

import { useMemo, useState } from "react";
import { MapPin, Navigation, SlidersHorizontal } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { RouteBatchDistanceAction } from "@/components/route-batch-distance-action";
import { RouteDistanceAction } from "@/components/route-distance-action";
import { RouteSequenceAction } from "@/components/route-sequence-action";
import { VisitResultForm } from "@/components/visit-result-form";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RoutePlanWorkspaceProps = {
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
};

type ViewMode = "map" | "stops" | "route";

export function RoutePlanWorkspace({ mapMarkers, routePlan }: RoutePlanWorkspaceProps) {
  const [viewMode, setViewMode] = useState<ViewMode>("map");
  const [region, setRegion] = useState("all");
  const regions = useMemo(() => routePlan.groups.map((group) => group.region), [routePlan.groups]);
  const filteredGroups = useMemo(
    () => (region === "all" ? routePlan.groups : routePlan.groups.filter((group) => group.region === region)),
    [region, routePlan.groups]
  );
  const filteredStops = filteredGroups.flatMap((group) => group.stops);
  const destinations = filteredStops.map((stop) => stop.address || "").filter(Boolean);
  const filteredMarkers = filterMarkersForStops(mapMarkers, filteredStops, region);

  return (
    <Card>
      <CardHeader className="space-y-4">
        <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
          <CardTitle className="flex items-center gap-2">
            <Navigation className="h-5 w-5 text-primary" />
            방문 동선 작업공간
          </CardTitle>
          <div className="flex flex-wrap gap-2">
            {[
              ["map", "지도"],
              ["stops", "방문순서"],
              ["route", "동선계산"]
            ].map(([key, label]) => (
              <button
                key={key}
                className={`h-9 rounded-md border px-3 text-sm font-bold transition ${
                  viewMode === key ? "border-primary bg-primary text-white" : "border-border bg-white hover:bg-muted"
                }`}
                onClick={() => setViewMode(key as ViewMode)}
                type="button"
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        <div className="flex flex-col gap-3 rounded-md border border-border bg-muted/35 p-3 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-center gap-2 text-sm font-black">
            <SlidersHorizontal className="h-4 w-4 text-primary" />
            지역 필터
          </div>
          <div className="flex flex-wrap gap-2">
            <FilterButton active={region === "all"} label="전체" onClick={() => setRegion("all")} />
            {regions.map((nextRegion) => (
              <FilterButton key={nextRegion} active={region === nextRegion} label={nextRegion} onClick={() => setRegion(nextRegion)} />
            ))}
          </div>
        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {viewMode === "map" ? (
          <div className="space-y-3">
            <KakaoAddressMap markers={filteredMarkers} />
            <p className="text-xs font-bold text-muted-foreground">지도에는 선택한 지역의 방문 후보와 물류 출발지가 표시됩니다.</p>
          </div>
        ) : null}

        {viewMode === "route" ? (
          <div className="space-y-3">
            <RouteBatchDistanceAction destinations={destinations} />
            <RouteSequenceAction destinations={destinations} />
          </div>
        ) : null}

        {viewMode === "stops" ? (
          <RouteStopGroups groups={filteredGroups} />
        ) : null}

        {!filteredGroups.length ? (
          <div className="rounded-md border border-border bg-muted/35 p-6 text-center">
            <MapPin className="mx-auto mb-3 h-8 w-8 text-primary" />
            <p className="font-black">선택한 지역의 방문 예정 리드가 없습니다.</p>
            <p className="mt-1 text-sm text-muted-foreground">다른 지역을 선택하거나 대시보드에서 리드 상태를 변경하세요.</p>
          </div>
        ) : null}
      </CardContent>
    </Card>
  );
}

function RouteStopGroups({ groups }: { readonly groups: RoutePlan["groups"] }) {
  return (
    <div className="space-y-4">
      {groups.map((group) => (
        <div key={group.region} className="rounded-md border border-border p-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-lg font-black">{group.region}</p>
              <p className="text-xs text-muted-foreground">
                {group.stops.length}곳 · {group.totalDistanceKm.toLocaleString()}km · {formatMinutes(group.totalDurationMinutes)} · 예상 월{" "}
                {group.expectedRevenue.toLocaleString()}만원
              </p>
            </div>
            <Badge className="bg-primary/10 text-primary">지역 묶음</Badge>
          </div>
          <div className="space-y-2">
            {group.stops.map((stop) => (
              <div key={stop.id || stop.name} className="rounded-md bg-muted/35 p-3">
                <div className="grid gap-3 sm:grid-cols-[44px_1fr_90px_110px] sm:items-center">
                  <span className="flex h-9 w-9 items-center justify-center rounded-full bg-primary text-sm font-black text-white">{stop.order}</span>
                  <div>
                    <p className="font-bold">{stop.name}</p>
                    <p className="text-xs text-muted-foreground">{stop.region} · 예상 월 {stop.expectedRevenue}만원</p>
                    <p className="mt-1 text-xs text-muted-foreground">{stop.address || "주소 미등록"}</p>
                  </div>
                  <Badge className="justify-center bg-accent/20 text-foreground">{stop.score}점</Badge>
                  <span className="text-xs font-bold text-muted-foreground">방문 후보</span>
                </div>
                <div className="mt-3 rounded-md bg-muted/45 p-3">
                  <RouteDistanceAction
                    destinationAddress={stop.address}
                    distanceKm={stop.distanceKm}
                    durationMinutes={stop.durationMinutes}
                    routeProvider={stop.routeProvider}
                  />
                </div>
                <div className="mt-3 border-t border-border pt-3">
                  <VisitResultForm expectedRevenue={stop.expectedRevenue} leadId={stop.id} />
                </div>
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  );
}

function FilterButton({ active, label, onClick }: { readonly active: boolean; readonly label: string; readonly onClick: () => void }) {
  return (
    <button
      className={`h-8 rounded-md border px-3 text-xs font-black transition ${
        active ? "border-primary bg-primary text-white" : "border-border bg-white hover:bg-muted"
      }`}
      onClick={onClick}
      type="button"
    >
      {label}
    </button>
  );
}

function filterMarkersForStops(markers: KakaoMapMarker[], stops: RoutePlanStop[], region: string) {
  if (region === "all") return markers;
  const stopAddresses = new Set(stops.map((stop) => stop.address).filter(Boolean));
  return markers.filter((marker) => marker.tone === "origin" || stopAddresses.has(marker.address));
}

function formatMinutes(minutes: number) {
  if (!minutes) return "0분";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}
