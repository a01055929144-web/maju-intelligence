"use client";

import { useMemo, useState } from "react";
import { CalendarDays, Clock, MapPin, Navigation, RefreshCw, Search } from "lucide-react";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { RoutePlan, RoutePlanStop } from "@/lib/store";

type RevenueGrade = "A" | "B" | "C";
type GradeFilter = "all" | RevenueGrade;

type StoreRow = RoutePlanStop & {
  grade: RevenueGrade;
  markerX: number;
  markerY: number;
};

type SalesRouteMapWorkspaceProps = {
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
};

const gradeFilters: Array<{ label: string; value: GradeFilter }> = [
  { label: "전체", value: "all" },
  { label: "A등급", value: "A" },
  { label: "B등급", value: "B" },
  { label: "C등급", value: "C" }
];

export function SalesRouteMapWorkspace({ mapMarkers, routePlan }: SalesRouteMapWorkspaceProps) {
  const [query, setQuery] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  const [selectedId, setSelectedId] = useState("");
  const stores = useMemo(() => createStoreRows(routePlan, mapMarkers), [mapMarkers, routePlan]);
  const visibleStores = useMemo(
    () =>
      stores.filter((store) => {
        const keyword = query.trim().toLowerCase();
        const matchesQuery = !keyword || `${store.name} ${store.region} ${store.address || ""}`.toLowerCase().includes(keyword);
        const matchesGrade = gradeFilter === "all" || store.grade === gradeFilter;
        return matchesQuery && matchesGrade;
      }),
    [gradeFilter, query, stores]
  );
  const selectedStore = visibleStores.find((store) => store.id === selectedId) || visibleStores[0] || stores[0];
  const gradeCounts = useMemo(() => countGrades(stores), [stores]);
  const markers = useMemo(() => createMarkers(mapMarkers, visibleStores), [mapMarkers, visibleStores]);

  return (
    <div className="overflow-hidden rounded-md border border-slate-200 bg-white text-slate-950 shadow-sm">
      <header className="flex flex-col gap-4 border-b border-slate-200 bg-white px-5 py-4 2xl:flex-row 2xl:items-center 2xl:justify-between">
        <div className="min-w-0">
          <h2 className="whitespace-nowrap text-lg font-black">영업·배송 통합 지도</h2>
          <p className="mt-1 text-sm font-bold text-slate-500">거래처 위치, 매출 등급, 방문·배송 우선순위를 한 화면에서 확인합니다.</p>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <nav className="flex items-center gap-1 rounded-md border border-slate-200 bg-slate-50 p-1">
            {["지도", "거래처 목록", "오늘 코스"].map((item) => (
              <button
                className={`h-8 rounded-md px-3 text-sm font-black transition ${item === "지도" ? "bg-white text-blue-700 shadow-sm" : "text-slate-500 hover:text-slate-950"}`}
                key={item}
                type="button"
              >
                {item}
              </button>
            ))}
          </nav>
          <span className="text-xs font-bold text-slate-400">기존 영업·배송 데이터 기준</span>
          <button className="grid h-9 w-9 place-items-center rounded-md border border-slate-200 bg-white text-slate-500 hover:bg-slate-50" type="button">
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <section className="grid grid-cols-2 border-b border-blue-500 bg-slate-50 md:grid-cols-6">
        <Kpi label="전체" tone="blue" value={`${routePlan.totalStops}곳`} />
        <Kpi label="A등급" tone="green" value={`${gradeCounts.A}곳`} />
        <Kpi label="B등급" tone="blue" value={`${gradeCounts.B}곳`} />
        <Kpi label="예상매출" tone="green" value={`${routePlan.totalExpectedRevenue.toLocaleString()}만원`} />
        <Kpi label="금일 총 km" tone="purple" value={`${routePlan.totalDistanceKm.toLocaleString()}km`} />
        <Kpi label="예상시간" tone="red" value={formatMinutes(routePlan.totalDurationMinutes)} />
      </section>

      <section className="flex flex-col gap-3 border-b border-slate-200 bg-white px-5 py-3 lg:flex-row lg:items-center">
        <label className="relative min-w-0 flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            className="h-10 w-full rounded-md border border-slate-200 bg-slate-50 pl-9 pr-3 text-sm font-bold text-slate-950 outline-none placeholder:text-slate-400 focus:border-blue-500 focus:bg-white"
            onChange={(event) => setQuery(event.target.value)}
            placeholder="거래처명·지역·주소 검색..."
            value={query}
          />
        </label>
        <div className="flex flex-wrap items-center gap-2">
          {gradeFilters.map((filter) => (
            <button
              className={`h-10 rounded-md border px-4 text-sm font-black transition ${
                gradeFilter === filter.value ? "border-blue-600 bg-blue-600 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              key={filter.value}
              onClick={() => setGradeFilter(filter.value)}
              type="button"
            >
              {filter.label}
            </button>
          ))}
          <button className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50" type="button">
            이탈 제외
          </button>
          <button className="h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-black text-slate-700 hover:bg-slate-50" type="button">
            내 위치
          </button>
          <span className="ml-2 text-sm font-black text-slate-500">{visibleStores.length}개</span>
        </div>
      </section>

      <section className="grid min-h-[760px] grid-cols-1 xl:grid-cols-[minmax(0,1fr)_340px_380px]">
        <div className="min-w-0 bg-slate-100">
          <KakaoAddressMap mapClassName="h-[760px] min-h-[680px] rounded-none border-0 xl:h-[calc(100vh-292px)]" markers={markers} showList={false} />
        </div>

        <aside className="border-l border-slate-200 bg-white">
          <div className="border-b border-slate-200 px-4 py-4">
            <p className="text-sm font-black text-slate-950">거래처 목록</p>
            <p className="mt-1 text-xs font-bold text-slate-500">매출 등급과 배송거리 기준</p>
          </div>
          <div className="max-h-[720px] overflow-auto xl:max-h-[calc(100vh-365px)]">
            {visibleStores.map((store) => (
              <button
                className={`block w-full border-b border-slate-100 px-4 py-4 text-left transition hover:bg-slate-50 ${
                  store.id === selectedStore?.id ? "bg-blue-50 shadow-[inset_3px_0_0_#2563eb]" : ""
                }`}
                key={store.id}
                onClick={() => setSelectedId(store.id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{store.name}</p>
                  <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-slate-500">{store.address || store.region}</p>
                <p className="mt-1 text-xs font-bold text-slate-400">
                  {store.distanceKm?.toLocaleString() || "-"}km · {formatMinutes(store.durationMinutes || 0)} · 예상 {store.expectedRevenue.toLocaleString()}만원
                </p>
              </button>
            ))}
          </div>
        </aside>

        <aside className="border-l border-slate-200 bg-slate-50">{selectedStore ? <StoreDetail store={selectedStore} /> : null}</aside>
      </section>
    </div>
  );
}

function StoreDetail({ store }: { readonly store: StoreRow }) {
  return (
    <div className="max-h-[760px] overflow-auto xl:max-h-[calc(100vh-292px)]">
      <div className="border-b border-slate-200 bg-white px-5 py-5">
        <p className="mb-3 text-sm font-black text-slate-500">거래처 상세</p>
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-lg font-black text-slate-950">{store.name}</h3>
            <p className="mt-1 text-xs font-bold text-slate-500">
              {store.grade}등급 · {store.region} · 점수 {store.score}점
            </p>
          </div>
          <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
        </div>
      </div>

      <div className="space-y-6 px-5 py-5">
        <PanelTitle title="기본 정보" />
        <InfoRow icon={<MapPin className="h-4 w-4" />} label="주소" value={store.address || "주소 미등록"} />
        <InfoRow label="지역" value={store.region} />
        <InfoRow label="상태" value={getStatusLabel(store.status)} />
        <InfoRow label="예상매출" value={`${store.expectedRevenue.toLocaleString()}만원`} />
        <InfoRow label="계약점수" value={`${store.score}점`} />

        <PanelTitle title="배송·방문 정보" />
        <MetricRow icon={<Navigation className="h-4 w-4" />} label="거리" value={`${store.distanceKm?.toLocaleString() || "-"}km`} />
        <MetricRow icon={<Clock className="h-4 w-4" />} label="예상시간" value={formatMinutes(store.durationMinutes || 0)} />
        <MetricRow icon={<CalendarDays className="h-4 w-4" />} label="방문순서" value={`${store.order}번째`} />
        <MetricRow label="경로출처" value={getProviderLabel(store.routeProvider)} />

        <PanelTitle title="AI 추천 근거" />
        <div className="space-y-2">
          {(store.reasons?.length ? store.reasons : ["배송 반경", "예상 매출", "지역 확장성"]).map((reason) => (
            <p className="rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-700" key={reason}>
              {reason}
            </p>
          ))}
        </div>

        <PanelTitle title="액션 메모" />
        <textarea
          className="min-h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950 outline-none focus:border-blue-500"
          defaultValue={`${store.region} ${store.name} 방문 후보. 예상 월매출 ${store.expectedRevenue.toLocaleString()}만원 기준 ${store.grade}등급으로 분류됨.`}
        />
      </div>
    </div>
  );
}

function Kpi({ label, tone, value }: { readonly label: string; readonly tone: "blue" | "green" | "purple" | "red"; readonly value: string }) {
  const valueClass = {
    blue: "text-blue-600",
    green: "text-emerald-600",
    purple: "text-violet-600",
    red: "text-rose-600"
  }[tone];

  return (
    <div className="border-r border-slate-200 px-5 py-3 last:border-r-0">
      <p className="text-xs font-bold text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-2xl font-black ${valueClass}`}>{value}</p>
    </div>
  );
}

function PanelTitle({ title }: { readonly title: string }) {
  return <p className="border-b border-slate-200 pb-2 text-xs font-black text-slate-500">{title}</p>;
}

function InfoRow({ icon, label, value }: { readonly icon?: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="grid grid-cols-[86px_minmax(0,1fr)] gap-3 text-sm">
      <span className="font-bold text-slate-500">{label}</span>
      <span className="flex min-w-0 items-center gap-2 font-black text-slate-950">
        {icon}
        <span className="min-w-0 break-words">{value}</span>
      </span>
    </div>
  );
}

function MetricRow({ icon, label, value }: { readonly icon?: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="flex items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-3 text-sm">
      <span className="flex items-center gap-2 font-bold text-slate-500">
        {icon}
        {label}
      </span>
      <span className="font-black text-slate-950">{value}</span>
    </div>
  );
}

function createStoreRows(routePlan: RoutePlan, existingMarkers: KakaoMapMarker[]): StoreRow[] {
  return routePlan.groups
    .flatMap((group) => group.stops)
    .map((store, index) => {
      const marker = existingMarkers.find((item) => item.address === store.address || item.name === store.name);
      return {
        ...store,
        grade: getRevenueGrade(store.expectedRevenue),
        markerX: marker?.x ?? 18 + ((index * 13) % 68),
        markerY: marker?.y ?? 20 + ((index * 17) % 58)
      };
    });
}

function createMarkers(existingMarkers: KakaoMapMarker[], stores: StoreRow[]): KakaoMapMarker[] {
  const origin = existingMarkers.find((marker) => marker.tone === "origin");
  const storeMarkers = stores.map((store) => ({
    address: store.address || `${store.region} ${store.name}`,
    grade: store.grade,
    label: store.grade,
    name: store.name,
    tone: "lead" as const,
    x: store.markerX,
    y: store.markerY
  }));

  return origin ? [origin, ...storeMarkers] : storeMarkers;
}

function getRevenueGrade(revenue: number): RevenueGrade {
  if (revenue >= 260) return "A";
  if (revenue >= 220) return "B";
  return "C";
}

function countGrades(stores: StoreRow[]) {
  return stores.reduce(
    (counts, store) => ({
      ...counts,
      [store.grade]: counts[store.grade] + 1
    }),
    { A: 0, B: 0, C: 0 } as Record<RevenueGrade, number>
  );
}

function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

function getStatusLabel(status: string) {
  if (status === "today") return "오늘 추천";
  if (status === "visit-planned") return "방문 예정";
  if (status === "high-probability") return "계약 가능성 높음";
  if (status === "this-week") return "이번주 추천";
  if (status === "excluded") return "제외";
  return status || "미분류";
}

function getProviderLabel(provider?: RoutePlanStop["routeProvider"]) {
  if (provider === "cached") return "티맵 캐시";
  if (provider === "tmap") return "티맵";
  if (provider === "estimated") return "추정";
  return "샘플";
}

function gradeBadgeClass(grade: RevenueGrade) {
  if (grade === "A") return "rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-black text-white";
  if (grade === "B") return "rounded-full bg-blue-500 px-2.5 py-1 text-xs font-black text-white";
  return "rounded-full bg-slate-500 px-2.5 py-1 text-xs font-black text-white";
}
