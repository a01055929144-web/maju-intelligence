"use client";

import { useState } from "react";
import { Clock, Navigation } from "lucide-react";
import { Button } from "@/components/ui/button";

type RouteDistanceActionProps = {
  readonly destinationAddress?: string;
  readonly distanceKm?: number;
  readonly durationMinutes?: number;
  readonly routeProvider?: string;
};

type RouteState = {
  distanceKm?: number;
  durationMinutes?: number;
  provider?: string;
};

export function RouteDistanceAction({ destinationAddress, distanceKm, durationMinutes, routeProvider }: RouteDistanceActionProps) {
  const [route, setRoute] = useState<RouteState>({ distanceKm, durationMinutes, provider: routeProvider });
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");

  async function calculateDistance() {
    if (!destinationAddress) return;

    setIsLoading(true);
    setMessage("");

    const response = await fetch("/api/routes/distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinationAddress })
    }).catch(() => null);

    if (!response?.ok) {
      setMessage("계산 실패");
      setIsLoading(false);
      return;
    }

    const payload = await response.json().catch(() => null);
    setRoute({
      distanceKm: payload?.route?.distanceKm,
      durationMinutes: payload?.route?.durationMinutes,
      provider: payload?.route?.provider
    });
    setMessage(payload?.route?.persisted ? "저장됨" : "계산됨");
    setIsLoading(false);
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-2 text-xs font-black text-foreground">
        <Navigation className="h-3.5 w-3.5 text-primary" />
        {route.distanceKm ? `${route.distanceKm}km` : "거리 미계산"}
      </span>
      <span className="inline-flex h-8 items-center gap-1 rounded-md bg-white px-2 text-xs font-black text-foreground">
        <Clock className="h-3.5 w-3.5 text-primary" />
        {route.durationMinutes ? `${route.durationMinutes}분` : "시간 미계산"}
      </span>
      <Button size="sm" variant="outline" className="h-8 px-2 text-xs" disabled={!destinationAddress || isLoading} onClick={calculateDistance}>
        {isLoading ? "계산 중" : "티맵 재계산"}
      </Button>
      {message ? <span className="text-xs font-bold text-muted-foreground">{message}</span> : null}
      {route.provider === "estimated" ? <span className="text-xs font-bold text-amber-700">추정값</span> : null}
    </div>
  );
}
