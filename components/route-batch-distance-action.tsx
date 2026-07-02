"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { RefreshCw } from "lucide-react";
import { Button } from "@/components/ui/button";

type RouteBatchDistanceActionProps = {
  readonly destinations: readonly string[];
};

export function RouteBatchDistanceAction({ destinations }: RouteBatchDistanceActionProps) {
  const router = useRouter();
  const [isLoading, setIsLoading] = useState(false);
  const [message, setMessage] = useState("");
  const uniqueDestinations = useMemo(() => Array.from(new Set(destinations.filter(Boolean))), [destinations]);

  async function calculateAll() {
    if (!uniqueDestinations.length) return;

    setIsLoading(true);
    setMessage("");

    const response = await fetch("/api/routes/batch-distance", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ destinations: uniqueDestinations })
    }).catch(() => null);

    if (!response?.ok) {
      setMessage("계산 실패");
      setIsLoading(false);
      return;
    }

    const payload = await response.json().catch(() => null);
    setMessage(`${payload?.summary?.count || uniqueDestinations.length}곳 저장`);
    setIsLoading(false);
    router.refresh();
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <Button size="sm" className="gap-2" disabled={!uniqueDestinations.length || isLoading} onClick={calculateAll}>
        <RefreshCw className={`h-4 w-4 ${isLoading ? "animate-spin" : ""}`} />
        {isLoading ? "전체 계산 중" : "전체 거리 계산"}
      </Button>
      {message ? <span className="text-xs font-bold text-muted-foreground">{message}</span> : null}
    </div>
  );
}
