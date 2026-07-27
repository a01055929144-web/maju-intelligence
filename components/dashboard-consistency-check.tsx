"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { AlertTriangle, CheckCircle2, Database, RefreshCw } from "lucide-react";
import { Badge } from "@/components/ui/badge";

type ConsistencyCheck = {
  detail: string;
  label: string;
  ok: boolean;
  value: string;
};

type ConsistencyPayload = {
  checkedAt?: string;
  checks?: ConsistencyCheck[];
  latencyMs?: number;
  ok?: boolean;
  recommendations?: string[];
  source?: "sample" | "supabase" | string;
  summary?: {
    dashboardCustomers?: number;
    historyItems?: number;
    mappableRouteStops?: number;
    masterCustomers?: number;
    missingAddressCustomers?: number;
    missingAddressExamples?: Array<{
      customerId?: string;
      customerName: string;
      deliveryManager?: string;
      deliveryZone?: string;
    }>;
    routeStops?: number;
  };
};

export function DashboardConsistencyCheck({ companyId }: { readonly companyId?: string }) {
  const [payload, setPayload] = useState<ConsistencyPayload | null>(null);
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(true);

  const endpoint = useMemo(() => {
    if (!companyId) return "/api/customer/data-consistency";
    return `/api/customer/data-consistency?companyId=${encodeURIComponent(companyId)}`;
  }, [companyId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError("");

    try {
      const response = await fetch(endpoint, { cache: "no-store" });
      const data = (await response.json()) as ConsistencyPayload & { message?: string };

      if (!response.ok && response.status !== 207) {
        throw new Error(data.message || "데이터 점검을 불러오지 못했습니다.");
      }

      setPayload(data);
    } catch (caught) {
      setPayload(null);
      setError(caught instanceof Error ? caught.message : "데이터 점검을 불러오지 못했습니다.");
    } finally {
      setLoading(false);
    }
  }, [endpoint]);

  useEffect(() => {
    void load();
  }, [load]);

  const checks = payload?.checks || [];
  const okCount = checks.filter((check) => check.ok).length;
  const isSupabase = payload?.source === "supabase";
  const isHealthy = Boolean(payload?.ok && isSupabase);
  const sourceLabel = isSupabase ? "Supabase 실데이터" : payload?.source ? "샘플/대체 데이터" : "확인 중";
  const checkedAt = payload?.checkedAt ? new Date(payload.checkedAt).toLocaleString("ko-KR") : "-";
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const missingAddressExamples = payload?.summary?.missingAddressExamples || [];
  const timelineHref = buildTimelineHref(companyId, payload?.summary?.missingAddressCustomers || 0);

  return (
    <section className="overflow-hidden rounded-lg border border-slate-200/80 bg-white shadow-sm">
      <div className="flex flex-col gap-3 border-b border-slate-200/80 bg-white px-5 py-4 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-black text-slate-950">실시간 데이터 일치 점검</h2>
            <Badge className={isHealthy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {loading ? "확인 중" : isHealthy ? "정상" : "확인 필요"}
            </Badge>
            <Badge className="border border-slate-200 bg-white text-slate-600">{sourceLabel}</Badge>
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
            대시보드, 거래처 히스토리, 영업·배송 코스가 같은 거래처 원장을 보고 있는지 API로 직접 확인합니다.
          </p>
        </div>
        <button
          className="inline-flex h-9 shrink-0 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          다시 점검
        </button>
      </div>

      <div className="grid gap-3 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          <StatusTile label="거래처 원장" value={formatCount(payload?.summary?.masterCustomers, "곳")} />
          <StatusTile label="대시보드 거래처" value={formatCount(payload?.summary?.dashboardCustomers, "곳")} />
          <StatusTile label="코스 매장" value={formatCount(payload?.summary?.routeStops, "곳")} />
          <StatusTile label="주소 보완" value={formatCount(payload?.summary?.missingAddressCustomers, "곳")} />
        </div>

        <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
          <p className="text-[11px] font-black uppercase text-slate-400">최근 점검</p>
          <p className="mt-1 text-sm font-black text-slate-950">{checkedAt}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {payload?.latencyMs === undefined ? "응답 대기 중" : `${payload.latencyMs}ms 응답`}
          </p>
        </div>
      </div>

      {error ? (
        <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-900">{error}</div>
      ) : (
        <div className="grid gap-3 border-t border-slate-100 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-2 md:grid-cols-2">
            {checks.map((check) => (
              <div key={check.label} className={`rounded-md border p-3 ${check.ok ? "border-emerald-100 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}`}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-slate-950">{check.label}</p>
                    <p className="mt-1 text-lg font-black text-slate-950">{check.value}</p>
                  </div>
                  {check.ok ? <CheckCircle2 className="h-4 w-4 shrink-0 text-emerald-700" /> : <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />}
                </div>
                <p className="mt-2 text-xs font-bold leading-5 text-slate-600">{check.detail}</p>
              </div>
            ))}
            {!checks.length ? (
              <div className="rounded-md border border-slate-200 bg-slate-50 p-3 text-sm font-bold text-slate-500">
                {loading ? "데이터 점검 결과를 불러오는 중입니다." : "표시할 점검 결과가 없습니다."}
              </div>
            ) : null}
          </div>

          <div className="rounded-md border border-slate-200 bg-slate-50/70 p-4">
            <p className="text-sm font-black text-slate-950">다음 조치</p>
            <div className="mt-3 space-y-2">
              {(payload?.recommendations || ["점검 결과를 불러온 뒤 다음 조치를 표시합니다."]).slice(0, 3).map((item) => (
                <p key={item} className="rounded-md bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-600">
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-3 text-xs font-bold text-slate-500">
              {okCount}/{Math.max(checks.length, 1)}개 기준 통과
            </p>
            {missingAddressExamples.length ? (
              <div className="mt-3 rounded-md border border-amber-200 bg-amber-50 p-3">
                <p className="text-xs font-black text-amber-900">주소 보완 대상</p>
                <div className="mt-2 space-y-1">
                  {missingAddressExamples.slice(0, 4).map((customer) => (
                    <p key={customer.customerId || customer.customerName} className="truncate text-xs font-bold text-amber-900">
                      {customer.customerName} · {customer.deliveryZone || "권역 미지정"} · {customer.deliveryManager || "담당자 미지정"}
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            <div className="mt-3 grid gap-2 sm:grid-cols-3 lg:grid-cols-1">
              <QuickFixLink href={`/${query}`} label="데이터 등록" />
              <QuickFixLink href={timelineHref} label={missingAddressExamples.length ? "주소 보완 열기" : "거래처 히스토리"} />
              <QuickFixLink href={`/routes/today${query}`} label="코스 관리" />
            </div>
          </div>
        </div>
      )}
    </section>
  );
}

function QuickFixLink({ href, label }: { readonly href: string; readonly label: string }) {
  return (
    <Link className="inline-flex h-9 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-xs font-black text-slate-700 hover:bg-slate-50" href={href}>
      {label}
    </Link>
  );
}

function buildTimelineHref(companyId: string | undefined, missingAddressCount: number) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (missingAddressCount > 0) params.set("operationFilter", "address-missing");
  const query = params.toString();
  return query ? `/crm/timeline?${query}` : "/crm/timeline";
}

function StatusTile({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md border border-slate-200 bg-slate-50/70 p-3">
      <p className="text-[11px] font-black uppercase text-slate-400">{label}</p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function formatCount(value: number | undefined, suffix: string) {
  if (value === undefined) return "-";
  return `${value.toLocaleString()}${suffix}`;
}
