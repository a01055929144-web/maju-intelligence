"use client";
import { copyText } from "@/lib/copy-text";
import { leadLayerColor } from "@/domains/route/map-layer-colors";
import { MapExplorerTabs, MapLayerControl, MapLayerLegend, type MapPanelMode } from "@/components/map/map-layer-controls";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, } from "react";
import { DriverSelectField } from "@/components/driver-select-field";
import { areaLabelMatchesSigungu, phoneDigitsMatch, summarizeMultiFilter } from "@/lib/map-filter-multi";
import {
  AlertTriangle,
  ArrowDown,
  ArrowUp,
  ArrowUpDown,
  CalendarDays,
  Check,
  CheckCircle2,
  
  Columns2,
  Columns3,
  Copy,
  
  
  ExternalLink,
  Eye,
  EyeOff,
  
  Gauge,
  GripVertical,
  Layers,
  
  Loader2,
  ListFilter,
  Lock,
  Maximize2,
  Minimize2,
  MapPin,
  MapPinned,
  
  MessageSquareText,
  Navigation,
  
  
  Phone,
  
  Radar,
  RefreshCw,
  Ruler,
  Search,
  Square,
  Star,
  Store,
  Target,
  
  Truck,
  
  UserRound,
  Utensils,
  X,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChurnRiskAlert } from "@/components/churn-risk-alert";
import { LoadingState } from "@/components/ui/state";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { SearchInput } from "@/components/ui/search-input";
import { ConfirmDialog } from "@/components/ui/confirm-dialog";
import { NOTICE_TOAST_MS } from "@/components/ui/notice";
import { MapCustomerNotice } from "@/components/map/map-customer-notice";
import { customerLocationChip, customerLocationNote, customerLocationState } from "@/domains/route/map-customer-notice";
import { MapFilterChipsRow, MapLeadFilterStrip } from "@/components/map/map-filters-bar";
import { MapFilterPopover } from "@/components/map/map-filter-popover";
import { useMapFilters, type MapFilterPopKey } from "@/components/map/use-map-filters";
import { MapSearchResultsPanel, type SearchResultRow } from "@/components/map/map-search-results-panel";
import { useBusinessSearch, type ExternalBusinessResult } from "@/components/map/use-business-search";
import { assignSearchPins } from "@/components/map/search-pins";
import { isStoreVisibleByStatus, isTerminatedHiddenOnMap, relationshipLabel } from "@/domains/customer/relationship-filter";
import { MapVehicleConnectionToast } from "@/components/map-vehicle-connection-toast";
import { MobileMapSummary } from "@/components/mobile-map-summary";
import { SalesAreaSelector, type SalesAreaSelectorSnapshot } from "@/components/sales-area-selector";
import { isClosedLead } from "@/lib/leads";
import {
  filterMapLeads,
  getPermitLeadOpenDate,
  getPermitLeadType,
  isHiddenLeadStatus,
  isPermitLeadInOpenDateFilter,
  PERMIT_LEAD_TYPE_OPTIONS,
  parseLeadRegion,
  scopeLeadsByStatus,
  type LeadOpenDateFilterMode,
  type PermitLeadType
} from "@/domains/lead/map-filters";
import { buildPlaceSearchLinks } from "@/lib/place-links";
import { getStaffMapPollIntervalMs, STAFF_LOCATION_FRESHNESS_MINUTES } from "@/lib/staff-location";
import { normalizeStoredMapPanelMode } from "@/lib/map-preferences";
import { nextLeadLayerSelection } from "@/lib/map-layer-selection";
import { getMapLeadReminderLabel } from "@/lib/map-lead-workflow";
import type {
  ChurnRiskCustomer,
  DeliveryCompletionEvent,
  DeliveryVehicle,
  PermitLeadActionItem,
  PermitLeadItem,
  PossibleDuplicateCustomer,
  RoutePlan,
  RoutePlanStop,
  StaffInvitation,
  StaffLocationEvent,
  StaffVehicleLocation
} from "@/lib/store";
import type { VehicleMaster, } from "@/domains/delivery/vehicle-master";
import type { RouteOrderLinkStatus } from "@/application/route/today-route-order-projection";
import { getTmsServiceDateKey } from "@/domains/delivery/service-date";
import { LEAD_STAGE_OPTIONS, toLeadStageValue } from "@/domains/lead/lead-status";
import { leadDocumentEntryHref, type LeadDocumentEntryAccess } from "@/domains/lead/document-entry";
import { formatStoreAreaPyeong, STORE_AREA_RANGE_OPTIONS } from "@/domains/lead/store-area";
import { useUnsavedChangesWarning } from "@/lib/use-unsaved-changes-warning";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { formatPhoneNumber } from "@/lib/phone";
import {
  clamp,
  estimateFuelCostWon,
  formatMinutes,
  getStoreTotals,
  gradeBadgeClass,
  
  readLocalJson,
  resolveRevenueGrade,
  roundToOneDecimal,
  saveLocalJson,
  type RevenueGrade
} from "@/lib/route-map-utils";
import { businessStatusClass, getBusinessStatusLabel, getLeadConfidence, isGenericNaverSearchLink, LEAD_STORE_AREA_FEATURE_ENABLED, permitGradeToneClassName, type StoreRow } from "@/components/map/map-row-helpers";
import { RouteMetric, VehicleEdit, createLiveVehicleMarkers, createLocationRoutePath, liveVehicleMatchesDeliveryGroup, summarizeLocationEvents, vehicleColorForId } from "@/components/map/vehicle-helpers";
export { RouteMetric, vehicleColorForId };
import { FullRouteNavigateAction, getRouteStopAddress, NavigateMenu, RouteWorkspaceGuide, type CourseSummary, type MarkerViewMode, type WorkspaceView } from "@/components/map/route-planner";
export { FullRouteNavigateAction, getRouteStopAddress, NavigateMenu };
export type { CourseSummary };
import { localStoreKeys, QUOTE_DRAFT_UPDATED_EVENT } from "@/components/map/local-store-keys";
import { buildOutboundItemNotes, quoteDraftId, readQuoteDraft, type QuoteDraft, type QuoteSubject } from "@/components/map/quote-draft";
export { buildOutboundItemNotes };
// M8: 견적 창은 열 때만 내려받는다.
const QuoteDrawer = dynamic(() => import("@/components/map/quote-drawer").then((m) => m.QuoteDrawer));
export { localStoreKeys, QUOTE_DRAFT_UPDATED_EVENT, quoteDraftId, readQuoteDraft };
export type { QuoteDraft, QuoteSubject };
import { getLeadInstagramHandle, getLeadInstagramSearchUrl, buildLeadDmScript, getPermitLeadQuoteSubject, isPermitLeadUnscored, PERMIT_LEAD_TYPE_LABEL } from "@/components/map/lead-helpers";
export { normalizeLeadSearchToken, normalizeInstagramHandleValue, getLeadInstagramHandle, getLeadInstagramSearchUrl, getLeadInstagramSearchTokens, permitLeadActionLabel, buildLeadDmScript, getPermitLeadTableAction, getPermitLeadQuoteSubject, PERMIT_PERIOD_OPTIONS, PERMIT_PERIOD_BADGE_LABEL, PERMIT_ACTION_OPTIONS, isPermitLeadUnscored, PERMIT_LEAD_TYPE_LABEL, PERMIT_LEAD_TYPE_DESCRIPTION, formatLeadOpenDateFilterLabel } from "@/components/map/lead-helpers";
export type { LeadDmSettings, PermitLeadActionIntent } from "@/components/map/lead-helpers";
import { useLatestRequest } from "@/hooks/use-latest-request";
// 옛 경로 다시 내보내기(다른 화면이 워크스페이스에서 가져오던 이름).
export { getLeadConfidence, permitGradeToneClassName };
export type { StoreRow };
import { StoreEdit, StoreHistoryItem, StoreAttachment, FuelPriceByType, resolveDisplayIndustry, withPermitLeadCompanyQuery, normalizePhoneNumber } from "@/components/map/map-place-helpers";
// M4b: 지도 거래처 상세·빠른 카드는 열 때만 내려받는다(components/map/map-place-detail.tsx). 옛 경로 이름은 그대로 내보낸다.
export const StoreQuickCard = dynamic(() => import("@/components/map/map-place-detail").then((m) => m.StoreQuickCard));
const StoreDetail = dynamic(() => import("@/components/map/map-place-detail").then((m) => m.StoreDetail));
export { withPermitLeadCompanyQuery };
export type { FuelPriceByType };
export { sortLeadList } from "@/components/map/lead-list-sort";
// M4a: 오른쪽 목록 패널은 열 때만 내려받는다(분리 파일 components/map/map-side-panel.tsx).
const StoreManagementPanel = dynamic(() => import("@/components/map/map-side-panel").then((m) => m.StoreManagementPanel));
const LeadListPanel = dynamic(() => import("@/components/map/map-side-panel").then((m) => m.LeadListPanel));
// M6: 담당자·차량 패널과 라이브 차량·분석 창은 열 때만 내려받는다(components/map/vehicle-layer.tsx).
const DeliveryAssignmentPanel = dynamic(() => import("@/components/map/vehicle-layer").then((m) => m.DeliveryAssignmentPanel));
const LiveVehicleStatusPanel = dynamic(() => import("@/components/map/vehicle-layer").then((m) => m.LiveVehicleStatusPanel));
const VehicleAnalysisModal = dynamic(() => import("@/components/map/vehicle-layer").then((m) => m.VehicleAnalysisModal));

const CustomerAttachmentUploadPanel = dynamic(
  () => import("@/components/customer-attachment-upload-panel").then((module) => module.CustomerAttachmentUploadPanel),
  { loading: () => <LoadingState label="첨부 기능을 준비하는 중입니다." /> }
);
type GradeFilter = "all" | RevenueGrade;

export type PermitLeadActionKind = "call" | "dm" | "visit" | "hold" | "exclude" | "quote" | "sms" | "talktalk" | "email" | "fax" | "status";
export type BulkLeadActionBusy = PermitLeadActionKind | "quoteFollowUp" | "";
export type PermitLeadActionResult = { action?: PermitLeadActionItem; message?: string; ok: boolean; status?: string };
export const LIST_PAGE_SIZE_OPTIONS = [10, 30, 50, 100] as const;
export type ListPageSize = (typeof LIST_PAGE_SIZE_OPTIONS)[number];
export type PermitLeadEnrichResponse = {
  lead?: Partial<PermitLeadItem>;
  message?: string;
  ok?: boolean;
  persisted?: boolean;
  skippedFields?: string[];
  sources?: {
    googleReviews?: boolean;
    keywordVolume?: boolean;
    placeLinks?: boolean;
  };
};

// 검색으로 찾은 미등록 매장은 아직 거래처 id가 없으므로, 지도 마커/클릭 매칭에 쓸 안정적인
// id를 상호명+주소로 만들어 씁니다. 같은 상호명이 검색 결과에 여러 번 나와도 주소가 다르면 구분됩니다.
function externalResultId(result: ExternalBusinessResult) {
  return `external-${result.name}-${result.roadAddress || result.address}`;
}

// 검색 결과를 편집 없이 그대로(상호명·주소·연락처·업종) 빠르게 거래처로 저장합니다. 개별 등록
// 패널(QuickRegisterDrawer)의 저장 로직과 별개로, 여러 매장을 체크해 한 번에 등록할 때 씁니다.
async function registerExternalBusinessResult(result: ExternalBusinessResult): Promise<{ id: string; name: string }> {
  const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
  const response = await fetchWithTimeout("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: result.roadAddress || result.address,
      businessStatus: "확인 필요",
      companyId: companyId || undefined,
      customerName: result.name,
      industry: result.industry || "미분류",
      kakaoPlaceUrl: result.kakaoPlaceUrl,
      phone: result.phone,
      validateBusinessNumber: false
    })
  }, 12000);
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `${result.name} 등록에 실패했습니다.`);
  // 2026-08-27 피드백("중복값 입력되지 않게 만들어줘") 대응: 여러 곳을 한 번에 등록하는 흐름이라
  // 검색 결과마다 확인창을 띄우기 어려우므로, 이미 같은 상호명의 거래처가 있으면 등록하지 않고
  // 건너뛴 것으로 처리합니다(사용자가 정말 새 거래처로 등록하고 싶다면 개별 등록 패널을 쓰면 됩니다).
  if (payload?.possibleDuplicate) throw new Error(`${result.name}은(는) 이미 등록된 거래처와 이름이 같아 건너뛰었습니다.`);

  const customerId = String(payload?.customer?.id || "");
  if (!customerId) throw new Error(`${result.name}은(는) 저장됐지만 ID를 확인하지 못했습니다.`);
  return { id: customerId, name: result.name };
}

type RoutePlanStoreDetails = RoutePlanStop & {
  businessNumber?: string;
  businessStatus?: string;
  loadingPosition?: string;
  memo?: string;
};


export type DeliveryProof = {
  deliveryStatus: "arrived" | "partial" | "issue";
  fileName: string;
  // 2026-08-28 피드백 대응: 저장 실패 시 그 이유를 함께 남겨 화면에 오류 배너로 보여줍니다.
  failureReason?: string;
  messageChannel: "kakao" | "sms";
  memo: string;
  persisted?: boolean;
  recordedAt: string;
  storeId: string;
};

export type DeliveryProofInput = {
  deliveryStatus: DeliveryProof["deliveryStatus"];
  file?: File | null;
  fileName: string;
  messageChannel: DeliveryProof["messageChannel"];
  memo: string;
};

type SalesRouteMapWorkspaceProps = {
  readonly canManageStaff?: boolean;
  readonly churnRiskCompanyId?: string;
  /** 견적서 DM/문자 문안 헤더에 "MAJU" 대신 표시할, 로그인한 고객사 이름입니다. */
  readonly companyName?: string;
  readonly distributorSales?: boolean; // CC-21: 서버가 첫 화면부터 알려 줘서 "매장|유통사" 전환이 로드 전에도 보인다.
  readonly documentEntry?: LeadDocumentEntryAccess;
  readonly holdModulesEnabled?: boolean;
  readonly initialCustomerId?: string;
  readonly initialLeadId?: string;
  readonly initialLeadType?: PermitLeadType;
  readonly leadDetailMode?: "drawer" | "page";
  /** 2026-08-24 피드백: "전반적으로 속도가 더뎌" — 서버 컴포넌트가 이미 계산한 이탈 위험 거래처
   * 목록을 그대로 내려받아, ChurnRiskAlert가 마운트되자마자 같은 데이터를 다시 fetch하는 중복
   * 네트워크 왕복을 없앱니다. */
  readonly churnRiskCustomers?: ChurnRiskCustomer[];
  readonly mapMarkers: KakaoMapMarker[];
  readonly orderLinkStatus?: RouteOrderLinkStatus;
  readonly routePlan: RoutePlan;
  readonly staffVehicleLocations?: StaffVehicleLocation[];
  readonly staffInvitations?: StaffInvitation[];
  /** 2026-08-31 피드백 대응: 물류 출발지 주소가 아직 설정되지 않아 거리 계산이 기본값으로
   * 이뤄지고 있음을 알리는 배너를 띄울지 여부(고객사 계정에서만, 관리자 미리보기에서는 숨김). */
  readonly showOriginAddressBanner?: boolean;
  readonly timelineHref?: string;
  readonly vehicleFuelTypes?: Record<string, "gasoline" | "diesel">;
  readonly vehicleMasterAvailable?: boolean;
  readonly vehicleMasterVehicles?: VehicleMaster[];
};


const gradeFilters: Array<{ label: string; value: GradeFilter }> = [
  { label: "전체", value: "all" },
  { label: "A등급", value: "A" },
  { label: "B등급", value: "B" },
  { label: "C등급", value: "C" }
];
const workspaceViews: Array<{ helper: string; icon: LucideIcon; label: string; shortLabel: string; value: WorkspaceView }> = [
  { helper: "신규·영업 리드와 거래처", icon: MapPin, label: "지도", shortLabel: "지도", value: "map" },
  { helper: "검색·상세·편집", icon: Store, label: "거래처", shortLabel: "원장", value: "customers" },
  { helper: "선택 매장 경유·티맵", icon: Navigation, label: "코스", shortLabel: "코스", value: "course" },
  { helper: "인허가·반경·전환", icon: Radar, label: "리드", shortLabel: "신규", value: "leads" },
  // 2026-09-07 피드백("매일 배송 경로, 경유, 배송완료 여부 등 히스토리 파악 할 수 있도록 해야해,
  // 달력으로 표기해서 기간 설정을 하고, 특정일자의 배송 일자를 보면 좋을 것 같아") 대응 탭입니다.
  { helper: "달력·방문순서·경로", icon: CalendarDays, label: "배송 이력", shortLabel: "배송", value: "history" }
];
const workspaceViewDescriptions: Record<WorkspaceView, string> = {
  course: "배송차와 거래처를 선택해 티맵 도로 기준 방문 순서를 계산합니다.",
  customers: "거래처 원장, 첨부자료, 메모를 관리합니다.",
  history: "달력에서 날짜를 골라 그날의 담당자별 방문 순서·완료 기록·실제 GPS 경로를 확인합니다.",
  leads: "신규 인허가 데이터와 반경 리드를 관리합니다.",
  map: "거래처 등급, 배송차, 신규 리드를 지도에서 확인합니다."
};
const originMarkerId = "origin-hub";
export const tmapWaypointLimit = 15;
// v2(10-27 시안 ⑫): 기본 = 3분할(왼쪽 담당자·차량 / 지도 / 오른쪽 신규·영업·거래처 목록). v1 저장값은 무시합니다.
const MAP_PANEL_MODE_STORAGE_KEY = "maju:map-panel-mode:v2";
// "반경 리드"에서 지도를 클릭하면 항상 이 값으로 시작합니다(네이버 지도 반경 도구 참고, 2026-08-20).
const DEFAULT_LEAD_SEARCH_RADIUS_KM = 0.5;
export const QUOTE_FOLLOW_UP_STATUS_FILTER = "__quote_follow_up";
export const vehicleMarkerColors = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#be123c", "#4f46e5", "#16a34a", "#9333ea"];


// 2026-08-28 피드백 대응: storeEdits/vehicleEdits는 이 브라우저에서만 유지되는 "서버 저장 전까지의
// 임시 낙관적 캐시"인데, 지우는 로직이 없어 한 번 저장되면 영구히 남아 있었습니다. 실제 서버 값이
// 나중에 다른 경로(다른 기기, 관리자 도구 등)로 바뀌어도 이 브라우저는 계속 옛 값을 보여주는
// 문제가 있었습니다. 완전한 해결(저장 성공 시 즉시 제거)은 현재 화면이 서버 재조회 없이 이 캐시에만
// 의존해 렌더링하는 구조상 화면이 원래 값으로 되돌아가 보이는 부작용이 있어, 대신 TTL(48시간)을 둬서
// "최소한 며칠 넘게 어긋난 채로 남아있지는 않게" 합니다.
const EDIT_CACHE_TTL_MS = 48 * 60 * 60 * 1000;

function loadEditCacheWithTtl<T>(valueKey: string, savedAtKey: string): { values: Record<string, T>; savedAt: Record<string, number> } {
  const values = readLocalJson<Record<string, T>>(valueKey, {});
  const savedAt = readLocalJson<Record<string, number>>(savedAtKey, {});
  const now = Date.now();
  const freshValues: Record<string, T> = {};
  const freshSavedAt: Record<string, number> = {};
  for (const [id, value] of Object.entries(values)) {
    const timestamp = savedAt[id];
    // 이 기능 배포 이전에 저장돼 저장 시각 기록이 없는 값은 일단 유지하되, 지금 시각으로 새로
    // 기록해 이후부터는 TTL이 정상 적용되게 합니다.
    if (timestamp && now - timestamp > EDIT_CACHE_TTL_MS) continue;
    freshValues[id] = value;
    freshSavedAt[id] = timestamp || now;
  }
  return { values: freshValues, savedAt: freshSavedAt };
}

export function SalesRouteMapWorkspace({ canManageStaff = false, churnRiskCompanyId, churnRiskCustomers, companyName, distributorSales = false, documentEntry = { canCreateQuote: false, canCreateSheet: false }, holdModulesEnabled = false, initialCustomerId, initialLeadId, initialLeadType = "new", initialView = "map", leadDetailMode = "drawer", mapMarkers, orderLinkStatus = "off", routePlan, showOriginAddressBanner, staffInvitations = [], staffVehicleLocations = [], timelineHref, vehicleFuelTypes, vehicleMasterAvailable = false, vehicleMasterVehicles = [] }: SalesRouteMapWorkspaceProps & { readonly initialView?: WorkspaceView }) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // 검색창은 원래 등록된 거래처 안에서만 찾았습니다. 아직 거래처로 등록하지 않은 주변 매장도
  // 같이 보여주고 그 자리에서 바로 등록으로 넘어갈 수 있도록, 카카오 매장 검색 결과를 함께 붙입니다.
  const { results: externalResults, message: externalSearchMessage, loading: isSearchingExternal } = useBusinessSearch(query);
  // 검색창 포커스(최근 검색어 표시용)와 "검색 결과" 탭 열림. 탭은 오른쪽 패널의 기존 탭 상태를 건드리지 않고 위에 덮어 보여 주므로 닫으면 원래 패널 그대로다.
  const [showExternalResults, setShowExternalResults] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const searchTabOpen = searchOpen && query.trim().length >= 2;
  const [recentQueries, setRecentQueries] = useState<string[]>([]);
  useEffect(() => {
    try { const saved = JSON.parse(localStorage.getItem("maju:map:recent-queries") || "[]"); if (Array.isArray(saved)) setRecentQueries(saved.filter((item): item is string => typeof item === "string").slice(0, 5)); } catch { /* 저장소 없음 */ }
  }, []);
  function rememberQuery(value: string) {
    const keyword = value.trim();
    if (keyword.length < 2) return;
    setRecentQueries((old) => {
      const next = [keyword, ...old.filter((item) => item !== keyword)].slice(0, 5);
      try { localStorage.setItem("maju:map:recent-queries", JSON.stringify(next)); } catch { /* 저장소 없음 */ }
      return next;
    });
  }
  function closeSearch() { setQuery(""); setSearchOpen(false); setHoveredResultId(""); }
  useEffect(() => {
    if (!searchTabOpen) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeSearch(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [searchTabOpen]);
  // 지도 검색에서 고른 미등록 매장의 빠른 등록 대상입니다.
  const [quickRegisterTarget, setQuickRegisterTarget] = useState<ExternalBusinessResult | null>(null);
  // 검색 결과 일괄 등록 선택 상태입니다.
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
  // M2b: 검색 결과 줄 마우스 올림(지도 마커 강조)과 `결과 전체 보기` 요청.
  const [hoveredResultId, setHoveredResultId] = useState("");
  const [fitResultsRequest, setFitResultsRequest] = useState<{ token: number; ids: readonly string[] } | null>(null);
  const [isBulkRegistering, setIsBulkRegistering] = useState(false);
  const [bulkRegisterMessage, setBulkRegisterMessage] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  // 첫 진입은 담당자 패널 + 지도의 2분할로 시작해 지도를 넓게 확보합니다. 거래처 목록은 상단의
  // 상시 노출 분할 스위치에서 한 번에 전환할 수 있고, 3분할/지도 전용 화면도 같은 자리에서 선택합니다.
  const [leftCollapsed, setLeftCollapsed] = useState(false);
  const [rightCollapsed, setRightCollapsed] = useState(false);
  const [mapPanelMode, setMapPanelModeState] = useState<MapPanelMode>("split");
  // 2026-08-30 피드백("우측 패널 전체거래처는 거래처,리드목록 구별을 해야함"): 지도에 신규 리드가
  // 함께 표시 중일 때(반경 검색 또는 "리드" 전체 표시 토글), 오른쪽 패널에서 거래처 목록과 리드
  // 목록을 탭으로 전환할 수 있게 합니다. 리드가 안 보이는 평소에는 기존처럼 거래처 목록만 보입니다.
  const [rightPanelTab, setRightPanelTab] = useState<"stores" | "leads">("leads");
  useEffect(() => {
    try {
      const savedMode = window.localStorage.getItem(MAP_PANEL_MODE_STORAGE_KEY);
      // v1에 저장된 리드 패널 값은 과거에 리드 표시까지 강제로 켰습니다. 이제 지도 패널과
      // 마커 표시 여부를 분리하므로 거래처 패널로 안전하게 이관합니다.
      const compatibleMode = normalizeStoredMapPanelMode(savedMode);
      if (compatibleMode) {
        setMapPanelModeState(compatibleMode);
        setLeftCollapsed(compatibleMode === "customer" || compatibleMode === "map");
        setRightCollapsed(compatibleMode === "driver" || compatibleMode === "map");
        if (compatibleMode === "customer") setRightPanelTab("stores");
        if (compatibleMode !== "split") setShowAllLeadsOnMap(false);
      }
      // 휴대폰 폭에서는 예전처럼 거래처 중심으로 시작합니다(오른쪽 목록은 PC 3분할 전용).
      if (window.matchMedia && !window.matchMedia("(min-width: 1024px)").matches) setShowAllLeadsOnMap(false);
      // 지도는 매번 거래처·오늘 코스·차량 위치 중심으로 시작합니다. 과거 저장값이 true여도
      // 리드 레이어를 자동으로 켜지 않으며, 현재 화면에서 사용자가 직접 켠 경우에만 유지합니다.
      window.localStorage.removeItem("maju:map-leads-visible:v1");
    } catch {
      // 브라우저 저장소가 차단돼도 기본값(거래처만 표시)으로 지도를 사용할 수 있어야 합니다.
    }
  }, []);
  const [liveVehicleLocations, setLiveVehicleLocations] = useState<StaffVehicleLocation[]>(staffVehicleLocations);
  const [vehicleMasterRecords, setVehicleMasterRecords] = useState<VehicleMaster[]>(vehicleMasterVehicles);
  const [liveVehicleConnectionError, setLiveVehicleConnectionError] = useState("");
  const [vehicleAnalysis, setVehicleAnalysis] = useState<{
    completions: DeliveryCompletionEvent[];
    events: StaffLocationEvent[];
    error: string;
    loading: boolean;
    vehicle: StaffVehicleLocation | null;
  }>({ completions: [], events: [], error: "", loading: false, vehicle: null });
  const [vehicleAnalysisDate, setVehicleAnalysisDate] = useState(() => getTmsServiceDateKey());
  // 2026-09-07 피드백: "분석 버튼을 눌러야 이런 경로가 나오는데 메인 지도 화면에서도 구현할 수
  // 있도록해줘" — 팝업(VehicleAnalysisModal)을 열지 않아도, 라이브 차량 목록에서 "경로" 버튼으로
  // 같은 실제 GPS 이동 경로를 메인 지도에 바로 겹쳐 볼 수 있게 합니다. 한 번에 한 대만 표시합니다
  // (지도 컴포넌트가 폴리라인 하나만 그리도록 되어 있어, 여러 대를 동시에 겹치면 서로 구분이 안 됨).
  const [mainMapRouteVehicleId, setMainMapRouteVehicleId] = useState("");
  const [mainMapRouteEvents, setMainMapRouteEvents] = useState<StaffLocationEvent[]>([]);
  const [mainMapRouteLoading, setMainMapRouteLoading] = useState(false);
  const [mainMapRouteError, setMainMapRouteError] = useState("");
  const [statsExpanded, setStatsExpanded] = useState(false);
  const [mobileMapControlsOpen, setMobileMapControlsOpen] = useState(false);
  const [mobileSalesAreaOpen, setMobileSalesAreaOpen] = useState(false);
  // 작업공간 전체를 브라우저 전체 화면으로 확대합니다.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  // 지도 탭에서 검색/필터/신규 리드 반경 바가 1024px 이상에서 지도 위 카드로 표시됩니다(lg:absolute).
  // "신규 리드 반경"을 켜면 이 카드에 한 줄이 더 늘어나 높이가 커지는데, 지도 오른쪽 위
  // MapControls(내 위치 버튼)의 세로 위치가 고정값이면 늘어난 카드와 겹칩니다.
  //
  // 이 카드(mapHeaderRef)는 위쪽 KPI/이탈 위험 알림 블록을 건너뛰고 항상 지도 영역의 부모
  // 기준 top-2에 뜨는데(lg:absolute), MapControls는 지도 영역 자신(mapAreaRef)의 top을
  // 기준으로 위치합니다 — 두 기준점이 서로 다른 조상이라, 카드 높이만으로 오프셋을 계산하면
  // KPI 패널이 펼쳐져 있거나 이탈 위험 알림 배너가 떠 있을 때 실제 카드 아래쪽 가장자리와
  // MapControls 위치가 어긋납니다. getBoundingClientRect()로 카드의 실제 화면 아래쪽 가장자리와
  // 지도 영역의 실제 화면 위쪽 가장자리를 직접 비교해 그 차이를 오프셋으로 써서, 위에 어떤 블록이
  // 얼마나 있든 항상 카드 바로 아래에 오도록 합니다.
  const mapHeaderRef = useRef<HTMLElement>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const [mapHeaderHeightPx, setMapHeaderHeightPx] = useState(0);
  const recomputeMapHeaderOffset = useCallback(() => {
    const headerNode = mapHeaderRef.current;
    const areaNode = mapAreaRef.current;
    if (!headerNode || !areaNode) return;
    const headerRect = headerNode.getBoundingClientRect();
    const areaRect = areaNode.getBoundingClientRect();
    // 시안 ⑫부터 필터 줄은 지도 위에 겹치지 않는 고정 줄입니다. 겹칠 때(예전 배치·특수 화면)만
    // 그만큼 + 여백을 주고, 겹치지 않으면 0이라 패널·컨트롤이 지도 영역 맨 위에 붙습니다.
    const overlap = headerRect.bottom - areaRect.top;
    setMapHeaderHeightPx(overlap > 1 ? Math.round(overlap + 16) : 0);
  }, []);
  useEffect(() => {
    const headerNode = mapHeaderRef.current;
    const areaNode = mapAreaRef.current;
    if (!headerNode || !areaNode || typeof ResizeObserver === "undefined") return;
    const observer = new ResizeObserver(recomputeMapHeaderOffset);
    observer.observe(headerNode);
    observer.observe(areaNode);
    recomputeMapHeaderOffset();
    // 2026-09-07 피드백("우측 패널 위쪽에 위치하는데 짤려서 안보임") 대응: ResizeObserver는 헤더
    // 카드(mapHeaderRef) 자신의 "크기"가 변할 때만 반응합니다. 그런데 이 오프셋 계산은 크기가 아니라
    // "화면상 실제 위치"(getBoundingClientRect)를 봅니다 — 창 크기 변경처럼 두 요소의 크기는 그대로여도
    // 화면 위치/레이아웃이 바뀌는 경우까지는 ResizeObserver가 못 잡아, 헤더 카드(z-20, 항상 위)가
    // 계산이 어긋난 채로 좌우 패널(z-10)의 위쪽을 가려버리는 문제가 있었습니다. window resize에도
    // 다시 계산하도록 보강합니다.
    window.addEventListener("resize", recomputeMapHeaderOffset);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", recomputeMapHeaderOffset);
    };
  }, [recomputeMapHeaderOffset]);
  // 위 ResizeObserver/resize 리스너로도 놓칠 수 있는 나머지 경우(폰트 로딩으로 인한 리플로우,
  // 리드 필터 줄이 늘어나는 등rowspan 변화가 있는 렌더 등)를 보강하기 위해, 커밋될 때마다(매 렌더
  // 이후) 오프셋을 다시 계산합니다. recomputeMapHeaderOffset은 getBoundingClientRect 두 번 읽는 정도라
  // 가볍고, 값이 그대로면 setState가 리렌더를 유발하지 않아 무한 루프로 이어지지 않습니다.
  useLayoutEffect(() => {
    recomputeMapHeaderOffset();
  });
  const [mapFocusId, setMapFocusId] = useState("");
  const [previewStoreId, setPreviewStoreId] = useState("");
  const [detailLeadId, setDetailLeadId] = useState("");
  const [selectedId, setSelectedId] = useState(initialCustomerId || "");
  // 지도 홈 퀵카드에서 "경유지 추가"를 누르면 경유 코스 탭으로 바로 이동시키면서 이 값을 같이
  // 넘겨, TodayCourseView가 마운트된 뒤 해당 거래처를 오늘 경유 선택에 자동으로 포함시킵니다.
  const [pendingCourseStoreId, setPendingCourseStoreId] = useState("");
  // 서버 렌더와 첫 클라이언트 렌더는 같은 기본 탭을 사용하고, 마운트 뒤 URL 딥링크를 반영합니다.
  // history도 정식 탭이므로 ?view=history를 누락하지 않습니다.
  const [activeView, setActiveView] = useState<WorkspaceView>(initialView);
  const [excludeClosedStores, setExcludeClosedStores] = useState(false);
  // 거래 종료(수동 표시) 거래처는 기본으로 목록·지도에서 숨긴다. 필터 "거래 종료 거래처 보기"로 다시 본다.
  const [showTerminatedStores, setShowTerminatedStores] = useState(false);
  // 지도 레이어 바 "거래처": 꺼 두면 거래처 마커만 지도에서 숨긴다(목록·검색은 그대로).
  const [customersLayerOn, setCustomersLayerOn] = useState(true);
  const [markerViewMode, setMarkerViewMode] = useState<MarkerViewMode>("grade");
  const [storeAttachments, setStoreAttachments] = useState<Record<string, StoreAttachment>>(() => readLocalJson(localStoreKeys.attachments, {}));
  const [storeEdits, setStoreEdits] = useState<Record<string, StoreEdit>>(
    () => loadEditCacheWithTtl<StoreEdit>(localStoreKeys.storeEdits, localStoreKeys.storeEditsSavedAt).values
  );
  const [storeEditsSavedAt, setStoreEditsSavedAt] = useState<Record<string, number>>(
    () => loadEditCacheWithTtl<StoreEdit>(localStoreKeys.storeEdits, localStoreKeys.storeEditsSavedAt).savedAt
  );
  const [storeHistories, setStoreHistories] = useState<Record<string, StoreHistoryItem[]>>(() => readLocalJson(localStoreKeys.histories, {}));
  const [vehicleEdits, setVehicleEdits] = useState<Record<string, VehicleEdit>>(
    () => loadEditCacheWithTtl<VehicleEdit>(localStoreKeys.vehicleEdits, localStoreKeys.vehicleEditsSavedAt).values
  );
  const [vehicleEditsSavedAt, setVehicleEditsSavedAt] = useState<Record<string, number>>(
    () => loadEditCacheWithTtl<VehicleEdit>(localStoreKeys.vehicleEdits, localStoreKeys.vehicleEditsSavedAt).savedAt
  );
  const [manualDrivers, setManualDrivers] = useState<string[]>(() => readLocalJson(localStoreKeys.manualDrivers, []));
  // 배송차는 담당자와 별개로 지정될 수 있어(같은 트럭을 여러 담당자가 나눠 쓰거나, 한 담당자가
  // 상황에 따라 다른 차량을 몰 수 있음), 아직 어떤 거래처에도 배정되지 않은 배송차 이름을 미리
  // 등록해 두는 목록입니다. manualDrivers와 동일한 로컬 저장 방식을 씁니다.
  const [manualVehicles, setManualVehicles] = useState<string[]>(() => readLocalJson(localStoreKeys.manualVehicles, []));
  const [courseSummary, setCourseSummary] = useState<CourseSummary | null>(null);
  const [fuelPrices, setFuelPrices] = useState<FuelPriceByType>({ diesel: null, gasoline: null });
  const [vehicleFilterId, setVehicleFilterId] = useState("all");
  const [selectedLiveVehicleId, setSelectedLiveVehicleId] = useState("");
  const [recalculatingDistances, setRecalculatingDistances] = useState(false);
  const [distanceRecalcError, setDistanceRecalcError] = useState("");
  // 지도 탭에서 바로 켜는 "반경 리드" — 리드 탭의 리드 탐색과 같은 API를 쓰지만,
  // 지도 위에 마커로 바로 보여주기 위한 별도 상태입니다(리드 탭 상태와는 독립적).
  // 기본 모드는 "point"(지도 클릭) — 네이버 지도 반경 도구처럼 지도를 클릭하면 그 지점에
  // 고정 기본값(0.5km) 반경이 즉시 생기고, 손잡이로 조절, 오른쪽 클릭이나 지우기 버튼으로 지웁니다.
  const [leadRadiusOpen, setLeadRadiusOpen] = useState(false);
  const [leadRadiusAnchorMode, setLeadRadiusAnchorMode] = useState<"all" | "customer" | "point">("point");
  const [leadRadiusCustomerId, setLeadRadiusCustomerId] = useState("");
  // point 모드에서 클릭으로 고정한 중심좌표입니다. 아직 고정 전이면 null이고, 이 값이 null인
  // 동안에만 지도 클릭이 "이 지점에 반경 만들기" 인터랙션을 받습니다.
  const [leadRadiusPoint, setLeadRadiusPoint] = useState<{ lat: number; lng: number } | null>(null);
  // 지도가 마지막으로 멈춘 중심좌표 — "빠른 반경 선택" 칩을 누르면 클릭 없이도 지금 보고 있는
  // 지도 중심을 기준으로 바로 탐색할 수 있게 합니다(네이버 지도의 "이 지역 검색"과 비슷한 흐름).
  const [mapCenterPoint, setMapCenterPoint] = useState<{ lat: number; lng: number } | null>(null);
  // 반경 기본값은 0.5km로 고정합니다(2026-08-20 피드백) — 지도를 클릭하면 항상 이 값으로
  // 시작하고, 이후 손잡이 드래그나 숫자 입력으로 조절합니다.
  const [leadRadiusKm, setLeadRadiusKm] = useState(DEFAULT_LEAD_SEARCH_RADIUS_KM);
  const [leadRadiusSearching, setLeadRadiusSearching] = useState(false);
  const [leadRadiusResult, setLeadRadiusResult] = useState<NearbyPermitLeadResult | null>(null);
  const [leadRadiusError, setLeadRadiusError] = useState("");
  const [previewLeadId, setPreviewLeadId] = useState("");
  // "전체 리드 보기" — 반경 검색과 무관하게 활성 신규 리드 전체를 메인 지도에 바로 표시합니다.
  // 예전에는 신규 리드 탭 안에 별도 지도가 있었는데(같은 데이터를 두 지도에서 따로 관리),
  // 이제 메인 지도 한 곳에서만 보여주도록 합칩니다(2026-08-20 피드백).
  // 시안 ⑫: 3분할 기본 화면은 오른쪽 "신규" 목록과 지도 리드 핀을 함께 보여줍니다.
  const [showAllLeadsOnMap, setShowAllLeadsOnMap] = useState(true);
  const [allLeadsForMap, setAllLeadsForMap] = useState<PermitLeadItem[]>([]);
  const [allLeadsLoadState, setAllLeadsLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  // M9: 같은 종류 요청은 마지막 것만 살린다(옛 응답이 새 목록을 덮지 않게).
  const beginAllLeadsRequest = useLatestRequest();
  const beginRadiusRequest = useLatestRequest();
  const [mapSalesRegionsConfigured, setMapSalesRegionsConfigured] = useState<boolean | null>(null);
  // 시안 ⑫: 영업 지역 칩 팝오버를 "내 영업 지역 / 영업 필요 지역"으로 묶기 위한 지역 라벨.
  const [mapAssignedAreaLabels, setMapAssignedAreaLabels] = useState<string[]>([]);
  const [mapExpansionAreaLabels, setMapExpansionAreaLabels] = useState<string[]>([]);
  // 시안 ⑫ 필터 칩 팝오버(한 번에 하나만 열림). left는 필터 줄 기준 px입니다.
  // M3b: 리드 필터 상태·저장 필터(프리셋)는 훅 한 곳(묶음은 useMemo로 고정). 이름은 그대로 꺼내 쓴다.
  const {
    applyMapFilterPreset, mapFilterPop, mapFilterPopLeft, mapFilterPopRef, mapFilterPopTop, mapFilterPresetBusy, mapFilterPresetEnabled, mapFilterPresets,
    mapLeadAreaRange, mapLeadIndustryFilter, mapLeadOpenDateEnd, mapLeadOpenDateEndDraft, mapLeadOpenDateStart, mapLeadOpenDateStartDraft,
    mapLeadRegionDong, mapLeadRegionSigungu, mapLeadReminderOnly, mapLeadStageFilter, mapLeadTypeFilter, leadFiltersActive,
    removeSelectedMapFilterPreset, resetLeadFilters, saveCurrentMapFilterPreset, selectedMapFilterPresetId, selectMapLeadRegionSigungu,
    setMapFilterPop, setMapFilterPopLeft, setMapFilterPopTop, setMapLeadAreaRange, setMapLeadIndustryFilter, setMapLeadOpenDateEnd,
    setMapLeadOpenDateEndDraft, setMapLeadOpenDateStart, setMapLeadOpenDateStartDraft, setMapLeadRegionDong, setMapLeadRegionSigungu,
    setMapLeadReminderOnly, setMapLeadStageFilter, setMapLeadTypeFilter, setShowClosedLeadsOnMap, setShowDismissedLeadsOnMap, setShowRejectedLeadsOnMap,
    showClosedLeadsOnMap, showDismissedLeadsOnMap, showRejectedLeadsOnMap
  } = useMapFilters({ excludeClosedStores, gradeFilter, initialLeadType, setExcludeClosedStores, setGradeFilter });
  const [showOutsideSalesAreaOnMap, setShowOutsideSalesAreaOnMap] = useState(false);
  // 리드 보기 3가지(활성 / 거절함 / 숨김=제외, CC-50): 거절함·숨김은 서로 겹치지 않는다.
  const resetLeadView = () => {
    setShowDismissedLeadsOnMap(false);
    setShowRejectedLeadsOnMap(false);
  };
  const selectDismissedView = (value: boolean | ((current: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(showDismissedLeadsOnMap) : value;
    setShowDismissedLeadsOnMap(next);
    if (next) setShowRejectedLeadsOnMap(false);
  };
  const selectRejectedView = (value: boolean | ((current: boolean) => boolean)) => {
    const next = typeof value === "function" ? value(showRejectedLeadsOnMap) : value;
    setShowRejectedLeadsOnMap(next);
    if (next) setShowDismissedLeadsOnMap(false);
  };
  // CC-21: 유통사 영업을 켠 회사만 "매장|유통사" 전환이 보인다(서버가 distributorSales로 알려 줌).
  const [mapDistributorSales, setMapDistributorSales] = useState(distributorSales);
  const [mapTargetType, setMapTargetType] = useState<"restaurant" | "distributor">("restaurant");
  // 지도 위 "리드 전체" 표시에도 업종·개시일 필터를 걸 수 있게 합니다(2026-08-24 피드백: "지도상에서
  // 날짜 필터, 업종 필터가 있어야 좋을 것 같아"). 신규 리드 탭의 필터와는 별도 상태입니다 — 탭이
  // 다른 화면이라 상태를 공유하면 오히려 "왜 지도에서 리드가 안 보이지" 하는 혼란을 줄 수 있습니다.
  const [unplacedCustomerCount, setUnplacedCustomerCount] = useState(0);
  // 주소를 좌표로 못 바꾼 거래처 id — 안내 "주소 확인"·검색 결과 "좌표 없음" 표시에 쓴다.
  const [unplacedCustomerIds, setUnplacedCustomerIds] = useState<string[]>([]);
  // 근사 위치(근처로 표시)로 놓은 거래처 id — 안내·검색 결과 칩·상세에 "위치 추정"을 보여 준다.
  const [approximateCustomerIds, setApproximateCustomerIds] = useState<string[]>([]);
  const handleCustomerGeocodeFailed = useCallback((count: number, ids: string[], approximateIds: string[]) => {
    setUnplacedCustomerCount(count);
    const same = (a: string[], b: string[]) => a.length === b.length && a.every((id, index) => id === b[index]);
    setUnplacedCustomerIds((old) => (same(old, ids) ? old : ids));
    setApproximateCustomerIds((old) => (same(old, approximateIds) ? old : approximateIds));
  }, []);
  // 날짜 입력칸은 입력할 때마다 바로 필터링하지 않고, "조회" 버튼을 눌러야 실제 필터(Applied)에
  // 반영되도록 Draft/Applied 상태를 분리합니다(2026-08-24 피드백: "리드들의 날짜 기간을 설정하면
  // 조회 버튼이 필요해보여").
  // 숨김(제외) 처리한 리드도 나중에 다시 거래할 수 있으니, 지도에서 완전히 사라지게 하지 않고
  // "활성/숨김" 필터로 전환해서 볼 수 있게 합니다(2026-08-24 피드백: "숨김처리하게되면 별도의
  // 필터값이 있으면 좋을 것 같아 ... 추후에 숨김처리한 거래처도 거래할 수도 있으니깐").
  // 네이버 부동산의 지역 드릴다운을 참고해, 검색창 아래에 시군구 → 동 단위로 리드를 좁혀볼 수 있는
  // 칩 목록을 둡니다(2026-08-24 피드백: "시군구, 동 구분하여 리드 구분을 하게끔 만들것"). 동은
  // 시군구를 먼저 골라야 그 안의 동만 추려서 보여줍니다.
  // 지도 앱처럼 한 번에 하나의 업무 드로어만 엽니다. 리드 탭을 누르면 별도 설정 메뉴를
  // 거치지 않고 리드 데이터를 불러오고, 신규/영업 구분과 지도 마커·목록을 같은 기준으로 맞춥니다.
  function setMapPanelMode(mode: MapPanelMode) {
    setMapPanelModeState(mode);
    try {
      window.localStorage.setItem(MAP_PANEL_MODE_STORAGE_KEY, mode === "newLead" || mode === "salesLead" ? "customer" : mode);
    } catch {
      // 저장소 차단 시 현재 탭에서만 상태를 유지합니다.
    }
    if (mode === "split") {
      setLeftCollapsed(false);
      setRightCollapsed(false);
      // 시안 ⑫: 3분할은 신규 리드 목록·지도 표시가 기본입니다(넓은 화면만 — 모바일은 지도 핀이 넘침).
      if (typeof window !== "undefined" && window.matchMedia?.("(min-width: 1024px)").matches) {
        setRightPanelTab("leads");
        resetLeadView();
        if (mapLeadTypeFilter === "all") setMapLeadTypeFilter("new");
        setMapLeadsVisible(true);
      }
      return;
    }
    if (mode === "driver") {
      setLeftCollapsed(false);
      setRightCollapsed(true);
      return;
    }
    if (mode === "map") {
      setLeftCollapsed(true);
      setRightCollapsed(true);
      return;
    }
    setLeftCollapsed(true);
    setRightCollapsed(false);
    if (mode === "customer") {
      setRightPanelTab("stores");
      return;
    }
    setRightPanelTab("leads");
    setMapLeadsVisible(true);
    resetLeadView();
    setMapLeadTypeFilter(mode === "newLead" ? "new" : "sales");
  }

  function setMapLeadsVisible(visible: boolean) {
    setShowAllLeadsOnMap(visible);
  }
  // 카드 안에 줄이 늘거나 줄 때(신규 리드 반경 열기, 리드 전체 필터 표시 등) ResizeObserver가 항상
  // 제때 다시 계산해 주는 건 아니라서(2026-08-24 발견: "내 현재위치 이모티콘 위치가 동떨어져있어") —
  // 카드 높이를 바꾸는 대표 상태들이 바뀔 때마다 렌더 직후 한 번 더 명시적으로 재계산합니다.
  useEffect(() => {
    recomputeMapHeaderOffset();
  }, [
    recomputeMapHeaderOffset,
    leadRadiusOpen,
    leadRadiusAnchorMode,
    leadRadiusPoint,
    leadRadiusResult,
    leadRadiusError,
    showAllLeadsOnMap,
    allLeadsLoadState,
    mapLeadIndustryFilter,
    mapLeadTypeFilter,
    mapLeadOpenDateStart,
    mapLeadOpenDateEnd,
    showDismissedLeadsOnMap,
    showRejectedLeadsOnMap,
    mapLeadRegionSigungu,
    mapLeadRegionDong
  ]);
  // 업종·메뉴 기반 견적서 초안 — 지도 위 리드 카드/거래처 카드 어디서든 열 수 있는 공용 상태입니다.
  const [quoteSubject, setQuoteSubject] = useState<QuoteSubject | null>(null);
  const ledgerFallbackStores = useMemo(() => createStoreRowsFromLedgerMarkers(mapMarkers), [mapMarkers]);
  const sourceReady = routePlan.source === "supabase" || ledgerFallbackStores.length > 0;
  const routeSeedStores = useMemo(() => {
    const routeStores = routePlan.source === "supabase" ? createStoreRows(routePlan, mapMarkers) : [];
    return routeStores.length ? routeStores : ledgerFallbackStores;
  }, [ledgerFallbackStores, mapMarkers, routePlan]);
  // manualDrivers도 넘겨야 "새 담당자·배송차 추가"로 등록한, 아직 거래처가 없는 담당자가 빈 배송차로
  // 목록에 보입니다(2026-08-24 발견: 이전에는 manualVehicles만 반영되어 담당자만 추가하면 목록에
  // 나타나지 않는 버그가 있었음 — 삭제 기능을 테스트하다 발견).
  const activeVehicleMasterNames = useMemo(
    () => vehicleMasterRecords.filter((vehicle) => vehicle.status === "active").map((vehicle) => vehicle.name),
    [vehicleMasterRecords]
  );
  const baseDeliveryVehicles = useMemo(
    // storeEdits(개별 거래처에서 담당자·배송차를 바꾼 편집 내역)를 그룹핑 전에 먼저 반영해야, 편집
    // 직후 지도 필터(deliveryVehicleId)와 거래처 상세 화면이 같은 배송차를 가리킵니다. 2026-08-27
    // 피드백("배송담당자 필터랑 거래처 상세 필터랑 데이터가 안맞아") 대응.
    () =>
      createDeliveryVehiclesFromStores(
        applyStoreEditsForVehicleGrouping(routeSeedStores, storeEdits),
        vehicleFuelTypes,
        // 차량 마스터가 있는 회사에서는 과거 브라우저 localStorage의 수동 차량을 다시 합치지
        // 않습니다. 오래된 수동 항목이 활성 마스터 3대 옆에 빈 4번째 차량으로 재생성되는 원인이
        // 되므로, 마스터를 등록 차량의 유일한 기준으로 사용합니다.
        vehicleMasterAvailable ? activeVehicleMasterNames : Array.from(new Set([...manualVehicles, ...activeVehicleMasterNames])),
        manualDrivers
      ),
    [routeSeedStores, storeEdits, vehicleFuelTypes, manualVehicles, activeVehicleMasterNames, manualDrivers, vehicleMasterAvailable]
  );
  const deliveryVehicles = useMemo(() => applyVehicleEdits(baseDeliveryVehicles, vehicleEdits), [baseDeliveryVehicles, vehicleEdits]);
  // "미배정" 자동 그룹은 실제로 저장된 배송차가 아니므로, 헤더의 "N대" 배지에는 실제 배송차 수만
  // 셉니다(2026-08-24 피드백 대응으로 미배정 그룹을 도입하며 함께 정리).
  // 차량 마스터가 준비된 회사에서는 "차량 N대"가 반드시 활성 차량 마스터 수를 뜻해야 합니다.
  // 거래처에 담당자만 지정된 레거시 배정 그룹이나 모바일 GPS 계정은 실제 차량이 아니므로 이 수에
  // 합치지 않습니다. 마스터 테이블을 아직 적용하지 않은 회사에서만 기존 배정 그룹 수로 폴백합니다.
  const realVehicleCount = useMemo(
    () => vehicleMasterAvailable ? activeVehicleMasterNames.length : deliveryVehicles.filter((vehicle) => !vehicle.isUnassigned).length,
    [activeVehicleMasterNames.length, deliveryVehicles, vehicleMasterAvailable]
  );
  const fuelTypeConfiguredByVehicleId = useMemo(() => {
    const map = new Map<string, boolean>();
    baseDeliveryVehicles.forEach((vehicle) => map.set(vehicle.id, Boolean(vehicleFuelTypes?.[vehicle.driver])));
    return map;
  }, [baseDeliveryVehicles, vehicleFuelTypes]);
  const allStores = useMemo(() => applyStoreEdits(createDeliveryStoreRows(deliveryVehicles, mapMarkers), storeEdits), [deliveryVehicles, mapMarkers, storeEdits]);
  const storeById = useMemo(() => new Map(allStores.map((store) => [store.id, store])), [allStores]);
  const geocodableStoresForRadius = useMemo(() => allStores.filter((store) => store.address?.trim()), [allStores]);

  // overridePoint/overrideRadiusKm은 지도 클릭으로 반경을 방금 고정한 직후(handleLeadSearchLocked)
  // 처럼, setLeadRadiusPoint/setLeadRadiusKm 호출 직후라 아직 state에 반영되지 않은 값을 즉시 검색에
  // 써야 할 때 씁니다(React state 업데이트는 비동기라 바로 이어서 읽으면 이전 값이 잡히는 문제 방지).
  async function runMapLeadRadiusSearch(overridePoint?: { lat: number; lng: number } | null, overrideRadiusKm?: number) {
    setLeadRadiusError("");
    const point = overridePoint !== undefined ? overridePoint : leadRadiusPoint;
    const radiusKmValue = overrideRadiusKm ?? leadRadiusKm;
    if (leadRadiusAnchorMode === "customer" && !leadRadiusCustomerId) {
      setLeadRadiusError("기준 거래처를 선택하세요.");
      return;
    }
    if (leadRadiusAnchorMode === "point" && !point) {
      setLeadRadiusError("지도를 클릭해 반경을 먼저 선택하세요.");
      return;
    }
    const anchorStore = geocodableStoresForRadius.find((store) => store.id === leadRadiusCustomerId);
    if (leadRadiusAnchorMode === "customer" && !anchorStore) {
      setLeadRadiusError("선택한 거래처에 주소 정보가 없습니다.");
      return;
    }

    setLeadRadiusSearching(true);
    setLeadRadiusResult(null);
    const signal = beginRadiusRequest();
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/nearby"), {
        signal,
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchorMode: leadRadiusAnchorMode,
          anchorCustomer: anchorStore ? { id: anchorStore.id, name: anchorStore.name, address: anchorStore.address } : undefined,
          anchorPoint: leadRadiusAnchorMode === "point" ? point : undefined,
          radiusKm: radiusKmValue
        })
      });
      const payload = await response.json().catch(() => null);
      if (signal.aborted) return; // 더 새 탐색이 시작됨 — 옛 응답은 버린다(M9)
      if (!response.ok) {
        setLeadRadiusError(payload?.message || "리드 탐색에 실패했습니다.");
        return;
      }
      setLeadRadiusResult(payload);
      if (payload?.leads?.length) setRightPanelTab("leads");
    } catch {
      if (signal.aborted) return;
      setLeadRadiusError("네트워크 오류로 리드 탐색을 완료하지 못했습니다.");
    } finally {
      if (!signal.aborted) setLeadRadiusSearching(false);
    }
  }

  // 지도를 클릭해 반경을 만든 순간(네이버 지도 반경 도구 참고) — 좌표·반경(기본 0.5km)을 state에
  // 반영하고 곧바로 그 값으로 탐색합니다.
  function handleLeadSearchLocked(point: { lat: number; lng: number }, radiusMeters: number) {
    const radiusKmValue = Math.min(50, Math.max(0.1, Math.round((radiusMeters / 1000) * 10) / 10));
    setLeadRadiusPoint(point);
    setLeadRadiusKm(radiusKmValue);
    void runMapLeadRadiusSearch(point, radiusKmValue);
  }

  // "지점 다시 선택"/"지우기" — 고정된 지점을 지우고 지도 클릭으로 새 지점을 다시 고를 수 있게
  // 합니다. 지도 위 말풍선의 지우기 버튼(onClear)과 오른쪽 클릭에서도 이 함수를 그대로 씁니다.
  function resetLeadSearchPoint() {
    setLeadRadiusPoint(null);
    setLeadRadiusResult(null);
    setLeadRadiusError("");
    setPreviewLeadId("");
  }

  // 네이버 지도의 "이 지역에서 검색" 칩처럼, 클릭 없이도 지금 보고 있는 지도 중심을 기준으로
  // 미리 정해둔 반경으로 바로 탐색합니다 — 마우스 정밀 조작이 부담스러운 사용자를 위한 빠른 경로입니다.
  function runPresetRadiusSearch(radiusKmValue: number) {
    if (!mapCenterPoint) {
      setLeadRadiusError("지도가 아직 준비되지 않았습니다. 잠시 후 다시 시도하세요.");
      return;
    }
    setLeadRadiusAnchorMode("point");
    setLeadRadiusPoint(mapCenterPoint);
    setLeadRadiusKm(radiusKmValue);
    void runMapLeadRadiusSearch(mapCenterPoint, radiusKmValue);
  }

  // "전체 리드 보기" 켤 때 활성 신규 리드를 한 번 불러옵니다(반경 검색과 무관 — 거래처 등록 여부와
  // 상관없이 지금 살아있는 리드 전체를 지도에 뿌립니다). 신규 리드 탭의 목록 로딩과 같은 엔드포인트를
  // 씁니다.
  async function loadAllLeadsForMap() {
    setAllLeadsLoadState("loading");
    const signal = beginAllLeadsRequest();
    try {
      // 숨김(제외) 리드도 함께 받아와서, "활성/숨김" 토글로 클라이언트에서 바로 전환할 수 있게
      // 합니다(2026-08-24 피드백: 숨김 처리한 거래처도 나중에 다시 볼 수 있어야 함).
      const params = new URLSearchParams({ excludeExcluded: "false" });
      if (showOutsideSalesAreaOnMap) params.set("includeOutsideSalesArea", "true");
      if (mapTargetType === "distributor") params.set("targetType", "distributor");
      if (LEAD_STORE_AREA_FEATURE_ENABLED && mapLeadAreaRange) params.set("storeArea", mapLeadAreaRange);
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits?${params.toString()}`), { cache: "no-store", signal });
      const payload = await response.json().catch(() => null);
      if (signal.aborted) return; // 필터가 더 바뀌어 새 요청이 나감 — 옛 응답은 버린다(M9)
      if (!response.ok || !payload) {
        setAllLeadsLoadState("error");
        return;
      }
      setMapDistributorSales(payload.distributorSales === true);
      setAllLeadsForMap(Array.isArray(payload.leads) ? payload.leads : []);
      setMapSalesRegionsConfigured(payload.salesRegionsConfigured !== false);
      setAllLeadsLoadState("ready");
    } catch {
      if (!signal.aborted) setAllLeadsLoadState("error");
    }
  }

  const handleMapSalesAreaSnapshot = useCallback((snapshot: SalesAreaSelectorSnapshot) => {
    setMapSalesRegionsConfigured(snapshot.salesAreaState.effectiveAreas.length > 0);
  }, []);

  useEffect(() => {
    let active = true;
    fetch(withPermitLeadCompanyQuery("/api/leads/permits/keyword-search-regions"), { cache: "no-store" })
      .then((response) => response.json())
      .then((payload) => {
        if (!active) return;
        setMapSalesRegionsConfigured(Boolean(payload?.salesAreaState?.effectiveAreas?.length));
        const labelsOf = (rows: unknown) =>
          Array.isArray(rows) ? rows.map((row) => (row && typeof row === "object" && "label" in row ? String((row as { label?: unknown }).label || "") : "")).filter(Boolean) : [];
        const effective: string[] = Array.isArray(payload?.salesAreaState?.effectiveAreas) ? payload.salesAreaState.effectiveAreas.map(String) : [];
        setMapAssignedAreaLabels(Array.from(new Set([...labelsOf(payload?.regions), ...effective])));
        setMapExpansionAreaLabels(labelsOf(payload?.expansionCandidateRegions));
      })
      .catch(() => {
        if (active) setMapSalesRegionsConfigured(null);
      });
    return () => { active = false; };
  }, []);

  // 2026-09-07 버그 리포트: "리드 표에서는 잘 가져오는데 지도에서는 표시가 안 된다" — 원인은
  // allLeadsLoadState가 한 번 "ready"가 되면(첫 토글 때 리드가 아직 0건이었던 경우 등) 이후
  // 새 리드가 수집돼도 idle 상태가 아니라서 이 useEffect가 다시 실행되지 않아 지도가 그 시점의
  // 낡은(대개 빈) 목록을 계속 보여주던 것이었습니다. "리드" 버튼을 켤 때마다(즉 showAllLeadsOnMap이
  // false→true로 바뀔 때마다) idle 여부와 무관하게 항상 다시 불러오도록 고쳐, 꺼졌다 켜면 최신
  // 데이터로 새로고침됩니다.
  useEffect(() => {
    if (showAllLeadsOnMap) void loadAllLeadsForMap();
  }, [showAllLeadsOnMap, showOutsideSalesAreaOnMap, mapLeadAreaRange, mapTargetType]);
  // 검색창에서 "기거래처·리드·미등록 매장"을 한 번에 찾을 수 있어야 한다는 피드백(2026-08-24: "검색창에도
  // 검색하면 기거래처랑, 리드랑, 다른 거래처 검색까지 다양하게 진행하면 될 것 같아")에 맞춰, "리드 전체
  // 보기"를 켜지 않은 상태에서 검색만 하더라도 리드 데이터를 미리 불러와 검색 결과에 포함시킵니다.
  useEffect(() => {
    if (query.trim().length >= 2 && allLeadsLoadState === "idle") void loadAllLeadsForMap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query]);

  // 지도 위 리드 카드에서 바로 "관심 없음"으로 숨길 수 있게 합니다(2026-08-24 피드백: "관심 없으면
  // 숨김처리 하면 좋을 것 같네"). 신규 리드 탭의 runLeadAction과 같은 액션 API를 쓰지만, 이 컴포넌트
  // (SalesRouteMapWorkspace)와 신규 리드 탭(PermitLeadsView)은 서로 다른 컴포넌트라 상태를 공유하지
  // 않으므로, 지도 쪽 로컬 목록만 직접 갱신합니다.
  async function dismissLeadFromMap(lead: PermitLeadItem) {
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "exclude", result: "제외" })
      });
      if (!response.ok) return;
      // 목록에서 완전히 지우지 않고 상태만 "제외"로 바꿔둡니다 — "숨김 리드" 필터로 다시 볼 수 있고,
      // 나중에 복구도 가능합니다(2026-08-24 피드백).
      setAllLeadsForMap((current) => current.map((item) => (item.id === lead.id ? { ...item, status: "제외" } : item)));
      setLeadRadiusResult((current) => (current ? { ...current, leads: current.leads.filter((item) => item.id !== lead.id) } : current));
      setPreviewLeadId("");
    } catch {
      // 지도 위 가벼운 액션이라 실패해도 조용히 둡니다 — 신규 리드 탭에서 다시 시도할 수 있습니다.
    }
  }

  // 숨김(제외) 처리한 리드를 다시 활성으로 되돌립니다. 전용 "복구" 액션 타입은 따로 없어 기존
  // "hold"(검토 필요) 액션을 재사용합니다 — 제외 상태만 아니면 지도/리드 탭 양쪽에서 정상적으로
  // 다시 보이기 때문입니다.
  async function restoreLeadFromMap(lead: PermitLeadItem) {
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "hold" })
      });
      if (!response.ok) return;
      setAllLeadsForMap((current) => current.map((item) => (item.id === lead.id ? { ...item, status: "검토 필요" } : item)));
    } catch {
      // 지도 위 가벼운 액션이라 실패해도 조용히 둡니다.
    }
  }

  async function updateMapLeadStage(leadId: string, status: string, memo?: string): Promise<{ ok: boolean; message?: string }> {
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${leadId}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType: "status", memo, result: status })
      });
      const payload = (await response.json().catch(() => null)) as { message?: string } | null;
      if (!response.ok) return { ok: false, message: payload?.message || "단계 변경에 실패했습니다." };
      setAllLeadsForMap((current) => current.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)));
      setLeadRadiusResult((current) => current
        ? { ...current, leads: current.leads.map((lead) => (lead.id === leadId ? { ...lead, status } : lead)) }
        : current);
      return { ok: true };
    } catch {
      return { ok: false, message: "네트워크 상태를 확인한 뒤 다시 시도해 주세요." };
    }
  }

  // 담당자와 별개로 거래처에 직접 지정된 배송차 이름들 + 아직 배정 전인 배송차(manualVehicles)를
  // 합쳐, "배송차" 드롭다운에서 고를 수 있는 선택지 목록을 만듭니다.
  const vehicleNameOptions = useMemo(() => {
    // 2026-09-07 피드백("배송차, 담당자 값들이 통일되지 않은 것 같아 확인해") 대응: 저장 시점에는
    // trim()하지만(lib/store.ts의 upsertCustomerMaster), 그 전에 이미 앞뒤 공백이 섞여 저장된
    // 기존 거래처 레코드가 있으면 눈에는 똑같아 보이는 배송차 이름이 서로 다른 옵션으로 두 번
    // 나타납니다. trim() 기준으로 모아 이런 레거시 중복이 드롭다운에 갈라져 보이지 않게 합니다.
    const names = new Set<string>();
    allStores.forEach((store) => {
      const trimmed = store.deliveryVehicleName?.trim();
      if (trimmed) names.add(trimmed);
    });
    manualVehicles.forEach((name) => {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    });
    activeVehicleMasterNames.forEach((name) => {
      const trimmed = name.trim();
      if (trimmed) names.add(trimmed);
    });
    return Array.from(names).sort();
  }, [activeVehicleMasterNames, allStores, manualVehicles]);
  const registeredStoreNames = useMemo(() => new Set(allStores.map((store) => store.name.trim().toLowerCase())), [allStores]);
  // 이미 거래처로 등록된 곳은 "미등록 매장" 목록에서 빼서 중복으로 보이지 않게 합니다.
  const unregisteredResults = useMemo(
    () => externalResults.filter((result) => result.name.trim() && !registeredStoreNames.has(result.name.trim().toLowerCase())),
    [externalResults, registeredStoreNames]
  );
  // 검색창은 원래 "미등록 매장" 카카오맵 검색 결과만 목록으로 보여줬습니다 — 이미 등록된 거래처는
  // 지도 마커 필터링(gradeBaseStores)으로만 걸러져서, 목록에는 안 보이고 지도 위에서만 좁혀지다
  // 보니 "검색하면 등록 안 된 곳만 나온다"는 오해를 샀습니다. 등록된 거래처 매치도 같은 드롭다운에
  // 목록으로 보여주고, 클릭하면 그 거래처로 바로 이동하도록 추가합니다.
  const registeredMatches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword.length < 2) return [];
    return allStores
      .filter((store) => `${store.name} ${store.region} ${store.address || ""} ${store.deliveryDriver || ""}`.toLowerCase().includes(keyword) || phoneDigitsMatch(store.phone, keyword))
      .slice(0, 30);
  }, [allStores, query]);
  // 신규 리드도 같은 검색창에서 함께 찾을 수 있게 합니다(2026-08-24 피드백). 이미 "제외" 처리한 리드는
  // 다른 신규 리드 목록들과 마찬가지로 기본 검색 결과에서는 뺍니다.
  const leadMatches = useMemo(() => {
    const keyword = query.trim().toLowerCase();
    if (keyword.length < 2) return [];
    return allLeadsForMap
      .filter((lead) => !isHiddenLeadStatus(lead.status))
      .filter((lead) => `${lead.businessName} ${lead.address || ""} ${lead.industryPrimary || ""}`.toLowerCase().includes(keyword) || phoneDigitsMatch(lead.phone, keyword))
      .slice(0, 30);
  }, [allLeadsForMap, query]);
  // 검색어가 바뀌면 이전 검색 결과에 대한 체크 선택은 의미가 없으므로 함께 초기화합니다.
  useEffect(() => {
    setSelectedResultIds(new Set());
    setBulkRegisterMessage("");
  }, [query]);
  // M2b: 패널 줄 번호 = 지도 번호 핀(묶음 순서 거래처 → 영업 → 신규 → 미등록).
  const searchRows = useMemo(
    () =>
      assignSearchPins<SearchResultRow>({
        customers: registeredMatches.map((store) => ({ id: store.id || store.name, name: store.name, address: store.address || store.region || "", chip: customerLocationChip(customerLocationState(store.id, unplacedCustomerIds, approximateCustomerIds), relationshipLabel(store.relationshipStatus, "거래처")) })),
        salesLeads: leadMatches.filter((lead) => getPermitLeadType(lead) === "sales").map((lead) => ({ id: lead.id, name: lead.businessName, address: lead.address || "주소 확인 필요", industry: lead.industryPrimary || undefined, chip: lead.status || "영업" })),
        newLeads: leadMatches.filter((lead) => getPermitLeadType(lead) !== "sales").map((lead) => ({ id: lead.id, name: lead.businessName, address: lead.address || "주소 확인 필요", industry: lead.industryPrimary || undefined, chip: lead.status || "신규" })),
        unregistered: unregisteredResults.map((result) => ({ id: externalResultId(result), name: result.name, address: result.roadAddress || result.address, industry: result.industry || undefined, chip: "카카오 미등록" }))
      }),
    [registeredMatches, leadMatches, unregisteredResults, unplacedCustomerIds, approximateCustomerIds]
  );
  const gradeBaseStores = useMemo(
    () =>
      allStores.filter((store) => {
        const keyword = query.trim().toLowerCase();
        const matchesQuery =
          !keyword ||
          `${store.name} ${store.region} ${store.address || ""} ${store.businessRegistrationNumber} ${store.deliveryDriver || ""} ${store.deliveryVehicleName || ""}`
            .toLowerCase()
            .includes(keyword);
        const matchesVehicle = vehicleFilterId === "all" || store.deliveryVehicleId === vehicleFilterId;
        // 거래 종료는 기본 숨김("거래 종료 거래처 보기"로 표시), 사업자 폐업은 "이탈 제외"를 켰을 때만 뺀다.
        const matchesStatus = isStoreVisibleByStatus(store, { excludeClosed: excludeClosedStores, showTerminated: showTerminatedStores });
        return matchesQuery && matchesVehicle && matchesStatus;
      }),
    [allStores, excludeClosedStores, query, showTerminatedStores, vehicleFilterId]
  );
  const visibleStores = useMemo(
    () => gradeBaseStores.filter((store) => gradeFilter === "all" || store.grade === gradeFilter),
    [gradeBaseStores, gradeFilter]
  );
  const selectedStore = allStores.find((store) => store.id === selectedId);
  const previewStore = allStores.find((store) => store.id === previewStoreId);
  // 거래 종료 거래처를 검색으로 열었는데 기본 지도에서는 숨겨져 있을 때 "지도에 보기"(거래 종료 보기 켜고, 이탈 제외가 가리고 있으면 끔).
  const showTerminatedOnMap = () => {
    setShowTerminatedStores(true);
    setExcludeClosedStores(false);
  };
  const hiddenOnMapHandler = (store?: StoreRow) => (store && isTerminatedHiddenOnMap(store, { excludeClosed: excludeClosedStores, showTerminated: showTerminatedStores }) ? showTerminatedOnMap : undefined);
  const gradeCounts = useMemo(() => countGrades(gradeBaseStores), [gradeBaseStores]);
  const routeTotals = useMemo(() => getStoreTotals(visibleStores), [visibleStores]);
  const allStoreTotals = useMemo(() => getStoreTotals(allStores), [allStores]);
  // 2026-09-07 피드백("배송이완료되면 완료가 표시되었으면 해") 대응: 오늘(최근 20시간) 안에 배송완료로
  // 기록된 거래처 id 목록입니다. 라이브 차량 위치와 같은 폴링 주기를 타도록 같은 요청에
  // completions=true를 얹어, 새 폴링을 따로 만들지 않고 한 번에 최신 상태를 받아옵니다.
  // (이 블록이 예전에 병합 과정에서 두 벌로 중복 선언돼 빌드가 깨졌던 것을 여기서 하나로 정리했습니다.)
  const [todayCompletions, setTodayCompletions] = useState<DeliveryCompletionEvent[]>([]);
  // 2026-09-07 피드백("모바일로 접속했는데 PC는 새로고침해야 불이 들어와 — 실시간 연동이 필요해,
  // 접속하면 아래에서 팝업이 뜨거나 화면이 조금 강하게 보여졌으면 좋겠어" + 후속 피드백 "속도는
  // 빠를수록 좋은 거야"): 폴링 주기를 15초→8초→4초로 줄여 체감 지연을 최소화했고(기사 앱의 위치
  // 전송 최소 간격도 함께 8초로 단축, mobile-location-reporter.tsx 참고), 이전 폴링에는 없던
  // 차량(기사)이 새로 나타나면 화면 하단에 "OOO 기사님이 접속했습니다" 배너를 몇 초간 띄워
  // 새로고침 없이도 바로 눈에 띄게 합니다.
  const knownVehicleIdsRef = useRef<Set<string> | null>(null);
  const hasRealtimeVehicleRef = useRef(staffVehicleLocations.some((location) => location.displayState === "realtime"));
  const [justConnectedVehicle, setJustConnectedVehicle] = useState<{ at: number; label: string } | null>(null);
  useEffect(() => {
    setLiveVehicleLocations(staffVehicleLocations);
  }, [staffVehicleLocations]);
  useEffect(() => {
    let cancelled = false;
    let toastTimer: number | undefined;
    const load = async () => {
      try {
        const params = new URLSearchParams({ completions: "true", date: getTmsServiceDateKey() });
        if (churnRiskCompanyId) params.set("companyId", churnRiskCompanyId);
        const response = await fetchWithTimeout(`/api/staff/location?${params.toString()}`, { cache: "no-store" }, 8000);
        const payload = (await response.json().catch(() => null)) as { completions?: DeliveryCompletionEvent[]; error?: string; locations?: StaffVehicleLocation[] } | null;
        if (!response.ok) throw new Error(payload?.error || "라이브 차량 위치를 불러오지 못했습니다.");
        if (!cancelled && response.ok && Array.isArray(payload?.locations)) {
          setLiveVehicleConnectionError("");
          setLiveVehicleLocations(payload.locations);
          hasRealtimeVehicleRef.current = payload.locations.some((location) => location.displayState === "realtime");
          const activeIds = new Set(payload.locations.filter((location) => !location.isStale).map((location) => location.id));
          const previousIds = knownVehicleIdsRef.current;
          // 첫 폴링(previousIds === null)에서는 이미 접속해 있던 차량까지 전부 "새로 접속"으로
          // 오탐하지 않도록 알림 없이 기준선만 세웁니다. 그다음 폴링부터 새로 나타난 차량만 알립니다.
          if (previousIds) {
            const newlyConnected = payload.locations.find((location) => !location.isStale && !previousIds.has(location.id));
            if (newlyConnected) {
              const label = newlyConnected.driverName || newlyConnected.deliveryVehicle || "기사";
              setJustConnectedVehicle({ at: Date.now(), label });
              if (toastTimer) window.clearTimeout(toastTimer);
              toastTimer = window.setTimeout(() => setJustConnectedVehicle(null), NOTICE_TOAST_MS);
            }
          }
          knownVehicleIdsRef.current = activeIds;
        }
        if (!cancelled && response.ok && Array.isArray(payload?.completions)) setTodayCompletions(payload.completions);
      } catch (error) {
        // 마지막 정상 좌표는 유지하되 통신 실패를 명확히 표시합니다. 다음 4초 폴링이 성공하면 자동 복구됩니다.
        if (!cancelled) setLiveVehicleConnectionError(error instanceof Error ? error.message : "라이브 차량 연결이 지연되고 있습니다.");
      }
    };
    void load();
    const handleVisibilityChange = () => {
      if (document.visibilityState === "visible") void load();
    };
    document.addEventListener("visibilitychange", handleVisibilityChange);
    let timer = window.setTimeout(function poll() {
      if (document.visibilityState === "visible") void load();
      timer = window.setTimeout(
        poll,
        getStaffMapPollIntervalMs(hasRealtimeVehicleRef.current)
      );
    }, getStaffMapPollIntervalMs(hasRealtimeVehicleRef.current));
    return () => {
      cancelled = true;
      if (toastTimer) window.clearTimeout(toastTimer);
      document.removeEventListener("visibilitychange", handleVisibilityChange);
      window.clearTimeout(timer);
    };
  }, [churnRiskCompanyId]);
  const completedStoreIdsToday = useMemo(() => new Set(todayCompletions.map((completion) => completion.customerId)), [todayCompletions]);
  const vehicleMarkerMeta = useMemo(() => createVehicleMarkerMeta(deliveryVehicles), [deliveryVehicles]);
  const markers = useMemo(
    () => createMarkers(mapMarkers, visibleStores, markerViewMode, vehicleMarkerMeta, completedStoreIdsToday),
    [mapMarkers, markerViewMode, vehicleMarkerMeta, visibleStores, completedStoreIdsToday]
  );
  const selectedLiveVehicle = liveVehicleLocations.find((location) => location.id === selectedLiveVehicleId);
  const liveVehiclesForMap = useMemo(() => {
    const mapEligibleLocations = liveVehicleLocations.filter((location) => location.status !== "offline");
    if (selectedLiveVehicleId) return mapEligibleLocations.filter((location) => location.id === selectedLiveVehicleId);
    if (vehicleFilterId === "all") return mapEligibleLocations;
    const deliveryVehicle = deliveryVehicles.find((vehicle) => vehicle.id === vehicleFilterId);
    return deliveryVehicle ? mapEligibleLocations.filter((location) => liveVehicleMatchesDeliveryGroup(location, deliveryVehicle)) : mapEligibleLocations;
  }, [deliveryVehicles, liveVehicleLocations, selectedLiveVehicleId, vehicleFilterId]);
  const liveVehicleMarkers = useMemo(() => createLiveVehicleMarkers(liveVehiclesForMap, storeById), [liveVehiclesForMap, storeById]);
  const liveVehicleSummary = useMemo(() => {
    const active = liveVehicleLocations.filter((location) => location.displayState === "realtime").length;
    const stale = liveVehicleLocations.filter((location) => location.displayState === "delayed").length;
    const lastOperation = liveVehicleLocations.filter((location) => location.displayState === "last_operation").length;
    const latest = liveVehicleLocations
      .map((location) => (location.lastLocationAt ? new Date(location.lastLocationAt).getTime() : 0))
      .filter((timestamp) => Number.isFinite(timestamp) && timestamp > 0)
      .sort((a, b) => b - a)[0];
    return {
      active,
      latestLabel: latest ? new Date(latest).toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" }) : "수신 전",
      lastOperation,
      stale,
      total: liveVehicleLocations.length
    };
  }, [liveVehicleLocations]);
  const openVehicleAnalysis = useCallback(
    async (vehicle: StaffVehicleLocation, date = getTmsServiceDateKey()) => {
      setVehicleAnalysisDate(date);
      setVehicleAnalysis({ completions: [], events: [], error: "", loading: true, vehicle });
      try {
        const search = new URLSearchParams({ completions: "true", date, events: "true", userId: vehicle.userId });
        if (vehicle.deliveryVehicle) search.set("deliveryVehicle", vehicle.deliveryVehicle);
        if (vehicle.driverName) search.set("driverName", vehicle.driverName);
        if (churnRiskCompanyId) search.set("companyId", churnRiskCompanyId);
        const response = await fetchWithTimeout(`/api/staff/location?${search.toString()}`, { cache: "no-store" }, 10000);
        const payload = (await response.json().catch(() => null)) as { completions?: DeliveryCompletionEvent[]; events?: StaffLocationEvent[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "운행 기록을 불러오지 못했습니다.");
        setVehicleAnalysis({ completions: payload?.completions || [], events: payload?.events || [], error: "", loading: false, vehicle });
      } catch (error) {
        setVehicleAnalysis({ completions: [], events: [], error: error instanceof Error ? error.message : "운행 기록을 불러오지 못했습니다.", loading: false, vehicle });
      }
    },
    [churnRiskCompanyId]
  );
  // 팝업을 열지 않고 메인 지도에 실제 이동 경로만 겹쳐 보여줍니다. 같은 차량을 다시 누르면 꺼집니다.
  const toggleMainMapRoute = useCallback(
    async (vehicle: StaffVehicleLocation) => {
      if (mainMapRouteVehicleId === vehicle.id) {
        setMainMapRouteVehicleId("");
        setMainMapRouteEvents([]);
        setMainMapRouteError("");
        return;
      }
      setMainMapRouteVehicleId(vehicle.id);
      setMainMapRouteEvents([]);
      setMainMapRouteError("");
      setMainMapRouteLoading(true);
      try {
        const search = new URLSearchParams({ events: "true", hours: "12", userId: vehicle.userId });
        if (vehicle.deliveryVehicle) search.set("deliveryVehicle", vehicle.deliveryVehicle);
        if (vehicle.driverName) search.set("driverName", vehicle.driverName);
        if (churnRiskCompanyId) search.set("companyId", churnRiskCompanyId);
        const response = await fetchWithTimeout(`/api/staff/location?${search.toString()}`, { cache: "no-store" }, 10000);
        const payload = (await response.json().catch(() => null)) as { events?: StaffLocationEvent[]; error?: string } | null;
        if (!response.ok) throw new Error(payload?.error || "실제 이동 경로를 불러오지 못했습니다.");
        setMainMapRouteEvents(payload?.events || []);
      } catch (error) {
        setMainMapRouteError(error instanceof Error ? error.message : "실제 이동 경로를 불러오지 못했습니다.");
      } finally {
        setMainMapRouteLoading(false);
      }
    },
    [churnRiskCompanyId, mainMapRouteVehicleId]
  );
  const mainMapRoutePath = useMemo(
    () => (mainMapRouteVehicleId ? createLocationRoutePath(mainMapRouteEvents) : []),
    [mainMapRouteVehicleId, mainMapRouteEvents]
  );
  const mainMapRouteMetrics = useMemo(() => summarizeLocationEvents(mainMapRouteEvents), [mainMapRouteEvents]);
  const mainMapRouteVehicle = useMemo(
    () => liveVehicleLocations.find((vehicle) => vehicle.id === mainMapRouteVehicleId) || null,
    [liveVehicleLocations, mainMapRouteVehicleId]
  );
  // 미등록 매장은 메인 지도에만 별도 마커로 합쳐 표시합니다.
  const unregisteredMapMarkers = useMemo(
    () =>
      unregisteredResults.map((result, index) => ({
        address: result.roadAddress || result.address,
        id: externalResultId(result),
        label: "미등록",
        name: result.name,
        tone: "unregistered" as const,
        x: 50,
        y: 50 + index
      })),
    [unregisteredResults]
  );
  // 지도 탭에서 "리드 반경 체크"를 켰을 때만 리드를 마커로 함께 보여줍니다(기본은 꺼짐 — 거래처 마커만).
  const leadRadiusMapMarkers: KakaoMapMarker[] = useMemo(() => {
    if (!leadRadiusOpen || !leadRadiusResult) return [];
    return leadRadiusResult.leads
      .filter((lead) => mapLeadTypeFilter === "all" || getPermitLeadType(lead) === mapLeadTypeFilter)
      .filter((lead) => showClosedLeadsOnMap || !isClosedLead(lead))
      .filter((lead) => lead.address)
      .map((lead) => ({
        address: lead.address!,
        grade: (lead.grade || undefined) as "A" | "B" | "C" | undefined,
        id: lead.id,
        label: `${getPermitLeadType(lead) === "new" ? "신규" : "영업"} ${lead.distanceKm}km`,
        leadType: getPermitLeadType(lead),
        markerColor: leadLayerColor(getPermitLeadType(lead) === "new" ? "new" : "sales"),
        name: lead.businessName,
        tone: "lead" as const,
        // 2026-09-07 피드백("신규 리드가 의정부쪽으로 모여져있어서") 대응: 저장된 위경도가 있으면
        // 그대로 넘겨 재지오코딩을 건너뜁니다(주소 텍스트 지오코딩은 부정확한 매칭도 성공 처리되어
        // 서로 다른 주소가 한 좌표로 뭉치는 원인이 됩니다).
        lat: Number.isFinite(lead.latitude) ? lead.latitude : undefined,
        lng: Number.isFinite(lead.longitude) ? lead.longitude : undefined,
        x: 0,
        y: 0
      }));
  }, [leadRadiusOpen, leadRadiusResult, mapLeadTypeFilter, showClosedLeadsOnMap]);
  // "활성/숨김" 토글의 1차 분리 — 숨김 보기에서는 status가 "제외"인 것만, 활성 보기에서는 그 외
  // 전부를 보여줍니다(2026-08-24 피드백: 숨김 리드도 별도로 조회 가능해야 함).
  const statusScopedLeadsForMap = useMemo(
    () => scopeLeadsByStatus(allLeadsForMap, { showClosed: showClosedLeadsOnMap, showDismissed: showDismissedLeadsOnMap, showRejected: showRejectedLeadsOnMap }),
    [allLeadsForMap, showDismissedLeadsOnMap, showRejectedLeadsOnMap, showClosedLeadsOnMap]
  );
  // 지도 "리드 전체"용 업종 빠른 선택 옵션(개수 많은 순, 상위 12개) — 활성/숨김 범위 기준이라
  // 토글을 바꾸면 옵션 목록도 그 범위에 맞게 갱신됩니다.
  const mapLeadIndustryOptions = useMemo(() => {
    const counts = new Map<string, number>();
    statusScopedLeadsForMap.forEach((lead) => {
      const industry = lead.industryPrimary || "미분류";
      counts.set(industry, (counts.get(industry) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [statusScopedLeadsForMap]);
  // 지도 "리드 전체"용 지역(시군구) 빠른 선택 옵션 — 네이버 부동산처럼 검색창 아래에서 시군구를
  // 고르면 그 안의 동만 다시 추려 보여줍니다.
  const mapLeadRegionOptions = useMemo(() => {
    const counts = new Map<string, number>();
    statusScopedLeadsForMap.forEach((lead) => {
      const { sigungu } = parseLeadRegion(lead.address);
      if (!sigungu) return;
      counts.set(sigungu, (counts.get(sigungu) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 30);
  }, [statusScopedLeadsForMap]);
  const mapLeadDongOptions = useMemo(() => {
    if (!mapLeadRegionSigungu) return [];
    const counts = new Map<string, number>();
    statusScopedLeadsForMap.forEach((lead) => {
      const region = parseLeadRegion(lead.address);
      if (region.sigungu !== mapLeadRegionSigungu || !region.dong) return;
      counts.set(region.dong, (counts.get(region.dong) || 0) + 1);
    });
    return Array.from(counts.entries()).sort((a, b) => b[1] - a[1]).slice(0, 14);
  }, [statusScopedLeadsForMap, mapLeadRegionSigungu]);
  // 시안 ⑫ 필터 칩 · 팝오버 -------------------------------------------------------------
  const mapLeadStageCounts = useMemo(() => {
    const counts = new Map<string, number>();
    statusScopedLeadsForMap.forEach((lead) => {
      const stage = toLeadStageValue(lead.status);
      counts.set(stage, (counts.get(stage) || 0) + 1);
    });
    return counts;
  }, [statusScopedLeadsForMap]);
  const mapRegionFilterGroups = useMemo(() => {
    const countBySigungu = new Map(mapLeadRegionOptions);
    const lastToken = (label: string) => label.trim().split(/\s+/).pop() || "";
    const used = new Set<string>();
    const fromLabels = (labels: string[]) => {
      const items: Array<[string, number]> = [];
      labels.forEach((label) => {
        const matched = mapLeadRegionOptions.find(([sigungu]) => areaLabelMatchesSigungu(label, sigungu))?.[0] || lastToken(label);
        if (!matched || used.has(matched)) return;
        used.add(matched);
        items.push([matched, countBySigungu.get(matched) || 0]);
      });
      return items;
    };
    const assigned = fromLabels(mapAssignedAreaLabels);
    const expansion = fromLabels(mapExpansionAreaLabels);
    const others = mapLeadRegionOptions.filter(([sigungu]) => !used.has(sigungu));
    return [
      { empty: "등록된 영업 지역이 없습니다.", helper: "담당 · 매일 수집", items: assigned, title: "내 영업 지역" },
      { empty: "확장 후보 지역이 없습니다.", helper: "확장 후보", items: expansion, title: "영업 필요 지역" },
      ...(others.length ? [{ empty: "", helper: "리드 주소 기준", items: others, title: "그 밖의 지역" }] : [])
    ];
  }, [mapAssignedAreaLabels, mapExpansionAreaLabels, mapLeadRegionOptions]);
  const mapOpenDatePreset = useMemo(() => {
    if (!mapLeadOpenDateStart && !mapLeadOpenDateEnd) return "";
    if (mapLeadOpenDateEnd) return "custom";
    const days = [7, 30, 90].find((value) => new Date(Date.now() - value * 86_400_000).toISOString().slice(0, 10) === mapLeadOpenDateStart);
    return days ? String(days) : "custom";
  }, [mapLeadOpenDateStart, mapLeadOpenDateEnd]);
  function applyMapOpenDatePreset(days: number) {
    const start = days > 0 ? new Date(Date.now() - days * 86_400_000).toISOString().slice(0, 10) : "";
    setMapLeadOpenDateStart(start);
    setMapLeadOpenDateEnd("");
    setMapLeadOpenDateStartDraft(start);
    setMapLeadOpenDateEndDraft("");
  }
  const stageLabelOf = (value: string) => LEAD_STAGE_OPTIONS.find((option) => option.value === value)?.label || value;
  const mapFilterChips: Array<{ active: boolean; icon: LucideIcon; key: MapFilterPopKey; label: string; muted?: boolean; title: string }> = [
    { active: Boolean(mapLeadRegionSigungu), icon: MapPin, key: "region", label: summarizeMultiFilter(mapLeadRegionSigungu, "영업 지역"), title: "영업 지역" },
    { active: Boolean(mapLeadIndustryFilter), icon: Utensils, key: "industry", label: summarizeMultiFilter(mapLeadIndustryFilter, "업종"), title: "업종" },
    { active: gradeFilter !== "all", icon: Star, key: "more", label: gradeFilter === "all" ? "우선순위" : `${gradeFilter}등급`, title: "우선순위 등급" },
    {
      active: LEAD_STORE_AREA_FEATURE_ENABLED && Boolean(mapLeadAreaRange),
      icon: Ruler,
      key: "size",
      label: LEAD_STORE_AREA_FEATURE_ENABLED && mapLeadAreaRange
        ? STORE_AREA_RANGE_OPTIONS.find((option) => option.value === mapLeadAreaRange)?.label || "규모(평)"
        : "규모(평)",
      muted: !LEAD_STORE_AREA_FEATURE_ENABLED,
      title: LEAD_STORE_AREA_FEATURE_ENABLED ? "매장 규모(평)" : "매장 규모(평) · 준비 중"
    },
    {
      active: Boolean(mapOpenDatePreset),
      icon: CalendarDays,
      key: "date",
      label: mapOpenDatePreset === "custom" ? "인허가 기간 직접" : mapOpenDatePreset ? `인허가 ${mapOpenDatePreset}일` : "인허가일",
      title: "인허가일 — 대표자 변경·재허가 날짜일 수 있어 실제 개업일과 다를 수 있습니다"
    },
    { active: Boolean(mapLeadStageFilter), icon: ListFilter, key: "stage", label: summarizeMultiFilter(mapLeadStageFilter, "단계", stageLabelOf), title: "단계" }
  ];
  function toggleMapFilterPop(key: MapFilterPopKey, anchor: HTMLElement) {
    if (mapFilterPop === key) {
      setMapFilterPop("");
      return;
    }
    const container = mapHeaderRef.current;
    if (container) {
      const containerRect = container.getBoundingClientRect();
      const anchorRect = anchor.getBoundingClientRect();
      const popWidth = Math.min(300, containerRect.width - 16);
      const left = Math.max(8, Math.min(anchorRect.left - containerRect.left, containerRect.width - popWidth - 8));
      setMapFilterPopLeft(Math.round(left));
      setMapFilterPopTop(Math.round(anchorRect.bottom - containerRect.top + 6));
    }
    setMapFilterPop(key);
  }
  useEffect(() => {
    if (!mapFilterPop) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Element | null;
      if (!target) return;
      if (mapFilterPopRef.current?.contains(target) || target.closest("[data-map-filter-chip]")) return;
      setMapFilterPop("");
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") setMapFilterPop("");
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, [mapFilterPop]);
  const filteredAllLeadsForMap = useMemo(
    () => filterMapLeads(statusScopedLeadsForMap, {
      areaRange: LEAD_STORE_AREA_FEATURE_ENABLED ? mapLeadAreaRange : "",
      distributorTarget: mapTargetType === "distributor",
      hasReminder: (lead) => Boolean(getMapLeadReminderLabel(lead)),
      industry: mapLeadIndustryFilter,
      openDateEnd: mapLeadOpenDateEnd,
      openDateStart: mapLeadOpenDateStart,
      regionDong: mapLeadRegionDong,
      regionSigungu: mapLeadRegionSigungu,
      reminderOnly: mapLeadReminderOnly,
      stage: mapLeadStageFilter,
      typeFilter: mapLeadTypeFilter
    }).filter((lead) => gradeFilter === "all" || lead.grade === gradeFilter),
    [statusScopedLeadsForMap, mapLeadTypeFilter, mapTargetType, mapLeadIndustryFilter, mapLeadStageFilter, mapLeadAreaRange, mapLeadReminderOnly, mapLeadOpenDateStart, mapLeadOpenDateEnd, mapLeadRegionSigungu, mapLeadRegionDong, gradeFilter]
  );
  // "전체 리드 보기"는 반경 검색 결과와 별개입니다 — 둘 다 켜져 있으면 중복 마커를 피하려고
  // 반경 검색 결과에 이미 있는 id는 걸러냅니다.
  const allLeadsMapMarkers: KakaoMapMarker[] = useMemo(() => {
    if (!showAllLeadsOnMap) return [];
    const radiusLeadIds = new Set(leadRadiusMapMarkers.map((marker) => marker.id));
    return filteredAllLeadsForMap
      .filter((lead) => lead.address && !radiusLeadIds.has(lead.id))
      .map((lead) => ({
        address: lead.address!,
        grade: (lead.grade || undefined) as "A" | "B" | "C" | undefined,
        id: lead.id,
        label: mapTargetType === "distributor" ? "유통사" : getPermitLeadType(lead) === "new" ? "신규" : "영업",
        leadType: getPermitLeadType(lead),
        // 유통사는 색을 정하지 않아 등급별 색을 씁니다.
        markerColor: mapTargetType === "distributor" ? undefined : leadLayerColor(getPermitLeadType(lead) === "new" ? "new" : "sales"),
        // 기거래처 근접 리드는 지도에서 청록 헤일로 + ★ 뱃지로 구분합니다(2026-08-24 피드백:
        // 앰버는 등급 마커 색과 섞여 탁해 보인다는 지적을 받아 청록으로 변경).
        nearAnchor: (lead.scoreBreakdown?.route_fit_score ?? 0) >= 11,
        name: lead.businessName,
        tone: "lead" as const,
        // 2026-09-07 피드백("신규 리드가 의정부쪽으로 모여져있어서") 대응: 저장된 위경도가 있으면
        // 그대로 넘겨 재지오코딩을 건너뜁니다.
        lat: Number.isFinite(lead.latitude) ? lead.latitude : undefined,
        lng: Number.isFinite(lead.longitude) ? lead.longitude : undefined,
        x: 0,
        y: 0,
        // 2026-09-12 버그 수정("리드 선택하면 지도가 안 보이다가 목록에서 클릭하면 그제서야 보임"):
        // "전체 리드 보기"는 반경 제한이 없어 리드가 전국에 흩어질 수 있습니다. 이 마커들까지 초기
        // 화면 맞추기에 포함되면 지도가 극단적으로 축소돼 사실상 빈 화면처럼 보이므로 제외합니다
        // (kakao-address-map.tsx의 KakaoMapMarker.excludeFromAutoBounds 참고). 반경이 제한된
        // "반경 리드"(leadRadiusMapMarkers)에는 이 플래그를 붙이지 않아 그쪽 동작은 그대로입니다.
        // 유통사는 수가 적어 마커 범위로 지도를 맞춥니다.
        excludeFromAutoBounds: mapTargetType !== "distributor"
      }));
  }, [showAllLeadsOnMap, filteredAllLeadsForMap, leadRadiusMapMarkers, mapTargetType]);
  // 우측 목록은 원본 조회 결과가 아니라 실제 생성된 지도 마커 ID를 기준으로 만듭니다. 반경과 전체
  // 보기를 함께 켠 경우 두 집합을 합치고, 주소가 없어 마커를 만들 수 없는 리드는 목록에서도 제외합니다.
  const detailLead = useMemo(
    () => (detailLeadId ? [...(leadRadiusResult?.leads || []), ...allLeadsForMap].find((lead) => lead.id === detailLeadId) || null : null),
    [detailLeadId, leadRadiusResult, allLeadsForMap]
  );
  const leadsForRightPanel = useMemo(() => {
    const visibleLeadIds = new Set([...leadRadiusMapMarkers, ...allLeadsMapMarkers].map((marker) => marker.id));
    if (!visibleLeadIds.size) return [];
    const candidates = [...(leadRadiusResult?.leads || []), ...filteredAllLeadsForMap];
    const seen = new Set<string>();
    return candidates.filter((lead) => {
      if (!visibleLeadIds.has(lead.id) || seen.has(lead.id)) return false;
      seen.add(lead.id);
      return true;
    });
  }, [leadRadiusResult, filteredAllLeadsForMap, leadRadiusMapMarkers, allLeadsMapMarkers]);
  // 통합 탐색에서 신규/영업 리드를 명시적으로 고른 경우 결과가 0건이어도 거래처 목록으로
  // 되돌아가지 않습니다. 빈 결과 자체가 현재 필터의 유효한 상태이므로 리드 패널에서 안내합니다.
  const activeRightPanelTab: "stores" | "leads" = rightPanelTab;
  const mapDisplayMarkers = useMemo(
    () => [...(customersLayerOn ? markers : markers.filter((marker) => marker.tone !== "customer")), ...unregisteredMapMarkers, ...leadRadiusMapMarkers, ...allLeadsMapMarkers, ...liveVehicleMarkers],
    [customersLayerOn, markers, unregisteredMapMarkers, leadRadiusMapMarkers, allLeadsMapMarkers, liveVehicleMarkers]
  );
  const visibleMapLayerCounts = useMemo(() => {
    const leadMarkers = [...leadRadiusMapMarkers, ...allLeadsMapMarkers];
    return {
      customers: markers.filter((marker) => marker.tone === "customer").length,
      completedCustomers: markers.filter((marker) => marker.tone === "customer" && marker.id && completedStoreIdsToday.has(marker.id)).length,
      newLeads: leadMarkers.filter((marker) => marker.label?.startsWith("신규")).length,
      salesLeads: leadMarkers.filter((marker) => marker.label?.startsWith("영업")).length,
      activeVehicles: liveVehicleLocations.filter((location) => location.displayState === "realtime").length,
      staleVehicles: liveVehicleLocations.filter((location) => location.displayState === "delayed").length,
      lastOperationVehicles: liveVehicleLocations.filter((location) => location.displayState === "last_operation").length
    };
  }, [markers, leadRadiusMapMarkers, allLeadsMapMarkers, liveVehicleLocations, completedStoreIdsToday]);
  const deliveryDefaults = useMemo(() => getDeliveryDefaults(deliveryVehicles), [deliveryVehicles]);
  const mapReadyStoreCount = useMemo(() => allStores.filter((store) => Boolean(store.address?.trim())).length, [allStores]);
  const visibleMapReadyStoreCount = useMemo(() => visibleStores.filter((store) => Boolean(store.address?.trim())).length, [visibleStores]);
  const missingAddressCount = allStores.length - mapReadyStoreCount;
  const selectedVehicle = deliveryVehicles.find((vehicle) => vehicle.id === vehicleFilterId);
  const isVehicleFiltered = vehicleFilterId !== "all";
  const selectedVehicleLabel = selectedVehicle ? selectedVehicle.name : "전체 거래처";
  // 시안 ⑫ 격자: 왼쪽(목록 340px) · 지도 · 오른쪽(담당자 250px)이 겹치지 않고 붙어 있습니다.
  const mapLeftPanelVisible = (mapPanelMode === "split" || mapPanelMode === "driver") && !leftCollapsed;
  const mapLeftPanelMini = (mapPanelMode === "split" || mapPanelMode === "driver") && leftCollapsed;
  const mapRightPanelVisible =
    searchTabOpen || ((mapPanelMode === "split" || mapPanelMode === "customer" || mapPanelMode === "newLead" || mapPanelMode === "salesLead") && !rightCollapsed);
  // 11/15 대표: PC에서는 왼쪽 = 거래처·신규·영업 목록(340px), 오른쪽 = 담당자·차량. 모바일은 위에서 아래 순서 그대로.
  const mapLeftInsetClass = mapRightPanelVisible ? "lg:left-[340px] xl:left-[380px]" : "lg:left-0";
  const mapRightInsetClass = mapLeftPanelMini ? "lg:right-14" : !mapLeftPanelVisible ? "lg:right-0" : mapPanelMode === "split" ? "lg:right-[250px]" : "lg:right-[320px] xl:right-[360px]";
  // 레이어 바·조건 요약은 지도 칸(패널 사이) 안에 있으므로 패널 폭과 무관하게 지도 칸 기준 왼쪽 12px입니다.
  const mapOverlayLeftClass = "lg:left-3";
  const activeExplorerMode: MapPanelMode = mapPanelMode === "driver"
    ? "driver"
    : activeRightPanelTab === "stores"
      ? "customer"
      : mapLeadTypeFilter === "sales"
        ? "salesLead"
        : "newLead";
  // 담당자·거래처·신규·영업을 어느 목록에서도 같은 탭으로 전환합니다.
  const rightListTabs = (
    <MapExplorerTabs
      active={activeExplorerMode}
      counts={{
        customers: allStores.length,
        drivers: deliveryVehicles.filter((vehicle) => !vehicle.isUnassigned).length,
        newLeads: statusScopedLeadsForMap.filter((lead) => getPermitLeadType(lead) === "new").length,
        salesLeads: statusScopedLeadsForMap.filter((lead) => getPermitLeadType(lead) === "sales").length
      }}
      onSelect={(tab) => {
        const activeTab = activeExplorerMode;
        if (tab === activeTab && !rightCollapsed) {
          setMapPanelMode("map");
          return;
        }
        setMapPanelMode(tab);
      }}
    />
  );
  // 지도 왼쪽 아래 "현재 조건" 한 줄(시안 ⑫ filterText).
  const mapFilterSummaryText = [
    isVehicleFiltered ? `${selectedVehicleLabel} 담당만` : "",
    mapLeadRegionSigungu ? summarizeMultiFilter(mapLeadRegionSigungu, "") : "",
    mapLeadIndustryFilter ? summarizeMultiFilter(mapLeadIndustryFilter, "") : "",
    mapOpenDatePreset === "custom" ? "인허가 기간 직접" : mapOpenDatePreset ? `인허가 최근 ${mapOpenDatePreset}일` : "",
    mapLeadStageFilter ? `단계 ${summarizeMultiFilter(mapLeadStageFilter, "", stageLabelOf)}` : "",
    mapLeadReminderOnly ? "리마인드만" : ""
  ].filter(Boolean).join(" · ") || "전체 조건";
  const selectedGradeLabel = gradeFilter === "all" ? "전체" : `${gradeFilter}등급`;
  const selectedGradeCount = gradeFilter === "all" ? gradeBaseStores.length : gradeCounts[gradeFilter];
  const kpiSummary = activeView === "course" && courseSummary ? courseSummary : null;
  const distanceKpiHelper = !sourceReady ? "거래처 등록 대기" : kpiSummary ? "티맵 경유 순서 기준" : "출발지에서 각 거래처까지";
  const durationKpiHelper = !sourceReady ? "거래처 등록 대기" : kpiSummary ? "티맵 경유 순서 기준" : "출발지에서 각 거래처까지";
  const vehicleFuelTypeById = useMemo(() => {
    const map = new Map<string, "gasoline" | "diesel">();
    deliveryVehicles.forEach((vehicle) => map.set(vehicle.id, vehicle.fuelType || "diesel"));
    return map;
  }, [deliveryVehicles]);
  const fuelDistanceByType = useMemo(() => {
    const totals: Record<"diesel" | "gasoline", number> = { diesel: 0, gasoline: 0 };
    visibleStores.forEach((store) => {
      const fuelType = (store.deliveryVehicleId && vehicleFuelTypeById.get(store.deliveryVehicleId)) || "diesel";
      totals[fuelType] += Number(store.distanceKm || 0);
    });
    return totals;
  }, [visibleStores, vehicleFuelTypeById]);
  const selectedVehicleFuelType = selectedVehicle?.fuelType || "diesel";
  const activeFuelTypes: Array<"diesel" | "gasoline"> = kpiSummary
    ? [selectedVehicleFuelType]
    : (["diesel", "gasoline"] as const).filter((type) => fuelDistanceByType[type] > 0);
  const estimatedFuelCostWon = kpiSummary
    ? estimateFuelCostWon(kpiSummary.distanceKm, fuelPrices[selectedVehicleFuelType]?.pricePerLiter || 0)
    : estimateFuelCostWon(fuelDistanceByType.diesel, fuelPrices.diesel?.pricePerLiter || 0) +
      estimateFuelCostWon(fuelDistanceByType.gasoline, fuelPrices.gasoline?.pricePerLiter || 0);
  const fuelPricesReady = activeFuelTypes.length > 0 && activeFuelTypes.every((type) => fuelPrices[type]);
  const fuelKpiHelper = !sourceReady
    ? "거래처 등록 대기"
    : fuelPricesReady
      ? activeFuelTypes
          .map((type) => `${fuelPrices[type]?.sourceLabel} ${fuelPrices[type]?.pricePerLiter.toLocaleString()}원/L`)
          .join(" · ")
      : "OPINET 유가 확인 중";
  const activeFilterLabels = [
    query.trim() ? `검색: ${query.trim()}` : "",
    isVehicleFiltered ? `배송차: ${selectedVehicleLabel}` : "",
    gradeFilter !== "all" ? `등급: ${selectedGradeLabel}` : "",
    excludeClosedStores ? "이탈 제외" : "",
    showTerminatedStores ? "거래 종료 포함" : ""
  ].filter(Boolean);
  const dataRegistrationHref = useMemo(() => {
    if (typeof window === "undefined") return "/?type=customer-master";
    const companyId = new URLSearchParams(window.location.search).get("companyId");
    const params = new URLSearchParams({ type: "customer-master" });
    if (companyId) params.set("companyId", companyId);
    return `/?${params.toString()}`;
  }, []);
  const selectVehicle = (vehicleId: string) => {
    setVehicleFilterId(vehicleId);
    setSelectedLiveVehicleId("");
    setGradeFilter("all");
    setMapLeadIndustryFilter("");
    setMapLeadStageFilter("");
    setMapLeadReminderOnly(false);
    setMapFocusId("");
    setPreviewStoreId("");
    setSelectedId("");
  };
  // 2026-10-25: 담당자 선택·거래처 상세를 주소(URL)에 남겨 브라우저/휴대폰 뒤로가기로 이전 화면에 돌아오게 합니다.
  // 상태 → 주소 동기화는 값이 실제로 달라졌을 때만 pushState하므로, 뒤로가기로 돌아온 직후에는 다시 쌓이지 않습니다.
  const historySyncMountedRef = useRef(false);
  const detailHistoryPushedRef = useRef(false);
  // 패널(3분할·담당자·거래처·신규·영업·지도만)과 지도 위 미리보기 카드도 뒤로가기로 되돌립니다.
  const panelBaselineRef = useRef<MapPanelMode | null>(null);
  const lastSyncedPanelRef = useRef<MapPanelMode>(mapPanelMode);
  useEffect(() => {
    if (typeof window === "undefined" || initialView === "leads") return;
    if (!historySyncMountedRef.current) return;
    const params = new URLSearchParams(window.location.search);
    // 상세를 닫을 때, 방금 상세를 열면서 쌓은 기록이면 새 기록을 쌓지 않고 한 칸 뒤로 갑니다.
    // (닫은 뒤 뒤로가기를 누르면 상세가 다시 열리는 혼란 방지)
    if (!selectedId && params.has("detail") && detailHistoryPushedRef.current) {
      detailHistoryPushedRef.current = false;
      window.history.back();
      return;
    }
    if (vehicleFilterId !== "all") params.set("staff", vehicleFilterId);
    else params.delete("staff");
    if (selectedId) params.set("detail", selectedId);
    else params.delete("detail");
    if (panelBaselineRef.current === null && mapPanelMode !== lastSyncedPanelRef.current && !params.has("panel")) {
      panelBaselineRef.current = lastSyncedPanelRef.current;
    }
    if (panelBaselineRef.current !== null && mapPanelMode !== panelBaselineRef.current) params.set("panel", mapPanelMode);
    else params.delete("panel");
    lastSyncedPanelRef.current = mapPanelMode;
    const hadPin = params.has("pin");
    const pin = previewStoreId ? `s:${previewStoreId}` : previewLeadId ? `l:${previewLeadId}` : "";
    if (pin) params.set("pin", pin);
    else params.delete("pin");
    const next = `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`;
    const current = `${window.location.pathname}${window.location.search}${window.location.hash}`;
    if (next !== current) {
      // 미리보기 카드끼리 바꿀 때는 기록을 늘리지 않습니다(뒤로가기 한 번이면 카드가 닫힘).
      const onlyPinChanged = hadPin && Boolean(pin) && next.replace(/[?&]pin=[^&#]*/, "") === current.replace(/[?&]pin=[^&#]*/, "");
      if (onlyPinChanged) window.history.replaceState(null, "", next);
      else window.history.pushState(null, "", next);
      detailHistoryPushedRef.current = Boolean(selectedId);
    }
  }, [initialView, mapPanelMode, previewLeadId, previewStoreId, selectedId, vehicleFilterId]);
  useEffect(() => {
    if (typeof window === "undefined" || initialView === "leads") return;
    const applyFromLocation = () => {
      const params = new URLSearchParams(window.location.search);
      detailHistoryPushedRef.current = false;
      const view = params.get("view");
      setActiveView(view === "customers" || view === "course" || view === "history" ? view : "map");
      setVehicleFilterId(params.get("staff") || "all");
      setSelectedId(params.get("detail") || "");
      setSelectedLiveVehicleId("");
      const pin = params.get("pin") || "";
      setPreviewStoreId(pin.startsWith("s:") ? pin.slice(2) : "");
      setPreviewLeadId(pin.startsWith("l:") ? pin.slice(2) : "");
      setMapFocusId("");
      const panel = params.get("panel");
      const panelModes: MapPanelMode[] = ["split", "driver", "customer", "newLead", "salesLead", "map"];
      if (panel && panelModes.includes(panel as MapPanelMode)) {
        lastSyncedPanelRef.current = panel as MapPanelMode;
        setMapPanelMode(panel as MapPanelMode);
      } else if (panelBaselineRef.current) {
        lastSyncedPanelRef.current = panelBaselineRef.current;
        setMapPanelMode(panelBaselineRef.current);
      }
    };
    // 저장된 패널 모드 복원(위쪽 effect)이 첫 기록으로 쌓이지 않도록 기준값을 맞춥니다.
    try {
      const savedMode = normalizeStoredMapPanelMode(window.localStorage.getItem(MAP_PANEL_MODE_STORAGE_KEY));
      if (savedMode) lastSyncedPanelRef.current = savedMode;
    } catch {
      // 저장소 차단 시 기본값 유지
    }
    applyFromLocation();
    historySyncMountedRef.current = true;
    window.addEventListener("popstate", applyFromLocation);
    return () => window.removeEventListener("popstate", applyFromLocation);
    // 최초 1회만 등록합니다. setState 함수는 안정적이라 의존성에서 뺍니다.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialView]);

  const selectLiveVehicle = (location: StaffVehicleLocation) => {
    const matchingGroup = deliveryVehicles.find((vehicle) => liveVehicleMatchesDeliveryGroup(location, vehicle));
    setVehicleFilterId(matchingGroup?.id || "all");
    setSelectedLiveVehicleId(location.id);
    setGradeFilter("all");
    setPreviewLeadId("");
    setPreviewStoreId("");
    setSelectedId("");
    setMapFocusId(`vehicle-${location.id}`);
    setMarkerViewMode("vehicle");
    if (mainMapRouteVehicleId !== location.id) void toggleMainMapRoute(location);
  };

  const focusOrigin = () => {
    if (initialView === "leads") {
      const params = new URLSearchParams(window.location.search);
      window.location.assign(`/map${params.size ? `?${params.toString()}` : ""}`);
      return;
    }
    setActiveView("map");
    setMapFocusId(originMarkerId);
    setPreviewStoreId("");
    setSelectedId("");
  };

  const resetWorkspace = () => {
    if (initialView === "leads") {
      const params = new URLSearchParams(window.location.search);
      window.location.assign(`/map${params.size ? `?${params.toString()}` : ""}`);
      return;
    }
    setActiveView("map");
    const params = new URLSearchParams(window.location.search);
    params.delete("view");
    window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`);
    setCourseSummary(null);
    setExcludeClosedStores(false);
    setGradeFilter("all");
    setMapFocusId("");
    setMarkerViewMode("grade");
    setPreviewStoreId("");
    setQuery("");
    setSelectedId("");
    setVehicleFilterId("all");
  };
  const changeWorkspaceView = (nextView: WorkspaceView) => {
    if (nextView === "leads") {
      if (initialView === "leads") return;
      setActiveView("map");
      setMapLeadsVisible(true);
      setRightPanelTab("leads");
      setLeftCollapsed(true);
      setRightCollapsed(false);
      setMapPanelMode(mapLeadTypeFilter === "sales" ? "salesLead" : "newLead");
      const params = new URLSearchParams(window.location.search);
      params.delete("view");
      window.history.replaceState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`);
      return;
    }
    if (initialView === "leads") {
      const params = new URLSearchParams(window.location.search);
      if (nextView === "map") params.delete("view");
      else params.set("view", nextView);
      window.location.assign(`/map${params.size ? `?${params.toString()}` : ""}`);
      return;
    }
    setActiveView(nextView);
    const params = new URLSearchParams(window.location.search);
    if (nextView === "map") params.delete("view");
    else params.set("view", nextView);
    window.history.pushState(null, "", `${window.location.pathname}${params.size ? `?${params.toString()}` : ""}${window.location.hash}`);
    setPreviewStoreId("");
    setMapFocusId("");
    if (nextView === "course" && vehicleFilterId === "all" && deliveryVehicles[0]) {
      selectVehicle(deliveryVehicles[0].id);
    }
  };

  useEffect(() => saveLocalJson(localStoreKeys.attachments, storeAttachments), [storeAttachments]);
  useEffect(() => saveLocalJson(localStoreKeys.histories, storeHistories), [storeHistories]);
  useEffect(() => saveLocalJson(localStoreKeys.storeEdits, storeEdits), [storeEdits]);
  useEffect(() => saveLocalJson(localStoreKeys.storeEditsSavedAt, storeEditsSavedAt), [storeEditsSavedAt]);
  useEffect(() => saveLocalJson(localStoreKeys.vehicleEdits, vehicleEdits), [vehicleEdits]);
  useEffect(() => saveLocalJson(localStoreKeys.vehicleEditsSavedAt, vehicleEditsSavedAt), [vehicleEditsSavedAt]);
  useEffect(() => saveLocalJson(localStoreKeys.manualDrivers, manualDrivers), [manualDrivers]);
  useEffect(() => saveLocalJson(localStoreKeys.manualVehicles, manualVehicles), [manualVehicles]);

  useEffect(() => {
    const handleFullscreenChange = () => setIsFullscreen(document.fullscreenElement === workspaceRef.current);
    document.addEventListener("fullscreenchange", handleFullscreenChange);
    return () => document.removeEventListener("fullscreenchange", handleFullscreenChange);
  }, []);

  async function toggleFullscreen() {
    if (document.fullscreenElement) {
      await document.exitFullscreen().catch(() => null);
      return;
    }
    setStatsExpanded(false);
    await workspaceRef.current?.requestFullscreen().catch(() => null);
  }

  useEffect(() => {
    if (!sourceReady) {
      setFuelPrices({ diesel: null, gasoline: null });
      return;
    }

    let active = true;

    Promise.all(
      (["diesel", "gasoline"] as const).map((fuelType) =>
        fetch(`/api/fuel/opinet?fuelType=${fuelType}`, { cache: "no-store" })
          .then((response) => (response.ok ? response.json() : null))
          .catch(() => null)
      )
    ).then(([diesel, gasoline]) => {
      if (!active) return;
      setFuelPrices({ diesel, gasoline });
    });

    return () => {
      active = false;
    };
  }, [sourceReady]);

  async function updateStore(storeId: string, edit: StoreEdit) {
    const currentStore = allStores.find((store) => store.id === storeId);
    if (!currentStore) return { persisted: false };

    const nextStore = { ...currentStore, ...edit };
    // 2026-08-28 피드백 대응(저장 실패해도 화면엔 저장된 것처럼 남음): PATCH가 실패하면 낙관적으로
    // 반영해둔 이 값을 되돌려야 하므로, 덮어쓰기 전 이전 값을 스냅샷으로 남겨둡니다.
    const previousEdit = storeEdits[storeId];
    setStoreEdits((current) => ({ ...current, [storeId]: { ...current[storeId], ...edit } }));
    setStoreEditsSavedAt((current) => ({ ...current, [storeId]: Date.now() }));

    try {
      const response = await fetchWithTimeout("/api/customers", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(toCustomerPayload(nextStore))
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "거래처 저장에 실패했습니다.");
      // 2026-08-31 개선: 동시 편집 감지(낙관적 동시성 제어). 서버가 이 화면이 마지막으로 읽은
      // updated_at과 현재 값이 다르다고 판단하면(그 사이 다른 사람이 먼저 저장) conflict: true를
      // 돌려주고 실제로는 저장하지 않습니다 — 여기서 명확한 에러로 바꿔 아래 catch의 롤백 경로를
      // 그대로 타게 합니다(방금 낙관적으로 반영한 값을 되돌려야 하므로).
      if (payload?.conflict) {
        throw new Error("다른 사용자가 방금 이 정보를 수정했습니다. 새로고침 후 다시 시도해주세요.");
      }
      // 다음 저장에서도 동시 편집 감지가 계속 동작하도록, 서버가 이번에 실제로 반영한 updated_at을
      // 로컬 편집 상태에 함께 남겨둡니다.
      if (payload?.customer?.updatedAt) {
        setStoreEdits((current) => ({
          ...current,
          [storeId]: { ...current[storeId], updatedAt: payload.customer.updatedAt }
        }));
      }
      return { persisted: payload?.persisted !== false };
    } catch (error) {
      // 저장이 실패했으니(네트워크 오류 포함) 낙관적으로 반영했던 값을 이전 상태로 되돌립니다 —
      // 그래야 화면이 "저장된 것처럼" 계속 남아 있지 않습니다.
      setStoreEdits((current) => {
        const next = { ...current };
        if (previousEdit === undefined) delete next[storeId];
        else next[storeId] = previousEdit;
        return next;
      });
      setStoreEditsSavedAt((current) => {
        const next = { ...current };
        if (previousEdit === undefined) delete next[storeId];
        return next;
      });
      throw error;
    }
  }

  // 구글 리뷰 자동 수집(Google Places API)은 호출당 비용이 발생합니다. 카드를 열 때마다 백그라운드로
  // 자동 호출하던 방식(2026-08-18 도입)도 결국 "사용자가 요청하지 않아도 비용이 발생"하는 셈이라
  // 완전히 제거했습니다(2026-08-19). 이제 구글 리뷰 API는 담당자가 "리뷰 새로고침" 버튼을 직접
  // 눌렀을 때만 호출됩니다 — syncGoogleReviews() 핸들러 참고. 네이버·카카오 리뷰는 원래부터 API
  // 비용이 전혀 없는 붙여넣기 방식이라 이 정책과 무관합니다.

  // 사업자 휴폐업 상태(자동 조회)와 별개로, "이 거래처와 더 이상 거래하지 않기로 했다"는 판단은
  // 사람이 직접 내려서 저장합니다. /api/customers의 일반 upsert가 아니라 전용 엔드포인트를 쓰는 이유는
  // lib/store.ts의 setCustomerRelationshipStatus() 주석 참고 — 이 컬럼이 없는 환경에서도 나머지 거래처
  // 저장 기능이 함께 깨지지 않도록 하기 위해서입니다.
  async function updateRelationshipStatus(storeId: string, status: string, note?: string) {
    const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
    const response = await fetch("/api/customers/relationship-status", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ companyId: companyId || undefined, customerId: storeId, status, note })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || "거래 상태 저장에 실패했습니다.");
    setStoreEdits((current) => ({ ...current, [storeId]: { ...current[storeId], relationshipStatus: status } }));
    return { persisted: payload?.updated !== false };
  }

  async function updateVehicle(vehicleId: string, edit: VehicleEdit): Promise<{ ok: boolean; message?: string }> {
    const baseVehicle = baseDeliveryVehicles.find((vehicle) => vehicle.id === vehicleId);

    // 호차명(vehicle.name) 변경은 화면 표시값만 바꾸는 게 아니라, 이 배송차에 실제로 배정된
    // 거래처들의 deliveryVehicle 값을 서버에 일괄 저장합니다. 그래야 새로고침 후에도, 코스 계산
    // 그룹핑에도 새 이름이 그대로 유지됩니다. 아직 거래처가 없는 빈(수동 등록) 배송차는 저장할
    // 거래처가 없으니 로컬 배송차 이름 목록(manualVehicles)의 이름만 바꿉니다.
    if (baseVehicle && edit.name !== undefined) {
      const trimmedName = edit.name.trim();
      if (!trimmedName) return { ok: false, message: "호차명을 입력하세요." };

      if (trimmedName !== baseVehicle.name) {
        if (baseVehicle.stops.length) {
          try {
            const response = await fetch("/api/customers/bulk-vehicle", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({
                companyId: new URLSearchParams(window.location.search).get("companyId") || undefined,
                customerIds: baseVehicle.stops.map((stop) => stop.id),
                deliveryVehicle: trimmedName
              })
            });
            const payload = await response.json().catch(() => null);
            if (!response.ok) return { ok: false, message: payload?.message || "호차명 저장에 실패했습니다." };
          } catch {
            return { ok: false, message: "호차명 저장에 실패했습니다. 네트워크 상태를 확인하세요." };
          }
        }

        setManualVehicles((current) =>
          current.includes(baseVehicle.name) ? current.map((name) => (name === baseVehicle.name ? trimmedName : name)) : current
        );
        router.refresh();
      }
    }

    // 2026-08-28 피드백 대응: 아래 연료 타입 PATCH가 실패할 경우 낙관적으로 반영해둔 값을 되돌릴 수
    // 있도록, 덮어쓰기 전 이전 값을 스냅샷으로 남겨둡니다.
    const previousVehicleEdit = vehicleEdits[vehicleId];
    setVehicleEdits((current) => ({ ...current, [vehicleId]: { ...current[vehicleId], ...edit } }));
    setVehicleEditsSavedAt((current) => ({ ...current, [vehicleId]: Date.now() }));

    if (edit.fuelType === undefined) return { ok: true };
    if (!baseVehicle) return { ok: true };

    try {
      const response = await fetch("/api/delivery-vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: new URLSearchParams(window.location.search).get("companyId") || undefined,
          driverName: baseVehicle.driver,
          fuelType: edit.fuelType
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setVehicleEdits((current) => {
          const next = { ...current };
          if (previousVehicleEdit === undefined) delete next[vehicleId];
          else next[vehicleId] = previousVehicleEdit;
          return next;
        });
        return { ok: false, message: payload?.message || "연료 타입 저장에 실패했습니다." };
      }
      return { ok: true };
    } catch {
      setVehicleEdits((current) => {
        const next = { ...current };
        if (previousVehicleEdit === undefined) delete next[vehicleId];
        else next[vehicleId] = previousVehicleEdit;
        return next;
      });
      return { ok: false, message: "연료 타입 저장에 실패했습니다. 네트워크 상태를 확인하세요." };
    }
  }

  /**
   * "배송차"는 실제로는 거래처의 담당자(deliveryDriver) 값으로 그룹핑해 만드는 화면 전용 개념이라
   * 별도의 차량 테이블이 없습니다. 새 담당자·배송차를 추가한다는 것은 아직 어떤 거래처에도 배정되지
   * 않은 담당자 이름을 미리 등록해 목록에 보이게 하는 것과 같습니다. 연료 타입은 delivery_vehicles에
   * upsert되어 새로고침 후에도 유지되고, manualDrivers는 거래처가 배정되기 전까지 빈 배송차로 보이게
   * 하기 위한 이 화면 전용 로컬 저장값입니다.
   */
  async function addManualDriver(driverName: string, fuelType: "gasoline" | "diesel" = "diesel"): Promise<{ ok: boolean; message?: string }> {
    const trimmed = driverName.trim();
    if (!trimmed) return { ok: false, message: "담당자 이름을 입력하세요." };
    // 배송차 하나에 담당자가 여러 명 섞여 있을 수 있어(같은 트럭을 나눠 쓰는 경우), 배송차의 대표
    // 담당자(vehicle.driver)만으로는 중복 여부를 놓칠 수 있습니다. deliveryDefaults.drivers는 모든
    // 거래처의 담당자를 모은 목록이라 이걸로 확인합니다.
    if (deliveryDefaults.drivers.includes(trimmed)) {
      return { ok: false, message: "이미 등록된 담당자입니다." };
    }

    try {
      const response = await fetch("/api/delivery-vehicles", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: new URLSearchParams(window.location.search).get("companyId") || undefined,
          driverName: trimmed,
          fuelType
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) return { ok: false, message: payload?.message || "담당자 저장에 실패했습니다." };
    } catch {
      return { ok: false, message: "담당자 저장에 실패했습니다. 네트워크 상태를 확인하세요." };
    }

    setManualDrivers((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
    return { ok: true };
  }

  // 2026-08-24 피드백("추가는 있는데 삭제가 없다")에 대응해 처음 만든 삭제 함수는 거래처가 하나도
  // 없는(stops.length === 0) 배송차만 지울 수 있었습니다. 그런데 실제로 화면에 보이는 배송차는
  // 대부분 이미 거래처가 배정돼 있어서 사실상 아무것도 못 지우는 것과 같았습니다(2026-08-24 재피드백:
  // "배송 담당자 필터에서 배송차, 매니저 삭제해야하는데 개선이 안된것 같아"). 이제 배정된 거래처가
  // 있어도, 그 거래처들을 먼저 "담당자 미지정" 상태로 되돌린 뒤 배송차 자체를 지웁니다.
  async function deleteVehicle(vehicle: DeliveryVehicle): Promise<{ ok: boolean; message?: string }> {
    if (vehicle.stops.length > 0) {
      try {
        const clearResponse = await fetch("/api/customers/bulk-clear-assignment", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: new URLSearchParams(window.location.search).get("companyId") || undefined,
            customerIds: vehicle.stops.map((stop) => stop.id)
          })
        });
        if (!clearResponse.ok) {
          const payload = await clearResponse.json().catch(() => null);
          return { ok: false, message: payload?.message || "배정된 거래처를 해제하는 데 실패했습니다." };
        }
      } catch {
        return { ok: false, message: "배정된 거래처를 해제하는 데 실패했습니다. 네트워크 상태를 확인하세요." };
      }
    }

    if (vehicle.driver) {
      try {
        const response = await fetch("/api/delivery-vehicles", {
          method: "DELETE",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            companyId: new URLSearchParams(window.location.search).get("companyId") || undefined,
            driverName: vehicle.driver
          })
        });
        if (!response.ok) {
          const payload = await response.json().catch(() => null);
          return { ok: false, message: payload?.message || "삭제에 실패했습니다." };
        }
      } catch {
        return { ok: false, message: "삭제에 실패했습니다. 네트워크 상태를 확인하세요." };
      }
    }

    setManualDrivers((current) => current.filter((name) => name !== vehicle.driver));
    setManualVehicles((current) => current.filter((name) => name !== vehicle.name));
    setVehicleEdits((current) => {
      if (!(vehicle.id in current)) return current;
      const next = { ...current };
      delete next[vehicle.id];
      return next;
    });
    if (vehicleFilterId === vehicle.id) setVehicleFilterId("all");
    // 배정 해제된 거래처가 있었다면 서버 데이터를 다시 받아와야 그 거래처들이 "미배정"으로 바로 반영됩니다.
    if (vehicle.stops.length > 0) router.refresh();
    return { ok: true };
  }

  // 2026-08-24 피드백("전체 거래처 0km가 되네") 대응: distanceKm은 거리 계산을 한 번도 안 돌린
  // 거래처는 0으로 채워지는데, 계산 자체가 자동으로 도는 곳이 없어서 신규/미계산 거래처는 계속 0으로
  // 남아 있었습니다. 이미 있는 /api/routes/batch-distance(코스 탭 티맵 계산과 같은 API)를 재사용해
  // "전체 거래처" 패널에서 바로 일괄 계산할 수 있게 합니다. 한 번 호출에 최대 25개 주소까지만
  // 받으므로 25개씩 나눠서 순차 호출합니다.
  async function recalculateStoreDistances(missingStores: StoreRow[]): Promise<{ ok: boolean; message?: string }> {
    const destinations = Array.from(new Set(missingStores.map((store) => store.address).filter(Boolean)));
    if (!destinations.length) return { ok: false, message: "계산할 거래처 주소가 없습니다." };
    setRecalculatingDistances(true);
    setDistanceRecalcError("");
    try {
      const companyId = new URLSearchParams(window.location.search).get("companyId") || undefined;
      const allFailures: Array<{ address: string; message: string }> = [];
      for (let index = 0; index < destinations.length; index += 25) {
        const chunk = destinations.slice(index, index + 25);
        const response = await fetch("/api/routes/batch-distance", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId, destinations: chunk })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) {
          const message = payload?.error || "거리 계산에 실패했습니다.";
          setDistanceRecalcError(message);
          return { ok: false, message };
        }
        if (Array.isArray(payload?.failures)) allFailures.push(...payload.failures);
      }
      router.refresh();
      if (allFailures.length) {
        const message = `${allFailures.length}곳은 계산에 실패했습니다 (${allFailures[0].message}).`;
        setDistanceRecalcError(message);
        return { ok: true, message };
      }
      return { ok: true };
    } catch {
      const message = "거리 계산 중 오류가 발생했습니다. 네트워크 상태를 확인하세요.";
      setDistanceRecalcError(message);
      return { ok: false, message };
    } finally {
      setRecalculatingDistances(false);
    }
  }

  /**
   * 위 addManualDriver()는 "코스 계산용 배송차 그룹(담당자 기준)" 목록에 이름을 추가하는 함수이고,
   * 이 함수는 그것과 별개로 거래처마다 독립적으로 지정할 수 있는 "배송차" 값(정식 명칭, 예: "냉동
   * 1호차")을 드롭다운 제안 목록에 미리 추가해 두는 함수입니다. 담당자와 달리 서버에 별도로 저장할
   * 부가 속성(연료 타입 등)이 없어 이 화면 전용 로컬 저장값만으로 충분합니다.
   */
  async function addManualVehicle(vehicleName: string): Promise<{ ok: boolean; message?: string }> {
    const trimmed = vehicleName.trim();
    if (!trimmed) return { ok: false, message: "배송차 이름을 입력하세요." };
    if (vehicleNameOptions.includes(trimmed)) return { ok: false, message: "이미 등록된 배송차입니다." };

    setManualVehicles((current) => (current.includes(trimmed) ? current : [...current, trimmed]));
    return { ok: true };
  }

  function toggleResultSelection(id: string) {
    setSelectedResultIds((current) => {
      const next = new Set(current);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function toggleSelectAllResults() {
    setSelectedResultIds((current) =>
      current.size === unregisteredResults.length ? new Set() : new Set(unregisteredResults.map((result) => externalResultId(result)))
    );
  }

  // 체크한 미등록 매장을 한 번에 거래처로 등록합니다. 하나씩 순차 등록해, 하나가 실패해도
  // 나머지는 계속 저장되도록 하고 마지막에 성공/실패 건수를 함께 보여줍니다.
  async function registerSelectedResults() {
    const targets = unregisteredResults.filter((result) => selectedResultIds.has(externalResultId(result)));
    if (!targets.length || isBulkRegistering) return;

    setIsBulkRegistering(true);
    setBulkRegisterMessage("");
    let succeeded = 0;
    const failures: string[] = [];

    for (const result of targets) {
      try {
        await registerExternalBusinessResult(result);
        succeeded += 1;
      } catch (error) {
        failures.push(`${result.name}: ${error instanceof Error ? error.message : "등록 실패"}`);
      }
    }

    setIsBulkRegistering(false);
    setSelectedResultIds(new Set());
    setBulkRegisterMessage(
      failures.length ? `${succeeded}곳 등록 완료, ${failures.length}곳 실패 (${failures.join(", ")})` : `${succeeded}곳을 거래처로 등록했습니다.`
    );
    if (succeeded) router.refresh();
  }

  // CC-57: 목록 줄·상세 ← →로 리드를 고르면 카드·목록 선택 줄·지도 중심(+주소창 pin=)이 같이 바뀌고, 상세가 열려 있으면 상세도 그 리드로 바뀐다(닫혀 있으면 카드만).
  function selectLeadFromList(leadId: string) {
    setPreviewStoreId("");
    setSelectedId("");
    setPreviewLeadId(leadId);
    setDetailLeadId((current) => (current ? leadId : current));
    const selectedLead = leadsForRightPanel.find((lead) => lead.id === leadId);
    if (selectedLead) setMapLeadTypeFilter(getPermitLeadType(selectedLead));
  }
  // 상세 ← →의 순서 = 지금 왼쪽 목록 순서(필터·정렬 반영). 목록에 없는 리드의 상세면 화살표는 꺼진다.
  const detailLeadIndex = detailLeadId ? leadsForRightPanel.findIndex((lead) => lead.id === detailLeadId) : -1;
  const detailPreviousId = detailLeadIndex > 0 ? leadsForRightPanel[detailLeadIndex - 1].id : "";
  const detailNextId = detailLeadIndex >= 0 && detailLeadIndex < leadsForRightPanel.length - 1 ? leadsForRightPanel[detailLeadIndex + 1].id : "";

  // 검색 결과 줄(상호명)·"지도에서 보기"·"상세": 지도를 그 마커로 옮긴다(11/14 대표: 눌러도 화면이 안 움직임).
  // 좌표를 못 찾은 거래처는 옮길 곳이 없으니 상세를 열어 주소를 고치게 한다.
  function focusSearchResult(group: "customers" | "leads" | "unregistered", id: string) {
    rememberQuery(query);
    setPreviewStoreId("");
    setPreviewLeadId("");
    setSelectedId("");
    setMapFocusId("");
    if (group === "customers") {
      if (unplacedCustomerIds.includes(id)) setSelectedId(id);
      else setPreviewStoreId(id);
    } else if (group === "leads") {
      setPreviewLeadId(id);
      setDetailLeadId((current) => (current ? id : current));
      setMapLeadsVisible(true);
    } else {
      setMapFocusId(id);
    }
  }

  const searchResultsPanel = (
    <MapSearchResultsPanel
      bulkBusy={isBulkRegistering}
      bulkMessage={bulkRegisterMessage}
      customers={searchRows.customers}
      loading={isSearchingExternal}
      message={externalSearchMessage}
      newLeads={searchRows.newLeads}
      onClose={closeSearch}
      onFitAll={() => setFitResultsRequest({ token: Date.now(), ids: Array.from(searchRows.pins.keys()) })}
      onHover={(id) => setHoveredResultId(id || "")}
      onOpenCustomer={(id) => focusSearchResult("customers", id)}
      onFocusRow={focusSearchResult}
      onOpenLead={(id) => focusSearchResult("leads", id)}
      onRegister={(id) => {
        const target = unregisteredResults.find((result) => externalResultId(result) === id);
        if (target) { rememberQuery(query); setPreviewStoreId(""); setPreviewLeadId(""); setQuickRegisterTarget(target); }
      }}
      onRegisterSelected={registerSelectedResults}
      onToggle={toggleResultSelection}
      onToggleAll={toggleSelectAllResults}
      query={query}
      salesLeads={searchRows.salesLeads}
      selectedIds={selectedResultIds}
      unregistered={searchRows.unregistered}
    />
  );

  return (
    <div
      className={`maju-section-card flex min-h-[680px] flex-col text-slate-900 ${
        activeView === "map" ? "lg:h-full lg:min-h-0" : "!overflow-visible lg:min-h-[760px]"
      } ${isFullscreen ? "!rounded-none" : ""}`}
      ref={workspaceRef}
    >
      {justConnectedVehicle ? (
        // 2026-09-07 피드백("접속하면 아래에서 팝업이 뜨거나, 접속하는 화면이 조금 강하게
        // 보여졌으면 좋겠어"): 직원이 새로 접속(위치 보고 시작)하면 화면 하단 중앙에 눈에 띄는
        // 배너를 몇 초간 띄웁니다. 새로고침 없이도 바로 알 수 있도록 8초 폴링과 함께 동작합니다.
        <MapVehicleConnectionToast driverLabel={justConnectedVehicle.label} />
      ) : null}
      {/* 11/4: 리드 화면에서는 지도용 화면 전환(지도·거래처·코스·배송 이력)과 지도 필터 줄을 숨깁니다 — 리드 목록에는 적용되지 않던 필터라 혼란. */}
      {initialView === "leads" ? null : <header className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-3 py-2 lg:flex-row lg:items-center lg:justify-between lg:gap-3 xl:px-4">
        {sourceReady ? null : (
          <div className="flex min-w-0 flex-wrap items-center gap-2">
            <p className="text-xs font-medium text-slate-500 lg:whitespace-nowrap">거래처를 등록하면 지도 운영을 시작할 수 있습니다</p>
          </div>
        )}
        {/* 시안 ⑫ 1줄: 화면 전환(아이콘+이름) | 근무 중 · 보기 방식(3분할/지도+목록/지도만) */}
        <div className="grid w-full min-w-0 grid-cols-[minmax(0,1fr)_auto_auto_auto] items-center gap-1.5 lg:flex lg:flex-1 lg:items-center xl:gap-2">
          <nav className="maju-toolbar-scroll flex h-10 min-w-0 items-center gap-1 overflow-x-auto rounded-[10px] bg-slate-100 p-1 lg:mr-auto lg:w-max" aria-label="운영 지도 화면">
            {workspaceViews.filter((item) => item.value !== "leads").map((item) => {
              const Icon = item.icon;
              const mapLeadPanelOpen = activeView === "map" && (mapPanelMode === "newLead" || mapPanelMode === "salesLead");
              const selected = item.value === "leads"
                ? mapLeadPanelOpen
                : activeView === item.value && !(item.value === "map" && mapLeadPanelOpen);
              return (
                <button
                  aria-current={selected ? "page" : undefined}
                  className={`flex h-[30px] shrink-0 items-center gap-1.5 rounded-lg px-2 text-[13px] transition sm:px-3 ${
                    selected ? "bg-white font-bold text-teal-800 shadow-[0_1px_2px_rgba(0,0,0,.08)]" : "font-medium text-slate-600 hover:bg-white/70 hover:text-slate-900"
                  }`}
                  key={item.value}
                  onClick={() => changeWorkspaceView(item.value)}
                  title={workspaceViewDescriptions[item.value]}
                  type="button"
                >
                  <Icon className="h-4 w-4" />
                  <span className="hidden md:inline">{item.label}</span>
                </button>
              );
            })}
          </nav>
          <button
            aria-label={`근무 중 ${liveVehicleSummary.active}명${liveVehicleSummary.stale ? `, 위치 지연 ${liveVehicleSummary.stale}명` : ""}`}
            className={`flex h-8 shrink-0 items-center gap-1.5 rounded-lg border px-2.5 text-[13px] font-semibold transition ${
              liveVehicleSummary.active
                ? "border-slate-200 bg-white text-slate-900 hover:bg-emerald-50"
                : "border-slate-200 bg-white text-slate-500 hover:bg-slate-50"
            }`}
            onClick={() => setMarkerViewMode("vehicle")}
            title={`근무 중 직원 · 최근 수신 ${liveVehicleSummary.latestLabel} · ${STAFF_LOCATION_FRESHNESS_MINUTES}분 이내 활성${liveVehicleSummary.stale ? ` · 지연 ${liveVehicleSummary.stale}` : ""}${liveVehicleSummary.lastOperation ? ` · 마지막 운행 ${liveVehicleSummary.lastOperation}` : ""}`}
            type="button"
          >
            <span aria-hidden="true" className="relative flex h-2 w-2">
              {liveVehicleSummary.active ? <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-emerald-400 opacity-60" /> : null}
              <span className={`relative inline-flex h-2 w-2 rounded-full ${liveVehicleSummary.active ? "bg-emerald-600" : "bg-slate-300"}`} />
            </span>
            <span className="whitespace-nowrap"><span className="hidden xl:inline">근무 중 </span>{liveVehicleSummary.active}</span>
            {liveVehicleSummary.stale ? <span className="hidden rounded-full bg-amber-50 px-1.5 text-[11px] font-semibold text-amber-800 sm:inline">지연 {liveVehicleSummary.stale}</span> : null}
          </button>
          {activeView === "map" ? (
            <div aria-label="보기 방식" className="hidden shrink-0 overflow-hidden rounded-lg border border-slate-300 lg:flex" role="group">
              {([
                ["split", "3분할", Columns3],
                ["two", "지도+목록", Columns2],
                ["map", "지도만", Square]
              ] as const).map(([layout, label, LayoutIcon]) => {
                const twoActive = mapPanelMode === "customer" || mapPanelMode === "newLead" || mapPanelMode === "salesLead";
                const selected = layout === "two" ? twoActive : mapPanelMode === layout;
                return (
                  <button
                    aria-label={label}
                    aria-pressed={selected}
                    className={`grid h-8 w-10 place-items-center transition ${selected ? "bg-teal-700 text-white" : "bg-white text-slate-700 hover:bg-slate-50"}`}
                    key={layout}
                    onClick={() => {
                      if (layout !== "two") {
                        setMapPanelMode(layout);
                        return;
                      }
                      if (activeRightPanelTab === "stores") setMapPanelMode("customer");
                      else setMapPanelMode(mapLeadTypeFilter === "sales" ? "salesLead" : "newLead");
                    }}
                    title={label}
                    type="button"
                  >
                    <LayoutIcon className="h-[18px] w-[18px]" />
                  </button>
                );
              })}
            </div>
          ) : null}
          <details className="group relative shrink-0">
            <summary
              aria-label="지도 화면 설정"
              className="flex h-10 w-10 cursor-pointer list-none items-center justify-center rounded-lg border border-slate-200 bg-white text-xs font-semibold text-slate-700 transition hover:border-slate-300 hover:bg-slate-50 [&::-webkit-details-marker]:hidden"
              title="마커 표현, 리드 레이어, 패널과 화면 설정"
            >
              <MapPinned className="h-4 w-4" />
            </summary>
            <div className="absolute right-0 top-12 z-50 w-[min(92vw,420px)] space-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-[0_16px_40px_rgba(15,23,42,.18)]">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-xs font-bold text-slate-900">지도 표시</p>
                  <p className="mt-0.5 text-[11px] font-medium text-slate-500">리드 레이어와 마커 기준</p>
                </div>
                <div className="flex shrink-0 items-center gap-1 rounded-lg bg-slate-100 p-1">
                  {[{ label: "등급별", value: "grade" }, { label: "차량별", value: "vehicle" }].map((item) => {
                    const selected = markerViewMode === item.value;
                    return (
                      <button
                        className={`h-8 rounded-md px-2.5 text-xs font-semibold transition ${selected ? "bg-white text-slate-950 shadow-sm" : "text-slate-500 hover:text-slate-900"}`}
                        key={item.value}
                        onClick={() => setMarkerViewMode(item.value as MarkerViewMode)}
                        type="button"
                      >
                        {item.label}
                      </button>
                    );
                  })}
                </div>
              </div>
              {activeView === "map" ? (
                <div className="grid grid-cols-2 gap-1.5">
              <button
                aria-pressed={leadRadiusOpen}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
                  leadRadiusOpen ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-white"
                }`}
                onClick={() => setLeadRadiusOpen((value) => !value)}
                title="지도를 클릭해 원하는 지점 주변 반경 안의 신규·영업 리드를 찾습니다."
                type="button"
              >
                <Radar className="h-4 w-4" />
                <span>반경 리드</span>
              </button>
              <button
                aria-pressed={showAllLeadsOnMap}
                className={`flex h-9 items-center justify-center gap-1.5 rounded-md px-3 text-xs font-semibold transition ${
                  showAllLeadsOnMap ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"
                }`}
                onClick={() => {
                    const next = !showAllLeadsOnMap;
                    setRightPanelTab(next ? "leads" : "stores");
                    if (next) {
                      setLeftCollapsed(true);
                      setRightCollapsed(false);
                      setMapPanelModeState(mapLeadTypeFilter === "new" ? "newLead" : "salesLead");
                    } else if (mapPanelMode === "newLead" || mapPanelMode === "salesLead") {
                      setLeftCollapsed(true);
                      setRightCollapsed(false);
                      setMapPanelModeState("customer");
                    }
                    setMapLeadsVisible(next);
                  }
                }
                title="지도에 활성 신규·영업 리드 전체를 표시합니다."
                type="button"
              >
                <Layers className="h-4 w-4" />
                <span>{allLeadsLoadState === "loading" ? "불러오는 중" : "전체 리드"}</span>
              </button>
              {mapDistributorSales ? (
                <div aria-label="영업 대상" className="flex items-center gap-1" role="group">
                  {([["restaurant", "매장"], ["distributor", "유통사"]] as const).map(([id, label]) => <button aria-pressed={mapTargetType === id} className={`h-9 rounded-md px-3 text-xs font-semibold ${mapTargetType === id ? "bg-teal-700 text-white" : "text-slate-600 hover:bg-white hover:text-slate-900"}`} key={id} onClick={() => { setMapTargetType(id); setMapLeadsVisible(true); }} type="button">{label}</button>)}
                </div>
              ) : null}
                </div>
          ) : null}
              {activeView === "map" ? (
                <div className="grid grid-cols-6 gap-1.5 border-t border-slate-100 pt-2" aria-label="지도 업무 패널">
                  {([
                    ["split", "3분할"],
                    ["driver", "담당자"],
                    ["customer", "거래처"],
                    ["newLead", "신규"],
                    ["salesLead", "영업"],
                    ["map", "지도만"]
                  ] as const).map(([mode, label]) => (
                    <button
                      aria-pressed={mapPanelMode === mode}
                      className={`h-9 rounded-md border px-1 text-[11px] font-semibold transition ${
                        mapPanelMode === mode
                          ? "border-teal-300 bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100"
                          : "border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      key={mode}
                      onClick={() => setMapPanelMode(mode)}
                      type="button"
                    >
                      {label}
                    </button>
                  ))}
                </div>
              ) : null}
              <div className="grid grid-cols-3 gap-1.5 border-t border-slate-100 pt-2">
            <button
              aria-expanded={statsExpanded}
              aria-label={statsExpanded ? "KPI 접기" : "KPI 보기"}
              className={`maju-hit-slop grid h-9 place-items-center rounded-md border border-slate-200 transition ${statsExpanded ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              onClick={() => setStatsExpanded((value) => !value)}
              title={statsExpanded ? "통계 패널 접고 지도 크게 보기" : "매출·거리·유류비 통계 펼치기"}
              type="button"
            >
              <Gauge className="h-4 w-4" />
            </button>
            <button
              aria-label={isFullscreen ? "전체 화면 종료" : "전체 화면"}
              aria-pressed={isFullscreen}
              className={`maju-hit-slop grid h-9 place-items-center rounded-md border border-slate-200 transition ${isFullscreen ? "bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-200" : "text-slate-600 hover:bg-slate-50 hover:text-slate-900"}`}
              onClick={toggleFullscreen}
              title={isFullscreen ? "전체 화면 종료" : "전체 화면으로 크게 보기"}
              type="button"
            >
              {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            </button>
            <button
              aria-label="필터 초기화"
              className="maju-hit-slop grid h-9 place-items-center rounded-md border border-slate-200 text-slate-600 transition hover:bg-slate-50 hover:text-slate-900"
              onClick={resetWorkspace}
              title="필터 초기화"
              type="button"
            >
              <RefreshCw className="h-4 w-4" />
            </button>
              </div>
            </div>
          </details>
        </div>
      </header>}

      <div className={`relative flex flex-1 flex-col ${activeView === "map" ? "lg:min-h-0" : ""}`}>
        {showOriginAddressBanner ? (
          <div className="shrink-0 px-4 pt-3">
            <Link
              className="flex items-center gap-2 rounded-lg border border-amber-300 bg-amber-50 px-3 py-2 text-xs font-bold text-amber-900 transition hover:bg-amber-100"
              href="/dashboard/settings/company"
            >
              <AlertTriangle className="h-4 w-4 shrink-0" />
              <span>물류 출발지 주소가 아직 설정되지 않아, 배송·영업 거리가 기본 주소 기준으로 계산되고 있습니다. 회사 설정에서 출발지 주소를 등록해주세요.</span>
              <ExternalLink className="ml-auto h-3.5 w-3.5 shrink-0" />
            </Link>
          </div>
        ) : null}
        {timelineHref ? (
          <div className="shrink-0 px-4 pt-3 empty:hidden">
            <ChurnRiskAlert companyId={churnRiskCompanyId} initialCustomers={churnRiskCustomers} timelineHref={timelineHref} />
          </div>
        ) : null}

      {statsExpanded ? (
        <>
          <section className="grid shrink-0 grid-cols-3 border-b border-slate-200/80 bg-white lg:grid-cols-6">
            <Kpi
              helper={`전체 ${gradeBaseStores.length} · A ${gradeCounts.A} · B ${gradeCounts.B} · C ${gradeCounts.C}`}
              label={kpiSummary ? "선택 경유지" : `${isVehicleFiltered ? selectedVehicleLabel : "등급 거래처"} · ${selectedGradeLabel}`}
              tone={gradeFilter === "A" ? "green" : gradeFilter === "C" ? "purple" : "blue"}
              value={sourceReady ? `${kpiSummary?.selectedCount ?? selectedGradeCount}곳` : "등록 필요"}
            />
            <Kpi
              helper={selectedVehicle ? [selectedVehicle.driver, selectedVehicle.area].filter(Boolean).join(" · ") : "전체 배송차 기준"}
              label={selectedVehicle ? "선택 배송차" : "배송차량"}
              tone="blue"
              value={sourceReady ? (selectedVehicle ? selectedVehicle.name : `${realVehicleCount}대`) : "등록 후 배정"}
            />
            <Kpi
              helper={kpiSummary ? "선택 경유지 기준" : "현재 필터 기준"}
              label="매출합"
              tone="green"
              value={sourceReady ? `${(kpiSummary?.expectedRevenue ?? routeTotals.expectedRevenue).toLocaleString()}만원` : "-"}
            />
            <Kpi helper={distanceKpiHelper} label={kpiSummary ? "경유 코스 거리" : "출발지 기준 거리"} tone="purple" value={sourceReady ? `${(kpiSummary?.distanceKm ?? routeTotals.distanceKm).toLocaleString()}km` : "-"} />
            <Kpi helper={durationKpiHelper} label={kpiSummary ? "경유 코스 시간" : "출발지 기준 시간"} tone="red" value={sourceReady ? formatMinutes(kpiSummary?.durationMinutes ?? routeTotals.durationMinutes) : "-"} />
            <Kpi helper={fuelKpiHelper} label="예상 유류비" tone="green" value={sourceReady ? `${estimatedFuelCostWon.toLocaleString()}원` : "-"} />
          </section>

          <RouteBasisStrip
            allStoreCount={allStores.length}
            allStoreTotals={allStoreTotals}
            currentStoreCount={visibleStores.length}
            currentTotals={routeTotals}
            dataRegistrationHref={dataRegistrationHref}
            mapReadyStoreCount={mapReadyStoreCount}
            missingAddressCount={missingAddressCount}
            routePlan={routePlan}
            sourceReady={sourceReady}
            visibleMapReadyStoreCount={visibleMapReadyStoreCount}
          />

          <RouteWorkspaceGuide
            activeView={activeView}
            courseSummary={courseSummary}
            dataRegistrationHref={dataRegistrationHref}
            markerViewMode={markerViewMode}
            selectedVehicleLabel={selectedVehicleLabel}
            sourceReady={sourceReady}
            visibleStoreCount={visibleStores.length}
          />
        </>
      ) : null}

      {/* 시안 ⑫ 2줄: 지도 위에 떠 있는 카드가 아니라 화면 폭 전체의 고정 필터 줄입니다. 지도와
          좌우 패널은 이 줄 바로 아래에서 시작합니다(겹치지 않으므로 mapHeaderHeightPx는 0). */}
      <section
        className={`relative z-30 shrink-0 space-y-1 border-b border-slate-200 bg-white px-3 py-1.5 ${activeView === "map" ? "lg:px-4 lg:py-2" : ""} ${initialView === "leads" ? "hidden" : ""}`}
        ref={mapHeaderRef}
      >
        {activeView === "map" ? (
          <MobileMapSummary
            controlsOpen={mobileMapControlsOpen}
            customerCount={visibleMapLayerCounts.customers}
            leadCount={visibleMapLayerCounts.newLeads + visibleMapLayerCounts.salesLeads}
            leadsVisible={showAllLeadsOnMap}
            onOpenSalesArea={() => setMobileSalesAreaOpen(true)}
            onToggleControls={() => setMobileMapControlsOpen((open) => !open)}
            salesRegionsConfigured={mapSalesRegionsConfigured}
          />
        ) : null}
        <div id="map-mobile-filters" className={`${activeView === "map" && !mobileMapControlsOpen ? "hidden" : "block"} space-y-1 lg:block`}>
        <div className="grid gap-1.5 lg:grid-cols-[minmax(180px,280px)_minmax(0,1fr)] lg:items-center xl:gap-2">
          <SearchInput
            className="flex-1 lg:!h-9"
            inputProps={{
              onBlur: () => setShowExternalResults(false),
              onFocus: () => setShowExternalResults(true),
              onKeyDown: (event) => { if (event.key === "Enter") rememberQuery(query); }
            }}
            onChange={(value) => { setQuery(value); setSearchOpen(value.trim().length >= 2); }}
            onClear={closeSearch}
            placeholder="거래처·리드·담당자·주소 검색"
            value={query}
          >
            {showExternalResults && query.trim().length < 2 && recentQueries.length ? (
              <div aria-label="최근 검색어" className="absolute left-0 right-0 top-full z-30 mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white shadow-xl">
                <p className="border-b border-slate-100 px-3 py-1.5 text-xs font-semibold text-slate-500">최근 검색어</p>
                {recentQueries.map((item) => (
                  <button className="block w-full truncate border-b border-slate-100 px-3 py-2 text-left text-sm font-semibold text-slate-900 last:border-b-0 hover:bg-teal-50" key={item} onClick={() => { setQuery(item); setSearchOpen(true); }} onMouseDown={(event) => event.preventDefault()} type="button">{item}</button>
                ))}
              </div>
            ) : null}
          </SearchInput>
          <div className="flex min-w-0 items-center gap-1.5">
            <div className="maju-toolbar-scroll flex min-w-0 flex-1 flex-nowrap items-center justify-start gap-1.5 overflow-x-auto">
              <MapFilterChipsRow
                chips={mapFilterChips}
                onClearVehicle={() => selectVehicle("all")}
                onToggleChip={toggleMapFilterPop}
                onToggleReminder={() => setMapLeadReminderOnly((value) => !value)}
                openKey={mapFilterPop}
                reminderCount={statusScopedLeadsForMap.filter((lead) => Boolean(getMapLeadReminderLabel(lead))).length}
                reminderOnly={mapLeadReminderOnly}
                vehicleLabel={isVehicleFiltered ? selectedVehicleLabel : ""}
              />
            </div>
            <button
              aria-expanded={mapFilterPop === "more"}
              aria-label="필터 더보기"
              className={`grid h-9 w-10 shrink-0 place-items-center rounded-lg border text-sm font-black transition ${
                mapFilterPop === "more" || excludeClosedStores || showTerminatedStores || gradeFilter !== "all" || showDismissedLeadsOnMap || showRejectedLeadsOnMap
                  ? "border-teal-700 bg-teal-50 text-teal-800"
                  : "border-slate-300 bg-white text-slate-700 hover:bg-slate-50"
              }`}
              data-map-filter-chip=""
              onClick={(event) => toggleMapFilterPop("more", event.currentTarget)}
              title="이탈 제외 · 출발지 · 저장한 필터"
              type="button"
            >
              ⋯
            </button>
          </div>
          {mapFilterPop ? (
            <MapFilterPopover
              date={{
                applied: { end: mapLeadOpenDateEnd, start: mapLeadOpenDateStart },
                draft: { end: mapLeadOpenDateEndDraft, start: mapLeadOpenDateStartDraft },
                onApply: () => {
                  setMapLeadOpenDateStart(mapLeadOpenDateStartDraft);
                  setMapLeadOpenDateEnd(mapLeadOpenDateEndDraft);
                },
                onPreset: applyMapOpenDatePreset,
                preset: mapOpenDatePreset,
                setEndDraft: setMapLeadOpenDateEndDraft,
                setStartDraft: setMapLeadOpenDateStartDraft
              }}
              industry={{ loading: allLeadsLoadState === "loading", options: mapLeadIndustryOptions, setValue: setMapLeadIndustryFilter, value: mapLeadIndustryFilter }}
              left={mapFilterPopLeft}
              more={{
                excludeClosedStores,
                gradeFilter,
                gradeOptions: gradeFilters.map((filter) => ({ count: filter.value === "all" ? gradeBaseStores.length : gradeCounts[filter.value], label: filter.label, value: filter.value })),
                onFocusOrigin: focusOrigin,
                setExcludeClosedStores,
                setGrade: (value) => setGradeFilter(value as GradeFilter),
                setShowClosed: setShowClosedLeadsOnMap,
                setShowDismissed: selectDismissedView,
                setShowRejected: selectRejectedView,
                setShowOutsideSalesArea: setShowOutsideSalesAreaOnMap,
                setShowTerminatedStores,
                showClosed: showClosedLeadsOnMap,
                showDismissed: showDismissedLeadsOnMap,
                showRejected: showRejectedLeadsOnMap,
                showOutsideSalesArea: showOutsideSalesAreaOnMap,
                showOutsideSalesAreaChoice: mapSalesRegionsConfigured === true && mapTargetType === "restaurant",
                showTerminatedStores,
                summary: sourceReady
                  ? `거래처 ${visibleMapLayerCounts.customers} · 신규 ${visibleMapLayerCounts.newLeads} · 영업 ${visibleMapLayerCounts.salesLeads} · 차량 ${visibleMapLayerCounts.activeVehicles}`
                  : "거래처 등록 필요"
              }}
              onClose={() => setMapFilterPop("")}
              openKey={mapFilterPop}
              popRef={mapFilterPopRef}
              presets={{
                busy: mapFilterPresetBusy,
                enabled: mapFilterPresetEnabled,
                list: mapFilterPresets,
                onApply: applyMapFilterPreset,
                onRemove: () => void removeSelectedMapFilterPreset(),
                onSave: () => void saveCurrentMapFilterPreset(),
                selectedId: selectedMapFilterPresetId
              }}
              region={{
                groups: mapRegionFilterGroups,
                onOpenSalesArea: () => {
                  setMapFilterPop("");
                  setMobileSalesAreaOpen(true);
                },
                setDong: setMapLeadRegionDong,
                setSigungu: setMapLeadRegionSigungu,
                sigungu: mapLeadRegionSigungu
              }}
              size={{ enabled: LEAD_STORE_AREA_FEATURE_ENABLED, setValue: setMapLeadAreaRange, value: mapLeadAreaRange }}
              stage={{ counts: mapLeadStageCounts, setValue: setMapLeadStageFilter, value: mapLeadStageFilter }}
              top={mapFilterPopTop}
            />
          ) : null}
        </div>
        {statsExpanded ? (
          <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-semibold text-slate-500">현재 조건</span>
            {activeFilterLabels.length ? (
              activeFilterLabels.map((label) => (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700" key={label}>
                  {label}
                </span>
              ))
            ) : sourceReady ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-semibold text-slate-700">전체 거래처 표시 중</span>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-semibold text-amber-800">거래처 등록 대기</span>
            )}
          </div>
        ) : null}
        {activeView === "map" && mapSalesRegionsConfigured === false ? (
          <button
            className="hidden w-full items-center justify-between gap-3 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-left lg:flex"
            onClick={() => setMobileSalesAreaOpen(true)}
            type="button"
          >
            <span className="min-w-0">
              <span className="block text-xs font-black text-amber-950">영업 지역 미설정</span>
              <span className="block truncate text-[11px] font-semibold text-amber-800">지도를 가리지 않고 옆 창에서 지역을 선택할 수 있습니다.</span>
            </span>
            <span className="shrink-0 rounded-md bg-amber-900 px-3 py-1.5 text-xs font-black text-white">지역 선택</span>
          </button>
        ) : null}
        {activeView === "map" && leadRadiusOpen ? (
          <div className="space-y-2 rounded-lg border border-teal-100 bg-teal-50/60 px-3 py-2.5">
            <div className="flex flex-wrap items-center gap-2">
              <span className="flex items-center gap-1.5 text-xs font-semibold text-teal-800">
                <Radar className="h-3.5 w-3.5" />
                리드 반경
              </span>
              <div className="flex h-8 items-center rounded-lg border border-teal-200 bg-white p-0.5">
                {[
                  { label: "지도 클릭", value: "point" as const },
                  { label: "거래처 1곳", value: "customer" as const },
                  { label: "전체 거래처", value: "all" as const }
                ].map((item) => (
                  <button
                    className={`h-8 rounded-md px-2.5 text-xs font-semibold transition ${
                      leadRadiusAnchorMode === item.value ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-slate-50"
                    }`}
                    key={item.value}
                    onClick={() => {
                      setLeadRadiusAnchorMode(item.value);
                      setLeadRadiusResult(null);
                      setLeadRadiusError("");
                      setPreviewLeadId("");
                      if (item.value !== "point") {
                        setLeadRadiusPoint(null);
                      }
                    }}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {leadRadiusAnchorMode === "customer" ? (
                <select
                  className="h-8 min-w-[160px] flex-1 rounded-md border border-teal-200 bg-white px-2 text-xs font-semibold text-slate-950 outline-none focus:border-teal-300 sm:flex-none"
                  onChange={(event) => setLeadRadiusCustomerId(event.target.value)}
                  value={leadRadiusCustomerId}
                >
                  <option value="">기준 거래처 선택</option>
                  {geocodableStoresForRadius.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name}
                    </option>
                  ))}
                </select>
              ) : leadRadiusAnchorMode === "all" ? (
                <span className="rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-500">
                  주소 확인된 거래처 {geocodableStoresForRadius.length.toLocaleString()}곳 기준
                </span>
              ) : leadRadiusPoint ? (
                <span className="flex items-center gap-1.5 rounded-md bg-white px-2 py-1 text-xs font-medium text-slate-600">
                  지도 클릭 지점 기준
                  <button className="font-semibold text-teal-700 underline decoration-dotted underline-offset-2 hover:text-teal-900" onClick={resetLeadSearchPoint} type="button">
                    지점 다시 선택
                  </button>
                </span>
              ) : null}
              <label className="flex items-center gap-1 text-xs font-medium text-slate-600">
                반경
                <input
                  className="h-8 w-14 rounded-md border border-teal-200 bg-white px-1.5 text-center text-xs font-semibold text-slate-950 outline-none focus:border-teal-300"
                  max={50}
                  min={0.5}
                  onChange={(event) => setLeadRadiusKm(Number(event.target.value) || DEFAULT_LEAD_SEARCH_RADIUS_KM)}
                  step={0.5}
                  type="number"
                  value={leadRadiusKm}
                />
                km
              </label>
              <button
                className="maju-button-primary h-8 shrink-0 text-xs"
                disabled={leadRadiusSearching || (leadRadiusAnchorMode === "point" && !leadRadiusPoint)}
                onClick={() => void runMapLeadRadiusSearch()}
                type="button"
              >
                {leadRadiusSearching ? "탐색 중..." : "탐색"}
              </button>
            </div>

            {leadRadiusAnchorMode === "point" && !leadRadiusPoint ? (
              <div className="flex flex-wrap items-center gap-2 border-t border-teal-100 pt-2">
                <span className="text-xs font-semibold text-slate-500">빠른 선택</span>
                {[0.5, 1, 1.5, 3, 5].map((presetKm) => (
                  <button
                    className="h-8 rounded-full border border-teal-200 bg-white px-3 text-xs font-semibold text-teal-700 transition hover:bg-teal-100 disabled:cursor-not-allowed disabled:opacity-50"
                    disabled={!mapCenterPoint}
                    key={presetKm}
                    onClick={() => runPresetRadiusSearch(presetKm)}
                    title="지금 보고 있는 지도 중심 기준으로 바로 탐색합니다."
                    type="button"
                  >
                    현재 위치 {presetKm}km
                  </button>
                ))}
                <span className="text-xs font-medium text-slate-500">
                  또는 지도를 클릭해 원하는 지점에 기본 {DEFAULT_LEAD_SEARCH_RADIUS_KM}km 반경을 바로 만드세요.
                </span>
              </div>
            ) : null}

            {leadRadiusResult || leadRadiusError || (leadRadiusAnchorMode !== "point" || leadRadiusPoint) ? (
              <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-teal-100 pt-2 text-xs font-medium">
                {leadRadiusResult ? (
                  <span className="font-semibold text-teal-800">
                    반경 {leadRadiusResult.radiusKm}km 안 리드 {leadRadiusResult.leads.length.toLocaleString()}곳 지도에 표시 중
                  </span>
                ) : null}
                {leadRadiusError ? <span className="font-semibold text-rose-600">{leadRadiusError}</span> : null}
                {leadRadiusAnchorMode !== "point" || leadRadiusPoint ? (
                  <span className="text-teal-700">지도 위 원 가장자리의 흰 손잡이를 드래그해 반경을 조절할 수 있습니다.</span>
                ) : null}
              </div>
            ) : null}
          </div>
        ) : null}
        {/* 시안 ⑫: PC에서는 위 칩 필터와 오른쪽 탭이 같은 일을 하므로 이 보조 줄은 모바일에서만 보입니다. */}
        {activeView === "map" && showAllLeadsOnMap && mapPanelMode !== "split" ? (
          <MapLeadFilterStrip
            allLeadsLoading={allLeadsLoadState === "loading"}
            dongOptions={mapLeadDongOptions}
            filteredCount={filteredAllLeadsForMap.length}
            filtersActive={leadFiltersActive}
            mapTargetType={mapTargetType}
            onApplyOpenDate={() => {
              setMapLeadOpenDateStart(mapLeadOpenDateStartDraft);
              setMapLeadOpenDateEnd(mapLeadOpenDateEndDraft);
            }}
            onChangeDong={setMapLeadRegionDong}
            onChangeOpenDateEndDraft={setMapLeadOpenDateEndDraft}
            onChangeOpenDateStartDraft={setMapLeadOpenDateStartDraft}
            onSelectDismissed={selectDismissedView}
            onSelectRejected={selectRejectedView}
            onSelectLeadType={(value) => {
              setMapLeadTypeFilter(value);
              if (value === "new") setMapPanelMode("newLead");
              if (value === "sales") setMapPanelMode("salesLead");
            }}
            onSelectSigungu={selectMapLeadRegionSigungu}
            onToggleOutsideSalesArea={setShowOutsideSalesAreaOnMap}
            onReset={resetLeadFilters}
            openDateApplied={{ end: mapLeadOpenDateEnd, start: mapLeadOpenDateStart }}
            openDateDraft={{ end: mapLeadOpenDateEndDraft, start: mapLeadOpenDateStartDraft }}
            regionDong={mapLeadRegionDong}
            regionOptions={mapLeadRegionOptions}
            regionSigungu={mapLeadRegionSigungu}
            salesRegionsConfigured={mapSalesRegionsConfigured}
            leadType={mapLeadTypeFilter}
            showDismissed={showDismissedLeadsOnMap}
            showRejected={showRejectedLeadsOnMap}
            showOutsideSalesArea={showOutsideSalesAreaOnMap}
            totalCount={statusScopedLeadsForMap.length}
          />
        ) : null}
        </div>
      </section>

      {activeView === "map" ? (
        <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden rounded-b-xl lg:block" ref={mapAreaRef}>
          <div className={`relative min-h-0 min-w-0 bg-slate-100 lg:absolute ${
            `lg:bottom-0 lg:top-0 ${mapLeftInsetClass} ${mapRightInsetClass}`
          } ${isFullscreen ? "h-full" : "h-[calc(100dvh-10rem)] min-h-[420px] max-h-[720px] lg:h-full lg:min-h-0 lg:max-h-none"}`}>
            {sourceReady ? (
              <>
                <div className="h-full min-h-0 [&>div]:h-full">
                  <KakaoAddressMap
                    controlsOffsetPx={mapHeaderHeightPx || undefined}
                    onCustomerGeocodeFailed={handleCustomerGeocodeFailed}
                    focusedMarkerId={previewStoreId || selectedId || previewLeadId || mapFocusId || undefined}
                    fitMarkersRequest={searchTabOpen ? fitResultsRequest ?? undefined : undefined}
                    hoveredMarkerId={searchTabOpen && hoveredResultId ? hoveredResultId : undefined}
                    pinNumbers={searchTabOpen ? searchRows.pins : undefined}
                    restoreViewWhenDone={searchTabOpen}
                    mapClassName="h-full min-h-[420px] rounded-none border-0 lg:min-h-0"
                    markers={mapDisplayMarkers}
                    onMarkerClick={(marker) => {
                      if (marker.tone === "unregistered") {
                        const target = unregisteredResults.find((result) => externalResultId(result) === marker.id);
                        if (target) setQuickRegisterTarget(target);
                        return;
                      }
                      if (marker.tone === "lead") {
                        setPreviewStoreId("");
                        setSelectedId("");
                        setPreviewLeadId(marker.id || "");
                        setDetailLeadId((current) => (current ? marker.id || current : current)); // CC-57: 열린 상세도 같이
                        // 2026-08-31 피드백 대응: 우측 패널이 "거래처" 탭에 머물러 있으면 리드
                        // 마커를 클릭해도 그 항목이 아예 목록에 없어 우측 패널이 안 바뀝니다.
                        setRightPanelTab("leads");
                        if (mapPanelMode !== "split") setLeftCollapsed(true);
                        setRightCollapsed(false);
                        const selectedLead = [...(leadRadiusResult?.leads || []), ...allLeadsForMap].find((lead) => lead.id === marker.id);
                        const selectedLeadType = selectedLead ? getPermitLeadType(selectedLead) : mapLeadTypeFilter;
                        setMapLeadTypeFilter(selectedLeadType === "new" ? "new" : "sales");
                        if (mapPanelMode !== "split") setMapPanelMode(selectedLeadType === "new" ? "newLead" : "salesLead");
                        return;
                      }
                      if (marker.tone === "vehicle") {
                        // 2026-09-07 피드백("차량 마커를 클릭했는데 생각지 못한 거래처가 나와, 배송차량의
                        // 상세 정보가 나와야해"): 예전엔 차량이 현재 작업 중인 거래처가 있으면 차량 정보
                        // 대신 그 거래처로 바로 넘어가버려서, 정작 차량 마커를 눌러도 차량 상세(운행 경로·
                        // 완료 내역)를 볼 방법이 없었습니다. 이제 차량 마커는 항상 차량 분석 모달을 엽니다
                        // — 그 모달 안에 현재 작업 중인 거래처 정보와 "거래처로 이동" 버튼이 이미 있으므로
                        // 거래처를 보고 싶으면 거기서 한 번 더 누르면 됩니다.
                        const vehicle = liveVehicleLocations.find((location) => `vehicle-${location.id}` === marker.id);
                        if (vehicle) {
                          selectLiveVehicle(vehicle);
                          void openVehicleAnalysis(vehicle);
                        }
                        return;
                      }
                      if (!marker.id || marker.tone === "origin") return;
                      setMapFocusId("");
                      setPreviewLeadId("");
                      setPreviewStoreId(marker.id);
                      // 위와 대칭으로, 리드 탭에 머물러 있는 상태에서 기거래처 마커를 클릭해도
                      // 우측 패널이 그 거래처를 보여주도록 거래처 탭으로 전환합니다.
                      setRightPanelTab("stores");
                      setRightCollapsed(false);
                      if (mapPanelMode !== "split") setMapPanelMode("customer");
                    }}
                    leadSearch={{
                      active: leadRadiusOpen && leadRadiusAnchorMode === "point" && !leadRadiusPoint,
                      defaultRadiusMeters: DEFAULT_LEAD_SEARCH_RADIUS_KM * 1000,
                      onLocked: handleLeadSearchLocked
                    }}
                    onCenterChange={setMapCenterPoint}
                    radiusOverlay={
                      leadRadiusOpen && (leadRadiusAnchorMode !== "point" || leadRadiusPoint)
                        ? {
                            centerMarkerId: leadRadiusAnchorMode === "customer" ? leadRadiusCustomerId || undefined : undefined,
                            centerPoint: leadRadiusAnchorMode === "point" ? leadRadiusPoint || undefined : undefined,
                            onClear: leadRadiusAnchorMode === "point" ? resetLeadSearchPoint : undefined,
                            onRadiusChange: (meters) => setLeadRadiusKm(Math.min(50, Math.max(0.1, Math.round((meters / 1000) * 10) / 10))),
                            radiusMeters: leadRadiusKm * 1000
                          }
                        : undefined
                    }
                    routePath={mainMapRoutePath}
                    showList={false}
                  />
                </div>
                <MapLayerControl
                  className={mapOverlayLeftClass}
                  counts={visibleMapLayerCounts}
                  headerOffsetPx={mapHeaderHeightPx}
                  customersOn={customersLayerOn}
                  markerViewMode={markerViewMode}
                  onToggleCustomers={() => setCustomersLayerOn((on) => !on)}
                  onSelectLeadLayer={(type) => {
                    const next = nextLeadLayerSelection(showAllLeadsOnMap, mapLeadTypeFilter, type);
                    setMapLeadsVisible(next.visible);
                    setMapLeadTypeFilter(next.type);
                    resetLeadView();
                  }}
                  onSelectMarkerMode={() => setMarkerViewMode((mode) => (mode === "vehicle" ? "grade" : "vehicle"))}
                  showAllLeadsOnMap={showAllLeadsOnMap}
                  typeFilter={mapLeadTypeFilter}
                />
                <MapLayerLegend counts={visibleMapLayerCounts} />
                {/* 시안 ⑫: 지도 왼쪽 아래에 지금 걸린 조건을 한 줄로 보여줍니다(범례는 레이어 바의 색 점이 대신). */}
                <div
                  aria-label="현재 필터 조건"
                  className={`pointer-events-none absolute bottom-3 z-10 hidden max-w-[calc(100%-24rem)] truncate rounded-lg bg-white px-2.5 py-1.5 text-xs text-slate-600 shadow-[0_2px_8px_rgba(15,23,42,.12)] lg:block ${mapOverlayLeftClass}`}
                  role="status"
                >
                  {mapFilterSummaryText}
                </div>
                {/* 2026-09-07 피드백("분석 버튼을 눌러야 이런 경로가 나오는데 메인 지도 화면에서도
                    구현할 수 있도록해줘"): 라이브 차량 패널에서 "경로" 버튼을 누르면 그 차량의 최근
                    12시간 GPS 경로를 분석 모달을 열지 않고 메인 지도 위에 바로 그려줍니다. 로딩/에러/
                    표시 상태를 알려주는 배너를 지도 우상단에 띄우고, 닫기를 누르면 경로를 지웁니다. */}
                {mainMapRouteVehicleId ? (
                  <div
                    className="pointer-events-none absolute left-3 z-10 max-w-xs lg:left-auto lg:right-3"
                    style={{ top: mapHeaderHeightPx ? `${mapHeaderHeightPx + 12}px` : "0.75rem" }}
                  >
                    <div className="pointer-events-auto rounded-xl border border-slate-200 bg-white/95 px-3 py-2.5 shadow-lg">
                      <div className="flex items-start justify-between gap-2">
                        <div className="min-w-0">
                          <p className="flex items-center gap-1.5 text-xs font-black text-slate-950">
                            <span className="inline-block h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: vehicleColorForId(mainMapRouteVehicleId) }} />
                            <span className="truncate">{mainMapRouteVehicle?.deliveryVehicle || mainMapRouteVehicle?.driverName || "차량"} 경로</span>
                          </p>
                          <p className="mt-1 text-[11px] font-bold text-slate-500">
                            {mainMapRouteLoading
                              ? "GPS 경로를 불러오는 중입니다..."
                              : mainMapRouteError
                                ? mainMapRouteError
                                : `실제 이동 ${mainMapRouteMetrics.distanceKm.toLocaleString()}km · ${formatMinutes(mainMapRouteMetrics.durationMinutes)} · GPS ${mainMapRouteEvents.length.toLocaleString()}건`}
                          </p>
                        </div>
                        <button
                          className="shrink-0 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-black text-slate-600 hover:bg-slate-200"
                          onClick={() => {
                            setMainMapRouteVehicleId("");
                            setMainMapRouteEvents([]);
                            setMainMapRouteError("");
                          }}
                          type="button"
                        >
                          닫기
                        </button>
                      </div>
                    </div>
                  </div>
                ) : null}
                {/* 2026-08-28 피드백 대응(지도 필터 조합 결과가 0건이어도 별다른 안내 없이 빈 지도만
                    보임): 배송차량·등급 필터 등으로 거래처가 전부 걸러졌을 때 빈 지도만 덩그러니
                    보이지 않도록, 필터를 초기화할 수 있는 안내 배너를 보여줍니다. 거래처가 아예
                    0곳인 경우(등록 자체가 안 된 상태)는 RouteWorkspaceGuide가 별도로 안내하므로
                    allStores.length > 0을 조건에 포함해 중복 안내를 피합니다. */}
                {visibleStores.length === 0 && allStores.length > 0 && allLeadsMapMarkers.length === 0 ? (
                  <div className="pointer-events-none absolute inset-x-0 top-1/2 z-10 flex -translate-y-1/2 justify-center px-4">
                    <div className="pointer-events-auto flex flex-col items-center gap-2 rounded-xl border border-slate-200 bg-white/95 px-5 py-4 text-center shadow-lg">
                      <p className="text-sm font-black text-slate-800">현재 필터 조건에 맞는 거래처가 없습니다</p>
                      <p className="text-xs font-bold text-slate-500">
                        {selectedVehicle ? `${selectedVehicle.name} · ` : ""}
                        {gradeFilter !== "all" ? `${gradeFilter}등급 · ` : ""}
                        전체 {allStores.length.toLocaleString()}곳 중 조건에 맞는 거래처가 0곳입니다.
                      </p>
                      {isVehicleFiltered || gradeFilter !== "all" ? (
                        <button
                          className="rounded-md bg-slate-900 px-3 py-1.5 text-xs font-black text-white hover:bg-slate-700"
                          onClick={() => {
                            selectVehicle("all");
                            setGradeFilter("all");
                          }}
                          type="button"
                        >
                          필터 초기화
                        </button>
                      ) : null}
                    </div>
                  </div>
                ) : null}
                {previewStore ? (
                  <StoreQuickCard
                    driverOptions={deliveryDefaults.drivers}
                    onShowOnMap={hiddenOnMapHandler(previewStore)}
                    headerOffsetPx={mapHeaderHeightPx}
                    onAddDriver={addManualDriver}
                    onAddVehicle={addManualVehicle}
                    onAddToRoute={() => {
                      // 경유 코스 탭은 배송차가 지정돼야 경유 선택이 유지됩니다(미지정 상태에서 배송차를
                      // 고르면 그 차량 기본 목록으로 선택이 초기화되어 방금 추가한 거래처가 빠질 수 있음) —
                      // 이 거래처에 배정된 배송차를 먼저 선택해 그 문제를 피합니다.
                      selectVehicle(previewStore.deliveryVehicleId || deliveryVehicles[0]?.id || "all");
                      setPendingCourseStoreId(previewStore.id);
                      setPreviewStoreId("");
                      setActiveView("course");
                    }}
                    onClose={() => setPreviewStoreId("")}
                    onOpenDetail={() => {
                      setSelectedId(previewStore.id);
                      setPreviewStoreId("");
                    }}
                    onOpenQuote={holdModulesEnabled ? (targetStore) =>
                      setQuoteSubject({
                        address: targetStore.address,
                        customerId: targetStore.id,
                        industry: resolveDisplayIndustry(targetStore),
                        menuNotes: targetStore.menuSummary,
                        name: targetStore.name,
                        outboundNotes: buildOutboundItemNotes(resolveDisplayIndustry(targetStore)),
                        phone: targetStore.phone,
                        reviewKeywords: targetStore.reviewKeywords,
                        reviewSummary: targetStore.reviewSummary
                      }) : undefined}
                    onSave={(edit) => updateStore(previewStore.id, edit)}
                    store={previewStore}
                    vehicleOptions={vehicleNameOptions}
                  />
                ) : null}
                {previewLeadId ? (
                  <PermitLeadMapQuickCard
                    allStores={allStores}
                    documentEntry={documentEntry}
                    headerOffsetPx={mapHeaderHeightPx}
                    lead={
                      leadRadiusResult?.leads.find((lead) => lead.id === previewLeadId) ||
                      allLeadsForMap.find((lead) => lead.id === previewLeadId) ||
                      null
                    }
                    onClose={() => setPreviewLeadId("")}
                    onConverted={() => {
                      setLeadRadiusResult((current) => (current ? { ...current, leads: current.leads.filter((lead) => lead.id !== previewLeadId) } : current));
                      setAllLeadsForMap((current) => current.filter((lead) => lead.id !== previewLeadId));
                      setPreviewLeadId("");
                    }}
                    onDismiss={dismissLeadFromMap}
                    onOpenDetail={(lead) => setDetailLeadId(lead.id)}
                    onOpenQuote={holdModulesEnabled ? (lead) => setQuoteSubject(getPermitLeadQuoteSubject(lead)) : undefined}
                    onRestore={restoreLeadFromMap}
                  />
                ) : null}
              </>
            ) : (
              <OperationalEmptyState
                actionHref={dataRegistrationHref}
                actionLabel="거래처 등록"
                description="거래처 기본정보를 저장하면 지도와 코스가 열립니다."
                title="거래처 원장 필요"
              />
            )}
          </div>

          {/* 2026-08-24 피드백("차량 매니저 필터가 검색창하고 겹쳐보여"): 이 좌우 패널은 mapAreaRef
              기준 lg:absolute 오버레이인데, 위 mapHeaderRef 검색창 카드도 같은 좌표계에 lg:absolute로
              떠 있고 리드 필터 행이 늘어나면 높이가 커집니다. 좌우 패널이 고정 lg:top-3만 쓰면 헤더가
              커질 때 그 아래로 가려지므로, 크로스헤어 버튼과 동일하게 mapHeaderHeightPx를 top 인라인
              스타일로 반영합니다. */}
          <div
            className={`max-h-[55vh] min-h-0 shrink-0 overflow-hidden border-t border-slate-200 lg:absolute lg:z-10 lg:max-h-none lg:flex-col lg:bg-white ${
              mapPanelMode !== "driver" && mapPanelMode !== "split"
                ? "hidden"
                : `flex lg:bottom-0 lg:right-0 lg:top-0 lg:border-0 lg:border-l lg:border-slate-200 ${
                    leftCollapsed ? "lg:w-14" : mapPanelMode === "split" ? "lg:w-[250px]" : "lg:w-[320px] xl:w-[360px]"
                  }`
            }`}
          >
            {mapPanelMode === "split" ? null : <MapExplorerTabs
              active={mapPanelMode}
              counts={{
                customers: allStores.length,
                drivers: deliveryVehicles.filter((vehicle) => !vehicle.isUnassigned).length,
                newLeads: statusScopedLeadsForMap.filter((lead) => getPermitLeadType(lead) === "new").length,
                salesLeads: statusScopedLeadsForMap.filter((lead) => getPermitLeadType(lead) === "sales").length
              }}
              onSelect={setMapPanelMode}
            />}
            <div className="min-h-0 flex-1 overflow-hidden">
            <DeliveryAssignmentPanel
              canManageStaff={canManageStaff}
              collapsed={leftCollapsed}
              fuelTypeConfiguredByVehicleId={fuelTypeConfiguredByVehicleId}
              liveVehicleDetails={
                <LiveVehicleStatusPanel
                  activeRouteVehicleId={mainMapRouteVehicleId}
                  completions={todayCompletions}
                  onAnalyze={openVehicleAnalysis}
                  onFocusVehicle={(vehicleId) => {
                    setPreviewLeadId("");
                    setPreviewStoreId("");
                    setMapFocusId(`vehicle-${vehicleId}`);
                    setMarkerViewMode("vehicle");
                  }}
                  onPreviewStore={(storeId) => {
                    setPreviewLeadId("");
                    setPreviewStoreId(storeId);
                    setRightPanelTab("stores");
                  }}
                  onToggleRoute={toggleMainMapRoute}
                  routeLoading={mainMapRouteLoading}
                  selectedVehicle={selectedLiveVehicle}
                  storeById={storeById}
                  vehicles={liveVehicleLocations}
                />
              }
              liveVehicleError={liveVehicleConnectionError}
              todayCompletions={todayCompletions}
              onAddDriver={addManualDriver}
              onDeleteVehicle={deleteVehicle}
              onSelectLiveVehicle={selectLiveVehicle}
              onSelectVehicle={(vehicleId) => {
                if (vehicleId === "all") {
                  selectVehicle("all");
                  const routedVehicle = liveVehicleLocations.find((location) => location.id === mainMapRouteVehicleId);
                  if (routedVehicle) void toggleMainMapRoute(routedVehicle);
                  return;
                }
                const group = deliveryVehicles.find((vehicle) => vehicle.id === vehicleId);
                const liveVehicle = group && liveVehicleLocations.find((location) => liveVehicleMatchesDeliveryGroup(location, group));
                if (liveVehicle) selectLiveVehicle(liveVehicle);
                else selectVehicle(vehicleId);
              }}
              onToggleCollapsed={() => setLeftCollapsed((collapsed) => !collapsed)}
              onUpdateVehicle={updateVehicle}
              selectedVehicleId={vehicleFilterId}
              totalStores={allStores.length}
              liveVehicles={liveVehicleLocations}
              staffInvitations={staffInvitations}
              vehicleMasterAvailable={vehicleMasterAvailable}
              vehicleMasterVehicles={vehicleMasterRecords}
              onVehicleMasterChange={setVehicleMasterRecords}
              vehicles={deliveryVehicles}
            />
            </div>
          </div>

          <div
            className={`max-h-[360px] min-h-0 shrink-0 overflow-hidden border-t border-slate-200 lg:absolute lg:z-10 lg:max-h-none lg:flex-col lg:bg-white ${
              searchTabOpen
                ? "flex lg:bottom-0 lg:left-0 lg:top-0 lg:w-[340px] xl:w-[380px] lg:border-0 lg:border-r lg:border-slate-200"
                : mapPanelMode === "split"
                ? `hidden lg:bottom-0 lg:left-0 lg:top-0 lg:w-[340px] xl:w-[380px] lg:border-0 lg:border-r lg:border-slate-200 ${rightCollapsed ? "" : "lg:flex"}`
                : mapPanelMode === "customer" || mapPanelMode === "newLead" || mapPanelMode === "salesLead"
                  ? "flex lg:bottom-0 lg:left-0 lg:top-0 lg:w-[340px] xl:w-[380px] lg:border-0 lg:border-r lg:border-slate-200"
                  : "hidden"
            }`}
          >
            <div className="min-h-0 flex-1 overflow-hidden">
            {searchTabOpen ? searchResultsPanel : activeRightPanelTab === "leads" ? (
              <LeadListPanel
                collapsed={rightCollapsed}
                leads={leadsForRightPanel}
                loadState={allLeadsLoadState}
                onSelectLead={selectLeadFromList}
                onOpenDetail={setDetailLeadId}
                onRetry={() => void loadAllLeadsForMap()}
                onUpdateStage={updateMapLeadStage}
                onOpenTable={() => {
                  const params = new URLSearchParams(window.location.search);
                  params.delete("view");
                  params.delete("panel");
                  params.delete("pin");
                  params.delete("detail");
                  params.set("type", mapLeadTypeFilter === "sales" ? "keyword" : "permit");
                  // /map 과 /leads 는 같은 /dashboard 로 rewrite 되어 router.push 로는 화면(initialView)이 바뀌지 않는다.
                  // 사이드바와 같은 방식으로 문서를 새로 연다.
                  window.location.assign(`/leads?${params.toString()}`);
                }}
                onToggleCollapsed={() => setMapPanelMode(rightCollapsed ? (mapLeadTypeFilter === "new" ? "newLead" : "salesLead") : "map")}
                selectedLeadId={previewLeadId}
                tabs={rightListTabs}
                title={showDismissedLeadsOnMap ? "숨김 리드" : showRejectedLeadsOnMap ? "거절한 리드" : mapLeadTypeFilter === "all" ? "전체 리드" : PERMIT_LEAD_TYPE_LABEL[mapLeadTypeFilter]}
              />
            ) : (
              <StoreManagementPanel
                notice={sourceReady ? <MapCustomerNotice
                  inline
                  approximateCount={approximateCustomerIds.length}
                  customerCount={allStores.length}
                  onOpenApproximate={approximateCustomerIds.length ? () => { setPreviewStoreId(""); setPreviewLeadId(""); setSelectedId(approximateCustomerIds[0]); } : undefined}
                  onOpenUnplaced={unplacedCustomerIds.length ? () => { setPreviewStoreId(""); setPreviewLeadId(""); setSelectedId(unplacedCustomerIds[0]); } : undefined}
                  unplacedCount={unplacedCustomerCount}
                  /> : undefined}
                collapsed={rightCollapsed}
                dataRegistrationHref={dataRegistrationHref}
                distanceRecalcError={distanceRecalcError}
                onEditStore={setSelectedId}
                onRecalculateDistances={recalculateStoreDistances}
                onSelectStore={(storeId) => {
                  setPreviewLeadId("");
                  setSelectedId("");
                  setPreviewStoreId(storeId);
                }}
                onClearFilter={isVehicleFiltered ? () => selectVehicle("all") : undefined}
                onToggleCollapsed={() => setMapPanelMode(rightCollapsed ? "customer" : "map")}
                recalculatingDistances={recalculatingDistances}
                selectedStoreId={previewStoreId || selectedId}
                sourceReady={sourceReady}
                tabs={rightListTabs}
                title={selectedVehicle ? `${selectedVehicle.name} 거래처` : "전체 거래처"}
                stores={visibleStores}
              />
            )}
            </div>
          </div>
        </div>
      ) : null}

      {activeView === "customers" ? (
        <CustomerDirectoryView
          dataRegistrationHref={dataRegistrationHref}
          driverOptions={deliveryDefaults.drivers}
          fuelPrices={fuelPrices}
          onSelectStore={setSelectedId}
          selectedStoreId={selectedId}
          sourceReady={sourceReady}
          stores={visibleStores}
          vehicleOptions={vehicleNameOptions}
        />
      ) : null}

      {vehicleAnalysis.vehicle ? (
        <VehicleAnalysisModal
          completions={vehicleAnalysis.completions}
          currentStore={vehicleAnalysis.vehicle.currentCustomerId ? storeById.get(vehicleAnalysis.vehicle.currentCustomerId) : undefined}
          error={vehicleAnalysis.error}
          events={vehicleAnalysis.events}
          date={vehicleAnalysisDate}
          loading={vehicleAnalysis.loading}
          onClose={() => setVehicleAnalysis({ completions: [], events: [], error: "", loading: false, vehicle: null })}
          onOpenStore={(storeId) => {
            setSelectedId(storeId);
            setPreviewStoreId(storeId);
            setRightPanelTab("stores");
            setVehicleAnalysis({ completions: [], events: [], error: "", loading: false, vehicle: null });
          }}
          onDateChange={(date) => void openVehicleAnalysis(vehicleAnalysis.vehicle!, date)}
          onOpenHistory={() => {
            setActiveView("history");
            setVehicleAnalysis({ completions: [], events: [], error: "", loading: false, vehicle: null });
          }}
          vehicle={vehicleAnalysis.vehicle}
        />
      ) : null}

      {activeView === "course" ? (
        <TodayCourseView
          completedStoreIds={completedStoreIdsToday}
          dataRegistrationHref={dataRegistrationHref}
          fuelPrices={fuelPrices}
          markers={markers}
          onConsumePendingAddStore={() => setPendingCourseStoreId("")}
          onPreviewStore={setPreviewStoreId}
          onSummaryChange={setCourseSummary}
          onSelectStore={setSelectedId}
          onSelectVehicle={selectVehicle}
          orderLinkStatus={orderLinkStatus}
          pendingAddStoreId={pendingCourseStoreId}
          selectedStoreId={selectedId}
          selectedVehicle={selectedVehicle}
          selectedVehicleId={vehicleFilterId}
          sourceReady={sourceReady}
          stores={visibleStores}
          vehicles={deliveryVehicles}
        />
      ) : null}

      {detailLeadId && detailLead ? (
        <PermitLeadDetailDrawer
          key={detailLead.id}
          lead={detailLead}
          hasNext={Boolean(detailNextId)}
          hasPrevious={Boolean(detailPreviousId)}
          onNext={() => { if (detailNextId) selectLeadFromList(detailNextId); }}
          onPrevious={() => { if (detailPreviousId) selectLeadFromList(detailPreviousId); }}
          onClose={() => setDetailLeadId("")}
          onConverted={(lead) => {
            setLeadRadiusResult((current) => (current ? { ...current, leads: current.leads.filter((item) => item.id !== lead.id) } : current));
            setAllLeadsForMap((current) => current.filter((item) => item.id !== lead.id));
            setPreviewLeadId("");
            router.refresh();
          }}
          onLeadChanged={(updated) => {
            setAllLeadsForMap((current) => current.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)));
            setLeadRadiusResult((current) => (current ? { ...current, leads: current.leads.map((item) => (item.id === updated.id ? { ...item, ...updated } : item)) } : current));
          }}
          onOpenQuote={holdModulesEnabled ? (lead) => setQuoteSubject(getPermitLeadQuoteSubject(lead)) : undefined}
        />
      ) : null}

      {activeView === "leads" ? (
        <PermitLeadsView
          initialLeadId={initialLeadId}
          detailMode={leadDetailMode}
          onOpenQuote={holdModulesEnabled ? (lead) => setQuoteSubject(getPermitLeadQuoteSubject(lead)) : undefined}
          stores={allStores}
        />
      ) : null}

      {activeView === "history" ? (
        <DeliveryHistoryView
          companyId={churnRiskCompanyId}
          onOpenStore={(storeId) => {
            setSelectedId(storeId);
            setPreviewStoreId(storeId);
            setRightPanelTab("stores");
          }}
          stores={allStores}
        />
      ) : null}
      </div>
      {mobileSalesAreaOpen ? (
        <div className="fixed inset-0 z-[70] flex items-end bg-slate-950/45 lg:items-center lg:justify-center lg:p-6" role="dialog" aria-modal="true" aria-label="영업 지역 선택">
          <button className="absolute inset-0" aria-label="영업 지역 선택 닫기" onClick={() => setMobileSalesAreaOpen(false)} type="button" />
          <section className="relative z-10 max-h-[82dvh] w-full overflow-y-auto rounded-t-3xl bg-white px-4 pb-[calc(1rem+env(safe-area-inset-bottom))] pt-3 shadow-2xl lg:max-w-3xl lg:rounded-2xl lg:p-5">
            <div className="mx-auto mb-3 h-1.5 w-12 rounded-full bg-slate-300" />
            <div className="mb-3 flex items-start justify-between gap-3">
              <div>
                <p className="text-base font-black text-slate-950">영업할 지역 선택</p>
                <p className="mt-1 text-xs font-semibold text-slate-500">지역을 저장하면 지도의 리드가 즉시 갱신됩니다.</p>
              </div>
              <button className="grid h-10 w-10 place-items-center rounded-full bg-slate-100 text-slate-600" onClick={() => setMobileSalesAreaOpen(false)} type="button" aria-label="닫기">
                <X className="h-5 w-5" />
              </button>
            </div>
            <SalesAreaSelector
              compact
              mapCenterPoint={mapCenterPoint}
              onChanged={() => {
                setMapLeadsVisible(true);
                setShowOutsideSalesAreaOnMap(false);
                void loadAllLeadsForMap();
              }}
              onSnapshot={handleMapSalesAreaSnapshot}
            />
          </section>
        </div>
      ) : null}
      {selectedStore ? (
        <StoreDetail
          attachments={storeAttachments[selectedStore.id] || {}}
          locationNote={customerLocationNote(customerLocationState(selectedStore.id, unplacedCustomerIds, approximateCustomerIds))}
          onShowOnMap={hiddenOnMapHandler(selectedStore)}
          driverOptions={deliveryDefaults.drivers}
          fuelPrices={fuelPrices}
          history={storeHistories[selectedStore.id] || []}
          key={selectedStore.id}
          onAddDriver={addManualDriver}
          onAddVehicle={addManualVehicle}
          onClose={() => setSelectedId("")}
          onClearHistory={(storeId) =>
            setStoreHistories((current) => ({
              ...current,
              [storeId]: []
            }))
          }
          onDeleteHistory={(storeId, historyId) =>
            setStoreHistories((current) => ({
              ...current,
              [storeId]: (current[storeId] || []).filter((item) => item.id !== historyId)
            }))
          }
          onSaveAttachment={(slot, file) =>
            setStoreAttachments((current) => ({
              ...current,
              [selectedStore.id]: {
                ...current[selectedStore.id],
                [slot]: file
              }
            }))
          }
          onUpdateRelationshipStatus={updateRelationshipStatus}
          onUpdateStore={updateStore}
          onWriteHistory={(storeId, memo) =>
            setStoreHistories((current) => ({
              ...current,
              [storeId]: [
                {
                  id: `${storeId}-${Date.now()}`,
                  memo,
                  recordedAt: new Date().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })
                },
                ...(current[storeId] || [])
              ]
            }))
          }
          store={selectedStore}
          vehicleOptions={vehicleNameOptions}
        />
      ) : null}
      {quickRegisterTarget ? (
        <QuickRegisterDrawer
          driverOptions={deliveryDefaults.drivers}
          onAddDriver={addManualDriver}
          onAddVehicle={addManualVehicle}
          onClose={() => setQuickRegisterTarget(null)}
          onRegistered={() => router.refresh()}
          result={quickRegisterTarget}
          vehicleOptions={vehicleNameOptions}
        />
      ) : null}
      {quoteSubject ? <QuoteDrawer companyId={churnRiskCompanyId} companyName={companyName} onClose={() => setQuoteSubject(null)} subject={quoteSubject} /> : null}
    </div>
  );
}

// 지도 검색에서 찾은 미등록 매장을 화면을 떠나지 않고 그 자리에서 바로 등록할 수 있게 하는 패널입니다.
// 상호명만 있으면 저장할 수 있고(사업자등록번호는 나중에 서류로 보완), 저장에 성공하면 같은 패널 안에서
// 바로 사업자등록증·신분증·적재위치 파일을 업로드할 수 있도록 이어집니다.
function QuickRegisterDrawer({
  driverOptions,
  onAddDriver,
  onAddVehicle,
  onClose,
  onRegistered,
  result,
  vehicleOptions
}: {
  driverOptions?: string[];
  onAddDriver?: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  onAddVehicle?: (vehicleName: string) => Promise<{ ok: boolean; message?: string }>;
  onClose: () => void;
  onRegistered: () => void;
  result: ExternalBusinessResult;
  vehicleOptions?: string[];
}) {
  const [customerName, setCustomerName] = useState(result.name);
  const [address, setAddress] = useState(result.roadAddress || result.address);
  const [phone, setPhone] = useState(formatPhoneNumber(result.phone));
  const [industry, setIndustry] = useState(result.industry);
  const [deliveryManager, setDeliveryManager] = useState("");
  const [deliveryVehicle, setDeliveryVehicle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createdCustomer, setCreatedCustomer] = useState<{ id: string; name: string; assignmentNotice?: string } | null>(null);
  // 2026-08-27 피드백("중복값 입력되지 않게 만들어줘") 대응: 서버가 상호명이 같은 기존 거래처를
  // 발견하면 바로 저장하지 않고 이 상태에 그 목록을 담아 확인창을 띄웁니다. 사용자가 "그래도 등록"을
  // 선택해야만 confirmDuplicate: true로 다시 요청을 보내 실제로 저장합니다.
  const [duplicateMatches, setDuplicateMatches] = useState<PossibleDuplicateCustomer[] | null>(null);
  // 2026-08-31 에러 처리/복원력 감사 후속: 카카오 검색 결과로 채워진 값을 그대로 두거나(=아직
  // 손대지 않음) 이미 등록을 마쳤다면 이탈 경고를 띄우지 않고, 사용자가 실제로 뭔가 고치거나
  // 담당자/배송차를 지정했을 때만(=저장 안 하고 나가면 다시 입력해야 함) 경고합니다.
  const isDraftDirty =
    !createdCustomer &&
    (customerName !== (result.name || "") ||
      address !== (result.roadAddress || result.address || "") ||
      phone !== (result.phone || "") ||
      industry !== (result.industry || "") ||
      Boolean(deliveryManager) ||
      Boolean(deliveryVehicle));
  useUnsavedChangesWarning(isDraftDirty);

  async function saveCustomer(confirmDuplicate = false) {
    if (!customerName.trim() || isSaving) return;

    setIsSaving(true);
    setSaveError("");

    try {
      const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
      const response = await fetchWithTimeout("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          businessStatus: "확인 필요",
          companyId: companyId || undefined,
          confirmDuplicate,
          customerName,
          deliveryManager: deliveryManager || undefined,
          deliveryVehicle: deliveryVehicle || undefined,
          industry: industry || "미분류",
          kakaoPlaceUrl: result.kakaoPlaceUrl,
          phone: normalizePhoneNumber(phone),
          validateBusinessNumber: false
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "거래처 등록에 실패했습니다.");
      if (payload?.possibleDuplicate) {
        setDuplicateMatches(payload.duplicateMatches || []);
        return;
      }

      const customerId = String(payload?.customer?.id || "");
      if (!customerId) throw new Error("거래처는 저장됐지만 ID를 확인하지 못했습니다. 거래처 관리에서 확인해주세요.");

      setCreatedCustomer({ id: customerId, name: customerName, assignmentNotice: payload?.assignmentNotice });
      onRegistered();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "거래처 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button aria-label="빠른 등록 닫기" className="fixed inset-0 z-40 bg-slate-950/45" onClick={onClose} type="button" />
      <aside className="fixed right-0 top-0 z-50 flex h-screen w-full max-w-[480px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="maju-card-header border-b px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-teal-700">지도 검색 · 빠른 등록</p>
              <h3 className="mt-1 truncate text-xl font-black text-slate-950">{createdCustomer ? `${createdCustomer.name} 등록 완료` : "거래처로 등록"}</h3>
              <p className="mt-1 text-xs font-bold text-slate-500">
                {createdCustomer ? "서류를 업로드하면 바로 사용할 수 있습니다." : "이름과 주소만 있으면 바로 저장할 수 있습니다."}
              </p>
            </div>
            <button
              aria-label="닫기"
              className="grid h-9 w-9 shrink-0 place-items-center rounded-md bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-rose-50 hover:text-rose-700"
              onClick={onClose}
              type="button"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-4 py-4">
          {createdCustomer ? (
            <div className="space-y-4">
              <CustomerAttachmentUploadPanel customerId={createdCustomer.id} customerName={createdCustomer.name} />
              {createdCustomer.assignmentNotice ? (
                <div className="rounded-lg border border-teal-200 bg-teal-50 px-3 py-2 text-sm font-bold text-teal-800">
                  {createdCustomer.assignmentNotice}
                </div>
              ) : null}
              <button className="maju-button-primary flex h-11 w-full items-center justify-center gap-2 text-sm" onClick={onClose} type="button">
                <Check className="h-4 w-4" />
                완료
              </button>
            </div>
          ) : (
            <div className="space-y-3 rounded-md border border-slate-200 bg-white p-4">
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">상호명 (필수)</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setCustomerName(event.target.value)}
                  value={customerName}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">주소</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setAddress(event.target.value)}
                  value={address}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">연락처</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setPhone(formatPhoneNumber(event.target.value))}
                  value={phone}
                />
              </label>
              <label className="block space-y-1.5">
                <span className="text-xs font-black text-slate-500">업종</span>
                <input
                  className="h-10 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setIndustry(event.target.value)}
                  value={industry}
                />
              </label>
              <div className="grid grid-cols-2 gap-2">
                <label className="block space-y-1.5">
                  <span className="text-xs font-black text-slate-500">담당자</span>
                  <DriverSelectField driverOptions={driverOptions || []} onAddDriver={onAddDriver} onChange={setDeliveryManager} value={deliveryManager} />
                </label>
                <label className="block space-y-1.5">
                  <span className="text-xs font-black text-slate-500">배송차</span>
                  <DriverSelectField
                    driverOptions={vehicleOptions || []}
                    entityLabel="배송차"
                    onAddDriver={onAddVehicle}
                    onChange={setDeliveryVehicle}
                    value={deliveryVehicle}
                  />
                </label>
              </div>
              <p className="rounded-md bg-blue-50 px-3 py-2 text-xs font-bold leading-5 text-blue-800">
                사업자등록번호는 지금 없어도 됩니다. 저장 후 사업자등록증을 업로드해 보완할 수 있습니다.
              </p>
              {saveError ? <p className="text-xs font-bold text-rose-600">{saveError}</p> : null}
              <button
                className="maju-button-primary flex h-11 w-full items-center justify-center gap-2 text-sm disabled:opacity-60"
                disabled={!customerName.trim() || isSaving}
                onClick={() => saveCustomer()}
                type="button"
              >
                {isSaving ? "저장 중" : "거래처로 등록"}
              </button>
            </div>
          )}
        </div>
      </aside>
      {duplicateMatches ? (
        <ConfirmDialog
          cancelLabel="취소"
          confirmLabel="그래도 등록"
          message={`이름이 같은 거래처가 이미 있습니다.\n${duplicateMatches.map((match) => `· ${match.customerName}${match.address ? ` (${match.address})` : ""}`).join("\n")}\n\n그래도 새 거래처로 등록하시겠습니까?`}
          onCancel={() => setDuplicateMatches(null)}
          onConfirm={() => {
            setDuplicateMatches(null);
            saveCustomer(true);
          }}
          title="중복 의심 거래처"
          tone="default"
        />
      ) : null}
    </>
  );
}

function CustomerDirectoryView({
  dataRegistrationHref,
  driverOptions,
  fuelPrices,
  onSelectStore,
  selectedStoreId,
  sourceReady,
  stores,
  vehicleOptions
}: {
  readonly dataRegistrationHref: string;
  readonly driverOptions: string[];
  readonly fuelPrices: FuelPriceByType;
  readonly onSelectStore: (storeId: string) => void;
  readonly selectedStoreId: string;
  readonly sourceReady: boolean;
  readonly stores: StoreRow[];
  readonly vehicleOptions: string[];
}) {
  const router = useRouter();
  const deliveryPricePerLiter = fuelPrices.diesel?.pricePerLiter || fuelPrices.gasoline?.pricePerLiter || 0;
  const gradeCounts = countGrades(stores);
  const unknownCount = stores.filter((store) => store.businessStatus === "unknown").length;
  // 2026-08-31 피드백 대응: "물류비 합계" KPI. 거래처 하나하나가 출발지에서 각자 왕복한다고
  // 가정해 전부 더하면(=지금 표의 "예산 물류비" 열을 단순 합산) 실제 배송보다 훨씬 부풀려집니다 —
  // 실제로는 배송차 한 대가 담당 거래처를 한 번의 경로로 순회합니다. 배송차별 실제 순회 경로를
  // 매번 계산하려면 배송차마다 티맵 API를 호출해야 해 비용·속도 부담이 크므로, 그 배송차가 맡은
  // 거래처 중 가장 먼 거리를 "이 배송차가 한 번 나가서 도는 왕복 거리"의 근사치로 삼습니다(가장 먼
  // 곳까지 갔다 오는 길에 나머지 거래처를 들른다고 가정 — 실제 순회 경로보다는 다소 넉넉한 편이지만,
  // 거래처별 왕복을 전부 더하는 것보다는 훨씬 현실에 가깝습니다).
  const totalLogisticsCostWon = useMemo(() => {
    const farthestDistanceByVehicle = new Map<string, number>();
    stores.forEach((store) => {
      const vehicleKey = store.deliveryVehicleName || store.deliveryDriver || `__unassigned_${store.id}`;
      const distanceKm = store.distanceKm || 0;
      const current = farthestDistanceByVehicle.get(vehicleKey) ?? 0;
      if (distanceKm > current) farthestDistanceByVehicle.set(vehicleKey, distanceKm);
    });
    let total = 0;
    farthestDistanceByVehicle.forEach((distanceKm) => {
      total += estimateFuelCostWon(distanceKm, deliveryPricePerLiter) * 2;
    });
    return total;
  }, [stores, deliveryPricePerLiter]);
  type DirectorySortKey = "businessStatus" | "deliveryDriver" | "deliveryVehicleName" | "distanceKm" | "expectedRevenue" | "grade" | "industry" | "logisticsCost" | "name";
  const [sortKey, setSortKey] = useState<DirectorySortKey | null>(null);
  const [sortDirection, setSortDirection] = useState<"asc" | "desc">("asc");
  const [showMoreDirectoryColumns, setShowMoreDirectoryColumns] = useState(false);
  function toggleSort(key: DirectorySortKey) {
    if (sortKey === key) {
      setSortDirection((current) => (current === "asc" ? "desc" : "asc"));
    } else {
      setSortKey(key);
      setSortDirection("asc");
    }
  }
  const gradeSortWeight: Record<string, number> = { A: 3, B: 2, C: 1 };
  // 2026-09-07 피드백("담당자 또는 배송차가 거래처를 일괄 또는 선택해서 이동할 수 있는게 필요할
  // 것 같아. 하나하나 옮기려니까 너무 힘드네") 대응: 담당자/배송차로 목록을 좁혀두면 "전체 선택"
  // 만으로 그 그룹 전체를 한 번에 고를 수 있습니다(체크박스로 부분 선택도 그대로 가능).
  const [directoryManagerFilter, setDirectoryManagerFilter] = useState("");
  const [directoryVehicleFilter, setDirectoryVehicleFilter] = useState("");
  const filteredStores = useMemo(() => {
    return stores.filter((store) => {
      if (directoryManagerFilter && (store.deliveryDriver || "") !== directoryManagerFilter) return false;
      if (directoryVehicleFilter && (store.deliveryVehicleName || "") !== directoryVehicleFilter) return false;
      return true;
    });
  }, [stores, directoryManagerFilter, directoryVehicleFilter]);
  const sortedStores = useMemo(() => {
    if (!sortKey) return filteredStores;
    const decorated = filteredStores.map((store) => ({
      logisticsCost: estimateFuelCostWon(store.distanceKm || 0, deliveryPricePerLiter) * 2,
      store
    }));
    decorated.sort((a, b) => {
      let diff = 0;
      if (sortKey === "name") diff = a.store.name.localeCompare(b.store.name, "ko");
      else if (sortKey === "industry") diff = (a.store.industry || "").localeCompare(b.store.industry || "", "ko");
      else if (sortKey === "grade") diff = (gradeSortWeight[a.store.grade] || 0) - (gradeSortWeight[b.store.grade] || 0);
      else if (sortKey === "deliveryDriver") diff = (a.store.deliveryDriver || "").localeCompare(b.store.deliveryDriver || "", "ko");
      else if (sortKey === "deliveryVehicleName") diff = (a.store.deliveryVehicleName || "").localeCompare(b.store.deliveryVehicleName || "", "ko");
      else if (sortKey === "expectedRevenue") diff = a.store.expectedRevenue - b.store.expectedRevenue;
      else if (sortKey === "distanceKm") diff = (a.store.distanceKm || 0) - (b.store.distanceKm || 0);
      else if (sortKey === "logisticsCost") diff = a.logisticsCost - b.logisticsCost;
      else if (sortKey === "businessStatus") diff = getBusinessStatusLabel(a.store.businessStatus).localeCompare(getBusinessStatusLabel(b.store.businessStatus), "ko");
      return sortDirection === "asc" ? diff : -diff;
    });
    return decorated.map((item) => item.store);
  }, [filteredStores, sortKey, sortDirection, deliveryPricePerLiter]);
  function SortableHeader({
    className = "",
    label,
    sortKeyValue,
    helpText
  }: {
    className?: string;
    label: string;
    sortKeyValue: DirectorySortKey;
    helpText?: string;
  }) {
    const isActive = sortKey === sortKeyValue;
    return (
      <th className={`border-r border-slate-200 px-4 py-3 ${className}`}>
        <span className="inline-flex items-center gap-1">
          <button
            className={`inline-flex items-center gap-1 hover:text-slate-900 ${isActive ? "text-slate-900" : ""}`}
            onClick={() => toggleSort(sortKeyValue)}
            type="button"
          >
            {label}
            {isActive ? sortDirection === "asc" ? <ArrowUp className="h-3 w-3" /> : <ArrowDown className="h-3 w-3" /> : <ArrowUpDown className="h-3 w-3 text-slate-300" />}
          </button>
          {helpText ? (
            <details className="group relative" onClick={(event) => event.stopPropagation()}>
              <summary aria-label={`${label} 설명`} className="grid h-5 w-5 cursor-pointer list-none place-items-center rounded-full text-[11px] font-black text-slate-400 hover:bg-slate-200 hover:text-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-teal-500">ⓘ</summary>
              <span className="absolute left-0 top-6 z-30 block w-64 rounded-lg border border-slate-200 bg-white p-3 text-left text-[11px] font-semibold leading-5 text-slate-600 shadow-xl">{helpText}</span>
            </details>
          ) : null}
        </span>
      </th>
    );
  }
  // 2026-08-27 피드백("거래처가 중복되어 있는게 있어") 대응: 상호명+주소가 동일한 거래처를 화면에서
  // 바로 찾아 병합할 수 있게 합니다. 서버에는 이미 병합 API(mergeDuplicateCustomers)가 있었지만 이를
  // 부를 UI가 없어서 사용자가 중복을 직접 발견해도 정리할 방법이 없었습니다.
  const duplicateGroups = useMemo(() => {
    const groups = new Map<string, StoreRow[]>();
    stores.forEach((store) => {
      const key = `${store.name}`.trim().toLowerCase().replace(/\s/g, "") + "|" + `${store.address || ""}`.trim().toLowerCase().replace(/\s/g, "");
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key)!.push(store);
    });
    return Array.from(groups.values()).filter((group) => group.length > 1);
  }, [stores]);
  const [mergingKey, setMergingKey] = useState<string | null>(null);
  const [mergeError, setMergeError] = useState("");
  const [pendingMergeGroup, setPendingMergeGroup] = useState<StoreRow[] | null>(null);

  // 2026-09-07 피드백("담당자 또는 배송차가 거래처를 일괄 또는 선택해서 이동할 수 있는게 필요할
  // 것 같아. 하나하나 옮기려니까 너무 힘드네") 대응: 지금까지는 거래처를 한 곳씩 열어 담당자/배송차를
  // 고쳐야 했습니다. 위 directoryManagerFilter/directoryVehicleFilter로 목록을 좁힌 뒤 "전체 선택"으로
  // 그 그룹 전체를 한 번에, 또는 체크박스로 원하는 거래처만 골라, 다른 담당자/배송차로 한 번에
  // 옮길 수 있게 합니다.
  const [selectedStoreIds, setSelectedStoreIds] = useState<Set<string>>(new Set());
  const [bulkTargetManager, setBulkTargetManager] = useState("");
  const [bulkTargetVehicle, setBulkTargetVehicle] = useState("");
  const [bulkApplying, setBulkApplying] = useState(false);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkError, setBulkError] = useState("");

  function toggleSelectStore(storeId: string) {
    setSelectedStoreIds((current) => {
      const next = new Set(current);
      if (next.has(storeId)) next.delete(storeId);
      else next.add(storeId);
      return next;
    });
  }

  async function runBulkReassign() {
    const targetManager = bulkTargetManager.trim();
    const targetVehicle = bulkTargetVehicle.trim();
    const customerIds = Array.from(selectedStoreIds);
    if (!customerIds.length || (!targetManager && !targetVehicle)) return;
    setBulkApplying(true);
    setBulkError("");
    setBulkMessage("");
    try {
      const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
      if (targetManager) {
        const response = await fetch("/api/customers/bulk-manager", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: companyId || undefined, customerIds, deliveryManager: targetManager })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "담당자 일괄 변경에 실패했습니다.");
      }
      if (targetVehicle) {
        const response = await fetch("/api/customers/bulk-vehicle", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ companyId: companyId || undefined, customerIds, deliveryVehicle: targetVehicle })
        });
        const payload = await response.json().catch(() => null);
        if (!response.ok) throw new Error(payload?.message || "배송차 일괄 변경에 실패했습니다.");
      }
      setBulkMessage(`${customerIds.length.toLocaleString()}곳을 이동했습니다.`);
      setSelectedStoreIds(new Set());
      setBulkTargetManager("");
      setBulkTargetVehicle("");
      router.refresh();
    } catch (error) {
      setBulkError(error instanceof Error ? error.message : "일괄 이동에 실패했습니다.");
    } finally {
      setBulkApplying(false);
    }
  }

  function completenessScore(store: StoreRow) {
    return [store.businessRegistrationNumber, store.deliveryDriver, store.deliveryVehicleName, store.phone, store.representativeName, store.accessMethodType, store.loadingPosition].filter(
      Boolean
    ).length;
  }

  async function runMerge(group: StoreRow[]) {
    const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a));
    const primary = sorted[0];
    const duplicates = sorted.slice(1);
    const groupKey = group.map((store) => store.id).join(",");
    setMergingKey(groupKey);
    setMergeError("");
    try {
      const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
      const response = await fetch("/api/customers/merge", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          companyId: companyId || undefined,
          primaryCustomerId: primary.id,
          duplicateCustomerIds: duplicates.map((store) => store.id)
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "중복 거래처 병합에 실패했습니다.");
      setPendingMergeGroup(null);
      router.refresh();
    } catch (error) {
      setMergeError(error instanceof Error ? error.message : "중복 거래처 병합에 실패했습니다.");
    } finally {
      setMergingKey(null);
    }
  }

  return (
    <section className="flex min-h-[480px] flex-1 flex-col overflow-visible rounded-b-xl bg-[#f6f8fb] p-4 pb-6">
      <div className="grid shrink-0 gap-3 lg:grid-cols-3">
        <DirectoryStat label="거래처" value={`${stores.length}곳`} />
        <DirectoryStat label="A등급" value={`${gradeCounts.A}곳`} />
        <DirectoryStat
          label="물류비 합계"
          title="배송차별로, 그 배송차가 맡은 거래처 중 가장 먼 곳까지의 왕복 유류비를 더한 값입니다(참고용 추정치). 거래처 각각의 왕복을 단순 합산하지 않고 배송차 한 대가 한 번에 순회한다고 가정합니다."
          value={`${Math.round(totalLogisticsCostWon / 10000).toLocaleString()}만원`}
        />
      </div>

      {sourceReady && duplicateGroups.length ? (
        <div className="mt-3 flex shrink-0 flex-col gap-2.5 rounded-lg border border-rose-200 bg-rose-50 px-4 py-3">
          <div className="flex items-center gap-2.5">
            <Copy className="h-4 w-4 shrink-0 text-rose-700" />
            <p className="text-xs font-bold leading-5 text-rose-900">
              상호명·주소가 같은 중복 의심 거래처가 <span className="font-black">{duplicateGroups.length}건</span> 있습니다. 매출·거래내역이 나뉘어
              집계될 수 있어 병합을 권장합니다.
            </p>
          </div>
          {mergeError ? <p className="text-xs font-bold text-rose-700">{mergeError}</p> : null}
          <div className="flex flex-col gap-2">
            {duplicateGroups.map((group) => {
              const groupKey = group.map((store) => store.id).join(",");
              const sorted = [...group].sort((a, b) => completenessScore(b) - completenessScore(a));
              return (
                <div className="flex items-center justify-between gap-3 rounded-lg border border-rose-100 bg-white px-3 py-2" key={groupKey}>
                  <div className="min-w-0">
                    <p className="truncate text-xs font-black text-slate-950">{sorted[0].name}</p>
                    <p className="truncate text-[11px] font-bold text-slate-500">
                      {sorted[0].address || sorted[0].region} · {group.length}건 중복 · 기준 레코드는 자동으로 정보가 더 많은 쪽을 선택합니다
                    </p>
                  </div>
                  <button
                    className="maju-button-secondary h-8 shrink-0 px-3 text-[11px]"
                    disabled={mergingKey === groupKey}
                    onClick={() => setPendingMergeGroup(group)}
                    type="button"
                  >
                    {mergingKey === groupKey ? "병합 중..." : "병합"}
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      ) : null}

      {sourceReady && unknownCount ? (
        <div className="mt-3 flex shrink-0 items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs font-bold leading-5 text-amber-900">
            사업자 상태가 아직 확인되지 않은 거래처가 <span className="font-black">{unknownCount}곳</span> 있습니다. 아래 목록에서 거래처를 눌러 상세
            패널의 &quot;사업자 상태 조회&quot;를 실행하세요.
          </p>
        </div>
      ) : null}

      {/* 2026-09-07 피드백("담당자 또는 배송차가 거래처를 일괄 또는 선택해서 이동할 수 있는게
          필요할 것 같아. 하나하나 옮기려니까 너무 힘드네"): 담당자/배송차로 목록을 좁힌 뒤 "전체
          선택"으로 그 그룹 전체를, 또는 표의 체크박스로 원하는 거래처만 골라 다른 담당자·배송차로
          한 번에 옮길 수 있습니다. */}
      {sourceReady && stores.length ? (
        <div className="mt-3 flex shrink-0 flex-col gap-2.5 rounded-lg border border-teal-200 bg-teal-50/60 px-4 py-3">
          <div className="flex flex-wrap items-center gap-2">
            <p className="shrink-0 text-xs font-black text-teal-900">담당자/배송차 일괄 이동</p>
            <select
              className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
              onChange={(event) => setDirectoryManagerFilter(event.target.value)}
              value={directoryManagerFilter}
            >
              <option value="">담당자 전체</option>
              {driverOptions.map((driver) => (
                <option key={driver} value={driver}>
                  {driver}
                </option>
              ))}
            </select>
            <select
              className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
              onChange={(event) => setDirectoryVehicleFilter(event.target.value)}
              value={directoryVehicleFilter}
            >
              <option value="">배송차 전체</option>
              {vehicleOptions.map((vehicle) => (
                <option key={vehicle} value={vehicle}>
                  {vehicle}
                </option>
              ))}
            </select>
            <button
              className="maju-button-secondary h-8 shrink-0 px-3 text-[11px]"
              onClick={() => {
                const allVisibleSelected = sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id));
                setSelectedStoreIds(allVisibleSelected ? new Set() : new Set(sortedStores.map((store) => store.id)));
              }}
              type="button"
            >
              {sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id)) ? "전체 해제" : `보이는 ${sortedStores.length.toLocaleString()}곳 전체 선택`}
            </button>
            {selectedStoreIds.size ? <span className="text-xs font-black text-teal-900">{selectedStoreIds.size.toLocaleString()}곳 선택됨</span> : null}
          </div>
          {selectedStoreIds.size ? (
            <div className="flex flex-wrap items-center gap-2 border-t border-teal-200 pt-2.5">
              <span className="shrink-0 text-xs font-bold text-teal-900">이동할 곳:</span>
              <select
                className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
                onChange={(event) => setBulkTargetManager(event.target.value)}
                value={bulkTargetManager}
              >
                <option value="">담당자 변경 안 함</option>
                {driverOptions.map((driver) => (
                  <option key={driver} value={driver}>
                    {driver}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border border-teal-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-400"
                onChange={(event) => setBulkTargetVehicle(event.target.value)}
                value={bulkTargetVehicle}
              >
                <option value="">배송차 변경 안 함</option>
                {vehicleOptions.map((vehicle) => (
                  <option key={vehicle} value={vehicle}>
                    {vehicle}
                  </option>
                ))}
              </select>
              <button
                className="maju-button-primary h-8 shrink-0 px-3 text-[11px] disabled:cursor-not-allowed disabled:opacity-60"
                disabled={bulkApplying || (!bulkTargetManager.trim() && !bulkTargetVehicle.trim())}
                onClick={runBulkReassign}
                type="button"
              >
                {bulkApplying ? "이동 중..." : `${selectedStoreIds.size.toLocaleString()}곳 이동`}
              </button>
              <button
                className="maju-button-secondary h-8 shrink-0 px-3 text-[11px]"
                disabled={bulkApplying}
                onClick={() => {
                  setSelectedStoreIds(new Set());
                  setBulkTargetManager("");
                  setBulkTargetVehicle("");
                }}
                type="button"
              >
                선택 해제
              </button>
            </div>
          ) : null}
          {bulkError ? <p className="text-xs font-bold text-rose-700">{bulkError}</p> : null}
          {bulkMessage ? <p className="text-xs font-bold text-emerald-700">{bulkMessage}</p> : null}
        </div>
      ) : null}

      <div className="maju-section-card mt-4 !overflow-visible">
        {sourceReady && stores.length ? (
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-2.5">
            <p className="text-xs font-semibold text-slate-500">기본 화면은 업무에 필요한 핵심 정보만 표시합니다.</p>
            <button className="maju-button-secondary h-8 px-3 text-xs" onClick={() => setShowMoreDirectoryColumns((current) => !current)} type="button">
              {showMoreDirectoryColumns ? "핵심 컬럼만" : "컬럼 더보기"}
            </button>
          </div>
        ) : null}
        {!sourceReady ? (
          <OperationalEmptyState
            actionHref={dataRegistrationHref}
            actionLabel="거래처 등록"
            description="사업자번호, 주소, 담당자, 매출등급을 등록하세요."
            title="거래처 원장 필요"
          />
        ) : null}
        {sourceReady ? (
          stores.length ? (
            <div className="overflow-x-auto">
              <table className={`w-full border-separate border-spacing-0 text-left text-sm ${showMoreDirectoryColumns ? "min-w-[1520px]" : "min-w-[760px]"}`}>
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs font-black text-slate-500 shadow-[0_1px_0_#e2e8f0] backdrop-blur">
                  <tr>
                    <th className="w-[36px] border-r border-slate-200 px-3 py-3">
                      <input
                        aria-label="현재 보이는 거래처 전체 선택"
                        checked={sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id))}
                        className="h-3.5 w-3.5 accent-teal-700"
                        onChange={() => {
                          const allVisibleSelected = sortedStores.length > 0 && sortedStores.every((store) => selectedStoreIds.has(store.id));
                          setSelectedStoreIds(allVisibleSelected ? new Set() : new Set(sortedStores.map((store) => store.id)));
                        }}
                        type="checkbox"
                      />
                    </th>
                    <SortableHeader className="w-[28%]" label="거래처" sortKeyValue="name" />
                    {showMoreDirectoryColumns ? <SortableHeader className="w-[96px]" label="업종" sortKeyValue="industry" /> : null}
                    <SortableHeader className="w-[96px]" helpText="거래처의 매출 규모와 중요도를 기준으로 관리하는 등급입니다." label="매출등급" sortKeyValue="grade" />
                    <SortableHeader className="w-[130px]" label="담당자" sortKeyValue="deliveryDriver" />
                    {showMoreDirectoryColumns ? <SortableHeader
                      className="w-[130px]"
                      helpText="담당자와 배송차는 독립적으로 지정할 수 있으며 같은 배송차를 여러 담당자가 나눠 쓰는 경우도 포함합니다. 지도 필터는 이 값을 기준으로 동작합니다."
                      label="배송차"
                      sortKeyValue="deliveryVehicleName"
                    /> : null}
                    {showMoreDirectoryColumns ? <SortableHeader className="w-[120px] text-right" label="예상매출" sortKeyValue="expectedRevenue" /> : null}
                    {showMoreDirectoryColumns ? <SortableHeader className="w-[120px] text-right" label="출발지 거리" sortKeyValue="distanceKm" /> : null}
                    {showMoreDirectoryColumns ? <SortableHeader
                      className="w-[150px] text-right"
                      helpText="출발지에서 이 거래처까지 왕복했을 때의 예상 유류비로, 참고용 추정치입니다."
                      label="예산 물류비"
                      sortKeyValue="logisticsCost"
                    /> : null}
                    <SortableHeader className="w-[120px]" label="사업자 상태" sortKeyValue="businessStatus" />
                    {showMoreDirectoryColumns ? <th className="w-[110px] border-r border-slate-200 px-4 py-3">출입 방법</th> : null}
                    {showMoreDirectoryColumns ? <th
                      className="w-[90px] border-r border-slate-200 px-4 py-3"
                      title="보안을 위해 실제 비밀번호 값은 목록에 노출하지 않습니다. 거래처를 눌러 상세 패널에서 확인하세요."
                    >
                      비밀번호
                    </th> : null}
                    {showMoreDirectoryColumns ? <th className="w-[150px] px-4 py-3">적재 위치</th> : null}
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {sortedStores.map((store) => (
                    <tr
                      data-selected={store.id === selectedStoreId ? "true" : "false"}
                      className={`cursor-pointer transition hover:bg-slate-50 ${store.id === selectedStoreId ? "bg-teal-50/70 shadow-[inset_3px_0_0_#0f766e]" : "bg-white"}`}
                      key={store.id}
                      onClick={() => onSelectStore(store.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") onSelectStore(store.id);
                      }}
                    >
                      <td className="border-r border-slate-100 px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        <input
                          aria-label={`${store.name} 선택`}
                          checked={selectedStoreIds.has(store.id)}
                          className="h-3.5 w-3.5 accent-teal-700"
                          onChange={() => toggleSelectStore(store.id)}
                          type="checkbox"
                        />
                      </td>
                      <td className="min-w-0 border-r border-slate-100 px-4 py-3">
                        <p className="truncate font-black text-slate-950">{store.name}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">{store.address || store.region}</p>
                      </td>
                      {showMoreDirectoryColumns ? <td className="max-w-[96px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-500">{store.industry || "미분류"}</td> : null}
                      <td className="border-r border-slate-100 px-4 py-3">
                        <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                      </td>
                      <td className="max-w-[130px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{store.deliveryDriver || "미지정"}</td>
                      {showMoreDirectoryColumns ? <td className="max-w-[130px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{store.deliveryVehicleName || "미지정"}</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3 text-right font-black text-slate-950">{store.expectedRevenue.toLocaleString()}만원</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3 text-right font-bold text-slate-500">{store.distanceKm?.toLocaleString() || "-"}km</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3 text-right font-bold text-slate-500">
                        {(() => {
                          const roundTripCost = estimateFuelCostWon(store.distanceKm || 0, deliveryPricePerLiter) * 2;
                          return roundTripCost ? `왕복 ${roundTripCost.toLocaleString()}원` : <span className="text-slate-400">확인 필요</span>;
                        })()}
                      </td> : null}
                      <td className="border-r border-slate-100 px-4 py-3">
                        <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
                        {store.relationshipStatus === "거래종료" ? (
                          <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">거래 종료</span>
                        ) : null}
                      </td>
                      {showMoreDirectoryColumns ? <td className="max-w-[110px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-500">{store.accessMethodType || "미등록"}</td> : null}
                      {showMoreDirectoryColumns ? <td className="border-r border-slate-100 px-4 py-3">
                        {store.hasAccessPassword ? (
                          <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                            <Lock className="h-3 w-3" /> 등록됨
                          </span>
                        ) : (
                          <span className="text-xs font-bold text-slate-400">미등록</span>
                        )}
                      </td> : null}
                      {showMoreDirectoryColumns ? <td className="max-w-[150px] truncate px-4 py-3 font-bold text-slate-500">{store.loadingPosition || "미등록"}</td> : null}
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <OperationalEmptyState
              actionHref={dataRegistrationHref}
              actionLabel="거래처 관리 확인"
              description="필터를 초기화하거나 거래처 값을 확인하세요."
              title="조건에 맞는 거래처 없음"
            />
          )
        ) : null}
      </div>

      {pendingMergeGroup ? (
        <ConfirmDialog
          confirmLabel="병합"
          message={`"${pendingMergeGroup[0].name}" ${pendingMergeGroup.length}건을 하나로 병합합니다. 정보가 더 많은 레코드를 기준으로 남기고 나머지는 거래내역·메모·첨부자료를 옮긴 뒤 삭제합니다. 되돌릴 수 없습니다.`}
          onCancel={() => setPendingMergeGroup(null)}
          onConfirm={() => runMerge(pendingMergeGroup)}
          title="중복 거래처 병합"
        />
      ) : null}
    </section>
  );
}

/** 지도 위 리드 반경 검색 결과 마커를 클릭했을 때 뜨는 간단 카드입니다. StoreQuickCard보다 가볍습니다. */
// 2026-08-30 피드백("배송차, 매니저 추천도 같이 뜨면 좋을 듯") 대응: 새 가짜 거리 계산을 만들지
// 않고, 이미 있는 신호만 써서 추천합니다. 1순위는 서버가 실제 좌표 거리로 계산해준
// lead.nearestAnchor(반경 검색 결과에만 존재)의 담당자, 2순위는 주소 끝 괄호 안 "동" 이름이 같은
// 등록 거래처들 중 가장 많이 배정된 담당자입니다. 둘 다 없으면 추천을 만들어내지 않고 비웁니다
// (단가를 자동으로 채우지 않는 것과 같은 원칙 — 근거 없는 추천은 하지 않습니다).
function extractDistrictToken(address?: string): string {
  if (!address) return "";
  const parenMatch = address.match(/\(([^)]+)\)\s*$/);
  if (parenMatch) return parenMatch[1].trim();
  const dongMatch = address.match(/([가-힣0-9]+(?:동|읍|면))/);
  return dongMatch ? dongMatch[1] : "";
}

function getRecommendedDelivery(
  lead: { address?: string; nearestAnchor?: { id: string; name: string } | null },
  stores: StoreRow[]
): { basis: string; driver: string; vehicle: string } | null {
  const anchorStore = lead.nearestAnchor ? stores.find((store) => store.id === lead.nearestAnchor!.id) : undefined;
  if (anchorStore?.deliveryDriver) {
    return { basis: `근접 거래처 "${anchorStore.name}" 기준`, driver: anchorStore.deliveryDriver, vehicle: anchorStore.deliveryVehicleName || "" };
  }

  const district = extractDistrictToken(lead.address);
  if (!district) return null;
  const sameDistrictStores = stores.filter((store) => store.deliveryDriver && extractDistrictToken(store.address) === district);
  if (!sameDistrictStores.length) return null;

  const driverCounts = new Map<string, { count: number; vehicle: string }>();
  sameDistrictStores.forEach((store) => {
    const key = store.deliveryDriver!;
    const current = driverCounts.get(key);
    driverCounts.set(key, { count: (current?.count || 0) + 1, vehicle: store.deliveryVehicleName || current?.vehicle || "" });
  });
  const [topDriver, topInfo] = Array.from(driverCounts.entries()).sort((a, b) => b[1].count - a[1].count)[0];
  return { basis: `같은 "${district}" 거래처 ${topInfo.count}곳 기준`, driver: topDriver, vehicle: topInfo.vehicle };
}

function PermitLeadMapQuickCard({
  allStores,
  documentEntry,
  headerOffsetPx,
  lead,
  onClose,
  onConverted,
  onDismiss,
  onOpenDetail,
  onOpenQuote,
  onRestore
}: {
  /** 배송담당자·배송차 추천(getRecommendedDelivery)에 씁니다. */
  readonly allStores: StoreRow[];
  readonly documentEntry: LeadDocumentEntryAccess;
  /** StoreQuickCard와 동일한 목적 — 검색 헤더 높이에 맞춰 카드가 가려지지 않게 합니다. */
  readonly headerOffsetPx?: number;
  readonly lead: (PermitLeadItem & { distanceKm?: number; nearestAnchor?: { id: string; name: string } | null }) | null;
  readonly onClose: () => void;
  readonly onConverted: () => void;
  readonly onDismiss: (lead: PermitLeadItem) => void | Promise<void>;
  readonly onOpenDetail: (lead: PermitLeadItem) => void;
  readonly onOpenQuote?: (lead: PermitLeadItem) => void;
  readonly onRestore: (lead: PermitLeadItem) => void | Promise<void>;
}) {
  const [isConverting, setIsConverting] = useState(false);
  const [isDismissing, setIsDismissing] = useState(false);
  const [isRestoring, setIsRestoring] = useState(false);
  const [message, setMessage] = useState("");
  const [addressCopied, setAddressCopied] = useState(false);
  // 카드를 사용자가 자유롭게 끌어서 옮길 수 있게 합니다(2026-08-24 피드백: "리드 카드를 사용자가
  // 자유롭게 움직일 수 있도록 만들어"). 기존 절대 위치(positionClassName) 위에 transform으로만
  // 오프셋을 얹어, 리드가 바뀌어도 기본 위치 로직은 그대로 유지합니다.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });

  useEffect(() => {
    setDragOffset({ x: 0, y: 0 });
  }, [lead?.id]);

  if (!lead) return null;

  const isDismissed = isHiddenLeadStatus(lead.status);
  const routeFit = lead.scoreBreakdown?.route_fit_score ?? 0;
  const isNearAnchor = routeFit >= 11;
  const isOpeningSoon = lead.leadPeriod === "today" || lead.leadPeriod === "week";
  const instagramUrl = getLeadInstagramSearchUrl(lead);
  const instagramHandle = getLeadInstagramHandle(lead);
  const confidence = getLeadConfidence(lead);
  const recommendedDelivery = getRecommendedDelivery(lead, allStores);
  // 2026-09-01 피드백: "리드들의 카드내에 지도 이모티콘이 없네" — 저장된 naverPlaceUrl/kakaoPlaceUrl/
  // googlePlaceUrl은 추천 점수 갱신을 돌리기 전까지 비어 있어, 그때까지는 링크가 아예 안 보였습니다.
  // 거래처 카드(PlaceLinkRow)와 동일하게 값이 없거나 일반 검색 링크면 상호명+주소 검색 링크로
  // 폴백해 항상 3개 링크가 뜨도록 합니다.
  const leadPlaceSearchLinks = buildPlaceSearchLinks({ address: lead.address, customerName: lead.businessName });
  const savedLeadNaverPlaceUrl = lead.naverPlaceUrl?.trim();
  const leadNaverPlaceUrl = !savedLeadNaverPlaceUrl || isGenericNaverSearchLink(savedLeadNaverPlaceUrl) ? leadPlaceSearchLinks.naverPlaceUrl : savedLeadNaverPlaceUrl;
  const leadKakaoPlaceUrl = lead.kakaoPlaceUrl?.trim() || leadPlaceSearchLinks.kakaoPlaceUrl;
  const leadGooglePlaceUrl = lead.googlePlaceUrl?.trim() || leadPlaceSearchLinks.googleMapUrl;

  async function copyAddress() {
    if (!lead?.address) return;
    if (!(await copyText(lead.address))) { setMessage("복사 권한이 없어 직접 선택해서 복사해주세요."); return; }
    setAddressCopied(true);
    window.setTimeout(() => setAddressCopied(false), 1500);
  }

  async function copyLeadDmScript() {
    if (!lead) return;
    setMessage((await copyText(buildLeadDmScript(lead))) ? "리드 맞춤 DM 문구를 복사했습니다." : "복사 권한이 없어 DM 문구를 복사하지 못했습니다.");
  }

  function onDragHandleMouseDown(event: MouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const startOffset = dragOffset;
    const handleMove = (moveEvent: globalThis.MouseEvent) => {
      setDragOffset({ x: startOffset.x + (moveEvent.clientX - startX), y: startOffset.y + (moveEvent.clientY - startY) });
    };
    const handleUp = () => {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    };
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  async function dismiss() {
    if (!lead) return;
    setIsDismissing(true);
    try {
      await onDismiss(lead);
    } finally {
      setIsDismissing(false);
    }
  }

  async function restore() {
    if (!lead) return;
    setIsRestoring(true);
    try {
      await onRestore(lead);
    } finally {
      setIsRestoring(false);
    }
  }

  async function convert() {
    if (!lead) return;
    setIsConverting(true);
    setMessage("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/convert`), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setMessage(payload?.message || "거래처 전환에 실패했습니다.");
        return;
      }
      onConverted();
    } catch {
      setMessage("네트워크 오류로 전환하지 못했습니다.");
    } finally {
      setIsConverting(false);
    }
  }

  const positionClassName = "left-4 w-[min(320px,calc(100%-32px))] lg:left-3 lg:w-[min(320px,calc(100%-24px))]";

  return (
    <div
      className={`absolute top-4 lg:top-[var(--quick-card-top,5rem)] z-30 h-auto overflow-hidden rounded-xl border border-teal-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,.18)] ${positionClassName}`}
      style={{
        ["--quick-card-top" as string]: headerOffsetPx ? `${headerOffsetPx + 12}px` : undefined,
        transform: `translate(${dragOffset.x}px, ${dragOffset.y}px)`
      } as React.CSSProperties}
    >
      <button
        className="flex w-full cursor-grab items-center justify-center gap-1 border-b border-slate-100 bg-slate-50 py-1 text-slate-300 hover:text-slate-500 active:cursor-grabbing"
        onMouseDown={onDragHandleMouseDown}
        title="드래그해서 카드 위치를 옮길 수 있습니다."
        type="button"
      >
        <GripVertical className="h-3.5 w-3.5" />
      </button>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-[15px] font-black leading-5 text-slate-950">{lead.businessName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge className={`px-1.5 py-0 text-xs ${permitGradeToneClassName(lead.grade, isPermitLeadUnscored(lead))}`}>{lead.grade || (isPermitLeadUnscored(lead) ? "채점 전" : "-")}</Badge>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">{lead.industryPrimary}</span>
            {typeof lead.distanceKm === "number" ? (
              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-700">{lead.distanceKm}km</span>
            ) : null}
            {LEAD_STORE_AREA_FEATURE_ENABLED && formatStoreAreaPyeong(lead.storeAreaSqm) ? (
              <span className="rounded-full bg-indigo-50 px-2 py-0.5 text-[11px] font-black text-indigo-700">
                규모 {formatStoreAreaPyeong(lead.storeAreaSqm)}
              </span>
            ) : null}
            {isOpeningSoon ? (
              <span className="rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">개업 임박</span>
            ) : null}
            {isNearAnchor ? (
              <span className="flex items-center gap-0.5 rounded-full bg-cyan-50 px-2 py-0.5 text-xs font-black text-cyan-700 ring-1 ring-inset ring-cyan-100">
                <Star className="h-2.5 w-2.5 fill-cyan-600 text-cyan-600" />
                기거래처 근접
              </span>
            ) : null}
            {isDismissed ? <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-600">숨김</span> : null}
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-0.5">
          {isDismissed ? (
            <button
              aria-label="복구"
              className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-teal-50 hover:text-teal-700 disabled:opacity-50"
              disabled={isRestoring}
              onClick={() => void restore()}
              title="숨김 해제 · 복구"
              type="button"
            >
              <Eye className="h-3.5 w-3.5" />
            </button>
          ) : (
            <button
              aria-label="관심 없음 · 숨김 처리"
              className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
              disabled={isDismissing}
              onClick={() => void dismiss()}
              title="관심 없음 · 숨김 처리"
              type="button"
            >
              <EyeOff className="h-3.5 w-3.5" />
            </button>
          )}
          <button aria-label="닫기" className="grid h-6 w-6 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} type="button">
            <X className="h-3.5 w-3.5" />
          </button>
        </div>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <div className="flex items-start gap-1">
          <p className="flex min-w-0 flex-1 gap-2 text-[13px] font-bold leading-5 text-slate-600">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="line-clamp-2">{lead.address || "주소 확인 필요"}</span>
          </p>
          {lead.address ? (
            <button
              aria-label="주소 복사"
              className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 transition hover:bg-slate-100 hover:text-teal-700"
              onClick={() => void copyAddress()}
              title="주소 복사"
              type="button"
            >
              {addressCopied ? <Check className="h-3.5 w-3.5 text-teal-600" /> : <Copy className="h-3.5 w-3.5" />}
            </button>
          ) : null}
        </div>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500">
          <span className="flex min-w-0 items-center gap-1">
            <Phone className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{lead.phone || "연락처 미확인"}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <CalendarDays className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{getPermitLeadOpenDate(lead) || "개시일 미확인"}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <UserRound className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{lead.representativeName || "대표자 미확인"}</span>
          </span>
          <span className="flex min-w-0 items-center gap-1">
            <Gauge className="h-3 w-3 shrink-0 text-slate-400" />
            <span className="min-w-0 flex-1 truncate">{lead.status || "상태 미확인"}</span>
          </span>
          <span className="col-span-2 flex min-w-0 items-center gap-1 font-black text-teal-700">
            <Target className="h-3 w-3 shrink-0 text-teal-600" />
            <span className="min-w-0 flex-1 truncate">우선순위 {confidence.score}점 · {confidence.label}</span>
          </span>
          {typeof lead.rating === "number" ? (
            <span className="flex min-w-0 items-center gap-1">
              <Star className="h-3 w-3 shrink-0 fill-amber-400 text-amber-400" />
              <span className="min-w-0 flex-1 truncate">
                {lead.rating.toFixed(1)}
                {typeof lead.reviewCount === "number" ? ` (${lead.reviewCount.toLocaleString()})` : ""}
              </span>
            </span>
          ) : null}
          {typeof lead.keywordVolume === "number" ? (
            <span className="flex min-w-0 items-center gap-1">
              <Search className="h-3 w-3 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">검색량 {lead.keywordVolume.toLocaleString()}</span>
            </span>
          ) : null}
        </div>
        {lead.nearestAnchor ? (
          <p className="mt-1.5 text-[11px] font-bold text-slate-400">기준 거래처: {lead.nearestAnchor.name}</p>
        ) : null}
        {recommendedDelivery ? (
          <p className="mt-1.5 flex items-center gap-1 text-[11px] font-bold text-teal-700">
            <Truck className="h-3 w-3 shrink-0" />
            <span className="min-w-0 truncate">
              추천 배송: {recommendedDelivery.driver}
              {recommendedDelivery.vehicle ? ` · ${recommendedDelivery.vehicle}` : ""}
              <span className="font-semibold text-slate-400"> ({recommendedDelivery.basis})</span>
            </span>
          </p>
        ) : null}
        {/* 2026-09-07 피드백("카드에 네이버, 카카오, 구글 글자가 아닌 이모티콘으로 통일하고"):
            우측 리드 목록/거래처 카드에 이미 쓰던 브랜드컬러 원형 N/K/G 배지로 통일해, "네이버"·
            "카카오맵"·"구글"이라는 긴 글자 대신 한눈에 브랜드를 알아볼 수 있는 작은 아이콘만 남깁니다. */}
        <div className="mt-2 flex flex-wrap gap-1">
          <a
            aria-label="네이버에서 검색"
            className="grid h-6 w-6 place-items-center rounded-full bg-[#03C75A] text-[11px] font-black text-white"
            href={leadNaverPlaceUrl}
            rel="noreferrer"
            target="_blank"
            title="네이버에서 검색"
          >
            N
          </a>
          <a
            aria-label="카카오맵에서 검색"
            className="grid h-6 w-6 place-items-center rounded-full bg-[#FEE500] text-[11px] font-black text-slate-900"
            href={leadKakaoPlaceUrl}
            rel="noreferrer"
            target="_blank"
            title="카카오맵에서 검색"
          >
            K
          </a>
          <a
            aria-label="구글에서 검색"
            className="grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-black text-[#EA4335] ring-1 ring-inset ring-slate-200"
            href={leadGooglePlaceUrl}
            rel="noreferrer"
            target="_blank"
            title="구글에서 검색"
          >
            G
          </a>
          {instagramHandle ? (
            <a className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-600 ring-1 ring-slate-200 hover:bg-slate-100" href={instagramUrl} rel="noreferrer" target="_blank">
              인스타그램
            </a>
          ) : null}
        </div>
        {message ? <p className={`mt-1.5 text-[11px] font-bold ${message.includes("복사했습니다") ? "text-teal-700" : "text-rose-600"}`}>{message}</p> : null}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button className="maju-button-secondary h-8 justify-center text-xs" onClick={() => onOpenDetail(lead)} type="button">
            <ExternalLink className="h-3.5 w-3.5" />
            상세 열기
          </button>
          <button className="maju-button-secondary h-8 justify-center text-xs" onClick={() => void copyLeadDmScript()} type="button">
            <MessageSquareText className="h-3.5 w-3.5" />
            DM 문구 복사
          </button>
          {onOpenQuote ? (
            <button className="maju-button-secondary h-8 justify-center text-xs" onClick={() => onOpenQuote(lead)} type="button">
              임시 견적
            </button>
          ) : null}
          {documentEntry.canCreateSheet ? (
            <Link className="maju-button-secondary min-h-11 justify-center text-xs" href={withPermitLeadCompanyQuery(leadDocumentEntryHref("sheet", lead.id))}>
              단가표 만들기
            </Link>
          ) : null}
          {documentEntry.canCreateQuote ? (
            <Link className="maju-button-primary min-h-11 justify-center text-xs" href={withPermitLeadCompanyQuery(leadDocumentEntryHref("quote", lead.id))}>
              견적서 만들기
            </Link>
          ) : null}
          <button className="maju-button-primary h-8 justify-center text-xs disabled:opacity-60" disabled={isConverting} onClick={() => void convert()} type="button">
            {isConverting ? "전환 중..." : "거래처로 전환"}
          </button>
        </div>
      </div>
    </div>
  );
}

// 이 이름들은 9개 파일이 지도 파일에서 가져간다 — 옛 경로에서 다시 내보낸다(M3a: 순수 계산은 domains/lead/map-filters.ts).
export { getPermitLeadOpenDate, getPermitLeadType, isPermitLeadInOpenDateFilter, PERMIT_LEAD_TYPE_OPTIONS };
export type { LeadOpenDateFilterMode, PermitLeadType };
// 인허가 데이터 표준 컬럼명(공공데이터포털 기준)과 흔히 쓰는 변형을 함께 인식합니다.
const PERMIT_HEADER_ALIASES: Record<string, string[]> = {
  businessName: ["사업장명", "상호명", "업체명", "거래처명"],
  businessNumber: ["사업자번호", "사업자등록번호"],
  representativeName: ["대표자명", "대표자"],
  permitStatus: ["영업상태명", "상세영업상태명", "영업상태"],
  permitDate: ["인허가일자", "인허가일"],
  openDate: ["개업일자", "개업일"],
  address: ["도로명전체주소", "소재지전체주소", "지번주소", "도로명주소", "주소"],
  phone: ["소재지전화", "전화번호", "연락처"],
  jurisdiction: ["개방자치단체명", "관할기관"],
  industry: ["업태구분명", "업종명", "위생업태명", "업종"]
};

function normalizePermitHeaderText(text: string) {
  return text.replace(/[\s()（）]/g, "").toLowerCase();
}

function matchPermitHeaderField(header: string): string | null {
  const normalized = normalizePermitHeaderText(header);
  for (const [field, aliases] of Object.entries(PERMIT_HEADER_ALIASES)) {
    if (aliases.some((alias) => normalizePermitHeaderText(alias) === normalized)) return field;
  }
  return null;
}

export async function parsePermitExcelFile(file: File) {
  // 엑셀 읽기 라이브러리는 업로드 버튼을 눌렀을 때만 불러옵니다(초기 번들 크기 절약).
  const { readSheet } = await import("read-excel-file/browser");
  const rows = (await readSheet(file, 1)) as unknown[][];
  const headerIndex = rows.findIndex((row) => row.some((cell) => String(cell ?? "").trim()));
  if (headerIndex < 0) return { rows: [] as Record<string, string>[], unmatchedHeaders: [] as string[] };

  const headers = rows[headerIndex].map((cell) => String(cell ?? "").trim());
  const fieldByColumn = headers.map((header) => (header ? matchPermitHeaderField(header) : null));
  const unmatchedHeaders = Array.from(new Set(headers.filter((header, index) => header && !fieldByColumn[index])));

  const parsedRows = rows
    .slice(headerIndex + 1)
    .map((row) => {
      const record: Record<string, string> = {};
      fieldByColumn.forEach((field, index) => {
        if (!field) return;
        const cell = row[index];
        const value = cell instanceof Date ? cell.toISOString().slice(0, 10) : String(cell ?? "").trim();
        if (value) record[field] = value;
      });
      return record;
    })
    .filter((record) => record.businessName);

  return { rows: parsedRows, unmatchedHeaders };
}

export type PermitUploadResult = {
  duplicates: number;
  excludedInactive: number;
  excludedNonTarget: number;
  classifiedAsSalesLead: number;
  inserted: number;
  skippedNoName: number;
  total: number;
  updated: number;
};

export type GovSyncResult = {
  configured: boolean;
  fetched: number;
  ingest: PermitUploadResult;
  // 2026-09-07 피드백("끊어서 진행하면 더 자세한 데이터") 대응: "계속 가져오기" 버튼이 다음 호출에
  // 그대로 넘길 다음 스캔 시작 페이지/전체 페이지 수입니다.
  nextStartPage?: number;
  scannedPages?: number;
  totalPages?: number;
};

export type SeoulSyncResult = {
  configured: boolean;
  fetched: number;
  ingest: PermitUploadResult;
  nextStartPage?: number;
  scannedPages?: number;
  totalPages?: number;
};

export type PermitLeadSourceStatus = {
  enrichment?: {
    googleReviews?: boolean;
    keywordVolume?: boolean;
  };
  sources?: {
    govRestaurant?: boolean;
    seoulRestaurant?: boolean;
    kakaoKeywordSearch?: boolean;
  };
  // 2026-08-28 피드백 대응(리드 야간 동기화가 실패해도 화면에 표시가 없음)
  syncStatus?: {
    gov: { lastAt: string | null; status: string | null; message: string | null };
    seoul: { lastAt: string | null; status: string | null; message: string | null };
    kakaoKeyword: { lastAt: string | null; status: string | null; message: string | null };
  } | null;
};

// 2026-08-31 피드백: "영업리드(신규리드, 개업일자 아님)도 키워드 검색량으로 영업순위를 알아야
// 한다" — 개업일자와 무관하게 이미 운영 중인 매장까지 카카오 로컬 키워드 검색으로 찾아오는
// "영업리드 탐색" 기능의 타입입니다.
export type CompanyLeadSearchRegion = {
  id: string;
  companyId: string;
  label: string;
  latitude?: number;
  longitude?: number;
  createdAt: string;
};

export type KakaoKeywordLeadSweepResult = {
  configured: boolean;
  anchorsUsed: number;
  callsMade: number;
  candidatesFound: number;
  ingest: PermitUploadResult;
};

export type NearbyPermitLeadResult = {
  anchorCount: number;
  leads: Array<PermitLeadItem & { distanceKm: number; nearestAnchor: { id: string; name: string } | null }>;
  radiusKm: number;
  unresolvedAnchorCount: number;
  unresolvedLeadCount: number;
};

/**
 * "신규 리드" 탭입니다. 지도 홈 안의 내부 탭으로, 사업자 인허가 신규 데이터를 CRM 표로 보여주고
 * (표가 기본, 지도는 보조), 업로드·엑셀 다운로드·기존 거래처 반경 안 "리드 탐색"(AI 영업 세일즈)을
 * 한 화면에서 처리합니다. 별도 페이지가 아니라 지도 홈의 데이터를 그대로 씁니다.
 */
// 지도에서 신규·영업 리드 상세를 거래처 상세처럼 옆 창으로 엽니다(대표 요청 10-29). 리드 화면과 같은 상세 패널을 씁니다.
const PermitLeadDetailDrawer = dynamic(() => import("./permit-leads-view").then((module) => module.PermitLeadDetailDrawer), { ssr: false });

const PermitLeadsView = dynamic(() => import("./permit-leads-view").then((module) => module.PermitLeadsView), {
  loading: () => (
    <div className="maju-empty-state flex min-h-[320px] items-center justify-center gap-2 p-8 text-center text-sm font-bold text-slate-500">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      리드 화면을 불러오는 중입니다…
    </div>
  ),
  ssr: false
});

// "히스토리" 탭입니다. 달력에서 날짜를 골라 그날의 담당자별 방문 순서·완료 기록·실제 GPS 경로를
// 보여줍니다(2026-09-07 피드백).
const DeliveryHistoryView = dynamic(() => import("./delivery-history-view").then((module) => module.DeliveryHistoryView), {
  loading: () => (
    <div className="maju-empty-state flex min-h-[320px] items-center justify-center gap-2 p-8 text-center text-sm font-bold text-slate-500">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      히스토리 화면을 불러오는 중입니다…
    </div>
  ),
  ssr: false
});

const TodayCourseView = dynamic(() => import("./today-course-view").then((module) => module.TodayCourseView), {
  loading: () => (
    <div className="maju-empty-state flex min-h-[320px] items-center justify-center gap-2 p-8 text-center text-sm font-bold text-slate-500">
      <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
      코스 화면을 불러오는 중입니다…
    </div>
  ),
  ssr: false
});

export function DirectoryStat({
  active = false,
  label,
  onClick,
  title,
  tone = "slate",
  value
}: {
  readonly active?: boolean;
  readonly label: string;
  readonly onClick?: () => void;
  readonly title?: string;
  readonly tone?: "rose" | "slate";
  readonly value: string;
}) {
  const content = (
    <>
      <p className="maju-muted-label">{label}</p>
      <p className={`mt-1 text-[24px] font-black leading-none ${tone === "rose" ? "text-rose-600" : "text-slate-950"}`}>{value}</p>
    </>
  );
  // 2026-09-01 피드백: "해당 카드를 누르면, 아래 거래처들이 필터가 되면 좋을 것 같아" — KPI 카드를
  // 눌러 바로 아래 목록을 그 조건으로 필터링할 수 있게 클릭 가능한 버튼 형태를 추가로 지원합니다.
  if (onClick) {
    return (
      <button
        className={`maju-stat-card w-full px-4 py-3 text-left transition hover:border-teal-300 hover:shadow-sm ${
          active ? "border-teal-400 ring-1 ring-inset ring-teal-300" : ""
        }`}
        onClick={onClick}
        title={title}
        type="button"
      >
        {content}
      </button>
    );
  }
  return (
    <div className="maju-stat-card px-4 py-3" title={title}>
      {content}
    </div>
  );
}

export function OperationalEmptyState({
  actionHref,
  actionLabel,
  description,
  title
}: {
  readonly actionHref: string;
  readonly actionLabel: string;
  readonly description: string;
  readonly title: string;
}) {
  return (
    <div className="grid h-full min-h-[520px] place-items-center px-4 text-center">
      <div className="max-w-xl rounded-xl border border-dashed border-teal-200 bg-teal-50/60 px-4 py-8 shadow-[0_8px_22px_rgba(15,118,110,0.08)]">
        <div className="mx-auto grid h-11 w-11 place-items-center rounded-full bg-white text-teal-700 shadow-sm ring-1 ring-inset ring-teal-100">
          <Store className="h-5 w-5" />
        </div>
        <h3 className="mt-4 text-lg font-black text-slate-950">{title}</h3>
        <p className="mt-2 text-sm font-bold leading-6 text-slate-600">{description}</p>
        <Link className="maju-button-primary mt-5 h-10 px-4 text-sm" href={actionHref}>
          {actionLabel}
        </Link>
      </div>
    </div>
  );
}

function Kpi({
  helper,
  label,
  tone,
  value
}: {
  readonly helper?: string;
  readonly label: string;
  readonly tone: "blue" | "green" | "purple" | "red";
  readonly value: string;
}) {
  const valueClass = {
    blue: "text-slate-950",
    green: "text-emerald-700",
    purple: "text-violet-700",
    red: "text-rose-600"
  }[tone];
  const accentClass = {
    blue: "bg-blue-600",
    green: "bg-emerald-600",
    purple: "bg-violet-600",
    red: "bg-rose-600"
  }[tone];
  const backgroundClass = {
    blue: "bg-white",
    green: "bg-emerald-50/40",
    purple: "bg-violet-50/40",
    red: "bg-rose-50/40"
  }[tone];

  return (
    <div className={`relative min-w-0 overflow-hidden border-r border-b border-slate-200/80 px-2.5 py-2 last:border-r-0 sm:px-4 sm:py-2.5 ${backgroundClass}`}>
      <span className={`absolute inset-x-0 top-0 h-0.5 ${accentClass}`} />
      <p className="truncate text-xs font-black text-slate-500 sm:text-[11px]">{label}</p>
      <p className={`mt-1 truncate text-[15px] font-black leading-none sm:text-[20px] ${valueClass}`}>{value}</p>
      {helper ? <p className="mt-1.5 truncate text-xs font-bold text-slate-400">{helper}</p> : null}
    </div>
  );
}

function RouteBasisStrip({
  allStoreCount,
  allStoreTotals,
  currentStoreCount,
  currentTotals,
  dataRegistrationHref,
  mapReadyStoreCount,
  missingAddressCount,
  routePlan,
  sourceReady,
  visibleMapReadyStoreCount
}: {
  readonly allStoreCount: number;
  readonly allStoreTotals: { distanceKm: number; durationMinutes: number; expectedRevenue: number };
  readonly currentStoreCount: number;
  readonly currentTotals: { distanceKm: number; durationMinutes: number; expectedRevenue: number };
  readonly dataRegistrationHref: string;
  readonly mapReadyStoreCount: number;
  readonly missingAddressCount: number;
  readonly routePlan: RoutePlan;
  readonly sourceReady: boolean;
  readonly visibleMapReadyStoreCount: number;
}) {
  const addressStatus = missingAddressCount > 0 ? `${missingAddressCount.toLocaleString()}곳 주소 보완 필요` : "전체 거래처 주소 정상";
  const routeReady = routePlan.source === "supabase";
  const sourceLabel = routeReady ? "코스 연결됨" : sourceReady ? "원장 기준 표시" : "거래처 연결 대기";
  const sourceHelper = routeReady ? "저장된 코스·거래처 기준" : sourceReady ? "거래처 원장 마커 기준" : "거래처 등록 또는 연결 확인 필요";
  const distanceValue = routeReady || allStoreTotals.distanceKm > 0 ? `${(routePlan.totalDistanceKm || allStoreTotals.distanceKm).toLocaleString()}km` : "티맵 계산 전";
  const durationValue = routeReady || allStoreTotals.durationMinutes > 0 ? formatMinutes(routePlan.totalDurationMinutes || allStoreTotals.durationMinutes) : "티맵 계산 전";

  return (
    <section className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-slate-50 px-4 py-2 xl:flex-row xl:items-center">
      <div className="flex shrink-0 items-center gap-2">
        <span className="text-xs font-black text-slate-500">기준</span>
        {!sourceReady ? (
          <Link
            className="inline-flex h-7 items-center justify-center rounded-md bg-teal-700 px-2.5 text-[11px] font-black text-white shadow-sm transition hover:bg-teal-800"
            href={dataRegistrationHref}
          >
            마스터 등록
          </Link>
        ) : null}
      </div>
      <div className="grid min-w-0 flex-1 overflow-hidden rounded-md border border-slate-200 bg-white sm:grid-cols-2 2xl:grid-cols-5">
        <RouteBasisMetric label="원장 기준" value={sourceLabel} helper={sourceHelper} tone={sourceReady ? "ready" : "warning"} />
        <RouteBasisMetric label="지도 표시" value={`${mapReadyStoreCount.toLocaleString()}/${allStoreCount.toLocaleString()}곳`} helper={addressStatus} tone={missingAddressCount > 0 ? "warning" : "ready"} />
        <RouteBasisMetric label="출발지 단건 거리합" value={distanceValue} helper="회사 출발지 → 각 거래처 합산" tone={routeReady || allStoreTotals.distanceKm > 0 ? "default" : "warning"} />
        <RouteBasisMetric label="출발지 단건 시간합" value={durationValue} helper="경유 최적화 전 기준값" tone={routeReady || allStoreTotals.durationMinutes > 0 ? "default" : "warning"} />
        <RouteBasisMetric label="현재 화면 거래처" value={`${currentStoreCount.toLocaleString()}/${allStoreCount.toLocaleString()}곳`} helper={`지도 ${visibleMapReadyStoreCount.toLocaleString()}곳 · 매출 ${currentTotals.expectedRevenue.toLocaleString()}만원`} />
      </div>
    </section>
  );
}

function RouteBasisMetric({ helper, label, tone = "default", value }: { readonly helper?: string; readonly label: string; readonly tone?: "default" | "ready" | "warning"; readonly value: string }) {
  const valueClass = tone === "ready" ? "text-emerald-700" : tone === "warning" ? "text-amber-700" : "text-slate-950";
  const dotClass = tone === "ready" ? "bg-emerald-500" : tone === "warning" ? "bg-amber-500" : "bg-slate-300";

  return (
    <div className="min-w-0 border-b border-r border-slate-100 px-3 py-1.5 last:border-r-0 2xl:border-b-0">
      <p className="flex min-w-0 items-center gap-1.5 truncate text-[11px] font-black text-slate-400">
        <span className={`h-1.5 w-1.5 shrink-0 rounded-full ${dotClass}`} />
        <span className="truncate">{label}</span>
      </p>
      <p className={`mt-1 truncate text-sm font-black ${valueClass}`}>{value}</p>
      {helper ? <p className="truncate text-xs font-bold text-slate-500">{helper}</p> : null}
    </div>
  );
}


export function RouteWorkStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${done ? "border-emerald-200 bg-white text-emerald-800" : active ? "border-slate-300 bg-white text-slate-900" : "border-slate-200 bg-white text-slate-500"}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-600 text-white" : active ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-500"}`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className="text-xs font-black">{label}</span>
    </div>
  );
}

function createStoreRows(routePlan: RoutePlan, existingMarkers: KakaoMapMarker[]): StoreRow[] {
  return routePlan.groups
    .flatMap((group) => group.stops)
    .map((store, index) => {
      const marker = findMarkerForStore(existingMarkers, store);
      const details = store as RoutePlanStoreDetails;
      return {
        ...store,
        accountCopyStatus: "missing",
        bankAccount: "",
        birthDate: store.birthDate || "",
        businessCertificateStatus: "missing",
        businessRegistrationNumber: details.businessNumber || "",
        businessStatus: normalizeStoreBusinessStatus(details.businessStatus),
        deliveryArea: (store as RoutePlanStop & { deliveryArea?: string }).deliveryArea || store.region,
        // 2026-08-24 피드백("삭제가 계속 안되네") 근본 원인 수정: 담당자가 없는 거래처에 순서대로
        // "김배송 매니저" 같은 가짜 이름을 붙이던 defaultDriverByIndex 폴백을 없앴습니다. 이 폴백 때문에
        // 담당자를 정상적으로 지워도(delivery_manager를 null로 저장해도) 새로고침하자마자 같은 순서로
        // 같은 가짜 이름이 다시 생겨, 화면에서는 "삭제가 안 되는 것"처럼 보였습니다. 이제 담당자가 없으면
        // 빈 값 그대로 두고, createDeliveryVehiclesFromStores에서 "미배정" 그룹 하나로 모아 보여줍니다.
        deliveryDriver: (store as RoutePlanStop & { deliveryDriver?: string }).deliveryDriver || "",
        email: store.email || "",
        // 지도 전용 경량 조회가 내려준 grade_override를 보존합니다. 여기서 매출 기준 등급을
        // 다시 계산하면 거래처 관리에서 저장한 수동 A/B/C 등급이 지도에서 사라집니다.
        grade: resolveRevenueGrade(getRevenueGrade(store.expectedRevenue), marker?.grade),
        industry: store.industry || "미분류",
        markerX: marker?.x ?? 18 + ((index * 13) % 68),
        markerY: marker?.y ?? 20 + ((index * 17) % 58),
        memo: details.loadingPosition || "정기 납품 조건 확인 필요",
        openingDate: store.openingDate || "",
        phone: store.phone || "",
        representativeName: store.representativeName || ""
      };
    });
}

function createStoreRowsFromLedgerMarkers(existingMarkers: KakaoMapMarker[]): StoreRow[] {
  return existingMarkers
    .filter((marker) => marker.tone === "lead" && marker.id && marker.address)
    .map((marker, index) => {
      const { expectedRevenue, name } = parseLedgerMarkerName(marker.name);
      const region = getRegionFromAddress(marker.address || "");

      return {
        id: marker.id || `ledger-marker-${index + 1}`,
        accountCopyStatus: "missing",
        address: marker.address || "",
        bankAccount: "",
        birthDate: "",
        businessCertificateStatus: "missing",
        businessRegistrationNumber: "",
        businessStatus: "unknown",
        deliveryArea: region,
        // 위 createStoreRows와 동일한 이유로 가짜 담당자 이름 생성을 제거했습니다.
        deliveryDriver: "",
        distanceKm: 0,
        durationMinutes: 0,
        email: "",
        expectedRevenue,
        grade: resolveRevenueGrade(getRevenueGrade(expectedRevenue), marker.grade),
        industry: "미분류",
        markerX: marker.x,
        markerY: marker.y,
        memo: "거래처 원장 기준으로 지도에 표시 중",
        name,
        openingDate: "",
        order: index + 1,
        phone: "",
        region,
        relationshipStatus: "관리중",
        representativeName: "",
        score: 80,
        status: "today"
      };
    });
}

function createDeliveryStoreRows(vehicles: DeliveryVehicle[], existingMarkers: KakaoMapMarker[]): StoreRow[] {
  return vehicles.flatMap((vehicle, vehicleIndex) =>
    vehicle.stops.map((store, storeIndex) => {
      const marker = findMarkerForStore(existingMarkers, store);
      const details = store as StoreRow & RoutePlanStoreDetails;
      return {
        ...store,
        accountCopyStatus: details.accountCopyStatus || "missing",
        bankAccount: details.bankAccount || "",
        birthDate: store.birthDate || details.birthDate || "",
        businessCertificateStatus: details.businessCertificateStatus || "missing",
        businessRegistrationNumber: details.businessRegistrationNumber || details.businessNumber || "",
        businessStatus: normalizeStoreBusinessStatus(details.businessStatus),
        deliveryArea: vehicle.area,
        // 배송차 하나에 담당자가 여러 명 섞여 있을 수 있어(같은 트럭을 나눠 쓰는 경우),
        // vehicle.driver(대표 담당자)로 덮어쓰지 않고 이 거래처에 실제 배정된 담당자를 그대로 씁니다.
        deliveryDriver: store.deliveryDriver || vehicle.driver,
        deliveryVehicleId: vehicle.id,
        // 배송차는 담당자와 독립적으로 거래처별로 지정할 수 있습니다. 거래처에 직접 지정된 배송차
        // 이름(store.deliveryVehicle, 서버에 저장된 값)이 있으면 그 값을 우선 보여주고, 아직 지정한
        // 적 없는 거래처는 예전처럼 담당자 기준 자동 그룹명(vehicle.name)을 그대로 보여줍니다.
        deliveryVehicleName: store.deliveryVehicle || vehicle.name,
        email: store.email || details.email || "",
        // 배송차 그룹으로 재구성할 때도 원장/지도에서 받은 수동 등급을 우선합니다.
        grade: resolveRevenueGrade(getRevenueGrade(store.expectedRevenue), marker?.grade, details.grade),
        industry: store.industry || details.industry || "미분류",
        markerX: marker?.x ?? 16 + (((vehicleIndex * 15 + storeIndex) * 7) % 70),
        markerY: marker?.y ?? 18 + (((vehicleIndex * 15 + storeIndex) * 11) % 58),
        memo: details.loadingPosition || details.memo || "배송 시간대와 결제 조건 확인 필요",
        openingDate: store.openingDate || details.openingDate || "",
        phone: store.phone || details.phone || "",
        representativeName: store.representativeName || details.representativeName || ""
      };
    })
  );
}

function parseLedgerMarkerName(value: string) {
  const [rawName, rawRevenue] = value.split("· 월 ");
  const expectedRevenue = Number((rawRevenue || "").replace(/[^0-9]/g, ""));

  return {
    expectedRevenue: Number.isFinite(expectedRevenue) && expectedRevenue > 0 ? expectedRevenue : 0,
    name: rawName.trim() || value
  };
}

function getRegionFromAddress(address: string) {
  const parts = address.trim().split(/\s+/).filter(Boolean);
  return parts.slice(0, 2).join(" ") || "미분류";
}

function findMarkerForStore(existingMarkers: KakaoMapMarker[], store: Pick<RoutePlanStop, "address" | "id" | "name">) {
  return existingMarkers.find((item) => (store.id && item.id === store.id) || item.address === store.address || item.name === store.name);
}

function normalizeStoreBusinessStatus(status: string | undefined): StoreRow["businessStatus"] {
  if (status === "active" || status === "정상") return "active";
  if (status === "closed" || status === "폐업") return "closed";
  if (status === "unknown" || status === "확인 필요" || status === "확인 예정") return "unknown";
  return "unknown";
}

function toCustomerPayload(store: StoreRow) {
  return {
    address: store.address || "",
    birthDate: store.birthDate,
    businessNumber: store.businessRegistrationNumber,
    businessStatus: getBusinessStatusLabel(store.businessStatus),
    customerName: store.name,
    deliveryKm: Number(store.distanceKm || 0),
    deliveryManager: store.deliveryDriver || "",
    deliveryMinutes: Number(store.durationMinutes || 0),
    deliveryVehicle: store.deliveryVehicleName || "",
    deliveryZone: store.deliveryArea || store.region,
    email: store.email,
    industry: store.industry,
    loadingPosition: store.memo || "",
    accessMethodType: store.accessMethodType,
    accessNote: store.accessNote,
    accessPassword: store.accessPassword,
    businessHours: store.businessHours || "",
    menuSummary: store.menuSummary || "",
    monthlyRevenue: Number(store.expectedRevenue || 0),
    openingDate: store.openingDate,
    phone: store.phone,
    region: store.region,
    representativeName: store.representativeName,
    reviewSummary: store.reviewSummary,
    reviewKeywords: store.reviewKeywords,
    reviewSource: store.reviewSource,
    visitCount: Number(store.order || 0),
    // 동시 편집 감지(낙관적 동시성 제어)용: 이 화면이 마지막으로 읽은 updated_at을 그대로 실어
    // 보내, 그 사이 다른 사람이 먼저 저장했는지 서버가 확인할 수 있게 합니다. updateStore()가
    // 저장 성공/실패에 따라 항상 최신 값으로 갱신해둡니다.
    expectedUpdatedAt: store.updatedAt
  };
}

/**
 * 배송차(코스 계산·연료비·지도 필터에 쓰이는 "배송차 목록")를 실제 배차 기준으로 묶습니다.
 * 담당자와 배송차는 이제 서로 독립된 값이라, 거래처에 직접 지정된 배송차 이름(deliveryVehicleName)이
 * 있으면 그 이름으로 묶고, 아직 지정하지 않은 거래처는 예전처럼 담당자 이름을 임시 배송차로 써서
 * 묶습니다(담당자 1인당 트럭 1대라는 기존 기본값). 한 배송차에 담당자가 여러 명 섞여 있을 수 있어
 * (같은 트럭을 나눠 쓰는 경우), 그 배송차의 "담당자" 표시값은 거래처 수가 가장 많은 담당자로 대표합니다.
 */
function createDeliveryVehiclesFromStores(
  stores: StoreRow[],
  vehicleFuelTypes?: Record<string, "gasoline" | "diesel">,
  extraVehicles: string[] = [],
  extraDrivers: string[] = []
): DeliveryVehicle[] {
  const groups = new Map<string, StoreRow[]>();
  const explicitVehicleKeys = new Set<string>();
  // 2026-08-24 피드백("삭제가 계속 안되네") 근본 원인 수정: 예전에는 담당자가 없는 거래처를
  // defaultDriverByIndex(순서 기반 "김배송 매니저" 등 가짜 이름)로 채워 넣고, 그 가짜 이름을 그대로
  // 배송차 그룹 키로 썼습니다. 그래서 실제로 담당자를 지웠어도(서버 값은 null) 새로고침하면 같은
  // 순서의 거래처가 같은 가짜 이름을 다시 받아 똑같은 배송차가 재생성되어 "삭제가 안 되는 것"처럼
  // 보였습니다. 이제 담당자·배송차가 둘 다 없는 거래처는 가짜 이름을 붙이지 않고 이 고정 키 하나로
  // 모아 "미배정" 그룹 한 개로만 보여줍니다. 실제로 저장된 배송차가 아니므로 삭제·편집 대상도 아닙니다.
  const UNASSIGNED_KEY = "__unassigned__";

  stores.forEach((store) => {
    // 2026-09-07 피드백("배송차, 담당자 값들이 통일되지 않은 것 같아 확인해") 대응: 저장 시점에는
    // trim()하지만(lib/store.ts의 upsertCustomerMaster), 그 전에 이미 앞뒤 공백이 섞여 저장된
    // 기존 거래처 레코드가 있으면 눈에는 같은 담당자/배송차인데 그룹 키만 미세하게 달라 서로 다른
    // 배송차 카드로 쪼개져 보입니다. trim() 기준으로 그룹핑해 이런 레거시 중복을 합칩니다.
    const driver = (store.deliveryDriver || "").trim();
    const area = store.deliveryArea || store.region || "미분류";
    // routeSeedStores(서버 원본 데이터)에는 deliveryVehicleName이 아니라 deliveryVehicle 필드로
    // 값이 들어옵니다(RoutePlanStop.deliveryVehicle). deliveryVehicleName은 createDeliveryStoreRows가
    // 그룹핑 이후 화면 표시용으로 파생시키는 필드라 여기서는 아직 존재하지 않아, 이 값으로 확인하면
    // 항상 비어 있어 그룹핑이 담당자 기준 자동 그룹으로만 폴백해버립니다.
    const trimmedVehicle = (store.deliveryVehicle || "").trim();
    const vehicleKey = trimmedVehicle || driver || UNASSIGNED_KEY;
    if (trimmedVehicle) explicitVehicleKeys.add(vehicleKey);
    groups.set(vehicleKey, [...(groups.get(vehicleKey) || []), { ...store, deliveryDriver: driver, deliveryArea: area }]);
  });

  // 아직 거래처가 배정되지 않은, 방금 추가한 배송차도 빈 그룹으로 목록에 나타나야 합니다.
  extraVehicles.forEach((vehicleName) => {
    explicitVehicleKeys.add(vehicleName);
    if (!groups.has(vehicleName)) groups.set(vehicleName, []);
  });

  // extraDrivers("새 담당자·배송차 추가"로 등록한, 아직 거래처가 없는 담당자)는 배송차 "이름"이 아니라
  // 담당자 이름이라 explicitVehicleKeys에는 넣지 않습니다 — 그래야 아래에서 배송차 이름은 자동
  // 채번("배송 N호차")되고, 담당자 표시값만 이 이름을 그대로 씁니다. 이미 실제 거래처가 있어 groups에
  // 존재하는 담당자면 건드리지 않습니다(중복 빈 그룹 방지).
  const assignedDriverKeys = new Set(
    Array.from(groups.values())
      .flatMap((stops) => stops.map((stop) => stop.deliveryDriver?.trim().toLowerCase()))
      .filter(Boolean)
  );
  extraDrivers.forEach((driverName) => {
    const trimmedDriverName = driverName.trim();
    if (!trimmedDriverName) return;
    // 차량명이 담당자명과 다른 정상 배정(예: 차량 "1호차" + 담당자 "정동규")도 이미 존재하는
    // 담당자입니다. 예전에는 groups.has(driverName)만 확인해 이 경우 빈 자동 차량을 하나 더 만들어
    // 차량 마스터 3대가 지도에서는 4대로 표시될 수 있었습니다.
    if (assignedDriverKeys.has(trimmedDriverName.toLowerCase())) return;
    if (!groups.has(trimmedDriverName)) groups.set(trimmedDriverName, []);
  });

  // "미배정" 그룹은 항상 목록 맨 뒤에 오도록 정렬합니다 — 그래야 실제 배송차 자동 번호("배송 1호차",
  // "배송 2호차"...)가 미배정 그룹이 어디 끼어드는지에 따라 밀리지 않습니다.
  const sortedEntries = Array.from(groups.entries()).sort(
    ([a], [b]) => (a === UNASSIGNED_KEY ? 1 : 0) - (b === UNASSIGNED_KEY ? 1 : 0)
  );

  let autoVehicleNumber = 0;
  return sortedEntries.map(([vehicleKey, stops]) => {
    const orderedStops = stops.map((stop, stopIndex) => ({
      ...stop,
      order: stopIndex + 1
    }));
    const isUnassigned = vehicleKey === UNASSIGNED_KEY;
    const isExplicitVehicle = explicitVehicleKeys.has(vehicleKey);
    const representativeDriver = isUnassigned ? "" : mostFrequentDriver(orderedStops) || (isExplicitVehicle ? "" : vehicleKey);
    if (!isUnassigned) autoVehicleNumber += 1;
    const vehicleName = isUnassigned ? "미배정" : isExplicitVehicle ? vehicleKey : `배송 ${autoVehicleNumber}호차`;

    return {
      addresses: orderedStops.map((stop) => stop.address || stop.region),
      area: summarizeVehicleArea(orderedStops),
      driver: representativeDriver,
      expectedRevenue: orderedStops.reduce((total, stop) => total + Number(stop.expectedRevenue || 0), 0),
      fuelType: vehicleFuelTypes?.[representativeDriver] || "diesel",
      id: isUnassigned ? "vehicle-unassigned" : `vehicle-${autoVehicleNumber}`,
      isUnassigned,
      name: vehicleName,
      stops: orderedStops,
      totalDistanceKm: roundToOneDecimal(orderedStops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0)),
      totalDurationMinutes: orderedStops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0)
    };
  });
}

// 한 배송차 그룹 안에 담당자가 여러 명 섞여 있을 때, 거래처 수가 가장 많은 담당자를 대표로 고릅니다.
function mostFrequentDriver(stops: StoreRow[]): string {
  const counts = new Map<string, number>();
  stops.forEach((stop) => {
    if (!stop.deliveryDriver) return;
    counts.set(stop.deliveryDriver, (counts.get(stop.deliveryDriver) || 0) + 1);
  });

  let best = "";
  let bestCount = 0;
  counts.forEach((count, driver) => {
    if (count > bestCount) {
      best = driver;
      bestCount = count;
    }
  });
  return best;
}

function summarizeVehicleArea(stops: StoreRow[]) {
  const areas = Array.from(new Set(stops.map((stop) => stop.deliveryArea || stop.region).filter(Boolean))).slice(0, 3);
  if (areas.length === 0) return "미분류";
  return areas.join("·");
}

function createVehicleMarkerMeta(vehicles: DeliveryVehicle[]) {
  return vehicles.reduce<Record<string, { color: string; label: string }>>((meta, vehicle, index) => {
    meta[vehicle.id] = {
      color: vehicleMarkerColors[index % vehicleMarkerColors.length],
      label: String(index + 1)
    };
    return meta;
  }, {});
}

function createMarkers(
  existingMarkers: KakaoMapMarker[],
  stores: StoreRow[],
  mode: MarkerViewMode,
  vehicleMeta: Record<string, { color: string; label: string }>,
  completedStoreIds: Set<string> = new Set()
): KakaoMapMarker[] {
  const origin = existingMarkers.find((marker) => marker.tone === "origin");
  const originWithId = origin ? { ...origin, id: origin.id || originMarkerId } : undefined;
  // 48-5: 거래처 원장 마커가 들고 온 저장 좌표·저장 대상 id를 같은 id의 거래처 마커로 넘긴다.
  const ledgerById = new Map(existingMarkers.filter((marker) => marker.id && marker.tone === "lead").map((marker) => [marker.id as string, marker]));
  const storeMarkers = spreadMarkers(
    stores.map((store) => {
      const vehicle = store.deliveryVehicleId ? vehicleMeta[store.deliveryVehicleId] : undefined;

      return {
        address: store.address || `${store.region} ${store.name}`,
        completed: completedStoreIds.has(store.id),
        displayName: store.name,
        grade: mode === "grade" ? store.grade : undefined,
        id: store.id,
        label: mode === "vehicle" ? vehicle?.label || "?" : store.grade,
        markerColor: mode === "vehicle" ? vehicle?.color : undefined,
        name: mode === "vehicle" ? `${store.deliveryVehicleName || "배송차 미지정"} · ${store.name}` : store.name,
        showName: true,
        // 이전에는 여기가 "lead"로 잘못 표시되어 있어서, 지도 탭의 onMarkerClick이 등록된
        // 거래처 마커를 신규 리드로 오인해 setPreviewLeadId를 호출했습니다. leadRadiusResult가
        // 없을 때는(기본 상태) 그 조건도 항상 거짓이라 아무 카드도 뜨지 않았던 것이 "마커
        // 선택하면 카드가 안 보임" 버그의 실제 원인이었습니다.
        tone: "customer" as const,
        x: store.markerX,
        y: store.markerY,
        ...pickStoredPosition(ledgerById.get(store.id), store.address)
      };
    })
  );

  return mergeMarkers(originWithId ? [originWithId, ...storeMarkers] : storeMarkers);
}

// 화면에서 주소를 고친 뒤에는(마커 주소와 달라지면) 서버가 준 옛 좌표를 쓰지 않고 지도가 다시 찾게 한다.
function pickStoredPosition(marker: KakaoMapMarker | undefined, currentAddress: string | undefined) {
  if (!marker) return {};
  if ((marker.address || "").trim() !== (currentAddress || "").trim()) return { coordinateSaveId: marker.coordinateSaveId };
  return { coordinateSaveId: marker.coordinateSaveId, lat: marker.lat, lng: marker.lng };
}

function spreadMarkers(markers: KakaoMapMarker[]) {
  const counts = new Map<string, number>();
  return markers.map((marker) => {
    const key = `${Math.round(marker.x / 3)}-${Math.round(marker.y / 3)}`;
    const count = counts.get(key) || 0;
    counts.set(key, count + 1);
    if (count === 0) return marker;
    const angle = count * 1.9;
    const radius = 2.2 + (count % 4) * 0.7;
    return {
      ...marker,
      x: clamp(marker.x + Math.cos(angle) * radius, 4, 96),
      y: clamp(marker.y + Math.sin(angle) * radius, 6, 94)
    };
  });
}

function mergeMarkers(markers: KakaoMapMarker[]) {
  const seen = new Set<string>();
  return markers.filter((marker) => {
    const key = `${marker.address}-${marker.name}-${marker.tone}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
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

function applyStoreEdits(stores: StoreRow[], edits: Record<string, StoreEdit>) {
  return stores.map((store) => {
    const edit = edits[store.id];
    const expectedRevenue = edit?.expectedRevenue ?? store.expectedRevenue;
    return {
      ...store,
      ...edit,
      expectedRevenue,
      // 로컬 편집에 등급이 없다는 이유로 서버에서 받은 수동 등급을 매출 등급으로 덮지 않습니다.
      grade: resolveRevenueGrade(getRevenueGrade(expectedRevenue), edit?.grade, store.grade)
    };
  });
}

function applyVehicleEdits(vehicles: DeliveryVehicle[], edits: Record<string, VehicleEdit>) {
  return vehicles.map((vehicle) => ({
    ...vehicle,
    ...edits[vehicle.id]
  }));
}

// 2026-08-27 피드백("배송담당자 필터랑 거래처 상세 필터랑 데이터가 안맞아") 원인 수정:
// createDeliveryVehiclesFromStores는 routeSeedStores(서버에서 막 받아온 원본 데이터)만 보고 배송차
// 그룹을 계산합니다. 개별 거래처 편집(storeEdits)으로 담당자·배송차를 바꿔도 이 그룹핑은 재계산되지
// 않아서, 거래처 상세에는 새 담당자·배송차 이름이 보이는데 지도 필터가 참조하는 deliveryVehicleId는
// 여전히 편집 전 그룹에 묶여 있었습니다 — 그래서 특정 배송차로 필터링한 목록과 그 안 거래처의 상세
// 정보가 서로 다른 담당자를 가리키는 것처럼 보였습니다. 배송차 그룹을 만들기 전에 편집된 담당자·배송차
// 값을 먼저 원본 필드에 반영해서, 그룹핑 단계부터 최신 값을 쓰도록 합니다.
function applyStoreEditsForVehicleGrouping(stores: StoreRow[], edits: Record<string, StoreEdit>): StoreRow[] {
  return stores.map((store) => {
    const edit = edits[store.id];
    if (!edit || (edit.deliveryDriver === undefined && edit.deliveryVehicleName === undefined)) return store;
    return {
      ...store,
      deliveryDriver: edit.deliveryDriver !== undefined ? edit.deliveryDriver : store.deliveryDriver,
      // createDeliveryVehiclesFromStores는 deliveryVehicleName이 아니라 deliveryVehicle 필드로 그룹
      // 키를 정합니다(서버 원본 필드명, 위 함수의 주석 참고). 편집값을 같은 필드에 반영해야 재그룹핑에
      // 실제로 반영됩니다.
      deliveryVehicle: edit.deliveryVehicleName !== undefined ? edit.deliveryVehicleName : store.deliveryVehicle
    };
  });
}

function getDeliveryDefaults(vehicles: DeliveryVehicle[]) {
  // 배송차 안에 담당자가 여러 명 섞여 있을 수 있어(같은 트럭을 나눠 쓰는 경우), 배송차의 대표
  // 담당자(vehicle.driver)만 모으면 일부 담당자를 놓칠 수 있습니다. 각 배송차에 실제로 배정된
  // 모든 거래처의 담당자를 함께 모아 정확한 담당자 목록을 만듭니다.
  // 2026-09-07 피드백("배송차, 담당자 값들이 통일되지 않은 것 같아 확인해") 대응: 저장 시점에는
  // trim()하지만(lib/store.ts의 upsertCustomerMaster), 그 전에 이미 앞뒤 공백이 섞여 저장된 기존
  // 거래처 레코드가 있으면 눈에는 똑같아 보이는 담당자 이름이 서로 다른 옵션으로 두 번 나타납니다.
  // trim() 기준으로 모아 이런 레거시 중복이 드롭다운에 갈라져 보이지 않게 합니다.
  const driverSet = new Set<string>();
  vehicles.forEach((vehicle) => {
    const trimmedDriver = vehicle.driver?.trim();
    if (trimmedDriver) driverSet.add(trimmedDriver);
    vehicle.stops.forEach((stop) => {
      const trimmedStopDriver = stop.deliveryDriver?.trim();
      if (trimmedStopDriver) driverSet.add(trimmedStopDriver);
    });
  });
  const drivers = Array.from(driverSet).sort();
  const areas = Array.from(new Set(vehicles.map((vehicle) => vehicle.area).filter(Boolean))).sort();
  return { areas, drivers };
}

