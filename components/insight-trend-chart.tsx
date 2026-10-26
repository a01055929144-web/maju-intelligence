import type { buildBusinessInsights } from "@/application/analytics/business-insights";

type Trend = ReturnType<typeof buildBusinessInsights>["trend"];
type Metric = "leads" | "contacts" | "quotes" | "contracts";

const metrics: Array<{ key: Metric; label: string; color: string }> = [
  { key: "leads", label: "새 리드", color: "#0f766e" },
  { key: "contacts", label: "연락", color: "#2563eb" },
  { key: "quotes", label: "견적 전달", color: "#d97706" },
  { key: "contracts", label: "계약", color: "#be123c" }
];

export function InsightTrendChart({ trend }: { trend: Trend }) {
  const width = 640;
  const height = 176;
  const left = 28;
  const top = 12;
  const innerWidth = width - left - 8;
  const innerHeight = height - top - 28;
  const maxValue = Math.max(1, ...trend.flatMap((point) => metrics.flatMap(({ key }) => [point.current[key], point.previous[key]])));
  const hasData = trend.some((point) => metrics.some(({ key }) => point.current[key] > 0 || point.previous[key] > 0));
  const points = (key: Metric, period: "current" | "previous") => trend.map((point, index) => {
    const x = left + index / Math.max(1, trend.length - 1) * innerWidth;
    const y = top + (1 - point[period][key] / maxValue) * innerHeight;
    return `${x.toFixed(1)},${y.toFixed(1)}`;
  }).join(" ");

  return (
    <div className="mt-4">
      <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs font-bold text-slate-600">
        {metrics.map((metric) => <span className="inline-flex items-center gap-1.5" key={metric.key}><span className="h-2.5 w-2.5 rounded-full" style={{ background: metric.color }} />{metric.label}</span>)}
        <span className="ml-auto text-slate-500">실선 이번 기간 · 점선 직전 기간</span>
      </div>
      <div className="mt-3 overflow-x-auto">
        <svg aria-label="새 리드, 연락, 견적 전달, 계약의 이번 기간과 직전 기간 추이" className="min-w-[640px] w-full" role="img" viewBox={`0 0 ${width} ${height}`}>
          {[0, 0.5, 1].map((fraction) => <g key={fraction}>
            <line stroke="#e2e8f0" x1={left} x2={width - 8} y1={top + fraction * innerHeight} y2={top + fraction * innerHeight} />
            <text fill="#64748b" fontSize="10" textAnchor="end" x={left - 5} y={top + fraction * innerHeight + 4}>{Math.round(maxValue * (1 - fraction))}</text>
          </g>)}
          {metrics.map((metric) => <g key={metric.key}>
            <polyline fill="none" opacity="0.4" points={points(metric.key, "previous")} stroke={metric.color} strokeDasharray="5 4" strokeWidth="2" />
            <polyline fill="none" points={points(metric.key, "current")} stroke={metric.color} strokeLinecap="round" strokeLinejoin="round" strokeWidth="2.5" />
          </g>)}
          {trend.map((point, index) => <text fill="#64748b" fontSize="10" key={`${point.label}-${index}`} textAnchor="middle" x={left + index / Math.max(1, trend.length - 1) * innerWidth} y={height - 5}>{point.label}</text>)}
        </svg>
      </div>
      {!hasData ? <p className="rounded-lg bg-slate-50 px-3 py-2 text-center text-xs font-bold text-slate-500">선택한 이번·직전 기간에 기록이 없습니다.</p> : null}
      <p className="text-xs font-semibold text-slate-500">각 기간을 같은 수의 구간으로 나누어 비교합니다. 연락은 구간별로 중복 매장을 한 번만 셉니다.</p>
    </div>
  );
}
