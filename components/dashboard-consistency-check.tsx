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
    consistencyScore?: number;
    dashboardCustomers?: number;
    duplicateCustomerGroups?: number;
    duplicateCustomerExamples?: Array<{
      customerName: string;
      count: number;
      customers: Array<{ id: string; address: string; normalizedKey: string }>;
    }>;
    estimatedRouteStops?: number;
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
    passedChecks?: number;
    routeCalculationCoverage?: number;
    routeProviderCounts?: Record<string, number>;
    routeStops?: number;
    salesTruncated?: boolean;
    totalChecks?: number;
  };
};

type FixItem = {
  href: string;
  label: string;
  status: string;
  title: string;
  tone: "bad" | "good" | "warn";
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
  const sourceLabel = isSupabase ? "Supabase 실데이터" : payload?.source ? "DB 거래처 원장 미연결" : "확인 중";
  const checkedAt = payload?.checkedAt ? new Date(payload.checkedAt).toLocaleString("ko-KR") : "-";
  const query = companyId ? `?companyId=${encodeURIComponent(companyId)}` : "";
  const dataRegistrationHref = `/${query}`;
  const missingAddressExamples = payload?.summary?.missingAddressExamples || [];
  const duplicateCustomerExamples = payload?.summary?.duplicateCustomerExamples || [];
  const routeProviderCounts = payload?.summary?.routeProviderCounts || {};
  const cachedRouteCount = Number(routeProviderCounts.cached || 0);
  const roadPendingRouteCount = Number(routeProviderCounts.estimated || 0) + Number(routeProviderCounts.sample || 0) + Number(routeProviderCounts.unknown || 0);
  const timelineHref = buildTimelineHref(companyId, payload?.summary?.missingAddressCustomers || 0);
  const routeHref = `/routes/today${query}`;
  const consistencyScore = payload?.summary?.consistencyScore ?? (checks.length ? Math.round((okCount / checks.length) * 100) : 0);
  const routeCoverage = payload?.summary?.routeCalculationCoverage ?? 0;
  const hasPayload = Boolean(payload);
  const fixItems = hasPayload
    ? buildFixItems({
        consistencyScore,
        dashboardCustomers: payload?.summary?.dashboardCustomers || 0,
        dataRegistrationHref,
        isSupabase,
        masterCustomers: payload?.summary?.masterCustomers || 0,
        missingAddressCustomers: payload?.summary?.missingAddressCustomers || 0,
        routeCoverage,
        routeStops: payload?.summary?.routeStops || 0,
        salesTruncated: Boolean(payload?.summary?.salesTruncated),
        timelineHref,
        routeHref
      })
    : [];

  return (
    <section className="maju-section-card">
      <div className="maju-card-header flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <Database className="h-4 w-4 text-teal-700" />
            <h2 className="text-sm font-black text-slate-950">데이터 일치 점검</h2>
            <Badge className={isHealthy ? "bg-emerald-100 text-emerald-800" : "bg-amber-100 text-amber-800"}>
              {loading ? "확인 중" : isHealthy ? "정상" : "확인 필요"}
            </Badge>
            <Badge className="border border-slate-200 bg-white text-slate-600">{sourceLabel}</Badge>
          </div>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-500">대시보드·히스토리·코스의 DB 기준을 확인합니다.</p>
        </div>
        <button
          className="maju-button-secondary shrink-0 disabled:cursor-not-allowed disabled:opacity-60"
          disabled={loading}
          onClick={() => void load()}
          type="button"
        >
          <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
          다시 점검
        </button>
      </div>

      <div className="grid gap-3 px-5 py-4 xl:grid-cols-[minmax(0,1fr)_340px]">
        <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
          <StatusTile label="DB 원장" value={formatCount(payload?.summary?.masterCustomers, "곳")} />
          <StatusTile label="대시보드" value={formatCount(payload?.summary?.dashboardCustomers, "곳")} />
          <StatusTile label="코스 매장" value={formatCount(payload?.summary?.routeStops, "곳")} />
          <StatusTile label="주소 보완" value={formatCount(payload?.summary?.missingAddressCustomers, "곳")} />
          <StatusTile label="실도로 계산" value={formatCount(payload ? cachedRouteCount : undefined, "곳")} />
          <StatusTile label="도로 미계산" value={formatCount(payload ? roadPendingRouteCount : undefined, "곳")} />
        </div>

        <div className="maju-stat-card bg-slate-50/70">
          <p className="maju-muted-label">최근 점검</p>
          <p className="mt-1 text-sm font-black text-slate-950">{checkedAt}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">
            {payload?.latencyMs === undefined ? "응답 대기 중" : `${payload.latencyMs}ms 응답`}
          </p>
        </div>
      </div>

      <div className="grid gap-3 border-t border-slate-100 px-5 py-4 lg:grid-cols-2">
        <ScoreBar
          description={`${okCount}/${Math.max(checks.length, 1)}개 기준 통과`}
          label="데이터 기준 일치율"
          tone={consistencyScore >= 80 ? "good" : consistencyScore >= 50 ? "warn" : "bad"}
          value={consistencyScore}
        />
        <ScoreBar
          description={`실도로 ${cachedRouteCount.toLocaleString()}곳 · 미계산 ${roadPendingRouteCount.toLocaleString()}곳`}
          label="티맵 실제거리 반영률"
          tone={routeCoverage >= 80 ? "good" : routeCoverage >= 40 ? "warn" : "bad"}
          value={routeCoverage}
        />
      </div>

      {error ? (
        <div className="border-t border-amber-200 bg-amber-50 px-5 py-3 text-sm font-bold text-amber-900">{error}</div>
      ) : (
        <div className="grid gap-3 border-t border-slate-100 px-5 py-4 lg:grid-cols-[minmax(0,1fr)_360px]">
          <div className="grid gap-2 md:grid-cols-2">
            {checks.map((check) => (
              <div key={check.label} className={`maju-stat-card ${check.ok ? "border-emerald-100 bg-emerald-50/60" : "border-amber-200 bg-amber-50/70"}`}>
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
              <div className="maju-empty-state p-3 text-sm font-bold text-slate-500">
                {loading ? "데이터 점검 결과를 불러오는 중입니다." : "표시할 점검 결과가 없습니다."}
              </div>
            ) : null}
          </div>

          <div className="maju-panel bg-slate-50/70 p-4">
            <p className="text-sm font-black text-slate-950">우선 조치</p>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">필요한 항목만 바로 보완합니다.</p>
            <div className="mt-3 space-y-2">
              {fixItems.length ? (
                fixItems.map((item) => (
                <Link
                  className={`maju-filter-box block bg-white px-3 py-3 hover:bg-slate-50 ${getFixBorderClass(item.tone)}`}
                  href={item.href}
                  key={item.title}
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-xs font-black text-slate-950">{item.title}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{item.label}</p>
                    </div>
                    <Badge className={getFixBadgeClass(item.tone)}>{item.status}</Badge>
                  </div>
                </Link>
                ))
              ) : (
                <div className="maju-stat-card px-3 py-3 text-xs font-bold leading-5 text-slate-500">
                  {loading ? "데이터 기준을 점검하는 중입니다." : "점검 결과를 불러오면 필요한 조치를 표시합니다."}
                </div>
              )}
            </div>
            <p className="mt-4 text-xs font-black text-slate-500">진단 메모</p>
            <div className="mt-3 space-y-2">
              {(payload?.recommendations || ["점검 결과를 불러온 뒤 다음 조치를 표시합니다."]).slice(0, 3).map((item) => (
                <p key={item} className="maju-stat-card bg-white px-3 py-2 text-xs font-bold leading-5 text-slate-600">
                  {item}
                </p>
              ))}
            </div>
            <p className="mt-3 text-xs font-bold text-slate-500">
              {okCount}/{Math.max(checks.length, 1)}개 기준 통과
            </p>
            {missingAddressExamples.length ? (
              <div className="maju-filter-box mt-3 border-amber-200 bg-amber-50 p-3">
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
            {duplicateCustomerExamples.length ? (
              <div className="maju-filter-box mt-3 border-rose-200 bg-rose-50 p-3">
                <p className="text-xs font-black text-rose-900">거래처 중복 의심</p>
                <div className="mt-2 space-y-1">
                  {duplicateCustomerExamples.slice(0, 4).map((group) => (
                    <p key={group.customerName} className="truncate text-xs font-bold text-rose-900">
                      {group.customerName} · {group.count}개 레코드로 분리됨
                    </p>
                  ))}
                </div>
              </div>
            ) : null}
            {roadPendingRouteCount > 0 ? (
              <div className="maju-filter-box mt-3 border-blue-200 bg-blue-50 p-3">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="text-xs font-black text-blue-950">티맵 거리 계산 필요</p>
                    <p className="mt-1 text-xs font-bold leading-5 text-blue-800">
                      {roadPendingRouteCount.toLocaleString()}곳은 티맵 도로 계산 전입니다. 코스 화면에서 거리 계산을 실행하세요.
                    </p>
                  </div>
                  <Badge className="shrink-0 bg-blue-600 text-white">{cachedRouteCount.toLocaleString()}곳 완료</Badge>
                </div>
              </div>
            ) : null}
          </div>
        </div>
      )}
    </section>
  );
}

function buildFixItems({
  consistencyScore,
  dataRegistrationHref,
  dashboardCustomers,
  isSupabase,
  masterCustomers,
  missingAddressCustomers,
  routeCoverage,
  routeHref,
  routeStops,
  salesTruncated,
  timelineHref
}: {
  readonly consistencyScore: number;
  readonly dataRegistrationHref: string;
  readonly dashboardCustomers: number;
  readonly isSupabase: boolean;
  readonly masterCustomers: number;
  readonly missingAddressCustomers: number;
  readonly routeCoverage: number;
  readonly routeHref: string;
  readonly routeStops: number;
  readonly salesTruncated: boolean;
  readonly timelineHref: string;
}): FixItem[] {
  const items: FixItem[] = [];

  items.push({
    href: dataRegistrationHref,
    label: isSupabase ? "Supabase DB 원장 조회가 정상입니다." : "DB 원장이 연결되지 않으면 대시보드, 히스토리, 코스 숫자를 확정할 수 없습니다.",
    status: isSupabase ? "정상" : "필수",
    title: "DB 연결",
    tone: isSupabase ? "good" : "bad"
  });

  items.push({
    href: dataRegistrationHref,
    label:
      dashboardCustomers === masterCustomers
        ? "대시보드와 DB 원장의 전체 매장 수가 같습니다."
        : `대시보드 ${dashboardCustomers.toLocaleString()}곳, DB 원장 ${masterCustomers.toLocaleString()}곳으로 다릅니다.`,
    status: dashboardCustomers === masterCustomers ? "일치" : "확인",
    title: "거래처 수 일치",
    tone: dashboardCustomers === masterCustomers ? "good" : "warn"
  });

  items.push({
    href: timelineHref,
    label:
      missingAddressCustomers > 0
        ? `주소가 없는 매장 ${missingAddressCustomers.toLocaleString()}곳은 지도와 코스에서 제외될 수 있습니다.`
        : "지도 표시용 주소와 좌표 기준이 준비되어 있습니다.",
    status: missingAddressCustomers > 0 ? "보완" : "정상",
    title: "주소·좌표",
    tone: missingAddressCustomers > 0 ? "warn" : "good"
  });

  items.push({
    href: routeHref,
    label:
      routeCoverage >= 80
        ? `코스 ${routeStops.toLocaleString()}곳의 티맵 도로거리 반영률이 안정적입니다.`
        : "영업·배송 코스에서 티맵 거리 계산을 실행해 도로 미계산 매장을 줄이세요.",
    status: `${routeCoverage}%`,
    title: "티맵 도로거리",
    tone: routeCoverage >= 80 ? "good" : routeCoverage >= 40 ? "warn" : "bad"
  });

  if (salesTruncated) {
    items.push({
      href: dataRegistrationHref,
      label: "매출 원장이 최근 1,000건 기준으로 표시 중입니다. 기간 필터나 페이지네이션 보강이 필요합니다.",
      status: "일부",
      title: "매출 원장 표시 범위",
      tone: "warn"
    });
  }

  return items.sort((a, b) => getFixPriority(a.tone) - getFixPriority(b.tone)).slice(0, consistencyScore >= 90 ? 3 : 4);
}

function buildTimelineHref(companyId: string | undefined, missingAddressCount: number) {
  const params = new URLSearchParams();
  if (companyId) params.set("companyId", companyId);
  if (missingAddressCount > 0) params.set("operationFilter", "address-missing");
  const query = params.toString();
  return query ? `/crm/timeline?${query}` : "/crm/timeline";
}

function getFixBadgeClass(tone: FixItem["tone"]) {
  if (tone === "good") return "shrink-0 bg-emerald-100 text-emerald-800";
  if (tone === "warn") return "shrink-0 bg-amber-100 text-amber-800";
  return "shrink-0 bg-rose-100 text-rose-800";
}

function getFixBorderClass(tone: FixItem["tone"]) {
  if (tone === "good") return "border-emerald-100";
  if (tone === "warn") return "border-amber-200";
  return "border-rose-200";
}

function getFixPriority(tone: FixItem["tone"]) {
  if (tone === "bad") return 0;
  if (tone === "warn") return 1;
  return 2;
}

function StatusTile({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="maju-stat-card">
      <p className="maju-muted-label flex items-center gap-1.5">
        <span className="h-1.5 w-1.5 rounded-full bg-teal-500" />
        {label}
      </p>
      <p className="mt-1 text-xl font-black text-slate-950">{value}</p>
    </div>
  );
}

function ScoreBar({
  description,
  label,
  tone,
  value
}: {
  readonly description: string;
  readonly label: string;
  readonly tone: "bad" | "good" | "warn";
  readonly value: number;
}) {
  const safeValue = Math.max(0, Math.min(100, value));
  const barClass = tone === "good" ? "bg-emerald-600" : tone === "warn" ? "bg-amber-500" : "bg-rose-500";
  const textClass = tone === "good" ? "text-emerald-700" : tone === "warn" ? "text-amber-700" : "text-rose-700";

  return (
    <div className="maju-stat-card p-4">
      <div className="flex items-end justify-between gap-3">
        <div>
          <p className="text-xs font-black text-slate-950">{label}</p>
          <p className="mt-1 text-xs font-bold text-slate-500">{description}</p>
        </div>
        <p className={`text-2xl font-black ${textClass}`}>{safeValue}%</p>
      </div>
      <div className="mt-3 h-2 overflow-hidden rounded-full bg-slate-100">
        <div className={`h-full rounded-full ${barClass}`} style={{ width: `${safeValue}%` }} />
      </div>
    </div>
  );
}

function formatCount(value: number | undefined, suffix: string) {
  if (value === undefined) return "-";
  return `${value.toLocaleString()}${suffix}`;
}
