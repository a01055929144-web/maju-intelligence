"use client";

import type { ReactNode } from "react";
import { useEffect, useMemo, useState } from "react";
import { Car, Clock3, Fuel, MapPinned, RefreshCw, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import type { StaffRouteDailySummary } from "@/lib/store";

type RouteCostTotals = {
  actualDistanceKm: number;
  drivingMinutes: number;
  estimatedFuelCostWon: number;
  estimatedLaborCostWon: number;
  estimatedTotalCostWon: number;
  locationEventCount: number;
  visitedCustomerCount: number;
};

const daysOptions = [7, 30, 90] as const;

function formatWon(value: number) {
  return `${Math.round(value).toLocaleString("ko-KR")}원`;
}

function formatMinutes(value: number) {
  if (value < 60) return `${value}분`;
  const hours = Math.floor(value / 60);
  const minutes = value % 60;
  return minutes ? `${hours}시간 ${minutes}분` : `${hours}시간`;
}

function getCostBasisLabel(summaries: StaffRouteDailySummary[]) {
  const basis = summaries.find((summary) => summary.costBasis)?.costBasis;
  const fuelWonPerKm = Number(basis?.fuelWonPerKm || 180);
  const laborWonPerHour = Number(basis?.laborWonPerHour || 12000);
  return `유류비 ${fuelWonPerKm.toLocaleString("ko-KR")}원/km · 인건비 ${laborWonPerHour.toLocaleString("ko-KR")}원/h`;
}

export function StaffRouteCostSummaryPanel() {
  const [days, setDays] = useState<(typeof daysOptions)[number]>(30);
  const [loading, setLoading] = useState(true);
  const [message, setMessage] = useState("");
  const [summaries, setSummaries] = useState<StaffRouteDailySummary[]>([]);
  const [totals, setTotals] = useState<RouteCostTotals>({
    actualDistanceKm: 0,
    drivingMinutes: 0,
    estimatedFuelCostWon: 0,
    estimatedLaborCostWon: 0,
    estimatedTotalCostWon: 0,
    locationEventCount: 0,
    visitedCustomerCount: 0
  });

  async function loadSummaries(nextDays = days) {
    setLoading(true);
    setMessage("");
    const response = await fetch(`/api/staff/route-costs?days=${nextDays}`, { cache: "no-store" });
    const payload = await response.json().catch(() => null);
    setLoading(false);

    if (!response.ok) {
      setMessage(payload?.error || "배송 비용 데이터를 불러오지 못했습니다.");
      return;
    }

    setSummaries(Array.isArray(payload?.summaries) ? payload.summaries : []);
    setTotals(payload?.totals || totals);
  }

  useEffect(() => {
    void loadSummaries(days);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [days]);

  const driverCount = useMemo(() => new Set(summaries.map((summary) => summary.userId || summary.driverName)).size, [summaries]);
  const costBasisLabel = useMemo(() => getCostBasisLabel(summaries), [summaries]);

  return (
    <section className="rounded-xl border border-slate-200 bg-white shadow-sm">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-100 px-5 py-4">
        <div>
          <div className="flex items-center gap-2">
            <Route className="h-5 w-5 text-teal-700" />
            <h2 className="text-base font-bold text-slate-950">배송 GPS 비용</h2>
            <Badge className="bg-white">{driverCount}명</Badge>
          </div>
          <p className="mt-1 text-sm text-slate-500">모바일 위치 기록 기준으로 실제 이동거리와 예상 물류비를 집계합니다.</p>
          <p className="mt-1 text-xs font-semibold text-slate-400">{costBasisLabel}</p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
            {daysOptions.map((option) => (
              <button
                className={`rounded-md px-3 py-1.5 text-sm font-semibold transition ${
                  days === option ? "bg-teal-700 text-white shadow-sm" : "text-slate-600 hover:bg-white"
                }`}
                key={option}
                onClick={() => setDays(option)}
                type="button"
              >
                {option}일
              </button>
            ))}
          </div>
          <Button disabled={loading} onClick={() => loadSummaries()} size="sm" type="button" variant="outline">
            <RefreshCw className={`h-4 w-4 ${loading ? "animate-spin" : ""}`} />
            새로고침
          </Button>
        </div>
      </div>

      <div className="grid gap-3 p-5 sm:grid-cols-2 xl:grid-cols-4">
        <SummaryCard icon={<MapPinned className="h-4 w-4" />} label="실제 이동거리" value={`${totals.actualDistanceKm.toLocaleString("ko-KR")}km`} />
        <SummaryCard icon={<Clock3 className="h-4 w-4" />} label="운행 시간" value={formatMinutes(totals.drivingMinutes)} />
        <SummaryCard icon={<Fuel className="h-4 w-4" />} label="유류비 추정" value={formatWon(totals.estimatedFuelCostWon)} />
        <SummaryCard icon={<Car className="h-4 w-4" />} label="총 물류비 추정" value={formatWon(totals.estimatedTotalCostWon)} />
      </div>

      <div className="px-5 pb-5">
        {message ? <div className="mb-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm font-semibold text-amber-800">{message}</div> : null}
        <div className="overflow-hidden rounded-lg border border-slate-200">
          <div className="max-h-[360px] overflow-auto">
            <table className="w-full min-w-[860px] border-collapse text-sm">
              <thead className="sticky top-0 z-10 bg-slate-50 text-xs font-bold uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-3 py-3 text-left">일자</th>
                  <th className="px-3 py-3 text-left">담당자</th>
                  <th className="px-3 py-3 text-left">차량</th>
                  <th className="px-3 py-3 text-right">거리</th>
                  <th className="px-3 py-3 text-right">시간</th>
                  <th className="px-3 py-3 text-right">방문</th>
                  <th className="px-3 py-3 text-right">위치기록</th>
                  <th className="px-3 py-3 text-right">추정 비용</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {loading ? (
                  <tr>
                    <td className="px-3 py-8 text-center font-semibold text-slate-500" colSpan={8}>
                      배송 GPS 비용을 불러오는 중입니다.
                    </td>
                  </tr>
                ) : summaries.length ? (
                  summaries.map((summary) => (
                    <tr className="hover:bg-slate-50" key={summary.id}>
                      <td className="px-3 py-3 font-semibold text-slate-900">{summary.routeDate}</td>
                      <td className="px-3 py-3 text-slate-700">{summary.driverName}</td>
                      <td className="px-3 py-3 text-slate-600">{summary.deliveryVehicle || "미지정"}</td>
                      <td className="px-3 py-3 text-right font-semibold text-slate-900">{summary.actualDistanceKm.toLocaleString("ko-KR")}km</td>
                      <td className="px-3 py-3 text-right text-slate-700">{formatMinutes(summary.drivingMinutes)}</td>
                      <td className="px-3 py-3 text-right text-slate-700">{summary.visitedCustomerCount.toLocaleString("ko-KR")}곳</td>
                      <td className="px-3 py-3 text-right text-slate-700">{summary.locationEventCount.toLocaleString("ko-KR")}건</td>
                      <td className="px-3 py-3 text-right font-bold text-teal-700">{formatWon(summary.estimatedTotalCostWon)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-8 text-center font-semibold text-slate-500" colSpan={8}>
                      아직 집계된 배송 GPS 비용이 없습니다.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </section>
  );
}

function SummaryCard({ icon, label, value }: { icon: ReactNode; label: string; value: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-3">
      <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wide text-slate-500">
        <span className="text-teal-700">{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-xl font-black text-slate-950">{value}</div>
    </div>
  );
}
