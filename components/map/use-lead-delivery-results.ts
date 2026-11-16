"use client";

import { useEffect, useState } from "react";
import type { LeadDeliveryResult } from "@/domains/lead/delivery-result";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";

// CC-65: 지도 리드 목록용. 스위치가 꺼져 있거나 못 읽으면 빈 Map(목록은 이전 모양 그대로).
export function useLeadDeliveryResults(): ReadonlyMap<string, LeadDeliveryResult> {
  const [map, setMap] = useState<ReadonlyMap<string, LeadDeliveryResult>>(new Map());
  useEffect(() => {
    let alive = true;
    void fetchWithTimeout("/api/leads/delivery-results", { cache: "no-store" }, 10000)
      .then((response) => (response.ok ? response.json() : null))
      .then((json: { items?: LeadDeliveryResult[] } | null) => { if (alive && json?.items?.length) setMap(new Map(json.items.map((item) => [item.leadId, item]))); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return map;
}
