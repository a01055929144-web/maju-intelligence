// D-6 ②: 지도 파일에서 분리한 탭·레이어 조절·범례(화면·동작 변화 0).
import { listTabColor, MAP_LAYER_COLORS } from "@/domains/route/map-layer-colors";
import type { PermitLeadType } from "@/domains/lead/map-filters";
import type { MarkerViewMode } from "@/components/map/route-planner";

export type MapPanelMode = "split" | "driver" | "customer" | "newLead" | "salesLead" | "map";

export function MapExplorerTabs({
  active,
  counts,
  onSelect
}: {
  readonly active: MapPanelMode;
  readonly counts: { customers: number; drivers: number; newLeads: number; salesLeads: number };
  readonly onSelect: (mode: MapPanelMode) => void;
}) {
  const tabs = [
    { count: counts.drivers, label: "담당자", color: "drivers" as const, value: "driver" as const },
    { count: counts.customers, label: "거래처", color: "customers" as const, value: "customer" as const },
    { count: counts.newLeads, label: "신규", color: "new" as const, value: "newLead" as const },
    { count: counts.salesLeads, label: "영업", color: "sales" as const, value: "salesLead" as const }
  ];
  return (
    <nav aria-label="지도 통합 탐색" className="grid shrink-0 grid-cols-4 gap-1 border-b border-slate-200 bg-slate-50 p-1.5">
      {tabs.map((tab) => (
        <button
          aria-current={active === tab.value ? "page" : undefined}
          className={`min-w-0 rounded-md px-1.5 py-1.5 text-xs font-bold transition ${
            active === tab.value ? "bg-white text-teal-800 shadow-sm ring-1 ring-inset ring-slate-200" : "text-slate-500 hover:bg-white hover:text-slate-900"
          }`}
          key={tab.value}
          onClick={() => onSelect(tab.value)}
          style={active === tab.value ? { color: listTabColor(tab.color) } : undefined}
          type="button"
        >
          <span className="block truncate">{tab.label}{" "}</span>
          <span className="mt-0.5 block text-xs font-semibold tabular-nums opacity-70">{tab.count.toLocaleString()}</span>
        </button>
      ))}
    </nav>
  );
}

export function MapLayerControl({
  className,
  counts,
  customersOn,
  headerOffsetPx,
  markerViewMode,
  onSelectLeadLayer,
  onSelectMarkerMode,
  onToggleCustomers,
  showAllLeadsOnMap,
  typeFilter
}: {
  readonly className: string;
  readonly customersOn: boolean;
  readonly onToggleCustomers: () => void;
  readonly counts: {
    activeVehicles: number;
    customers: number;
    newLeads: number;
    salesLeads: number;
  };
  readonly headerOffsetPx: number;
  readonly markerViewMode: MarkerViewMode;
  readonly onSelectLeadLayer: (type: PermitLeadType) => void;
  readonly onSelectMarkerMode: () => void;
  readonly showAllLeadsOnMap: boolean;
  readonly typeFilter: "all" | PermitLeadType;
}) {
  // 시안 ⑫ 레이어 바: 색 점 + 이름 + 건수의 둥근 버튼. 켜짐은 실선, 꺼짐은 점선·흐린 글자.
  const layerButtonClass = (active: boolean) =>
    `flex h-8 shrink-0 items-center gap-1.5 rounded-full px-2.5 text-xs transition ${
      active ? "border border-slate-400 bg-white text-slate-900" : "border border-dashed border-slate-300 bg-slate-50 text-slate-400 hover:text-slate-600"
    }`;
  const newOn = showAllLeadsOnMap && (typeFilter === "all" || typeFilter === "new");
  const salesOn = showAllLeadsOnMap && (typeFilter === "all" || typeFilter === "sales");
  const vehicleOn = markerViewMode === "vehicle";

  return (
    <div
      aria-label="지도 레이어"
      className={`pointer-events-auto absolute left-3 z-10 hidden max-w-[calc(100%-1.5rem)] items-center gap-1 overflow-x-auto rounded-[10px] bg-white p-1 shadow-[0_2px_8px_rgba(15,23,42,.12)] lg:flex ${className}`}
      style={{ top: headerOffsetPx ? `${headerOffsetPx + 12}px` : "0.75rem" }}
    >
      <button aria-pressed={customersOn} className={layerButtonClass(customersOn)} onClick={onToggleCustomers} title="거래처 레이어 켜기 또는 끄기" type="button">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: MAP_LAYER_COLORS.customer }} />
        거래처 {counts.customers}
      </button>
      <button aria-pressed={newOn} className={layerButtonClass(newOn)} onClick={() => onSelectLeadLayer("new")} title="신규 리드 레이어 켜기 또는 끄기" type="button">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: MAP_LAYER_COLORS.newLead }} />
        신규 {counts.newLeads}
      </button>
      <button aria-pressed={salesOn} className={layerButtonClass(salesOn)} onClick={() => onSelectLeadLayer("sales")} title="영업 리드 레이어 켜기 또는 끄기" type="button">
        <span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: MAP_LAYER_COLORS.salesLead }} />
        영업 {counts.salesLeads}
      </button>
      <button aria-pressed={vehicleOn} className={layerButtonClass(vehicleOn)} onClick={onSelectMarkerMode} title="거래처 마커를 차량별 또는 등급별로 표시" type="button">
        <span aria-hidden="true" className="h-2 w-2 rounded-sm" style={{ backgroundColor: MAP_LAYER_COLORS.vehicle }} />
        차량 {counts.activeVehicles}
      </button>
    </div>
  );
}

export function MapLayerLegend({
  counts
}: {
  readonly counts: {
    activeVehicles: number;
    completedCustomers: number;
    customers: number;
    newLeads: number;
    salesLeads: number;
    staleVehicles: number;
    lastOperationVehicles: number;
  };
}) {
  return (
    <div className="pointer-events-none absolute inset-x-2 bottom-2 z-10 flex justify-center sm:inset-x-3 sm:bottom-3 lg:hidden">
      <div
        aria-label="지도 마커 범례"
        className="flex max-w-full flex-wrap items-center justify-center gap-x-3 gap-y-1 rounded-xl border border-slate-200/90 bg-white/95 px-3 py-2 text-xs font-bold text-slate-700 shadow-[0_8px_24px_rgba(15,23,42,.16)] backdrop-blur sm:text-[11px] lg:max-w-[calc(100%-640px)] xl:max-w-[calc(100%-700px)]"
      >
        <span className="font-black text-slate-500">범례</span>
        <span className="inline-flex items-center gap-1"><span className="h-2.5 w-2.5 rounded-full ring-2 ring-white" style={{ backgroundColor: MAP_LAYER_COLORS.customer }} />거래처 {counts.customers}</span>
        {counts.newLeads > 0 ? (
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded" style={{ backgroundColor: MAP_LAYER_COLORS.newLead }} />신규 리드 {counts.newLeads}</span>
        ) : null}
        {counts.salesLeads > 0 ? (
          <span className="inline-flex items-center gap-1"><span className="h-2.5 w-4 rounded" style={{ backgroundColor: MAP_LAYER_COLORS.salesLead }} />영업 리드 {counts.salesLeads}</span>
        ) : null}
        <span className="inline-flex items-center gap-1"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">🚚</span>실시간 {counts.activeVehicles}</span>
        {counts.staleVehicles ? <span className="inline-flex items-center gap-1 text-slate-500"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-500 text-xs text-white">🚚</span>지연 {counts.staleVehicles}</span> : null}
        {counts.lastOperationVehicles ? <span className="inline-flex items-center gap-1 text-slate-400"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-slate-300 text-xs text-slate-700">🚚</span>마지막 운행 {counts.lastOperationVehicles}</span> : null}
        <span className="inline-flex items-center gap-1 text-emerald-700"><span className="inline-flex h-4 w-4 items-center justify-center rounded-full bg-emerald-600 text-xs text-white">✓</span>오늘 완료 {counts.completedCustomers}</span>
      </div>
    </div>
  );
}
