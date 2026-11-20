"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type FavoriteStatus = "disabled" | "error" | "forbidden" | "loading" | "ready";

function selectedCompanyId() {
  if (typeof window === "undefined") return "";
  return new URLSearchParams(window.location.search).get("companyId") || "";
}

export function useLeadFavorites(leadIds: string[]) {
  const key = leadIds.join(",");
  const [favoriteIds, setFavoriteIds] = useState<Set<string>>(new Set());
  const [status, setStatus] = useState<FavoriteStatus>(leadIds.length ? "loading" : "ready");
  const [error, setError] = useState("");
  const [busyLeadId, setBusyLeadId] = useState("");
  const [revision, setRevision] = useState(0);

  useEffect(() => {
    const ids = key ? key.split(",") : [];
    if (!ids.length) { setFavoriteIds(new Set()); setStatus("ready"); return; }
    const controller = new AbortController();
    setStatus("loading"); setError("");
    void (async () => {
      const next = new Set<string>();
      for (let index = 0; index < ids.length; index += 100) {
        const query = new URLSearchParams();
        ids.slice(index, index + 100).forEach((id) => query.append("leadId", id));
        const companyId = selectedCompanyId();
        if (companyId) query.set("companyId", companyId);
        const response = await fetch(`/api/leads/favorites?${query}`, { cache: "no-store", signal: controller.signal });
        if (response.status === 404) { setFavoriteIds(new Set()); setStatus("disabled"); return; }
        if (response.status === 403) { setFavoriteIds(new Set()); setStatus("forbidden"); return; }
        if (!response.ok) throw new Error("즐겨찾기를 불러오지 못했습니다.");
        const body = await response.json() as { favorites?: Array<{ leadId?: string }> };
        body.favorites?.forEach((favorite) => { if (favorite.leadId) next.add(favorite.leadId); });
      }
      setFavoriteIds(next); setStatus("ready");
    })().catch((cause) => {
      if (controller.signal.aborted) return;
      setError(cause instanceof Error ? cause.message : "즐겨찾기를 불러오지 못했습니다.");
      setStatus("error");
    });
    return () => controller.abort();
  }, [key, revision]);

  const toggle = useCallback(async (leadId: string) => {
    const starred = !favoriteIds.has(leadId);
    setBusyLeadId(leadId); setError("");
    try {
      const companyId = selectedCompanyId();
      const response = await fetch(`/api/leads/${encodeURIComponent(leadId)}/favorite`, {
        method: "PUT", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...(companyId ? { companyId } : {}), starred })
      });
      if (response.status === 404) { setStatus("disabled"); return; }
      if (response.status === 403) { setStatus("forbidden"); return; }
      if (!response.ok) throw new Error("즐겨찾기를 바꾸지 못했습니다.");
      const body = await response.json() as { favorite?: { starred?: boolean } };
      setFavoriteIds((current) => {
        const next = new Set(current);
        if (body.favorite?.starred === true) next.add(leadId); else next.delete(leadId);
        return next;
      });
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "즐겨찾기를 바꾸지 못했습니다.");
      setStatus("error");
    } finally { setBusyLeadId(""); }
  }, [favoriteIds]);

  return useMemo(() => ({
    busyLeadId, error, favoriteIds, retry: () => setRevision((value) => value + 1), status, toggle
  }), [busyLeadId, error, favoriteIds, status, toggle]);
}
