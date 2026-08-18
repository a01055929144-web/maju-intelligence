"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import {
  AlertTriangle,
  CalendarDays,
  Camera,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Clock,
  Copy,
  Crosshair,
  Download,
  Edit3,
  ExternalLink,
  FileImage,
  ListFilter,
  Maximize2,
  Minimize2,
  MapPin,
  MessageCircle,
  MessageSquareText,
  Navigation,
  PanelLeftClose,
  PanelLeftOpen,
  PanelRightClose,
  PanelRightOpen,
  Phone,
  Plus,
  Radar,
  RefreshCw,
  Search,
  Store,
  Trash2,
  Truck,
  Upload,
  UserCheck,
  UserRound,
  X,
  type LucideIcon
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { ChurnRiskAlert } from "@/components/churn-risk-alert";
import { CustomerAttachmentUploadPanel } from "@/components/customer-attachment-upload-panel";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { RouteSequence, RouteSequenceAction } from "@/components/route-sequence-action";
import { buildNaverSearchUrl, buildRouteNavigationLinks, GeoPoint, NavigationStop } from "@/lib/navigation-links";
import { buildPlaceSearchLinks } from "@/lib/place-links";
import { CustomerContactItem, DeliveryVehicle, PermitLeadItem, PermitLeadPeriod, PermitLeadQueues, RoutePlan, RoutePlanStop } from "@/lib/store";

type RevenueGrade = "A" | "B" | "C";
type GradeFilter = "all" | RevenueGrade;
type MarkerViewMode = "grade" | "vehicle";
type WorkspaceView = "map" | "customers" | "course" | "leads";
type ExternalBusinessResult = {
  address: string;
  industry: string;
  kakaoPlaceUrl: string;
  name: string;
  phone: string;
  roadAddress: string;
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
  const response = await fetch("/api/customers", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      address: result.roadAddress || result.address,
      businessStatus: "확인 예정",
      companyId: companyId || undefined,
      customerName: result.name,
      industry: result.industry || "미분류",
      kakaoPlaceUrl: result.kakaoPlaceUrl,
      phone: result.phone,
      validateBusinessNumber: false
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(payload?.message || `${result.name} 등록에 실패했습니다.`);

  const customerId = String(payload?.customer?.id || "");
  if (!customerId) throw new Error(`${result.name}은(는) 저장됐지만 ID를 확인하지 못했습니다.`);
  return { id: customerId, name: result.name };
}

type StoreRow = RoutePlanStop & {
  accountCopyStatus: "missing" | "received";
  bankAccount: string;
  birthDate: string;
  businessCertificateStatus: "missing" | "received";
  businessRegistrationNumber: string;
  businessStatus: "active" | "closed" | "unknown";
  deliveryArea?: string;
  deliveryDriver?: string;
  deliveryVehicleId?: string;
  deliveryVehicleName?: string;
  email: string;
  grade: RevenueGrade;
  industry: string;
  markerX: number;
  markerY: number;
  memo: string;
  openingDate: string;
  phone: string;
  representativeName: string;
};

type RoutePlanStoreDetails = RoutePlanStop & {
  businessNumber?: string;
  businessStatus?: string;
  loadingPosition?: string;
  memo?: string;
};

type StoreEdit = Partial<
  Pick<
    StoreRow,
    | "accountCopyStatus"
    | "address"
    | "bankAccount"
    | "birthDate"
    | "businessCertificateStatus"
    | "businessRegistrationNumber"
    | "businessStatus"
    | "businessHours"
    | "deliveryArea"
    | "deliveryDriver"
    | "deliveryVehicleName"
    | "email"
    | "expectedRevenue"
    | "grade"
    | "industry"
    | "memo"
    | "menuSummary"
    | "name"
    | "openingDate"
    | "phone"
    | "relationshipStatus"
    | "representativeName"
    | "reviewSummary"
    | "reviewKeywords"
    | "reviewSource"
    | "status"
  >
>;
type VehicleEdit = Partial<Pick<DeliveryVehicle, "area" | "driver" | "fuelType" | "name">>;

type StoreHistoryItem = {
  id: string;
  memo: string;
  recordedAt: string;
};

type DeliveryProof = {
  deliveryStatus: "arrived" | "partial" | "issue";
  fileName: string;
  messageChannel: "kakao" | "sms";
  memo: string;
  persisted?: boolean;
  recordedAt: string;
  storeId: string;
};

type DeliveryProofInput = {
  deliveryStatus: DeliveryProof["deliveryStatus"];
  file?: File | null;
  fileName: string;
  messageChannel: DeliveryProof["messageChannel"];
  memo: string;
};

type StoreAttachment = {
  businessCertificate?: AttachmentFile;
  bankbookCopy?: AttachmentFile;
  loadingPositionMedia?: AttachmentFile[];
};

type AttachmentFile = {
  dataUrl?: string;
  mediaType?: "file" | "image" | "video";
  name: string;
};

type BusinessOcrSuggestion = {
  businessRegistrationNumber: string;
  businessStatus: StoreRow["businessStatus"];
  companyName: string;
  openingDate: string;
  representativeName: string;
};

type SalesRouteMapWorkspaceProps = {
  readonly churnRiskCompanyId?: string;
  readonly mapMarkers: KakaoMapMarker[];
  readonly routePlan: RoutePlan;
  readonly timelineHref?: string;
  readonly vehicleFuelTypes?: Record<string, "gasoline" | "diesel">;
};

type CourseSummary = {
  distanceKm: number;
  durationMinutes: number;
  expectedRevenue: number;
  selectedCount: number;
};

type FuelPriceSummary = {
  basis: "opinet" | "fallback";
  checkedAt: string;
  pricePerLiter: number;
  sourceLabel: string;
};
type FuelPriceByType = Record<"diesel" | "gasoline", FuelPriceSummary | null>;

const gradeFilters: Array<{ label: string; value: GradeFilter }> = [
  { label: "전체", value: "all" },
  { label: "A등급", value: "A" },
  { label: "B등급", value: "B" },
  { label: "C등급", value: "C" }
];
const workspaceViews: Array<{ helper: string; icon: LucideIcon; label: string; shortLabel: string; value: WorkspaceView }> = [
  { helper: "마커·등급·배송차", icon: MapPin, label: "지도", shortLabel: "위치 확인", value: "map" },
  { helper: "검색·상세·편집", icon: Store, label: "원장", shortLabel: "거래처 관리", value: "customers" },
  { helper: "선택·경유·티맵", icon: Navigation, label: "코스", shortLabel: "경유 계산", value: "course" },
  { helper: "표·업로드·탐색", icon: Radar, label: "신규 리드", shortLabel: "신규 영업", value: "leads" }
];
const workspaceViewDescriptions: Record<WorkspaceView, string> = {
  course: "배송차와 거래처를 선택한 뒤 티맵 도로 경유 순서를 계산합니다.",
  customers: "거래처 원장 검색·필터",
  leads: "사업자 인허가 신규 데이터 기반 리드 목록·업로드·반경 리드 탐색",
  map: "등급·배송차별 마커"
};
const originMarkerId = "origin-hub";
const tmapWaypointLimit = 15;
const vehicleMarkerColors = ["#2563eb", "#059669", "#dc2626", "#7c3aed", "#ea580c", "#0891b2", "#be123c", "#4f46e5", "#16a34a", "#9333ea"];

const localStoreKeys = {
  attachments: "maju:sales-route:attachments",
  deliveryProofs: "maju:sales-route:delivery-proofs",
  histories: "maju:sales-route:histories",
  manualDrivers: "maju:sales-route:manual-drivers",
  manualVehicles: "maju:sales-route:manual-vehicles",
  storeEdits: "maju:sales-route:store-edits",
  vehicleEdits: "maju:sales-route:vehicle-edits"
};

export function SalesRouteMapWorkspace({ churnRiskCompanyId, mapMarkers, routePlan, timelineHref, vehicleFuelTypes }: SalesRouteMapWorkspaceProps) {
  const router = useRouter();
  const [query, setQuery] = useState("");
  // 검색창은 원래 등록된 거래처 안에서만 찾았습니다. 아직 거래처로 등록하지 않은 주변 매장도
  // 같이 보여주고 그 자리에서 바로 등록으로 넘어갈 수 있도록, 카카오 매장 검색 결과를 함께 붙입니다.
  const [externalResults, setExternalResults] = useState<ExternalBusinessResult[]>([]);
  const [isSearchingExternal, setIsSearchingExternal] = useState(false);
  const [externalSearchMessage, setExternalSearchMessage] = useState("");
  const [showExternalResults, setShowExternalResults] = useState(false);
  // 지도 검색에서 고른 미등록 매장의 빠른 등록 대상입니다.
  const [quickRegisterTarget, setQuickRegisterTarget] = useState<ExternalBusinessResult | null>(null);
  // 검색 결과 일괄 등록 선택 상태입니다.
  const [selectedResultIds, setSelectedResultIds] = useState<Set<string>>(new Set());
  const [isBulkRegistering, setIsBulkRegistering] = useState(false);
  const [bulkRegisterMessage, setBulkRegisterMessage] = useState("");
  const [gradeFilter, setGradeFilter] = useState<GradeFilter>("all");
  // 지도 우선 화면: 좌우 패널과 통계는 기본 접힘 상태입니다.
  const [leftCollapsed, setLeftCollapsed] = useState(true);
  const [rightCollapsed, setRightCollapsed] = useState(true);
  const [statsExpanded, setStatsExpanded] = useState(false);
  // 작업공간 전체를 브라우저 전체 화면으로 확대합니다.
  const [isFullscreen, setIsFullscreen] = useState(false);
  const workspaceRef = useRef<HTMLDivElement>(null);
  // 지도 탭에서 검색/필터/신규 리드 반경 바가 지도 위에 떠 있는 카드로 표시됩니다(xl:absolute).
  // "신규 리드 반경"을 켜면 이 카드에 한 줄이 더 늘어나 높이가 커지는데, 지도 오른쪽 위
  // MapControls(내 위치 버튼)의 세로 위치가 고정값이면 늘어난 카드와 겹칩니다.
  //
  // 이 카드(mapHeaderRef)는 위쪽 KPI/이탈 위험 알림 블록을 건너뛰고 항상 지도 영역의 부모
  // 기준 top-2에 뜨는데(xl:absolute), MapControls는 지도 영역 자신(mapAreaRef)의 top을
  // 기준으로 위치합니다 — 두 기준점이 서로 다른 조상이라, 카드 높이만으로 오프셋을 계산하면
  // KPI 패널이 펼쳐져 있거나 이탈 위험 알림 배너가 떠 있을 때 실제 카드 아래쪽 가장자리와
  // MapControls 위치가 어긋납니다. getBoundingClientRect()로 카드의 실제 화면 아래쪽 가장자리와
  // 지도 영역의 실제 화면 위쪽 가장자리를 직접 비교해 그 차이를 오프셋으로 써서, 위에 어떤 블록이
  // 얼마나 있든 항상 카드 바로 아래에 오도록 합니다.
  const mapHeaderRef = useRef<HTMLElement>(null);
  const mapAreaRef = useRef<HTMLDivElement>(null);
  const [mapHeaderHeightPx, setMapHeaderHeightPx] = useState(0);
  useEffect(() => {
    const headerNode = mapHeaderRef.current;
    const areaNode = mapAreaRef.current;
    if (!headerNode || !areaNode || typeof ResizeObserver === "undefined") return;
    const recompute = () => {
      const headerRect = headerNode.getBoundingClientRect();
      const areaRect = areaNode.getBoundingClientRect();
      setMapHeaderHeightPx(Math.max(0, headerRect.bottom - areaRect.top + 16));
    };
    const observer = new ResizeObserver(recompute);
    observer.observe(headerNode);
    observer.observe(areaNode);
    recompute();
    return () => observer.disconnect();
  }, []);
  const [mapFocusId, setMapFocusId] = useState("");
  const [previewStoreId, setPreviewStoreId] = useState("");
  const [selectedId, setSelectedId] = useState("");
  // /leads/permits 같은 예전 딥링크(?view=leads)로 들어와도 같은 탭이 바로 열리도록 초기값을 URL에서 읽습니다.
  const [activeView, setActiveView] = useState<WorkspaceView>(() => {
    if (typeof window === "undefined") return "map";
    const requested = new URLSearchParams(window.location.search).get("view");
    return requested === "leads" || requested === "customers" || requested === "course" ? requested : "map";
  });
  const [excludeClosedStores, setExcludeClosedStores] = useState(false);
  const [markerViewMode, setMarkerViewMode] = useState<MarkerViewMode>("grade");
  const [storeAttachments, setStoreAttachments] = useState<Record<string, StoreAttachment>>(() => readLocalJson(localStoreKeys.attachments, {}));
  const [storeEdits, setStoreEdits] = useState<Record<string, StoreEdit>>(() => readLocalJson(localStoreKeys.storeEdits, {}));
  const [storeHistories, setStoreHistories] = useState<Record<string, StoreHistoryItem[]>>(() => readLocalJson(localStoreKeys.histories, {}));
  const [vehicleEdits, setVehicleEdits] = useState<Record<string, VehicleEdit>>(() => readLocalJson(localStoreKeys.vehicleEdits, {}));
  const [manualDrivers, setManualDrivers] = useState<string[]>(() => readLocalJson(localStoreKeys.manualDrivers, []));
  // 배송차는 담당자와 별개로 지정될 수 있어(같은 트럭을 여러 담당자가 나눠 쓰거나, 한 담당자가
  // 상황에 따라 다른 차량을 몰 수 있음), 아직 어떤 거래처에도 배정되지 않은 배송차 이름을 미리
  // 등록해 두는 목록입니다. manualDrivers와 동일한 로컬 저장 방식을 씁니다.
  const [manualVehicles, setManualVehicles] = useState<string[]>(() => readLocalJson(localStoreKeys.manualVehicles, []));
  const [courseSummary, setCourseSummary] = useState<CourseSummary | null>(null);
  const [fuelPrices, setFuelPrices] = useState<FuelPriceByType>({ diesel: null, gasoline: null });
  const [vehicleFilterId, setVehicleFilterId] = useState("all");
  // 지도 탭에서 바로 켜는 "신규 리드 반경 체크" — 리드 탭의 리드 탐색과 같은 API를 쓰지만,
  // 지도 위에 마커로 바로 보여주기 위한 별도 상태입니다(리드 탭 상태와는 독립적).
  const [leadRadiusOpen, setLeadRadiusOpen] = useState(false);
  const [leadRadiusAnchorMode, setLeadRadiusAnchorMode] = useState<"customer" | "all">("customer");
  const [leadRadiusCustomerId, setLeadRadiusCustomerId] = useState("");
  // 기본 반경은 5km였는데, 실제로 많이 쓰는 값은 1.5km라는 피드백에 따라 기본값을 낮췄습니다(2026-08-19).
  const [leadRadiusKm, setLeadRadiusKm] = useState(1.5);
  const [leadRadiusSearching, setLeadRadiusSearching] = useState(false);
  const [leadRadiusResult, setLeadRadiusResult] = useState<NearbyPermitLeadResult | null>(null);
  const [leadRadiusError, setLeadRadiusError] = useState("");
  const [previewLeadId, setPreviewLeadId] = useState("");
  // 업종·메뉴 기반 견적서 초안 — 지도 위 리드 카드/거래처 카드 어디서든 열 수 있는 공용 상태입니다.
  const [quoteSubject, setQuoteSubject] = useState<QuoteSubject | null>(null);
  const ledgerFallbackStores = useMemo(() => createStoreRowsFromLedgerMarkers(mapMarkers), [mapMarkers]);
  const sourceReady = routePlan.source === "supabase" || ledgerFallbackStores.length > 0;
  const routeSeedStores = useMemo(() => {
    const routeStores = routePlan.source === "supabase" ? createStoreRows(routePlan, mapMarkers) : [];
    return routeStores.length ? routeStores : ledgerFallbackStores;
  }, [ledgerFallbackStores, mapMarkers, routePlan]);
  const baseDeliveryVehicles = useMemo(
    () => createDeliveryVehiclesFromStores(routeSeedStores, vehicleFuelTypes, manualVehicles),
    [routeSeedStores, vehicleFuelTypes, manualVehicles]
  );
  const deliveryVehicles = useMemo(() => applyVehicleEdits(baseDeliveryVehicles, vehicleEdits), [baseDeliveryVehicles, vehicleEdits]);
  const fuelTypeConfiguredByVehicleId = useMemo(() => {
    const map = new Map<string, boolean>();
    baseDeliveryVehicles.forEach((vehicle) => map.set(vehicle.id, Boolean(vehicleFuelTypes?.[vehicle.driver])));
    return map;
  }, [baseDeliveryVehicles, vehicleFuelTypes]);
  const allStores = useMemo(() => applyStoreEdits(createDeliveryStoreRows(deliveryVehicles, mapMarkers), storeEdits), [deliveryVehicles, mapMarkers, storeEdits]);
  const geocodableStoresForRadius = useMemo(() => allStores.filter((store) => store.address?.trim()), [allStores]);

  async function runMapLeadRadiusSearch() {
    setLeadRadiusError("");
    if (leadRadiusAnchorMode === "customer" && !leadRadiusCustomerId) {
      setLeadRadiusError("기준 거래처를 선택하세요.");
      return;
    }
    const anchorStore = geocodableStoresForRadius.find((store) => store.id === leadRadiusCustomerId);
    if (leadRadiusAnchorMode === "customer" && !anchorStore) {
      setLeadRadiusError("선택한 거래처에 주소 정보가 없습니다.");
      return;
    }

    setLeadRadiusSearching(true);
    setLeadRadiusResult(null);
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/nearby"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchorMode: leadRadiusAnchorMode,
          anchorCustomer: anchorStore ? { id: anchorStore.id, name: anchorStore.name, address: anchorStore.address } : undefined,
          radiusKm: leadRadiusKm
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setLeadRadiusError(payload?.message || "리드 탐색에 실패했습니다.");
        return;
      }
      setLeadRadiusResult(payload);
    } catch {
      setLeadRadiusError("네트워크 오류로 리드 탐색을 완료하지 못했습니다.");
    } finally {
      setLeadRadiusSearching(false);
    }
  }
  // 담당자와 별개로 거래처에 직접 지정된 배송차 이름들 + 아직 배정 전인 배송차(manualVehicles)를
  // 합쳐, "배송차" 드롭다운에서 고를 수 있는 선택지 목록을 만듭니다.
  const vehicleNameOptions = useMemo(() => {
    const names = new Set<string>();
    allStores.forEach((store) => {
      if (store.deliveryVehicleName) names.add(store.deliveryVehicleName);
    });
    manualVehicles.forEach((name) => names.add(name));
    return Array.from(names).sort();
  }, [allStores, manualVehicles]);
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
      .filter((store) => `${store.name} ${store.region} ${store.address || ""}`.toLowerCase().includes(keyword))
      .slice(0, 8);
  }, [allStores, query]);
  // 검색어가 바뀌면 이전 검색 결과에 대한 체크 선택은 의미가 없으므로 함께 초기화합니다.
  useEffect(() => {
    setSelectedResultIds(new Set());
    setBulkRegisterMessage("");
  }, [query]);
  useEffect(() => {
    const keyword = query.trim();
    if (keyword.length < 2) {
      setExternalResults([]);
      setExternalSearchMessage("");
      setIsSearchingExternal(false);
      return;
    }

    let cancelled = false;
    setIsSearchingExternal(true);
    const timer = setTimeout(async () => {
      const response = await fetch(`/api/business-search?query=${encodeURIComponent(keyword)}`, { cache: "no-store" }).catch(() => null);
      if (cancelled) return;
      const payload = response?.ok ? await response.json().catch(() => null) : null;
      const results = Array.isArray(payload?.results) ? payload.results : [];
      setExternalResults(results);
      setExternalSearchMessage(results.length ? "" : payload?.message || "");
      setIsSearchingExternal(false);
    }, 400);

    return () => {
      cancelled = true;
      clearTimeout(timer);
    };
  }, [query]);
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
        // "이탈 제외" 토글은 사업자 상태가 폐업인 곳뿐 아니라, 수동으로 "거래 종료"로 표시한
        // 거래처도 함께 빼줍니다. 둘 다 더 이상 영업 대상이 아니라는 점은 같습니다.
        const matchesStatus = !excludeClosedStores || (store.businessStatus !== "closed" && store.relationshipStatus !== "거래종료");
        return matchesQuery && matchesVehicle && matchesStatus;
      }),
    [allStores, excludeClosedStores, query, vehicleFilterId]
  );
  const visibleStores = useMemo(
    () => gradeBaseStores.filter((store) => gradeFilter === "all" || store.grade === gradeFilter),
    [gradeBaseStores, gradeFilter]
  );
  const selectedStore = allStores.find((store) => store.id === selectedId);
  const previewStore = allStores.find((store) => store.id === previewStoreId);
  const gradeCounts = useMemo(() => countGrades(gradeBaseStores), [gradeBaseStores]);
  const routeTotals = useMemo(() => getStoreTotals(visibleStores), [visibleStores]);
  const allStoreTotals = useMemo(() => getStoreTotals(allStores), [allStores]);
  const vehicleMarkerMeta = useMemo(() => createVehicleMarkerMeta(deliveryVehicles), [deliveryVehicles]);
  const markers = useMemo(() => createMarkers(mapMarkers, visibleStores, markerViewMode, vehicleMarkerMeta), [mapMarkers, markerViewMode, vehicleMarkerMeta, visibleStores]);
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
  // 지도 탭에서 "신규 리드 반경 체크"를 켰을 때만 리드를 마커로 함께 보여줍니다(기본은 꺼짐 — 거래처 마커만).
  const leadRadiusMapMarkers: KakaoMapMarker[] = useMemo(() => {
    if (!leadRadiusOpen || !leadRadiusResult) return [];
    return leadRadiusResult.leads
      .filter((lead) => lead.address)
      .map((lead) => ({
        address: lead.address!,
        grade: (lead.grade || undefined) as "A" | "B" | "C" | undefined,
        id: lead.id,
        label: `${lead.distanceKm}km`,
        name: lead.businessName,
        tone: "lead" as const,
        x: 0,
        y: 0
      }));
  }, [leadRadiusOpen, leadRadiusResult]);
  const mapDisplayMarkers = useMemo(
    () => [...markers, ...unregisteredMapMarkers, ...leadRadiusMapMarkers],
    [markers, unregisteredMapMarkers, leadRadiusMapMarkers]
  );
  const originMarker = mapMarkers.find((marker) => marker.tone === "origin");
  const deliveryDefaults = useMemo(() => getDeliveryDefaults(deliveryVehicles), [deliveryVehicles]);
  const mapReadyStoreCount = useMemo(() => allStores.filter((store) => Boolean(store.address?.trim())).length, [allStores]);
  const visibleMapReadyStoreCount = useMemo(() => visibleStores.filter((store) => Boolean(store.address?.trim())).length, [visibleStores]);
  const missingAddressCount = allStores.length - mapReadyStoreCount;
  const selectedVehicle = deliveryVehicles.find((vehicle) => vehicle.id === vehicleFilterId);
  const isVehicleFiltered = vehicleFilterId !== "all";
  const selectedVehicleLabel = selectedVehicle ? selectedVehicle.name : "전체 거래처";
  const selectedGradeLabel = gradeFilter === "all" ? "전체" : `${gradeFilter}등급`;
  const selectedGradeCount = gradeFilter === "all" ? gradeBaseStores.length : gradeCounts[gradeFilter];
  const kpiSummary = activeView === "course" && courseSummary ? courseSummary : null;
  const activeDistanceKm = kpiSummary?.distanceKm ?? routeTotals.distanceKm;
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
  const fuelBasisIsOpinet = activeFuelTypes.some((type) => fuelPrices[type]?.basis === "opinet");
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
    excludeClosedStores ? "이탈 제외" : ""
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
    setGradeFilter("all");
    setMapFocusId("");
    setPreviewStoreId("");
    setSelectedId("");
  };

  const focusOrigin = () => {
    setActiveView("map");
    setMapFocusId(originMarkerId);
    setPreviewStoreId("");
    setSelectedId("");
  };

  const resetWorkspace = () => {
    setActiveView("map");
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
    setActiveView(nextView);
    setPreviewStoreId("");
    setMapFocusId("");
    if (nextView === "course" && vehicleFilterId === "all" && deliveryVehicles[0]) {
      selectVehicle(deliveryVehicles[0].id);
    }
  };

  useEffect(() => saveLocalJson(localStoreKeys.attachments, storeAttachments), [storeAttachments]);
  useEffect(() => saveLocalJson(localStoreKeys.histories, storeHistories), [storeHistories]);
  useEffect(() => saveLocalJson(localStoreKeys.storeEdits, storeEdits), [storeEdits]);
  useEffect(() => saveLocalJson(localStoreKeys.vehicleEdits, vehicleEdits), [vehicleEdits]);
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
    setStoreEdits((current) => ({ ...current, [storeId]: { ...current[storeId], ...edit } }));

    const response = await fetch("/api/customers", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(toCustomerPayload(nextStore))
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || "거래처 저장에 실패했습니다.");
    return { persisted: payload?.persisted !== false };
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

    setVehicleEdits((current) => ({ ...current, [vehicleId]: { ...current[vehicleId], ...edit } }));

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
      if (!response.ok) return { ok: false, message: payload?.message || "연료 타입 저장에 실패했습니다." };
      return { ok: true };
    } catch {
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

  return (
    <div
      className={`maju-section-card flex min-h-[760px] flex-col text-slate-900 xl:h-full xl:min-h-0 ${isFullscreen ? "!rounded-none" : ""}`}
      ref={workspaceRef}
    >
      <header className="flex shrink-0 flex-col gap-2 border-b border-slate-200 bg-white px-4 py-2.5 xl:flex-row xl:items-center xl:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <h2 className="text-[16px] font-black leading-tight">영업·배송 지도</h2>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-inset ring-slate-200">
            {sourceReady ? `${allStores.length}곳` : "거래처 등록 필요"}
          </span>
          <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-700 ring-1 ring-inset ring-slate-200">
            {sourceReady ? `${deliveryVehicles.length}대` : "배송차 대기"}
          </span>
          <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-600 ring-1 ring-inset ring-slate-200">
            {activeView === "map" ? "마커 중심" : activeView === "customers" ? "원장 작업" : activeView === "leads" ? "신규 영업" : "경유 계산"}
          </span>
        </div>
        <div className="flex max-w-full flex-wrap items-center gap-1.5">
          <div className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-[0_1px_0_rgba(15,23,42,0.025)]">
            {[
              { label: "등급 마커", value: "grade" },
              { label: "차량 마커", value: "vehicle" }
            ].map((item) => {
              const selected = markerViewMode === item.value;
              return (
                <button
                  className={`h-8 rounded-md px-3 text-xs font-black transition ${
                    selected ? "bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]" : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                  key={item.value}
                  onClick={() => setMarkerViewMode(item.value as MarkerViewMode)}
                  type="button"
                >
                  {item.label}
                </button>
              );
            })}
          </div>
          {activeView === "map" ? (
            <button
              aria-pressed={leadRadiusOpen}
              className={`maju-button-secondary h-10 shrink-0 rounded-md px-3 text-xs font-black ${leadRadiusOpen ? "border-teal-300 bg-teal-50 text-teal-800" : "text-slate-600"}`}
              onClick={() => setLeadRadiusOpen((value) => !value)}
              title="지도에서 바로 기존 거래처 반경 안 신규 리드를 찾습니다."
              type="button"
            >
              <Radar className="h-4 w-4" />
              <span className="hidden sm:inline">신규 리드 반경</span>
            </button>
          ) : null}
          <nav className="flex h-10 items-center rounded-lg border border-slate-200 bg-slate-50 p-1 shadow-[0_1px_0_rgba(15,23,42,0.025)]">
            {workspaceViews.map((item) => {
              const Icon = item.icon;
              const selected = activeView === item.value;
              return (
                <button
                  className={`flex h-8 items-center gap-1.5 rounded-md px-3 text-xs font-black transition ${
                    selected ? "bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]" : "text-slate-500 hover:bg-white hover:text-slate-900"
                  }`}
                  key={item.value}
                  onClick={() => changeWorkspaceView(item.value)}
                  title={workspaceViewDescriptions[item.value]}
                  type="button"
                >
                  <Icon className="h-3.5 w-3.5" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
          <button
            aria-expanded={statsExpanded}
            className={`maju-button-secondary h-10 shrink-0 rounded-md px-3 text-xs font-black ${statsExpanded ? "border-teal-300 bg-teal-50 text-teal-800" : "text-slate-600"}`}
            onClick={() => setStatsExpanded((value) => !value)}
            title={statsExpanded ? "통계 패널 접고 지도 크게 보기" : "매출·거리·유류비 통계 펼치기"}
            type="button"
          >
            {statsExpanded ? "KPI 접기" : "KPI 보기"}
          </button>
          <button
            aria-pressed={isFullscreen}
            className={`maju-button-secondary h-10 shrink-0 rounded-md px-3 text-xs font-black ${isFullscreen ? "border-teal-300 bg-teal-50 text-teal-800" : "text-slate-600"}`}
            onClick={toggleFullscreen}
            title={isFullscreen ? "전체 화면 종료" : "전체 화면으로 크게 보기"}
            type="button"
          >
            {isFullscreen ? <Minimize2 className="h-4 w-4" /> : <Maximize2 className="h-4 w-4" />}
            <span className="hidden sm:inline">{isFullscreen ? "전체 화면 종료" : "전체 화면"}</span>
          </button>
          <button
            aria-label="필터 초기화"
            className="maju-button-secondary h-10 shrink-0 rounded-md px-3 text-slate-600"
            onClick={resetWorkspace}
            title="필터 초기화"
            type="button"
          >
            <RefreshCw className="h-4 w-4" />
          </button>
        </div>
      </header>

      <div className="relative flex flex-1 flex-col xl:min-h-0">
        <OperationalFlowBar
          activeView={activeView}
          courseCalculated={Boolean(courseSummary)}
          dataRegistrationHref={dataRegistrationHref}
          deliveryVehicleCount={deliveryVehicles.length}
          onChangeView={changeWorkspaceView}
          sourceReady={sourceReady}
          storeCount={allStores.length}
        />
        {timelineHref ? (
          <div className="shrink-0 px-4 pt-3 empty:hidden">
            <ChurnRiskAlert companyId={churnRiskCompanyId} timelineHref={timelineHref} />
          </div>
        ) : null}

      {statsExpanded ? (
        <>
          <section className="grid shrink-0 grid-cols-2 border-b border-slate-200/80 bg-white lg:grid-cols-3 2xl:grid-cols-6">
            <Kpi
              helper={`전체 ${gradeBaseStores.length} · A ${gradeCounts.A} · B ${gradeCounts.B} · C ${gradeCounts.C}`}
              label={kpiSummary ? "선택 경유지" : `${isVehicleFiltered ? selectedVehicleLabel : "등급 거래처"} · ${selectedGradeLabel}`}
              tone={gradeFilter === "A" ? "green" : gradeFilter === "C" ? "purple" : "blue"}
              value={sourceReady ? `${kpiSummary?.selectedCount ?? selectedGradeCount}곳` : "등록 필요"}
            />
            <Kpi
              helper={selectedVehicle ? `${selectedVehicle.driver} · ${selectedVehicle.area}` : "전체 배송차 기준"}
              label={selectedVehicle ? "선택 배송차" : "배송차량"}
              tone="blue"
              value={sourceReady ? (selectedVehicle ? selectedVehicle.name : `${deliveryVehicles.length}대`) : "등록 후 배정"}
            />
            <Kpi
              helper={kpiSummary ? "선택 경유지 기준" : "현재 필터 기준"}
              label="거래처 매출합"
              tone="green"
              value={sourceReady ? `${(kpiSummary?.expectedRevenue ?? routeTotals.expectedRevenue).toLocaleString()}만원` : "-"}
            />
            <Kpi helper={distanceKpiHelper} label={kpiSummary ? "경유 코스 거리" : "출발지 기준 거리"} tone="purple" value={sourceReady ? `${(kpiSummary?.distanceKm ?? routeTotals.distanceKm).toLocaleString()}km` : "-"} />
            <Kpi helper={durationKpiHelper} label={kpiSummary ? "경유 코스 시간" : "출발지 기준 시간"} tone="red" value={sourceReady ? formatMinutes(kpiSummary?.durationMinutes ?? routeTotals.durationMinutes) : "-"} />
            <Kpi helper={fuelKpiHelper} label={fuelBasisIsOpinet ? "OPINET 예상 유류비" : "예상 유류비"} tone="green" value={sourceReady ? `${estimatedFuelCostWon.toLocaleString()}원` : "-"} />
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

      <section
        className={`shrink-0 space-y-1.5 border-b border-slate-200/80 bg-white px-4 py-2 ${
          activeView === "map"
            ? "xl:absolute xl:inset-x-2 xl:top-2 xl:z-20 xl:space-y-1.5 xl:rounded-xl xl:border xl:border-slate-200 xl:bg-white xl:px-3 xl:py-2 xl:shadow-[0_10px_28px_rgba(15,23,42,.12)]"
            : ""
        }`}
        ref={mapHeaderRef}
      >
        <div className="grid gap-2 xl:grid-cols-[minmax(320px,1fr)_auto] xl:items-center">
          <label className="maju-search-field relative min-w-0 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              className="h-full w-full border-0 bg-transparent pl-6 pr-0 text-sm font-bold text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:border-0 focus:ring-0"
              onBlur={() => setShowExternalResults(false)}
              onChange={(event) => setQuery(event.target.value)}
              onFocus={() => setShowExternalResults(true)}
              placeholder="거래처명·지역·주소 검색"
              value={query}
            />
            {showExternalResults && query.trim().length >= 2 ? (
              <div className="absolute left-0 right-0 top-full z-30 mt-1 max-h-96 overflow-auto rounded-lg border border-slate-200 bg-white shadow-xl">
                {registeredMatches.length ? (
                  <div className="border-b border-slate-100">
                    <p className="border-b border-slate-100 px-3 py-1.5 text-[11px] font-black uppercase tracking-wide text-slate-400">
                      등록된 거래처 {registeredMatches.length.toLocaleString()}곳
                    </p>
                    {registeredMatches.map((store) => (
                      <button
                        className="flex w-full items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 text-left last:border-b-0 hover:bg-teal-50"
                        key={store.id}
                        onClick={() => {
                          setPreviewStoreId(store.id || "");
                          setShowExternalResults(false);
                        }}
                        onMouseDown={(event) => event.preventDefault()}
                        type="button"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-black text-slate-950">{store.name}</p>
                          <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{store.address || store.region}</p>
                        </div>
                        <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-700">지도에서 보기</span>
                      </button>
                    ))}
                  </div>
                ) : null}
                <div className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-1.5">
                  <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">미등록 매장 · 카카오맵 검색</p>
                  {unregisteredResults.length ? (
                    <label className="flex shrink-0 items-center gap-1.5 text-[11px] font-black text-slate-500">
                      <input
                        checked={selectedResultIds.size > 0 && selectedResultIds.size === unregisteredResults.length}
                        className="h-3.5 w-3.5 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                        onChange={toggleSelectAllResults}
                        onMouseDown={(event) => event.preventDefault()}
                        type="checkbox"
                      />
                      전체 선택
                    </label>
                  ) : null}
                </div>
                {isSearchingExternal ? (
                  <p className="px-3 py-2 text-xs font-bold text-slate-400">검색 중...</p>
                ) : unregisteredResults.length ? (
                  unregisteredResults.map((result) => {
                    const resultId = externalResultId(result);
                    const isSelected = selectedResultIds.has(resultId);
                    return (
                      <div
                        className={`flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 last:border-b-0 hover:bg-teal-50 ${
                          isSelected ? "bg-teal-50" : ""
                        }`}
                        key={resultId}
                      >
                        <div className="flex min-w-0 items-center gap-2">
                          <input
                            checked={isSelected}
                            className="h-3.5 w-3.5 shrink-0 rounded border-slate-300 text-teal-600 focus:ring-teal-400"
                            onChange={() => toggleResultSelection(resultId)}
                            onMouseDown={(event) => event.preventDefault()}
                            type="checkbox"
                          />
                          <div className="min-w-0">
                            <p className="truncate text-sm font-black text-slate-950">{result.name}</p>
                            <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
                              {result.roadAddress || result.address || "주소 정보 없음"}
                            </p>
                          </div>
                        </div>
                        <button
                          className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs"
                          onClick={() => {
                            setQuickRegisterTarget(result);
                            setShowExternalResults(false);
                          }}
                          onMouseDown={(event) => event.preventDefault()}
                          type="button"
                        >
                          거래처로 등록
                        </button>
                      </div>
                    );
                  })
                ) : (
                  <p className="px-3 py-2 text-xs font-bold text-slate-400">{externalSearchMessage || "새로 찾은 미등록 매장이 없습니다."}</p>
                )}
                {selectedResultIds.size > 0 ? (
                  <div className="sticky bottom-0 flex items-center justify-between gap-2 border-t border-slate-100 bg-white px-3 py-2">
                    <p className="text-xs font-bold text-slate-500">{selectedResultIds.size}곳 선택됨</p>
                    <button
                      className="maju-button-primary flex h-8 shrink-0 items-center gap-1.5 px-3 text-xs disabled:opacity-60"
                      disabled={isBulkRegistering}
                      onClick={registerSelectedResults}
                      onMouseDown={(event) => event.preventDefault()}
                      type="button"
                    >
                      {isBulkRegistering ? "등록 중" : `선택 ${selectedResultIds.size}곳 일괄 등록`}
                    </button>
                  </div>
                ) : null}
                {bulkRegisterMessage ? (
                  <p className="border-t border-slate-100 px-3 py-2 text-xs font-bold text-slate-600">{bulkRegisterMessage}</p>
                ) : null}
              </div>
            ) : null}
          </label>
          <div className="flex flex-wrap items-center justify-start gap-1.5 xl:justify-end">
            <MarkerModeLegend mode={markerViewMode} vehicles={deliveryVehicles} />
            <select
              className={`h-10 rounded-lg border px-2.5 text-xs font-black outline-none transition ${
                gradeFilter === "all" ? "border-slate-200 bg-white text-slate-700" : "border-teal-700 bg-teal-700 text-white"
              }`}
              onChange={(event) => setGradeFilter(event.target.value as GradeFilter)}
              value={gradeFilter}
            >
              {gradeFilters.map((filter) => (
                <option key={filter.value} value={filter.value}>
                  {filter.label} {filter.value === "all" ? gradeBaseStores.length : gradeCounts[filter.value]}곳
                </option>
              ))}
            </select>
            <button
              aria-pressed={excludeClosedStores}
              className={`h-10 rounded-lg border px-3 text-xs font-black transition ${
                excludeClosedStores
                  ? "border-teal-700 bg-teal-700 text-white shadow-[0_6px_14px_rgba(15,118,110,0.16)]"
                  : "border-slate-200 bg-white text-slate-700 shadow-[0_1px_0_rgba(15,23,42,0.025)] hover:border-slate-300 hover:bg-slate-50 hover:text-slate-950"
              }`}
              onClick={() => setExcludeClosedStores((value) => !value)}
              type="button"
            >
              {excludeClosedStores ? "이탈 제외 중" : "이탈 제외"}
            </button>
            <button
              className="maju-button-secondary h-10 rounded-lg"
              onClick={focusOrigin}
              title="물류 출발지로 지도 이동"
              type="button"
            >
              출발지
            </button>
            <span className={`rounded-md px-3 py-2 text-xs font-black ${sourceReady ? "bg-slate-100 text-slate-700" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100"}`}>
              {sourceReady ? selectedVehicleLabel : "거래처 연결 대기"}
            </span>
            <span className="ml-1 text-xs font-black text-slate-500">
              {sourceReady ? `${visibleStores.length}/${allStores.length}개` : "거래처 등록 필요"}
            </span>
          </div>
        </div>
        {statsExpanded ? (
          <div className="flex min-h-8 flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
            <span className="text-xs font-black text-slate-500">현재 조건</span>
            {activeFilterLabels.length ? (
              activeFilterLabels.map((label) => (
                <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200" key={label}>
                  {label}
                </span>
              ))
            ) : sourceReady ? (
              <span className="rounded-full bg-white px-3 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">전체 거래처 표시 중</span>
            ) : (
              <span className="rounded-full bg-amber-50 px-3 py-1 text-xs font-black text-amber-800 ring-1 ring-inset ring-amber-100">거래처 등록 대기</span>
            )}
          </div>
        ) : null}
        {activeView === "map" && leadRadiusOpen ? (
          <div className="flex flex-wrap items-center gap-2 rounded-lg border border-teal-200 bg-teal-50/60 px-3 py-2">
            <span className="flex items-center gap-1.5 text-xs font-black text-teal-800">
              <Radar className="h-3.5 w-3.5" />
              신규 리드 반경
            </span>
            <div className="flex h-8 items-center rounded-lg border border-teal-200 bg-white p-0.5">
              {[
                { label: "거래처 1곳", value: "customer" as const },
                { label: "전체 거래처", value: "all" as const }
              ].map((item) => (
                <button
                  className={`h-7 rounded-md px-2.5 text-[11px] font-black transition ${
                    leadRadiusAnchorMode === item.value ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-slate-50"
                  }`}
                  key={item.value}
                  onClick={() => setLeadRadiusAnchorMode(item.value)}
                  type="button"
                >
                  {item.label}
                </button>
              ))}
            </div>
            {leadRadiusAnchorMode === "customer" ? (
              <select
                className="h-8 min-w-[200px] rounded-md border border-teal-200 bg-white px-2 text-[11px] font-bold text-slate-950 outline-none"
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
            ) : (
              <span className="rounded-md bg-white px-2 py-1 text-[11px] font-bold text-slate-500 ring-1 ring-inset ring-teal-100">
                주소 확인된 거래처 {geocodableStoresForRadius.length.toLocaleString()}곳 기준
              </span>
            )}
            <label className="flex items-center gap-1 text-[11px] font-bold text-slate-600">
              반경
              <input
                className="h-8 w-14 rounded-md border border-teal-200 bg-white px-1.5 text-center text-[11px] font-bold text-slate-950 outline-none"
                max={50}
                min={0.5}
                onChange={(event) => setLeadRadiusKm(Number(event.target.value) || 1.5)}
                step={0.5}
                type="number"
                value={leadRadiusKm}
              />
              km
            </label>
            <button className="maju-button-primary h-8 text-[11px]" disabled={leadRadiusSearching} onClick={() => void runMapLeadRadiusSearch()} type="button">
              {leadRadiusSearching ? "탐색 중..." : "탐색"}
            </button>
            {leadRadiusResult ? (
              <span className="text-[11px] font-black text-teal-800">
                반경 {leadRadiusResult.radiusKm}km 안 리드 {leadRadiusResult.leads.length.toLocaleString()}곳 지도에 표시 중
              </span>
            ) : null}
            {leadRadiusError ? <span className="text-[11px] font-black text-rose-600">{leadRadiusError}</span> : null}
            <span className="text-[11px] font-bold text-teal-700">지도 위 원 가장자리의 흰 손잡이를 마우스로 드래그해도 반경을 조절할 수 있습니다.</span>
          </div>
        ) : null}
      </section>

      {activeView === "map" ? (
        <div className="relative flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-b-xl xl:block xl:min-h-0" ref={mapAreaRef}>
          <div className={`relative min-h-0 min-w-0 bg-slate-100 xl:absolute xl:inset-0 ${isFullscreen ? "h-full" : "h-[420px] xl:h-full"}`}>
            {sourceReady ? (
              <>
                <div className="h-full min-h-0 [&>div]:h-full">
                  <KakaoAddressMap
                    controlsOffsetClassName={rightCollapsed ? "xl:right-24" : "xl:right-[364px]"}
                    controlsOffsetPx={mapHeaderHeightPx || undefined}
                    focusedMarkerId={previewStoreId || selectedId || mapFocusId || undefined}
                    mapClassName="h-full min-h-[420px] rounded-none border-0 xl:min-h-0"
                    markers={mapDisplayMarkers}
                    onMarkerClick={(marker) => {
                      if (marker.tone === "unregistered") {
                        const target = unregisteredResults.find((result) => externalResultId(result) === marker.id);
                        if (target) setQuickRegisterTarget(target);
                        return;
                      }
                      if (marker.tone === "lead") {
                        setPreviewStoreId("");
                        setPreviewLeadId(marker.id || "");
                        return;
                      }
                      if (!marker.id || marker.tone === "origin") return;
                      setMapFocusId("");
                      setPreviewLeadId("");
                      setPreviewStoreId(marker.id);
                    }}
                    radiusOverlay={
                      leadRadiusOpen
                        ? {
                            centerMarkerId: leadRadiusAnchorMode === "customer" ? leadRadiusCustomerId || undefined : undefined,
                            onRadiusChange: (meters) => setLeadRadiusKm(Math.min(50, Math.max(0.5, Math.round((meters / 1000) * 10) / 10))),
                            radiusMeters: leadRadiusKm * 1000
                          }
                        : undefined
                    }
                    showList={false}
                  />
                </div>
                {previewStore ? (
                  <StoreQuickCard
                    driverOptions={deliveryDefaults.drivers}
                    leftPanelCollapsed={leftCollapsed}
                    onAddDriver={addManualDriver}
                    onAddVehicle={addManualVehicle}
                    onClose={() => setPreviewStoreId("")}
                    onOpenDetail={() => {
                      setSelectedId(previewStore.id);
                      setPreviewStoreId("");
                    }}
                    onOpenQuote={(targetStore) =>
                      setQuoteSubject({ customerId: targetStore.id, industry: resolveDisplayIndustry(targetStore), menuNotes: targetStore.menuSummary, name: targetStore.name })
                    }
                    onSave={(edit) => updateStore(previewStore.id, edit)}
                    originAddress={originMarker?.address || ""}
                    store={previewStore}
                    vehicleOptions={vehicleNameOptions}
                  />
                ) : null}
                {previewLeadId && leadRadiusResult ? (
                  <PermitLeadMapQuickCard
                    lead={leadRadiusResult.leads.find((lead) => lead.id === previewLeadId) || null}
                    leftPanelCollapsed={leftCollapsed}
                    onClose={() => setPreviewLeadId("")}
                    onConverted={() => {
                      setLeadRadiusResult((current) => (current ? { ...current, leads: current.leads.filter((lead) => lead.id !== previewLeadId) } : current));
                      setPreviewLeadId("");
                    }}
                    onOpenQuote={(lead) => setQuoteSubject({ industry: lead.industryPrimary, name: lead.businessName })}
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

          <div
            className={`min-h-0 shrink-0 border-t border-slate-200 xl:absolute xl:left-3 xl:top-3 xl:z-10 xl:overflow-hidden xl:rounded-xl xl:border xl:border-slate-200 xl:bg-white xl:shadow-lg ${
              leftCollapsed ? "xl:w-[72px]" : "xl:bottom-3 xl:w-[300px]"
            }`}
          >
            <DeliveryAssignmentPanel
              collapsed={leftCollapsed}
              fuelTypeConfiguredByVehicleId={fuelTypeConfiguredByVehicleId}
              onAddDriver={addManualDriver}
              onSelectVehicle={selectVehicle}
              onToggleCollapsed={() => setLeftCollapsed((value) => !value)}
              onUpdateVehicle={updateVehicle}
              selectedVehicleId={vehicleFilterId}
              totalStores={allStores.length}
              vehicles={deliveryVehicles}
            />
          </div>

          <div
            className={`min-h-0 shrink-0 border-t border-slate-200 xl:absolute xl:right-3 xl:top-3 xl:z-10 xl:overflow-hidden xl:rounded-xl xl:border xl:border-slate-200 xl:bg-white xl:shadow-lg ${
              rightCollapsed ? "xl:w-[72px]" : "xl:bottom-3 xl:w-[340px]"
            }`}
          >
            <StoreManagementPanel
              collapsed={rightCollapsed}
              dataRegistrationHref={dataRegistrationHref}
              onSelectStore={setSelectedId}
              onToggleCollapsed={() => setRightCollapsed((value) => !value)}
              selectedStoreId={selectedId}
              sourceReady={sourceReady}
              title={selectedVehicle ? `${selectedVehicle.name} 거래처` : "전체 거래처"}
              stores={visibleStores}
            />
          </div>
        </div>
      ) : null}

      {activeView === "customers" ? (
        <CustomerDirectoryView
          dataRegistrationHref={dataRegistrationHref}
          onSelectStore={setSelectedId}
          selectedStoreId={selectedId}
          sourceReady={sourceReady}
          stores={visibleStores}
        />
      ) : null}

      {activeView === "course" ? (
        <TodayCourseView
          dataRegistrationHref={dataRegistrationHref}
          markers={markers}
          onPreviewStore={setPreviewStoreId}
          onSummaryChange={setCourseSummary}
          onSelectStore={setSelectedId}
          onSelectVehicle={selectVehicle}
          routeTotals={routeTotals}
          selectedStoreId={selectedId}
          selectedVehicle={selectedVehicle}
          selectedVehicleId={vehicleFilterId}
          sourceReady={sourceReady}
          stores={visibleStores}
          vehicles={deliveryVehicles}
        />
      ) : null}

      {activeView === "leads" ? (
        <PermitLeadsView onOpenQuote={(lead) => setQuoteSubject({ industry: lead.industryPrimary, name: lead.businessName })} stores={allStores} />
      ) : null}
      </div>
      {selectedStore ? (
        <StoreDetail
          attachments={storeAttachments[selectedStore.id] || {}}
          areaOptions={deliveryDefaults.areas}
          driverOptions={deliveryDefaults.drivers}
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
          onSaveLoadingMedia={(files) =>
            setStoreAttachments((current) => ({
              ...current,
              [selectedStore.id]: {
                ...current[selectedStore.id],
                loadingPositionMedia: [...(current[selectedStore.id]?.loadingPositionMedia || []), ...files]
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
      {quoteSubject ? <QuoteDrawer onClose={() => setQuoteSubject(null)} subject={quoteSubject} /> : null}
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
  const [phone, setPhone] = useState(result.phone);
  const [industry, setIndustry] = useState(result.industry);
  const [deliveryManager, setDeliveryManager] = useState("");
  const [deliveryVehicle, setDeliveryVehicle] = useState("");
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState("");
  const [createdCustomer, setCreatedCustomer] = useState<{ id: string; name: string } | null>(null);

  async function saveCustomer() {
    if (!customerName.trim() || isSaving) return;

    setIsSaving(true);
    setSaveError("");

    try {
      const companyId = typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") : null;
      const response = await fetch("/api/customers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          address,
          businessStatus: "확인 예정",
          companyId: companyId || undefined,
          customerName,
          deliveryManager: deliveryManager || undefined,
          deliveryVehicle: deliveryVehicle || undefined,
          industry: industry || "미분류",
          kakaoPlaceUrl: result.kakaoPlaceUrl,
          phone,
          validateBusinessNumber: false
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) throw new Error(payload?.message || "거래처 등록에 실패했습니다.");

      const customerId = String(payload?.customer?.id || "");
      if (!customerId) throw new Error("거래처는 저장됐지만 ID를 확인하지 못했습니다. 거래처 관리에서 확인해주세요.");

      setCreatedCustomer({ id: customerId, name: customerName });
      onRegistered();
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "거래처 등록에 실패했습니다.");
    } finally {
      setIsSaving(false);
    }
  }

  return (
    <>
      <button aria-label="빠른 등록 닫기" className="fixed inset-0 z-40 bg-slate-950/20" onClick={onClose} type="button" />
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
                  onChange={(event) => setPhone(formatPhoneNumberInput(event.target.value))}
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
                onClick={saveCustomer}
                type="button"
              >
                {isSaving ? "저장 중" : "거래처로 등록"}
              </button>
            </div>
          )}
        </div>
      </aside>
    </>
  );
}

function DeliveryAssignmentPanel({
  collapsed,
  fuelTypeConfiguredByVehicleId,
  onAddDriver,
  onSelectVehicle,
  onToggleCollapsed,
  onUpdateVehicle,
  selectedVehicleId,
  totalStores,
  vehicles
}: {
  readonly collapsed: boolean;
  readonly fuelTypeConfiguredByVehicleId: Map<string, boolean>;
  readonly onAddDriver: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  readonly onSelectVehicle: (vehicleId: string) => void;
  readonly onToggleCollapsed: () => void;
  readonly onUpdateVehicle: (vehicleId: string, edit: VehicleEdit) => Promise<{ ok: boolean; message?: string }>;
  readonly selectedVehicleId: string;
  readonly totalStores: number;
  readonly vehicles: DeliveryVehicle[];
}) {
  const [editingVehicleId, setEditingVehicleId] = useState<string | null>(null);
  const [isAdding, setIsAdding] = useState(false);

  if (collapsed) {
    return (
      <aside className="flex min-h-0 items-center justify-center gap-1.5 border-r border-slate-200/80 bg-white px-1.5 py-2">
        <button
          aria-label="배송 담당자 패널 펼치기"
          className="maju-button-secondary h-8 w-8 shrink-0 px-0"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelLeftOpen className="h-3.5 w-3.5" />
        </button>
        <span className="relative inline-flex shrink-0" title="배송담당자 필터">
          <Truck className="h-4 w-4 text-slate-500" />
          <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-slate-900 px-1 text-[9px] font-black leading-none text-white">
            {vehicles.length}
          </span>
        </span>
      </aside>
    );
  }

  return (
    <aside className="flex h-full min-h-0 flex-col border-r border-slate-200/80 bg-white">
      <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <Truck className="h-4 w-4 text-slate-500" />
            배송담당자 필터
          </p>
          <p className="mt-1 text-xs font-bold text-slate-500">담당자별 거래처만 지도에 표시합니다.</p>
        </div>
        <button
          aria-label="배송 담당자 패널 접기"
          className="maju-button-secondary h-8 w-8 px-0"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelLeftClose className="h-4 w-4" />
        </button>
      </div>
      <div className="border-b border-slate-100 p-3">
        <button
          className={`w-full rounded-md border px-3 py-2.5 text-left transition ${
            selectedVehicleId === "all" ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900/5" : "border-slate-200 bg-white hover:bg-slate-50"
          }`}
          onClick={() => onSelectVehicle("all")}
          type="button"
        >
          <div className="flex items-center justify-between gap-2">
            <p className="text-sm font-black text-slate-950">전체 담당자</p>
            <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">{totalStores}곳</span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">담당자 필터 없이 모든 배송 거래처 표시</p>
        </button>
      </div>
      <div className="min-h-0 flex-1 divide-y divide-slate-100 overflow-auto">
        {vehicles.map((vehicle) => {
          const selected = vehicle.id === selectedVehicleId;
          const editing = editingVehicleId === vehicle.id;
          return (
            <div
              className={`w-full px-4 py-3 text-left transition ${
                selected ? "bg-slate-50 shadow-[inset_3px_0_0_#0f172a]" : "bg-white hover:bg-slate-50"
              }`}
              key={vehicle.id}
            >
              {editing ? (
                <VehicleEditForm
                  fuelTypeConfigured={fuelTypeConfiguredByVehicleId.get(vehicle.id) ?? false}
                  onCancel={() => setEditingVehicleId(null)}
                  onSave={async (edit) => {
                    const result = await onUpdateVehicle(vehicle.id, edit);
                    if (result.ok) setEditingVehicleId(null);
                    return result;
                  }}
                  vehicle={vehicle}
                />
              ) : (
                <button className="block w-full text-left" onClick={() => onSelectVehicle(vehicle.id)} type="button">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-950">{vehicle.name}</p>
                    <div className="flex items-center gap-1">
                      <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">
                        {vehicle.fuelType === "gasoline" ? "휘발유" : "경유"}
                        {fuelTypeConfiguredByVehicleId.get(vehicle.id) ? "" : " (기본값)"}
                      </span>
                      <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">
                        {vehicle.stops.length}곳
                      </span>
                    </div>
                  </div>
                  <p className="mt-1 flex items-center gap-1 text-xs font-bold text-slate-500">
                    <UserRound className="h-3.5 w-3.5" />
                    {vehicle.driver}
                  </p>
                  <div className="mt-1 flex items-center justify-between gap-2">
                    <p className="min-w-0 flex-1 truncate text-xs font-bold text-slate-400">{vehicle.area}</p>
                    <span
                      className="maju-button-secondary inline-flex h-7 shrink-0 items-center gap-1 px-2 text-xs"
                      onClick={(event) => {
                        event.stopPropagation();
                        setEditingVehicleId(vehicle.id);
                      }}
                      role="button"
                    >
                      <Edit3 className="h-3.5 w-3.5" />
                      편집
                    </span>
                  </div>
                </button>
              )}
            </div>
          );
        })}
      </div>
      <div className="shrink-0 border-t border-slate-200/80 p-3">
        {isAdding ? (
          <AddDriverForm
            onCancel={() => setIsAdding(false)}
            onSave={async (driverName, fuelType) => {
              const result = await onAddDriver(driverName, fuelType);
              if (result.ok) setIsAdding(false);
              return result;
            }}
          />
        ) : (
          <button className="maju-button-secondary flex h-9 w-full items-center justify-center gap-1.5 text-xs" onClick={() => setIsAdding(true)} type="button">
            <Plus className="h-3.5 w-3.5" />
            새 담당자·배송차 추가
          </button>
        )}
      </div>
    </aside>
  );
}

function AddDriverForm({
  onCancel,
  onSave
}: {
  readonly onCancel: () => void;
  readonly onSave: (driverName: string, fuelType: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
}) {
  const [driverName, setDriverName] = useState("");
  const [fuelType, setFuelType] = useState<"gasoline" | "diesel">("diesel");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await onSave(driverName, fuelType);
    setSaving(false);
    if (!result.ok) setError(result.message || "저장에 실패했습니다.");
  }

  return (
    <div className="space-y-2 rounded-md border border-teal-200 bg-teal-50/40 p-2.5">
      <p className="text-xs font-black text-slate-950">새 담당자·배송차 추가</p>
      <input
        autoFocus
        className="h-9 w-full rounded-md border border-slate-200 bg-white px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
        onChange={(event) => setDriverName(event.target.value)}
        placeholder="담당자 이름 (예: 김배송 매니저)"
        value={driverName}
      />
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "경유", value: "diesel" as const },
          { label: "휘발유", value: "gasoline" as const }
        ].map((item) => (
          <button
            className={`h-8 rounded-md border px-2 text-xs font-black transition ${
              fuelType === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"
            }`}
            key={item.value}
            onClick={() => setFuelType(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      {error ? <p className="text-[11px] font-bold leading-4 text-rose-600">{error}</p> : null}
      <p className="text-[11px] font-bold leading-4 text-slate-400">거래처 배정은 거래처 관리에서 담당자를 지정하면 이 배송차에 자동으로 묶입니다.</p>
      <div className="flex items-center justify-end gap-1.5">
        <button className="maju-button-secondary h-8 px-3 text-xs" disabled={saving} onClick={onCancel} type="button">
          취소
        </button>
        <button className="maju-button-primary h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || !driverName.trim()} onClick={handleSave} type="button">
          {saving ? "저장 중" : "추가"}
        </button>
      </div>
    </div>
  );
}

function RouteWorkspaceGuide({
  activeView,
  courseSummary,
  dataRegistrationHref,
  markerViewMode,
  selectedVehicleLabel,
  sourceReady,
  visibleStoreCount
}: {
  readonly activeView: WorkspaceView;
  readonly courseSummary: CourseSummary | null;
  readonly dataRegistrationHref: string;
  readonly markerViewMode: MarkerViewMode;
  readonly selectedVehicleLabel: string;
  readonly sourceReady: boolean;
  readonly visibleStoreCount: number;
}) {
  const viewLabel =
    activeView === "map" ? "지도 확인" : activeView === "customers" ? "거래처 목록" : activeView === "leads" ? "신규 리드" : "경유 코스";
  const markerLabel = markerViewMode === "grade" ? "거래처 등급별 마커" : "배송차별 마커";
  const guide =
    !sourceReady
      ? "거래처를 등록하면 지도, 목록, 배송차 경유 계산이 같은 기준으로 열립니다."
      : activeView === "course"
      ? courseSummary
        ? `${selectedVehicleLabel} 기준 경유 ${courseSummary.selectedCount}곳의 도로 거리와 시간이 계산되었습니다.`
        : `${selectedVehicleLabel} 기준 경유 거래처를 선택한 뒤 티맵 계산을 실행하세요.`
      : activeView === "customers"
        ? "목록에서 거래처를 누르면 상세 패널에서 원장, 첨부자료, 메모를 편집할 수 있습니다."
        : activeView === "leads"
          ? "사업자 인허가 데이터를 업로드하고, 기존 거래처 주변 반경에서 신규 리드를 탐색하세요."
          : "마커 선택 후 상세로 이동합니다.";

  return (
    <section className="shrink-0 border-b border-slate-200/80 bg-slate-50/70 px-4 py-2.5">
      <div className="flex flex-col gap-2 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex min-w-0 flex-wrap items-center gap-2">
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-slate-800 ring-1 ring-inset ring-slate-200">{viewLabel}</span>
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-100">{markerLabel}</span>
          <span className="rounded-md bg-white px-2.5 py-1 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-100">{visibleStoreCount.toLocaleString()}개 표시</span>
        </div>
        <div className="flex min-w-0 flex-col gap-2 lg:items-end">
          <p className="min-w-0 text-xs font-bold leading-5 text-slate-500 lg:text-right">{guide}</p>
          {!sourceReady ? (
            <Link className="maju-button-primary h-8" href={dataRegistrationHref}>
              거래처 등록
            </Link>
          ) : null}
        </div>
      </div>
    </section>
  );
}

function OperationalFlowBar({
  activeView,
  courseCalculated,
  dataRegistrationHref,
  deliveryVehicleCount,
  onChangeView,
  sourceReady,
  storeCount
}: {
  readonly activeView: WorkspaceView;
  readonly courseCalculated: boolean;
  readonly dataRegistrationHref: string;
  readonly deliveryVehicleCount: number;
  readonly onChangeView: (view: WorkspaceView) => void;
  readonly sourceReady: boolean;
  readonly storeCount: number;
}) {
  const steps: Array<{
    action: ReactNode;
    helper: string;
    label: string;
    ready: boolean;
    selected?: boolean;
  }> = [
    {
      action: (
        <Link className="absolute inset-0 rounded-lg" href={dataRegistrationHref} title="거래처 등록으로 이동">
          <span className="sr-only">거래처 등록</span>
        </Link>
      ),
      helper: sourceReady ? `${storeCount.toLocaleString()}곳` : "필수",
      label: "거래처 등록",
      ready: sourceReady
    },
    {
      action: <button aria-label="지도 확인" className="absolute inset-0 rounded-lg" onClick={() => onChangeView("map")} type="button" />,
      helper: sourceReady ? "마커 확인" : "등록 후",
      label: "지도 확인",
      ready: sourceReady,
      selected: activeView === "map"
    },
    {
      action: <button aria-label="원장 관리" className="absolute inset-0 rounded-lg" onClick={() => onChangeView("customers")} type="button" />,
      helper: sourceReady ? "상세·첨부" : "등록 후",
      label: "원장 관리",
      ready: sourceReady,
      selected: activeView === "customers"
    },
    {
      action: <button aria-label="코스 계산" className="absolute inset-0 rounded-lg" onClick={() => onChangeView("course")} type="button" />,
      helper: courseCalculated ? "계산 완료" : sourceReady ? `${deliveryVehicleCount.toLocaleString()}대` : "등록 후",
      label: "코스 계산",
      ready: courseCalculated,
      selected: activeView === "course"
    }
  ];

  return (
    <section className="shrink-0 border-b border-slate-200 bg-slate-50/80 px-4 py-2">
      <div className="grid gap-2 md:grid-cols-4">
        {steps.map((step, index) => (
          <div
            className={`relative min-w-0 rounded-lg border px-3 py-2 transition ${
              step.selected
                ? "border-teal-300 bg-teal-50 shadow-[0_1px_0_rgba(15,23,42,0.04)]"
                : step.ready
                  ? "border-emerald-100 bg-white"
                  : "border-slate-200 bg-white"
            }`}
            key={step.label}
          >
            {step.action}
            <div className="flex items-center gap-2">
              <span
                className={`grid h-6 w-6 shrink-0 place-items-center rounded-md text-[11px] font-black ${
                  step.ready ? "bg-emerald-600 text-white" : step.selected ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"
                }`}
              >
                {index + 1}
              </span>
              <div className="min-w-0">
                <p className="truncate text-xs font-black text-slate-900">{step.label}</p>
                <p className={`truncate text-[11px] font-black ${step.ready ? "text-emerald-700" : "text-slate-400"}`}>{step.helper}</p>
              </div>
            </div>
          </div>
        ))}
      </div>
    </section>
  );
}

/** On-demand geocode for one destination (and optionally an origin) via /api/routes/geocode. */
async function geocodeAddresses(addresses: string[]): Promise<Record<string, GeoPoint | null>> {
  const uniqueAddresses = Array.from(new Set(addresses.filter(Boolean)));
  if (!uniqueAddresses.length) return {};
  const response = await fetch("/api/routes/geocode", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ addresses: uniqueAddresses })
  }).catch(() => null);
  if (!response?.ok) return {};
  const payload = await response.json().catch(() => null);
  return payload?.points || {};
}

/**
 * Inline "길찾기" action: resolves real coordinates for origin/destination on first open (via
 * /api/routes/geocode) and offers a real turn-by-turn route in Kakao Map (works with or without
 * the app), plus app-required Naver Map / Tmap options, with a plain search-link fallback if
 * coordinates couldn't be resolved. See lib/navigation-links.ts for why Kakao is the default.
 */
function NavigateMenu({
  compact,
  destinationAddress,
  destinationName,
  originAddress,
  knownDestinationPoint,
  knownOriginPoint
}: {
  readonly compact?: boolean;
  readonly destinationAddress?: string;
  readonly destinationName: string;
  readonly originAddress?: string;
  /** Skip the geocode round-trip when the caller already resolved these (e.g. from a Tmap route calc). */
  readonly knownDestinationPoint?: GeoPoint | null;
  readonly knownOriginPoint?: GeoPoint | null;
}) {
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(false);
  const [points, setPoints] = useState<{ origin: GeoPoint | null; destination: GeoPoint | null } | null>(
    knownDestinationPoint !== undefined ? { origin: knownOriginPoint || null, destination: knownDestinationPoint } : null
  );

  async function handleToggle(event: MouseEvent) {
    event.stopPropagation();
    const nextOpen = !isOpen;
    setIsOpen(nextOpen);
    if (nextOpen && !points && destinationAddress) {
      setIsLoading(true);
      const resolved = await geocodeAddresses([originAddress || "", destinationAddress]);
      setPoints({
        origin: (originAddress && resolved[originAddress]) || null,
        destination: resolved[destinationAddress] || null
      });
      setIsLoading(false);
    }
  }

  const origin: NavigationStop = { name: "출발지", point: points?.origin || null };
  const destination: NavigationStop = { name: destinationName, point: points?.destination || null };
  const links = buildRouteNavigationLinks(origin, destination);

  return (
    <div className="relative">
      <button
        className={compact ? "maju-button-secondary inline-flex h-6 items-center gap-1 px-2 text-[11px]" : "maju-button-secondary h-8 shrink-0 px-3 text-xs"}
        onClick={handleToggle}
        type="button"
      >
        <Navigation className="h-3 w-3" />
        길찾기
      </button>
      {isOpen ? (
        <div
          className="absolute right-0 top-8 z-40 w-56 space-y-1 rounded-lg border border-slate-200 bg-white p-1.5 shadow-[0_18px_40px_rgba(15,23,42,.18)]"
          onClick={(event) => event.stopPropagation()}
        >
          {isLoading ? (
            <p className="px-2 py-2 text-xs font-bold text-slate-400">위치 확인 중...</p>
          ) : (
            <>
              <a
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-black text-slate-900 hover:bg-teal-50"
                href={links.kakaoWebUrl}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                카카오맵으로 길찾기
                <span className="text-[10px] font-bold text-teal-700">기본</span>
              </a>
              <a
                aria-disabled={!links.naverAppUrl}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold ${
                  links.naverAppUrl ? "text-slate-700 hover:bg-slate-50" : "pointer-events-none text-slate-300"
                }`}
                href={links.naverAppUrl || undefined}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                네이버지도 앱 길찾기
                <span className="text-[10px] font-bold text-slate-400">앱 필요</span>
              </a>
              <a
                aria-disabled={!links.tmapAppUrl}
                className={`flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold ${
                  links.tmapAppUrl ? "text-slate-700 hover:bg-slate-50" : "pointer-events-none text-slate-300"
                }`}
                href={links.tmapAppUrl || undefined}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                티맵 길찾기
                <span className="text-[10px] font-bold text-slate-400">앱 필요</span>
              </a>
              <a
                className="flex items-center justify-between rounded-md px-2 py-1.5 text-xs font-bold text-slate-500 hover:bg-slate-50"
                href={links.naverSearchUrl}
                onClick={() => setIsOpen(false)}
                rel="noreferrer"
                target="_blank"
              >
                네이버 지도에서 검색
              </a>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

/**
 * "전체 경로 길찾기": builds one real multi-stop route (출발지 -> 경유지... -> 마지막 배송지)
 * from the already-Tmap-geocoded course, instead of a single-place search link. Kakao Map
 * supports up to 5 waypoints via URL scheme, so a course longer than 6 stops (start + 5 vias +
 * destination) is capped to the first 5 vias + final destination and flagged as partial.
 */
function FullRouteNavigateAction({
  originLabel,
  originPoint,
  stopPointByAddress,
  stores
}: {
  readonly originLabel: string;
  readonly originPoint?: GeoPoint | null;
  readonly stopPointByAddress: Map<string, GeoPoint | null>;
  readonly stores: StoreRow[];
}) {
  if (!stores.length) return null;

  const stops: NavigationStop[] = stores.map((store) => ({
    name: store.name,
    point: stopPointByAddress.get(getRouteStopAddress(store)) || null
  }));
  const destination = stops[stops.length - 1];
  const waypoints = stops.slice(0, -1);
  const links = buildRouteNavigationLinks({ name: originLabel, point: originPoint || null }, destination, waypoints);
  const isPartial = stops.length > 6;

  return (
    <div className="mt-3 rounded-md border border-slate-200 bg-white p-3">
      <p className="text-xs font-black text-slate-950">전체 경로 길찾기</p>
      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
        {links.hasCoordinates
          ? `${originLabel} → ${isPartial ? "경유지 5곳" : `경유지 ${waypoints.length}곳`} → ${destination.name}${isPartial ? " (카카오맵 경유지 제한으로 앞 5곳만 반영)" : ""}`
          : "좌표를 확인할 수 없어 첫 배송지 검색으로 대체합니다."}
      </p>
      <div className="mt-2 flex flex-wrap gap-2">
        <a className="maju-button-primary h-9 px-3 text-xs" href={links.kakaoWebUrl} rel="noreferrer" target="_blank">
          <Navigation className="h-3.5 w-3.5" />
          카카오맵으로 전체 경로 길찾기
        </a>
        {links.naverAppUrl ? (
          <a className="maju-button-secondary h-9 px-3 text-xs" href={links.naverAppUrl} rel="noreferrer" target="_blank">
            네이버지도 앱 (경유지 포함)
          </a>
        ) : null}
      </div>
    </div>
  );
}

function StoreQuickCard({
  driverOptions,
  leftPanelCollapsed,
  onAddDriver,
  onAddVehicle,
  onClose,
  onOpenDetail,
  onOpenQuote,
  onSave,
  originAddress,
  store,
  variant = "floating",
  vehicleOptions
}: {
  readonly driverOptions?: string[];
  readonly leftPanelCollapsed?: boolean;
  readonly onAddDriver?: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  readonly onAddVehicle?: (vehicleName: string) => Promise<{ ok: boolean; message?: string }>;
  readonly onClose: () => void;
  readonly onOpenDetail: () => void;
  readonly onOpenQuote?: (store: StoreRow) => void;
  readonly onSave?: (edit: StoreEdit) => Promise<{ persisted: boolean }>;
  readonly originAddress?: string;
  readonly store: StoreRow;
  /**
   * "floating": 지도 홈처럼 지도 위에 떠 있는 좌측 패널을 피해야 하는 전체화면 지도용 위치 계산.
   * "grid": 경유 코스처럼 이미 별도 그리드 컬럼으로 좌우 패널 공간이 확보된 레이아웃용 — 항상 지도 영역
   * 안쪽에서 안전한 고정 여백만 사용해 옆 패널을 절대 침범하지 않습니다.
   */
  readonly variant?: "floating" | "grid";
  readonly vehicleOptions?: string[];
}) {
  const [isEditing, setIsEditing] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [draft, setDraft] = useState({
    name: store.name,
    phone: store.phone || "",
    deliveryDriver: store.deliveryDriver || "",
    deliveryVehicleName: store.deliveryVehicleName || "",
    memo: store.memo || "",
    businessHours: store.businessHours || "",
    menuSummary: store.menuSummary || ""
  });

  useEffect(() => {
    setDraft({
      name: store.name,
      phone: store.phone || "",
      deliveryDriver: store.deliveryDriver || "",
      deliveryVehicleName: store.deliveryVehicleName || "",
      memo: store.memo || "",
      businessHours: store.businessHours || "",
      menuSummary: store.menuSummary || ""
    });
    setIsEditing(false);
  }, [store.id]);

  async function handleSave() {
    if (!onSave) return;
    setIsSaving(true);
    try {
      await onSave(draft);
      setIsEditing(false);
    } finally {
      setIsSaving(false);
    }
  }

  // grid 변형은 이미 그리드 컬럼으로 좌우 여백이 확보돼 있으므로 고정된 작은 좌측 여백만 사용합니다.
  // floating 변형(지도 홈)은 지도 위에 떠 있는 좌측 패널을 피해야 해서 더 큰 오프셋을 쓰되,
  // 두 경우 모두 너비를 컨테이너 폭 기준 calc()로 제한해 옆 패널을 절대 침범하지 않게 합니다.
  const positionClassName =
    variant === "grid"
      ? "left-4 w-[min(300px,calc(100%-32px))]"
      : `left-4 w-[min(300px,calc(100%-32px))] ${
          leftPanelCollapsed ? "xl:left-[84px] xl:w-[min(300px,calc(100%-100px))]" : "xl:left-[336px] xl:w-[min(300px,calc(100%-352px))]"
        }`;
  const topClassName = variant === "grid" ? "top-4" : "top-4 xl:top-20";

  return (
    <div className={`absolute ${topClassName} z-30 h-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,.18)] ${positionClassName}`}>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          {isEditing ? (
            <input
              autoFocus
              className="h-8 w-full rounded-md border border-teal-200 bg-teal-50/50 px-2 text-[15px] font-black text-slate-950 outline-none focus:border-teal-400"
              onChange={(event) => setDraft((current) => ({ ...current, name: event.target.value }))}
              value={draft.name}
            />
          ) : (
            <p className="min-w-0 truncate text-[15px] font-black leading-5 text-slate-950">{store.name}</p>
          )}
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
            <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700">{store.grade}등급</span>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">{resolveDisplayIndustry(store)}</span>
          </div>
        </div>
        <button aria-label="닫기" className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} type="button">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <p className="flex gap-2 text-[13px] font-bold leading-5 text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="line-clamp-2">{store.address || store.region}</span>
        </p>
        {!isEditing ? (
          <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500">
            <span className="flex items-center gap-1 truncate">
              <Phone className="h-3 w-3 shrink-0 text-slate-400" />
              {store.phone || "연락처 미등록"}
            </span>
            <span className="flex items-center gap-1 truncate">
              <UserRound className="h-3 w-3 shrink-0 text-slate-400" />
              {store.representativeName || "대표자 미등록"}
            </span>
            <span className="flex items-center gap-1 truncate">
              <FileImage className="h-3 w-3 shrink-0 text-slate-400" />
              {store.businessRegistrationNumber || "사업자번호 미등록"}
            </span>
            <span className="flex items-center gap-1 truncate">
              <CalendarDays className="h-3 w-3 shrink-0 text-slate-400" />
              {store.openingDate ? `개업 ${store.openingDate}` : "개업일 미등록"}
            </span>
          </div>
        ) : null}
        {!isEditing ? (
          <div className="mt-2 flex flex-wrap items-center gap-1.5">
            {store.businessHours ? (
              <IconBadge title={`영업시간 · ${store.businessHours}`} tone="bg-teal-50 text-teal-700 ring-teal-200">
                <Clock className="h-3.5 w-3.5" />
              </IconBadge>
            ) : null}
            {store.menuSummary ? (
              <IconBadge title={`주요 메뉴 · ${store.menuSummary}`} tone="bg-orange-50 text-orange-700 ring-orange-200">
                <Store className="h-3.5 w-3.5" />
              </IconBadge>
            ) : null}
            <PlaceLinkRow compact store={store} />
          </div>
        ) : null}
        {!isEditing && store.reviewKeywords?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {store.reviewKeywords.slice(0, 6).map((keyword) => (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-[10px] font-black text-amber-700" key={keyword}>
                #{keyword}
              </span>
            ))}
          </div>
        ) : null}
        {!isEditing && store.reviewSummary ? (
          <p className="mt-1.5 flex gap-1.5 text-[11px] font-bold leading-4 text-slate-500">
            <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            <span>{store.reviewSummary}</span>
          </p>
        ) : null}
        {isEditing ? (
          <div className="mt-2 space-y-1.5">
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
              onChange={(event) => setDraft((current) => ({ ...current, phone: formatPhoneNumberInput(event.target.value) }))}
              placeholder="연락처"
              value={draft.phone}
            />
            <DriverSelectField
              compact
              driverOptions={driverOptions || []}
              onAddDriver={onAddDriver}
              onChange={(value) => setDraft((current) => ({ ...current, deliveryDriver: value }))}
              value={draft.deliveryDriver}
            />
            <DriverSelectField
              compact
              driverOptions={vehicleOptions || []}
              entityLabel="배송차"
              onAddDriver={onAddVehicle}
              onChange={(value) => setDraft((current) => ({ ...current, deliveryVehicleName: value }))}
              value={draft.deliveryVehicleName}
            />
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
              onChange={(event) => setDraft((current) => ({ ...current, businessHours: event.target.value }))}
              placeholder="영업시간 (예: 매일 10:00-22:00)"
              value={draft.businessHours}
            />
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
              onChange={(event) => setDraft((current) => ({ ...current, menuSummary: event.target.value }))}
              placeholder="주요 메뉴/취급 품목"
              value={draft.menuSummary}
            />
            <textarea
              className="min-h-14 w-full resize-none rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
              onChange={(event) => setDraft((current) => ({ ...current, memo: event.target.value }))}
              placeholder="메모"
              value={draft.memo}
            />
            <div className="flex items-center justify-end gap-1.5">
              <button className="maju-button-secondary h-8 px-3 text-xs" disabled={isSaving} onClick={() => setIsEditing(false)} type="button">
                취소
              </button>
              <button className="maju-button-primary h-8 px-3 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={isSaving} onClick={handleSave} type="button">
                {isSaving ? "저장 중" : "저장"}
              </button>
            </div>
          </div>
        ) : (
          <>
            <p className="mt-2.5 break-words text-[11px] font-black leading-4 text-slate-400">
              {[store.deliveryDriver, store.deliveryVehicleName].filter(Boolean).join(" · ") || "담당자·배송차 미지정"}
            </p>
            <div className="mt-1.5 flex items-center justify-end gap-2">
              {onSave ? (
                <button className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs" onClick={() => setIsEditing(true)} type="button">
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              ) : null}
              <NavigateMenu destinationAddress={store.address || store.region} destinationName={store.name} originAddress={originAddress} />
              {onOpenQuote ? (
                <button className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs" onClick={() => onOpenQuote(store)} title="견적서 작성" type="button">
                  견적서
                </button>
              ) : null}
              <button className="maju-button-primary h-8 shrink-0 px-3 text-xs" onClick={onOpenDetail} type="button">
                상세 열기
              </button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/**
 * 저장된 네이버·카카오·구글 링크가 있으면 그 링크로, 없으면 상호명+주소 검색 링크로 새 탭에서 엽니다.
 * 실제 리뷰·영업시간·메뉴는 각 플랫폼 페이지에서 확인합니다(공식 리뷰 API는 유료라 여기서는 연결만 제공).
 */
// 예전 로직으로 저장된 네이버 링크는 "상호명+상세주소" 조합 검색이라 결과가 어긋나는 경우가 많았습니다.
// 실제로 네이버 API가 확정 매칭한 링크(map.naver.com/p/search가 아닌 다른 경로)가 아니라면,
// 저장된 값 대신 항상 최신 로직(상호명 단독 검색)으로 다시 계산해서 보여줍니다.
const isGenericNaverSearchLink = (url?: string) => {
  const trimmed = url?.trim();
  return !trimmed || /^https:\/\/map\.naver\.com\/p\/search\//.test(trimmed);
};

// 네이버·카카오맵·구글맵처럼 클릭 시 새 탭으로 열리는 링크형 아이콘과 영업시간·메뉴처럼
// 클릭 동작 없이 마우스오버로만 내용을 보여주는 정보형 아이콘에 공통으로 쓰는 배지입니다.
function IconBadge({
  children,
  className = "",
  href,
  shape = "circle",
  title,
  tone
}: {
  readonly children: React.ReactNode;
  readonly className?: string;
  readonly href?: string;
  readonly shape?: "circle" | "square";
  readonly title: string;
  readonly tone: string;
}) {
  const shapeClassName = shape === "square" ? "rounded-[9px]" : "rounded-full";
  const sharedClassName = `grid h-7 w-7 shrink-0 place-items-center ${shapeClassName} text-[11px] font-black ring-1 ring-inset transition hover:scale-105 ${tone} ${className}`;
  if (href) {
    return (
      <a className={sharedClassName} href={href} rel="noreferrer" target="_blank" title={title}>
        {children}
      </a>
    );
  }
  return (
    <span className={sharedClassName} title={title}>
      {children}
    </span>
  );
}

// 원 안에 첫 글자만 넣던 방식 대신, 각 플랫폼의 실제 브랜드 컬러(네이버 그린·카카오 옐로우)와
// 지도 서비스임을 알 수 있는 핀 아이콘을 조합해 한눈에 구분되도록 했습니다.
const PLACE_LINK_BRAND_STYLE: Record<string, { icon: ReactNode; tone: string }> = {
  구글맵: { icon: <MapPin className="h-4 w-4" />, tone: "bg-white text-[#EA4335] ring-slate-200" },
  네이버: { icon: <span className="text-[13px] font-black leading-none">N</span>, tone: "bg-[#03C75A] text-white ring-[#03C75A]" },
  카카오맵: { icon: <MapPin className="h-4 w-4" />, tone: "bg-[#FEE500] text-slate-900 ring-[#FEE500]" }
};

function PlaceLinkRow({ className = "", compact = false, store }: { readonly className?: string; readonly compact?: boolean; readonly store: StoreRow }) {
  const searchLinks = buildPlaceSearchLinks({ address: store.address || store.region, customerName: store.name });
  const links = [
    { label: "네이버", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", url: isGenericNaverSearchLink(store.naverPlaceUrl) ? searchLinks.naverPlaceUrl : store.naverPlaceUrl!.trim() },
    { label: "카카오맵", tone: "bg-amber-50 text-amber-700 ring-amber-200", url: store.kakaoPlaceUrl?.trim() || searchLinks.kakaoPlaceUrl },
    { label: "구글맵", tone: "bg-blue-50 text-blue-700 ring-blue-200", url: store.googleMapUrl?.trim() || searchLinks.googleMapUrl }
  ];

  if (compact) {
    return (
      <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
        {links.map((link) => {
          const brand = PLACE_LINK_BRAND_STYLE[link.label];
          return (
            <IconBadge href={link.url} key={link.label} shape="square" title={`${link.label}에서 보기`} tone={brand?.tone ?? link.tone}>
              {brand?.icon ?? link.label[0]}
            </IconBadge>
          );
        })}
      </div>
    );
  }

  return (
    <div className={`flex flex-wrap items-center gap-1.5 ${className}`}>
      {links.map((link) => (
        <a
          className="inline-flex h-6 items-center gap-1 rounded-full bg-white px-2 text-[11px] font-black text-slate-600 ring-1 ring-inset ring-slate-200 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
          href={link.url}
          key={link.label}
          rel="noreferrer"
          target="_blank"
        >
          {link.label}
          <ExternalLink className="h-3 w-3" />
        </a>
      ))}
    </div>
  );
}

/**
 * 담당자·배송차 선택 드롭다운. 목록 맨 아래 "+ 새 OO 추가"를 고르면 이름을 입력해 바로 등록합니다.
 * entityLabel로 "담당자"/"배송차" 등 어떤 항목을 고르는 드롭다운인지 문구를 바꿔 재사용합니다.
 * 담당자와 배송차는 서로 다른 값일 수 있어(같은 트럭을 여러 담당자가 나눠 쓰거나, 한 담당자가
 * 상황에 따라 다른 차량을 몰 수 있음) 완전히 독립된 값으로 취급합니다.
 */
function DriverSelectField({
  compact,
  driverOptions,
  entityLabel = "담당자",
  onAddDriver,
  onChange,
  value
}: {
  readonly compact?: boolean;
  readonly driverOptions: string[];
  readonly entityLabel?: string;
  readonly onAddDriver?: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  readonly onChange: (value: string) => void;
  readonly value: string;
}) {
  const ADD_NEW = "__add_new_driver__";
  const [isAddingNew, setIsAddingNew] = useState(false);
  const [newName, setNewName] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const options = value && !driverOptions.includes(value) ? [value, ...driverOptions] : driverOptions;
  const selectClassName = compact
    ? "h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
    : "h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100";

  async function handleAddNew() {
    if (!onAddDriver) return;
    setSaving(true);
    setError("");
    const result = await onAddDriver(newName);
    setSaving(false);
    if (!result.ok) {
      setError(result.message || `${entityLabel} 추가에 실패했습니다.`);
      return;
    }
    onChange(newName.trim());
    setIsAddingNew(false);
    setNewName("");
  }

  if (isAddingNew) {
    return (
      <div className="space-y-1">
        <div className="flex items-center gap-1.5">
          <input
            autoFocus
            className={compact ? "h-8 w-full rounded-md border border-teal-200 bg-white px-2 text-xs font-bold outline-none focus:border-teal-400" : "h-10 w-full rounded-md border border-teal-200 bg-white px-3 font-bold outline-none focus:border-teal-400"}
            onChange={(event) => setNewName(event.target.value)}
            placeholder={`새 ${entityLabel} 이름`}
            value={newName}
          />
          <button className="maju-button-secondary h-8 shrink-0 px-2 text-xs" disabled={saving} onClick={() => setIsAddingNew(false)} type="button">
            취소
          </button>
          <button className="maju-button-primary h-8 shrink-0 px-2.5 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={saving || !newName.trim()} onClick={handleAddNew} type="button">
            {saving ? "추가 중" : "추가"}
          </button>
        </div>
        {error ? <p className="text-[11px] font-bold text-rose-600">{error}</p> : null}
      </div>
    );
  }

  return (
    <select
      className={selectClassName}
      onChange={(event) => {
        if (event.target.value === ADD_NEW) {
          setIsAddingNew(true);
          return;
        }
        onChange(event.target.value);
      }}
      value={value}
    >
      <option value="">{entityLabel} 미지정</option>
      {options.map((driver) => (
        <option key={driver} value={driver}>
          {driver}
        </option>
      ))}
      {onAddDriver ? <option value={ADD_NEW}>+ 새 {entityLabel} 추가</option> : null}
    </select>
  );
}

// 등급/배송차별 마커 색상 범례입니다. 예전에는 색점만 모아 보여주고 전체 설명은 마우스오버
// 툴팁으로 옮겼는데("마커 ●●●"), 어떤 색이 어떤 등급/배송차인지 hover 없이는 전혀 알 수 없다는
// 피드백을 받아(2026-08-19) 각 점 옆에 짧은 글자 라벨을 항상 보이게 되돌렸습니다. 대신 공간을
// 아끼기 위해 등급은 "A"처럼 한 글자로, 배송차는 이름을 그대로 쓰되 개수를 4개로 줄였습니다.
function MarkerModeLegend({ mode, vehicles }: { readonly mode: MarkerViewMode; readonly vehicles: DeliveryVehicle[] }) {
  const items =
    mode === "grade"
      ? [
          { color: "#7c3aed", label: "A등급", shortLabel: "A" },
          { color: "#2563eb", label: "B등급", shortLabel: "B" },
          { color: "#64748b", label: "C등급", shortLabel: "C" }
        ]
      : vehicles
          .slice(0, 8)
          .map((vehicle, index) => ({ color: vehicleMarkerColors[index % vehicleMarkerColors.length], label: vehicle.name, shortLabel: vehicle.name }));
  const visibleCount = mode === "grade" ? items.length : 4;
  const title = items.length ? `마커 색상 안내 · ${items.map((item) => item.label).join(" · ")}` : "마커 색상 안내";

  return (
    <span className="maju-filter-box inline-flex h-10 shrink-0 flex-wrap items-center gap-x-2 gap-y-0.5 px-2 py-1" title={title}>
      <span className="mr-0.5 text-xs font-black text-slate-500">마커</span>
      {items.slice(0, visibleCount).map((item) => (
        <span className="inline-flex items-center gap-1" key={item.label}>
          <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
          <span className="whitespace-nowrap text-[11px] font-bold text-slate-600">{item.shortLabel}</span>
        </span>
      ))}
      {items.length > visibleCount ? <span className="text-[11px] font-black text-slate-400">+{items.length - visibleCount}</span> : null}
    </span>
  );
}

function VehicleEditForm({
  fuelTypeConfigured,
  onCancel,
  onSave,
  vehicle
}: {
  readonly fuelTypeConfigured: boolean;
  readonly onCancel: () => void;
  readonly onSave: (edit: VehicleEdit) => Promise<{ ok: boolean; message?: string }>;
  readonly vehicle: DeliveryVehicle;
}) {
  const [name, setName] = useState(vehicle.name);
  const [driver, setDriver] = useState(vehicle.driver);
  const [area, setArea] = useState(vehicle.area);
  const [fuelType, setFuelType] = useState<"gasoline" | "diesel">(vehicle.fuelType || "diesel");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");

  async function handleSave() {
    setSaving(true);
    setError("");
    const result = await onSave({ area, driver, fuelType, name: name.trim() || vehicle.name });
    setSaving(false);
    if (!result.ok) setError(result.message || "저장에 실패했습니다.");
  }

  return (
    <div className="space-y-2">
      <p className="text-sm font-black text-slate-950">{vehicle.name} 편집</p>
      <label className="grid gap-1 text-xs">
        <span className="font-black text-slate-500">호차명</span>
        <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setName(event.target.value)} value={name} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="font-black text-slate-500">담당자</span>
        <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setDriver(event.target.value)} value={driver} />
      </label>
      <label className="grid gap-1 text-xs">
        <span className="font-black text-slate-500">구역</span>
        <input className="h-9 w-full rounded-md border border-slate-200 px-3 text-sm font-bold outline-none transition focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setArea(event.target.value)} value={area} />
      </label>
      <p className="text-[11px] font-bold leading-4 text-slate-400">
        호차명은 이 배송차에 배정된 거래처 전체에 반영되어 저장됩니다. 담당자·구역은 화면 표시값만 바뀝니다.
      </p>
      {!fuelTypeConfigured ? (
        <p className="rounded-md bg-amber-50 px-2 py-1.5 text-[11px] font-bold leading-4 text-amber-800">
          연료 타입 기본값은 경유입니다.
        </p>
      ) : null}
      <div className="grid grid-cols-2 gap-1.5">
        {[
          { label: "경유", value: "diesel" as const },
          { label: "휘발유", value: "gasoline" as const }
        ].map((item) => (
          <button
            className={`h-8 rounded-md border px-2 text-xs font-black transition ${
              fuelType === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-600"
            }`}
            key={item.value}
            onClick={() => setFuelType(item.value)}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="flex gap-2">
        <button className="maju-button-primary h-8 flex-1 text-xs disabled:cursor-not-allowed disabled:opacity-60" disabled={saving} onClick={handleSave} type="button">
          {saving ? "저장 중..." : "저장"}
        </button>
        <button className="maju-button-secondary h-8 flex-1 text-xs" disabled={saving} onClick={onCancel} type="button">
          취소
        </button>
      </div>
      {error ? <p className="text-xs font-bold text-rose-600">{error}</p> : null}
    </div>
  );
}

function StoreManagementPanel({
  collapsed,
  dataRegistrationHref,
  onSelectStore,
  onToggleCollapsed,
  selectedStoreId,
  sourceReady,
  stores,
  title
}: {
  readonly collapsed: boolean;
  readonly dataRegistrationHref: string;
  readonly onSelectStore: (storeId: string) => void;
  readonly onToggleCollapsed: () => void;
  readonly selectedStoreId: string;
  readonly sourceReady: boolean;
  readonly stores: StoreRow[];
  readonly title: string;
}) {
  if (collapsed) {
    return (
      <aside className="flex min-h-0 items-center justify-center gap-1.5 border-l border-slate-200/80 bg-white px-1.5 py-2">
        <button
          aria-label="거래처 목록 패널 펼치기"
          className="maju-button-secondary h-8 w-8 shrink-0 px-0"
          onClick={onToggleCollapsed}
          type="button"
        >
          <PanelRightOpen className="h-3.5 w-3.5" />
        </button>
        <span className="relative inline-flex shrink-0" title={title}>
          <Store className="h-4 w-4 text-slate-500" />
          <span className="absolute -right-2 -top-2 grid h-4 min-w-[16px] place-items-center rounded-full bg-slate-900 px-1 text-[9px] font-black leading-none text-white">
            {stores.length}
          </span>
        </span>
      </aside>
    );
  }

  return (
    <aside className="h-full min-h-0 border-l border-slate-200/80 bg-white">
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex items-center justify-between gap-3 border-b border-slate-200/80 bg-slate-50 px-4 py-3">
          <div className="min-w-0">
            <p className="text-sm font-black text-slate-950">{title}</p>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">거래처를 누르면 상세 패널이 열립니다.</p>
          </div>
          <button
            aria-label="거래처 목록 패널 접기"
            className="maju-button-secondary h-8 w-8 shrink-0 px-0"
            onClick={onToggleCollapsed}
            type="button"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
          <span className="shrink-0 rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{stores.length}곳</span>
        </div>
        <div className="min-h-0 flex-1 overflow-auto">
          {stores.length ? (
            stores.map((store) => (
              <button
                className={`block w-full border-b border-slate-100 px-4 py-3 text-left transition hover:bg-slate-50 ${
                  store.id === selectedStoreId ? "bg-slate-50 shadow-[inset_3px_0_0_#0f172a]" : ""
                }`}
                key={store.id}
                onClick={() => onSelectStore(store.id)}
                type="button"
              >
                <div className="flex items-center gap-2">
                  <p className="min-w-0 flex-1 truncate text-sm font-black text-slate-950">{store.name}</p>
                  <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                </div>
                <p className="mt-1 truncate text-xs font-bold text-slate-500">{store.address || store.region}</p>
                <div className="mt-2 grid grid-cols-[1fr_auto] items-center gap-2">
                  <p className="text-xs font-bold text-slate-400">
                    {store.distanceKm?.toLocaleString() || "-"}km · {formatMinutes(store.durationMinutes || 0)} · {store.expectedRevenue.toLocaleString()}만원
                  </p>
                  <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
                </div>
              </button>
            ))
          ) : (
            <div className="grid h-full min-h-[180px] place-items-center px-4 text-center">
              <div>
                <p className="text-sm font-black text-slate-700">{sourceReady ? "조건에 맞는 거래처가 없습니다." : "등록된 운영 거래처가 없습니다."}</p>
                <p className="mt-2 text-xs font-bold leading-5 text-slate-500">
                  {sourceReady ? "등급 필터나 검색어를 조정해 주세요." : "거래처를 먼저 등록하면 담당자별 거래처 목록이 표시됩니다."}
                </p>
                {!sourceReady ? (
                <Link className="maju-button-primary mt-3 h-8" href={dataRegistrationHref}>
                  거래처 등록하기
                </Link>
                ) : null}
              </div>
            </div>
          )}
        </div>
        <div className="border-t border-slate-200 bg-slate-50 px-4 py-3">
          <p className="text-xs font-bold leading-5 text-slate-500">거래처 선택 후 우측 패널에서 관리합니다.</p>
        </div>
      </div>
    </aside>
  );
}

function CustomerDirectoryView({
  dataRegistrationHref,
  onSelectStore,
  selectedStoreId,
  sourceReady,
  stores
}: {
  readonly dataRegistrationHref: string;
  readonly onSelectStore: (storeId: string) => void;
  readonly selectedStoreId: string;
  readonly sourceReady: boolean;
  readonly stores: StoreRow[];
}) {
  const totals = getStoreTotals(stores);
  const gradeCounts = countGrades(stores);
  const closedCount = stores.filter((store) => store.businessStatus === "closed").length;
  const unknownCount = stores.filter((store) => store.businessStatus === "unknown").length;
  const terminatedCount = stores.filter((store) => store.relationshipStatus === "거래종료").length;

  return (
    <section className="flex min-h-[480px] flex-1 flex-col overflow-hidden rounded-b-xl bg-[#f6f8fb] p-4 xl:min-h-0">
      <div className="grid shrink-0 gap-3 lg:grid-cols-5">
        <DirectoryStat label="거래처" value={`${stores.length}곳`} />
        <DirectoryStat label="A등급" value={`${gradeCounts.A}곳`} />
        <DirectoryStat label="예상매출" value={`${totals.expectedRevenue.toLocaleString()}만원`} />
        <DirectoryStat label="사업자 확인" value={`${closedCount}곳`} tone={closedCount ? "rose" : "slate"} />
        <DirectoryStat label="거래 종료" value={`${terminatedCount}곳`} tone={terminatedCount ? "rose" : "slate"} />
      </div>

      {sourceReady && unknownCount ? (
        <div className="mt-3 flex shrink-0 items-center gap-2.5 rounded-lg border border-amber-200 bg-amber-50 px-4 py-2.5">
          <AlertTriangle className="h-4 w-4 shrink-0 text-amber-700" />
          <p className="text-xs font-bold leading-5 text-amber-900">
            사업자 상태가 아직 확인되지 않은 거래처가 <span className="font-black">{unknownCount}곳</span> 있습니다. 아래 목록에서 거래처를 눌러 상세
            패널의 &quot;사업자 상태 조회&quot;를 실행하세요.
          </p>
        </div>
      ) : null}

      <div className="maju-section-card mt-4 flex-1 overflow-hidden xl:min-h-0">
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
            <div className="max-h-[calc(100vh-360px)] overflow-auto xl:h-full xl:max-h-none">
              <table className="w-full min-w-[920px] border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs font-black text-slate-500 shadow-[0_1px_0_#e2e8f0] backdrop-blur">
                  <tr>
                    <th className="w-[34%] border-r border-slate-200 px-4 py-3">거래처</th>
                    <th className="w-[96px] border-r border-slate-200 px-4 py-3">매출등급</th>
                    <th className="w-[150px] border-r border-slate-200 px-4 py-3">담당자</th>
                    <th className="w-[120px] border-r border-slate-200 px-4 py-3 text-right">예상매출</th>
                    <th className="w-[120px] border-r border-slate-200 px-4 py-3 text-right">출발지 거리</th>
                    <th className="w-[120px] px-4 py-3">사업자 상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {stores.map((store) => (
                    <tr
                      aria-selected={store.id === selectedStoreId}
                      className={`cursor-pointer transition hover:bg-slate-50 ${store.id === selectedStoreId ? "bg-teal-50/70 shadow-[inset_3px_0_0_#0f766e]" : "bg-white"}`}
                      key={store.id}
                      onClick={() => onSelectStore(store.id)}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") onSelectStore(store.id);
                      }}
                    >
                      <td className="min-w-0 border-r border-slate-100 px-4 py-3">
                        <p className="truncate font-black text-slate-950">{store.name}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">{store.address || store.region}</p>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3">
                        <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                      </td>
                      <td className="max-w-[150px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{store.deliveryDriver || "미지정"}</td>
                      <td className="border-r border-slate-100 px-4 py-3 text-right font-black text-slate-950">{store.expectedRevenue.toLocaleString()}만원</td>
                      <td className="border-r border-slate-100 px-4 py-3 text-right font-bold text-slate-500">{store.distanceKm?.toLocaleString() || "-"}km</td>
                      <td className="px-4 py-3">
                        <span className={businessStatusClass(store.businessStatus)}>{getBusinessStatusLabel(store.businessStatus)}</span>
                        {store.relationshipStatus === "거래종료" ? (
                          <span className="ml-1 rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">거래 종료</span>
                        ) : null}
                      </td>
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
    </section>
  );
}

type QuoteSubject = {
  customerId?: string;
  industry?: string;
  leadId?: string;
  menuNotes?: string;
  name: string;
};
type QuoteRow = { id: string; item: string; qty: number; spec: string; unitPrice: number };

// 업종별로 식자재 유통사가 통상 공급하는 품목 카테고리를 초안으로 깔아줍니다. 단가는 거래처마다
// 달라 0으로 비워두고, 담당자가 실제 협상가로 채워 넣는 것을 전제로 합니다(가짜 단가를 넣지 않음).
const INDUSTRY_QUOTE_TEMPLATES: Record<string, string[]> = {
  "한식": ["쌀 20kg", "돼지고기 앞다리살", "대파", "양파", "고춧가루", "식용유 18L", "국간장"],
  "고기/구이": ["삼겹살", "목살", "소고기(구이용)", "쌈채소 세트", "된장", "숯"],
  "곱창/막창": ["소곱창(손질)", "막창(손질)", "대창", "깻잎", "부추", "양념장 베이스"],
  "분식": ["떡볶이떡", "어묵", "튀김가루", "라면사리", "순대", "쫄면"],
  "카페/디저트": ["원두 1kg", "우유 1L", "생크림", "시럽류", "박력분 20kg", "일회용 컵"],
  "일식": ["초밥용 쌀 20kg", "간장 18L", "와사비", "김(초밥용)", "냉동 생선류", "무순"],
  "중식": ["면류(생면)", "굴소스", "두반장", "돼지고기 삼겹살", "청경채", "식용유 18L"],
  "프랜차이즈/배달": ["냉동육(닭/패티)", "튀김유 18L", "번/도우", "포장 용기", "소스류"],
  "주점": ["안주용 육류", "건어물", "채소 세트", "음료·주류 부재료"],
  "양식": ["파스타면", "올리브유", "치즈류", "육류(스테이크용)", "토마토소스"],
  "뷔페/단체급식": ["쌀 20kg (대량)", "육류 세트", "채소 세트(대량)", "국·찌개용 육수", "일회용품"]
};

// 거래처의 업종(industry) 값이 비어 있거나 "미분류"일 때, 이미 확보된 리뷰 키워드·리뷰 요약·메뉴
// 요약 텍스트에서 업종을 추정합니다. 정확한 값이 있으면 그걸 그대로 쓰고, 이건 어디까지나
// 마지막 보정 수단입니다(잘못 추정되면 사용자가 상세 화면에서 업종을 직접 입력해 덮어쓸 수 있음).
const INDUSTRY_KEYWORD_RULES: Array<{ industry: string; keywords: string[] }> = [
  { industry: "곱창/막창", keywords: ["곱창", "막창", "대창"] },
  { industry: "고기/구이", keywords: ["삼겹살", "고깃집", "정육", "숯불", "구이"] },
  { industry: "분식", keywords: ["분식", "떡볶이", "김밥"] },
  { industry: "한식", keywords: ["한식", "백반", "국밥", "찌개", "한정식"] },
  { industry: "카페/디저트", keywords: ["카페", "커피", "디저트", "베이커리", "빵집"] },
  { industry: "일식", keywords: ["일식", "초밥", "스시", "라멘", "이자카야"] },
  { industry: "중식", keywords: ["중식", "짜장", "짬뽕", "마라"] },
  { industry: "양식", keywords: ["양식", "파스타", "스테이크", "피자"] },
  { industry: "주점", keywords: ["주점", "호프", "포차", "술집"] },
  { industry: "프랜차이즈/배달", keywords: ["치킨", "배달전문", "패스트푸드", "버거"] },
  { industry: "뷔페/단체급식", keywords: ["뷔페", "단체급식", "구내식당"] }
];

function inferIndustryFromText(...texts: Array<string | undefined>): string | undefined {
  const haystack = texts.filter(Boolean).join(" ");
  if (!haystack) return undefined;
  const rule = INDUSTRY_KEYWORD_RULES.find((candidate) => candidate.keywords.some((keyword) => haystack.includes(keyword)));
  return rule?.industry;
}

/** 카드 뱃지·견적서 초안이 함께 쓰는 "실제로 보여줄 업종" 계산입니다. */
function resolveDisplayIndustry(store: {
  industry?: string;
  menuSummary?: string;
  name?: string;
  reviewKeywords?: string[];
  reviewSummary?: string;
}): string {
  if (store.industry && store.industry !== "미분류") return store.industry;
  const inferred = inferIndustryFromText(store.menuSummary, store.reviewSummary, store.reviewKeywords?.join(" "), store.name);
  return inferred || store.industry || "미분류";
}

function buildQuoteDraftRows(industry?: string): QuoteRow[] {
  const items = (industry && INDUSTRY_QUOTE_TEMPLATES[industry]) || [];
  return items.map((item, index) => ({ id: `draft-${index}`, item, qty: 1, spec: "", unitPrice: 0 }));
}

/** 지도 위 리드 반경 검색 결과 마커를 클릭했을 때 뜨는 간단 카드입니다. StoreQuickCard보다 가볍습니다. */
function PermitLeadMapQuickCard({
  lead,
  leftPanelCollapsed,
  onClose,
  onConverted,
  onOpenQuote
}: {
  readonly lead: (PermitLeadItem & { distanceKm: number; nearestAnchor: { id: string; name: string } | null }) | null;
  readonly leftPanelCollapsed?: boolean;
  readonly onClose: () => void;
  readonly onConverted: () => void;
  readonly onOpenQuote: (lead: PermitLeadItem) => void;
}) {
  const [isConverting, setIsConverting] = useState(false);
  const [message, setMessage] = useState("");
  if (!lead) return null;

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

  const positionClassName = `left-4 w-[min(300px,calc(100%-32px))] ${
    leftPanelCollapsed ? "xl:left-[84px] xl:w-[min(300px,calc(100%-100px))]" : "xl:left-[336px] xl:w-[min(300px,calc(100%-352px))]"
  }`;

  return (
    <div className={`absolute top-4 xl:top-20 z-30 h-auto overflow-hidden rounded-xl border border-teal-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,.18)] ${positionClassName}`}>
      <div className="flex items-start justify-between gap-2 px-3 py-2.5">
        <div className="min-w-0 flex-1">
          <p className="min-w-0 truncate text-[15px] font-black leading-5 text-slate-950">{lead.businessName}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-1">
            <Badge className={`px-1.5 py-0 text-[10px] ${permitGradeToneClassName(lead.grade)}`}>{lead.grade || "-"}</Badge>
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">{lead.industryPrimary}</span>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-700">{lead.distanceKm}km</span>
          </div>
        </div>
        <button aria-label="닫기" className="grid h-6 w-6 shrink-0 place-items-center rounded-md text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={onClose} type="button">
          <X className="h-3.5 w-3.5" />
        </button>
      </div>
      <div className="border-t border-slate-100 bg-slate-50/80 px-3 py-2.5">
        <p className="flex gap-2 text-[13px] font-bold leading-5 text-slate-600">
          <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
          <span className="line-clamp-2">{lead.address || "주소 확인 필요"}</span>
        </p>
        <div className="mt-2 grid grid-cols-2 gap-x-2 gap-y-1 text-[11px] font-bold text-slate-500">
          <span className="flex items-center gap-1 truncate">
            <Phone className="h-3 w-3 shrink-0 text-slate-400" />
            {lead.phone || "연락처 미확인"}
          </span>
          <span className="flex items-center gap-1 truncate">
            <CalendarDays className="h-3 w-3 shrink-0 text-slate-400" />
            {lead.permitDate || "인허가일 미확인"}
          </span>
        </div>
        {lead.nearestAnchor ? (
          <p className="mt-1.5 text-[11px] font-bold text-slate-400">기준 거래처: {lead.nearestAnchor.name}</p>
        ) : null}
        {message ? <p className="mt-1.5 text-[11px] font-bold text-rose-600">{message}</p> : null}
        <div className="mt-2 grid grid-cols-2 gap-1.5">
          <button className="maju-button-secondary h-8 justify-center text-xs" onClick={() => onOpenQuote(lead)} type="button">
            견적서 작성
          </button>
          <button className="maju-button-primary h-8 justify-center text-xs disabled:opacity-60" disabled={isConverting} onClick={() => void convert()} type="button">
            {isConverting ? "전환 중..." : "거래처로 전환"}
          </button>
        </div>
      </div>
    </div>
  );
}

/** 업종/메뉴 정보를 바탕으로 견적서 초안을 만드는 공용 드로어입니다. 신규 리드 카드·거래처 카드
 * 어디서나 열 수 있고, 저장은 하지 않고 화면에서 편집 후 엑셀로 내려받는 v1입니다. */
function QuoteDrawer({ onClose, subject }: { readonly onClose: () => void; readonly subject: QuoteSubject }) {
  const [rows, setRows] = useState<QuoteRow[]>(() => buildQuoteDraftRows(subject.industry));
  const [menuNotes, setMenuNotes] = useState(subject.menuNotes || "");

  function updateRow(id: string, patch: Partial<QuoteRow>) {
    setRows((current) => current.map((row) => (row.id === id ? { ...row, ...patch } : row)));
  }
  function addRow() {
    setRows((current) => [...current, { id: `row-${Date.now()}`, item: "", qty: 1, spec: "", unitPrice: 0 }]);
  }
  function removeRow(id: string) {
    setRows((current) => current.filter((row) => row.id !== id));
  }

  const total = rows.reduce((sum, row) => sum + row.qty * row.unitPrice, 0);

  async function downloadQuoteExcel() {
    const writeXlsxFileModule = await import("write-excel-file/browser");
    const headerRow = ["품목", "규격", "수량", "단가", "공급가액"].map((value) => ({ fontWeight: "bold" as const, value }));
    const dataRows = rows.map((row) => [
      { value: row.item },
      { value: row.spec },
      { value: row.qty },
      { value: row.unitPrice },
      { value: row.qty * row.unitPrice }
    ]);
    const totalRow = [{ value: "합계" }, { value: "" }, { value: "" }, { value: "" }, { value: total }];
    await writeXlsxFileModule
      .default([headerRow, ...dataRows, totalRow], { sheet: "견적서" })
      .toFile(`${subject.name}_견적서.xlsx`);
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div className="h-full w-full max-w-lg overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <p className="text-[11px] font-black uppercase tracking-wide text-teal-700">견적서 초안</p>
            <h3 className="mt-1 truncate text-lg font-black text-slate-950">{subject.name}</h3>
            {subject.industry ? <p className="mt-0.5 text-xs font-bold text-slate-500">{subject.industry} 업종 추천 품목으로 초안을 채웠습니다.</p> : null}
          </div>
          <button aria-label="닫기" className="maju-button-secondary h-8 w-8 shrink-0 px-0" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div>
            <p className="mb-1 text-xs font-black text-slate-700">메뉴 메모 (아는 만큼 적어두면 다음에 참고할 수 있어요)</p>
            <textarea
              className="h-16 w-full rounded-md border border-slate-200 bg-white px-2 py-1.5 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
              onChange={(event) => setMenuNotes(event.target.value)}
              placeholder="예: 김치찌개, 된장찌개, 제육볶음 등"
              value={menuNotes}
            />
          </div>

          <div className="rounded-lg border border-slate-200">
            <table className="w-full border-separate border-spacing-0 text-left text-xs">
              <thead className="bg-slate-50 text-[11px] font-black text-slate-500">
                <tr>
                  <th className="border-b border-slate-200 px-2 py-2">품목</th>
                  <th className="border-b border-slate-200 px-2 py-2">규격</th>
                  <th className="w-14 border-b border-slate-200 px-2 py-2">수량</th>
                  <th className="w-24 border-b border-slate-200 px-2 py-2">단가</th>
                  <th className="w-10 border-b border-slate-200 px-2 py-2" />
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr className="border-b border-slate-100 last:border-0" key={row.id}>
                    <td className="px-2 py-1.5">
                      <input
                        className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs font-bold outline-none focus:border-teal-300"
                        onChange={(event) => updateRow(row.id, { item: event.target.value })}
                        value={row.item}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="h-7 w-full rounded border border-slate-200 px-1.5 text-xs font-bold outline-none focus:border-teal-300"
                        onChange={(event) => updateRow(row.id, { spec: event.target.value })}
                        value={row.spec}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="h-7 w-full rounded border border-slate-200 px-1.5 text-right text-xs font-bold outline-none focus:border-teal-300"
                        onChange={(event) => updateRow(row.id, { qty: Number(event.target.value) || 0 })}
                        type="number"
                        value={row.qty}
                      />
                    </td>
                    <td className="px-2 py-1.5">
                      <input
                        className="h-7 w-full rounded border border-slate-200 px-1.5 text-right text-xs font-bold outline-none focus:border-teal-300"
                        onChange={(event) => updateRow(row.id, { unitPrice: Number(event.target.value) || 0 })}
                        type="number"
                        value={row.unitPrice}
                      />
                    </td>
                    <td className="px-2 py-1.5 text-center">
                      <button aria-label="삭제" className="text-slate-400 hover:text-rose-600" onClick={() => removeRow(row.id)} type="button">
                        <X className="h-3.5 w-3.5" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            <button className="flex w-full items-center justify-center gap-1.5 border-t border-slate-200 py-2 text-xs font-black text-teal-700 hover:bg-teal-50/50" onClick={addRow} type="button">
              <Plus className="h-3.5 w-3.5" />
              품목 추가
            </button>
          </div>

          <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2">
            <span className="text-xs font-black text-slate-600">합계</span>
            <span className="text-sm font-black text-slate-950">{total.toLocaleString()}원</span>
          </div>

          <button className="maju-button-primary w-full" onClick={() => void downloadQuoteExcel()} type="button">
            <Download className="h-4 w-4" />
            엑셀로 다운로드
          </button>
          <p className="text-[11px] font-semibold text-slate-400">
            단가는 자동으로 채워지지 않습니다 — 실제 협상가를 직접 입력한 뒤 다운로드하세요. 저장은 되지 않는 초안 도구입니다.
          </p>
        </div>
      </div>
    </div>
  );
}

const PERMIT_PERIOD_OPTIONS: Array<{ label: string; value: "all" | PermitLeadPeriod }> = [
  { label: "전체 기간", value: "all" },
  { label: "오늘 신규", value: "today" },
  { label: "이번 주 신규", value: "week" },
  { label: "이번 달 신규", value: "month" },
  { label: "최근 90일", value: "recent" }
];
const PERMIT_PERIOD_BADGE_LABEL: Record<PermitLeadPeriod, string> = {
  today: "오늘 신규",
  week: "이번 주 신규",
  month: "이번 달 신규",
  recent: "최근 90일"
};
const PERMIT_ACTION_OPTIONS = ["오늘 바로 전화", "오늘 DM 발송", "전화·DM 검토", "정보 보강", "제외 검토"];

function permitGradeToneClassName(grade: PermitLeadItem["grade"]) {
  if (grade === "A") return "bg-emerald-100 text-emerald-800";
  if (grade === "B") return "bg-blue-100 text-blue-800";
  if (grade === "C") return "bg-slate-100 text-slate-700";
  return "bg-slate-50 text-slate-400";
}

function permitLeadCompanyId() {
  return typeof window !== "undefined" ? new URLSearchParams(window.location.search).get("companyId") || "" : "";
}

function withPermitLeadCompanyQuery(path: string) {
  const companyId = permitLeadCompanyId();
  if (!companyId) return path;
  return `${path}${path.includes("?") ? "&" : "?"}companyId=${encodeURIComponent(companyId)}`;
}

// 지방행정 인허가 데이터 표준 컬럼명(공공데이터포털/LOCALDATA 기준)과 흔히 쓰는 변형을 함께 인식합니다.
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

async function parsePermitExcelFile(file: File) {
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

type PermitUploadResult = {
  duplicates: number;
  excludedInactive: number;
  excludedNonTarget: number;
  inserted: number;
  skippedNoName: number;
  total: number;
  updated: number;
};

type PermitSyncResult = {
  configured: boolean;
  opnSvcIds: string[];
  fetched: number;
  ingest: PermitUploadResult;
};

type NearbyPermitLeadResult = {
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
function PermitLeadsView({ onOpenQuote, stores }: { readonly onOpenQuote: (lead: PermitLeadItem) => void; readonly stores: StoreRow[] }) {
  const [leads, setLeads] = useState<PermitLeadItem[]>([]);
  const [queues, setQueues] = useState<PermitLeadQueues | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [viewMode, setViewMode] = useState<"table" | "map">("table");

  const [periodFilter, setPeriodFilter] = useState<"all" | PermitLeadPeriod>("all");
  const [industryFilter, setIndustryFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [hasPhoneOnly, setHasPhoneOnly] = useState(false);
  const [excludeExcluded, setExcludeExcluded] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [tableSearch, setTableSearch] = useState("");

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<PermitUploadResult | null>(null);
  const [uploadWarning, setUploadWarning] = useState("");
  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<PermitSyncResult | null>(null);
  const [syncWarning, setSyncWarning] = useState("");

  const [selectedLead, setSelectedLead] = useState<PermitLeadItem | null>(null);
  const [actionMessage, setActionMessage] = useState("");

  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [anchorMode, setAnchorMode] = useState<"customer" | "all">("customer");
  const [anchorCustomerId, setAnchorCustomerId] = useState("");
  const [radiusKm, setRadiusKm] = useState(5);
  const [nearbySearching, setNearbySearching] = useState(false);
  const [nearbyResult, setNearbyResult] = useState<NearbyPermitLeadResult | null>(null);
  const [nearbyError, setNearbyError] = useState("");
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);

  const geocodableStores = useMemo(() => stores.filter((store) => store.address?.trim()), [stores]);

  const loadLeads = useCallback(() => {
    setLoadState((current) => (current === "ready" ? current : "loading"));
    const params = new URLSearchParams();
    if (periodFilter !== "all") params.set("period", periodFilter);
    if (industryFilter) params.set("industry", industryFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (gradeFilter) params.set("grade", gradeFilter);
    if (hasPhoneOnly) params.set("hasPhone", "true");
    if (!excludeExcluded) params.set("excludeExcluded", "false");

    fetch(withPermitLeadCompanyQuery(`/api/leads/permits?${params.toString()}`), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload) {
          setLoadState("error");
          return;
        }
        setLeads(Array.isArray(payload.leads) ? payload.leads : []);
        setQueues(payload.queues || null);
        setLoadState("ready");
      })
      .catch(() => setLoadState("error"));
  }, [periodFilter, industryFilter, actionFilter, gradeFilter, hasPhoneOnly, excludeExcluded]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  const industryOptions = useMemo(() => Array.from(new Set(leads.map((lead) => lead.industryPrimary))).sort(), [leads]);

  const nearbyLeadIds = useMemo(() => new Set((nearbyResult?.leads || []).map((lead) => lead.id)), [nearbyResult]);
  const nearbyDistanceById = useMemo(() => {
    const map = new Map<string, number>();
    (nearbyResult?.leads || []).forEach((lead) => map.set(lead.id, lead.distanceKm));
    return map;
  }, [nearbyResult]);

  const filteredLeads = useMemo(() => {
    const keyword = tableSearch.trim().toLowerCase();
    return leads
      .filter((lead) => !showNearbyOnly || nearbyLeadIds.has(lead.id))
      .filter(
        (lead) =>
          !keyword ||
          [lead.businessName, lead.address, lead.phone, lead.representativeName, lead.industryPrimary]
            .filter(Boolean)
            .some((value) => String(value).toLowerCase().includes(keyword))
      );
  }, [leads, tableSearch, showNearbyOnly, nearbyLeadIds]);

  async function handleFileUpload(file: File) {
    setUploadBusy(true);
    setUploadResult(null);
    setUploadWarning("");
    try {
      const { rows, unmatchedHeaders } = await parsePermitExcelFile(file);
      if (!rows.length) {
        setUploadWarning("인식 가능한 행이 없습니다. '사업장명' 컬럼이 있는 파일인지 확인하세요.");
        return;
      }
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rows })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setUploadWarning(payload?.message || "업로드에 실패했습니다.");
        return;
      }
      setUploadResult(payload);
      if (unmatchedHeaders.length) setUploadWarning(`인식하지 못한 컬럼(무시됨): ${unmatchedHeaders.join(", ")}`);
      loadLeads();
    } catch (error) {
      setUploadWarning(error instanceof Error ? error.message : "파일을 읽지 못했습니다.");
    } finally {
      setUploadBusy(false);
    }
  }

  // 인허가 데이터 자동 수집: 수동 업로드와 같은 파이프라인을 API 호출로 대체합니다(LOCALDATA_API_KEY 필요).
  async function handleAutoSync() {
    setSyncBusy(true);
    setSyncResult(null);
    setSyncWarning("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 3 })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setSyncWarning(payload?.message || "자동 수집에 실패했습니다.");
        return;
      }
      setSyncResult(payload);
      loadLeads();
    } catch (error) {
      setSyncWarning(error instanceof Error ? error.message : "네트워크 오류로 자동 수집하지 못했습니다.");
    } finally {
      setSyncBusy(false);
    }
  }

  async function runLeadAction(lead: PermitLeadItem, actionType: "call" | "dm" | "visit" | "hold" | "exclude", result?: string) {
    setActionMessage("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, result })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setActionMessage(payload?.message || "처리에 실패했습니다.");
        return;
      }
      setActionMessage(`${lead.businessName} · "${payload.status}"로 갱신했습니다.`);
      setSelectedLead(null);
      loadLeads();
    } catch {
      setActionMessage("네트워크 오류로 처리하지 못했습니다.");
    }
  }

  async function convertToCustomer(lead: PermitLeadItem) {
    setActionMessage("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/convert`), { method: "POST" });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setActionMessage(payload?.message || "거래처 전환에 실패했습니다.");
        return;
      }
      setActionMessage(`${lead.businessName}을(를) 거래처로 전환했습니다.`);
      setSelectedLead(null);
      loadLeads();
    } catch {
      setActionMessage("네트워크 오류로 처리하지 못했습니다.");
    }
  }

  async function runNearbySearch() {
    setNearbyError("");
    if (anchorMode === "customer" && !anchorCustomerId) {
      setNearbyError("기준 거래처를 선택하세요.");
      return;
    }
    const anchorStore = geocodableStores.find((store) => store.id === anchorCustomerId);
    if (anchorMode === "customer" && !anchorStore) {
      setNearbyError("선택한 거래처에 주소 정보가 없습니다.");
      return;
    }

    setNearbySearching(true);
    setNearbyResult(null);
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/nearby"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          anchorMode,
          anchorCustomer: anchorStore ? { id: anchorStore.id, name: anchorStore.name, address: anchorStore.address } : undefined,
          radiusKm
        })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setNearbyError(payload?.message || "리드 탐색에 실패했습니다.");
        return;
      }
      setNearbyResult(payload);
      setShowNearbyOnly(true);
    } catch {
      setNearbyError("네트워크 오류로 리드 탐색을 완료하지 못했습니다.");
    } finally {
      setNearbySearching(false);
    }
  }

  async function downloadPermitLeadsExcel() {
    setActionMessage("");
    try {
      const writeXlsxFileModule = await import("write-excel-file/browser");
      const headerRow = [
        "상호명",
        "사업자번호",
        "대표자",
        "업종",
        "인허가일",
        "영업상태",
        "주소",
        "전화",
        "관할기관",
        "추천등급",
        "다음 액션",
        "상태",
        ...(showNearbyOnly && nearbyResult ? ["거리(km)"] : [])
      ].map((value) => ({ fontWeight: "bold" as const, value }));
      const dataRows = filteredLeads.map((lead) => [
        { value: lead.businessName },
        { value: lead.businessNumber || "" },
        { value: lead.representativeName || "" },
        { value: lead.industryPrimary },
        { value: lead.permitDate || "" },
        { value: lead.permitStatus || "" },
        { value: lead.address || "" },
        { value: lead.phone || "" },
        { value: lead.jurisdiction || "" },
        { value: lead.grade || "" },
        { value: lead.nextAction || "" },
        { value: lead.status },
        ...(showNearbyOnly && nearbyResult ? [{ value: nearbyDistanceById.get(lead.id) ?? "" }] : [])
      ]);
      await writeXlsxFileModule.default([headerRow, ...dataRows], { sheet: "신규 리드" }).toFile("신규_리드.xlsx");
    } catch (error) {
      setActionMessage(error instanceof Error ? error.message : "엑셀 다운로드에 실패했습니다.");
    }
  }

  const mapLeadMarkers: KakaoMapMarker[] = useMemo(() => {
    if (viewMode !== "map") return [];
    return filteredLeads
      .filter((lead) => lead.status !== "제외" && lead.address)
      .map((lead) => ({
        id: lead.id,
        name: lead.businessName,
        address: lead.address!,
        label: lead.leadPeriod === "today" ? "오늘" : lead.grade || "신규",
        tone: "lead" as const,
        grade: (lead.grade || undefined) as "A" | "B" | "C" | undefined,
        x: 0,
        y: 0
      }));
  }, [filteredLeads, viewMode]);

  const summary = queues?.summary;

  return (
    <section className="flex min-h-[480px] flex-1 flex-col gap-3 overflow-auto rounded-b-xl bg-[#f6f8fb] p-4 xl:min-h-0">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <DirectoryStat label="신규 리드" value={summary ? `${summary.active.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="오늘 신규" value={summary ? `${summary.todayNew.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="A등급" value={summary ? `${summary.gradeA.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="전화 가능" value={summary ? `${summary.hasPhone.toLocaleString()}곳` : "—"} />
      </div>

      <div className="maju-section-card">
        <button className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left" onClick={() => setUploadOpen((value) => !value)} type="button">
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-black text-slate-950">사업자 인허가 데이터 업로드</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${uploadOpen ? "rotate-180" : ""}`} />
        </button>
        {uploadOpen ? (
          <div className="space-y-2 p-3">
            <p className="text-xs font-semibold leading-5 text-slate-500">
              공공데이터포털(지방행정 인허가) 또는 자체 수집한 엑셀/CSV 파일을 업로드하세요. 사업장명, 인허가일자, 영업상태명, 업종명, 주소, 소재지전화
              컬럼을 자동으로 인식합니다. 같은 사업자번호는 최신 인허가 상태로 갱신되고, 이미 거래처로 등록된 사업자번호는 자동으로 제외 처리됩니다.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <label className="maju-button-primary inline-flex w-fit cursor-pointer">
                <Upload className="h-4 w-4" />
                {uploadBusy ? "업로드 중..." : "파일 선택"}
                <input
                  accept=".xlsx,.xls,.csv"
                  className="hidden"
                  disabled={uploadBusy}
                  onChange={(event) => {
                    const file = event.target.files?.[0];
                    if (file) void handleFileUpload(file);
                    event.target.value = "";
                  }}
                  type="file"
                />
              </label>
              <button className="maju-button-secondary inline-flex w-fit items-center gap-2" disabled={syncBusy} onClick={() => void handleAutoSync()} type="button">
                <Radar className="h-4 w-4" />
                {syncBusy ? "가져오는 중..." : "인허가 데이터 지금 가져오기(API)"}
              </button>
            </div>
            <p className="text-[11px] font-semibold leading-4 text-slate-400">
              "지금 가져오기"는 localdata.go.kr Open API로 최근 3일 변경분을 자동으로 가져옵니다. LOCALDATA_API_KEY 환경변수가 설정된 회사만
              사용할 수 있고, 매일 새벽 자동 실행도 함께 동작합니다.
            </p>
            {uploadWarning ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{uploadWarning}</p> : null}
            {uploadResult ? (
              <div className="flex flex-wrap gap-2 rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-600">
                <span>총 {uploadResult.total.toLocaleString()}행</span>
                <span className="text-emerald-700">신규 {uploadResult.inserted.toLocaleString()}</span>
                <span className="text-blue-700">갱신 {uploadResult.updated.toLocaleString()}</span>
                <span className="text-slate-500">기존 거래처 중복 {uploadResult.duplicates.toLocaleString()}</span>
                <span className="text-slate-500">비활성 제외 {uploadResult.excludedInactive.toLocaleString()}</span>
                <span className="text-slate-500">비대상 업종 제외 {uploadResult.excludedNonTarget.toLocaleString()}</span>
                {uploadResult.skippedNoName ? <span className="text-rose-600">상호명 없음 건너뜀 {uploadResult.skippedNoName.toLocaleString()}</span> : null}
              </div>
            ) : null}
            {syncWarning ? <p className="rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">{syncWarning}</p> : null}
            {syncResult ? (
              <div className="flex flex-wrap gap-2 rounded-md bg-teal-50 p-3 text-xs font-bold text-teal-800">
                <span>업종 {syncResult.opnSvcIds.length}종 · 수신 {syncResult.fetched.toLocaleString()}행</span>
                <span className="text-emerald-700">신규 {syncResult.ingest.inserted.toLocaleString()}</span>
                <span className="text-blue-700">갱신 {syncResult.ingest.updated.toLocaleString()}</span>
                <span className="text-slate-500">기존 거래처 중복 {syncResult.ingest.duplicates.toLocaleString()}</span>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="maju-section-card">
        <button className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left" onClick={() => setNearbyOpen((value) => !value)} type="button">
          <span className="flex items-center gap-2">
            <Crosshair className="h-4 w-4 text-teal-600" />
            <span className="text-sm font-black text-slate-950">리드 탐색 · AI 영업 세일즈</span>
            <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-700 ring-1 ring-inset ring-teal-100">
              기존 거래처 반경 안 신규 인허가
            </span>
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${nearbyOpen ? "rotate-180" : ""}`} />
        </button>
        {nearbyOpen ? (
          <div className="space-y-3 p-3">
            <p className="text-xs font-semibold leading-5 text-slate-500">
              기존 거래처 1곳 또는 전체 거래처를 기준으로, 지정한 반경 안에 새로 인허가된 사업장이 있는지 찾습니다. 결과는 아래 표에서 거리순으로
              바로 확인할 수 있습니다.
            </p>
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex h-9 items-center rounded-lg border border-slate-200 bg-slate-50 p-1">
                {[
                  { label: "거래처 1곳 기준", value: "customer" as const },
                  { label: "전체 거래처 합집합", value: "all" as const }
                ].map((item) => (
                  <button
                    className={`h-7 rounded-md px-3 text-xs font-black transition ${
                      anchorMode === item.value ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-white hover:text-slate-900"
                    }`}
                    key={item.value}
                    onClick={() => setAnchorMode(item.value)}
                    type="button"
                  >
                    {item.label}
                  </button>
                ))}
              </div>
              {anchorMode === "customer" ? (
                <select
                  className="h-9 min-w-[220px] rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setAnchorCustomerId(event.target.value)}
                  value={anchorCustomerId}
                >
                  <option value="">기준 거래처 선택</option>
                  {geocodableStores.map((store) => (
                    <option key={store.id} value={store.id}>
                      {store.name} · {store.address}
                    </option>
                  ))}
                </select>
              ) : (
                <span className="rounded-md bg-slate-50 px-3 py-1.5 text-xs font-bold text-slate-500 ring-1 ring-inset ring-slate-200">
                  주소가 확인된 거래처 {geocodableStores.length.toLocaleString()}곳 기준
                </span>
              )}
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                반경
                <input
                  className="h-9 w-20 rounded-md border border-slate-200 bg-white px-2 text-center text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  min={0.5}
                  max={50}
                  onChange={(event) => setRadiusKm(Number(event.target.value) || 5)}
                  step={0.5}
                  type="number"
                  value={radiusKm}
                />
                km
              </label>
              <button className="maju-button-primary h-9 text-xs" disabled={nearbySearching} onClick={() => void runNearbySearch()} type="button">
                <Crosshair className="h-3.5 w-3.5" />
                {nearbySearching ? "탐색 중..." : "탐색"}
              </button>
              {nearbyResult ? (
                <button
                  className="maju-button-secondary h-9 text-xs"
                  onClick={() => {
                    setNearbyResult(null);
                    setShowNearbyOnly(false);
                  }}
                  type="button"
                >
                  탐색 결과 지우기
                </button>
              ) : null}
            </div>
            {nearbyError ? <p className="rounded-md bg-rose-50 px-3 py-2 text-xs font-bold text-rose-700">{nearbyError}</p> : null}
            {nearbyResult ? (
              <div className="flex flex-wrap items-center gap-2 rounded-md bg-teal-50/70 px-3 py-2 text-xs font-bold text-teal-800">
                <span>
                  기준 {nearbyResult.anchorCount.toLocaleString()}곳 · 반경 {nearbyResult.radiusKm}km 안 리드 {nearbyResult.leads.length.toLocaleString()}곳
                </span>
                {nearbyResult.unresolvedAnchorCount ? <span className="text-amber-700">주소 확인 실패 거래처 {nearbyResult.unresolvedAnchorCount}곳</span> : null}
                {nearbyResult.unresolvedLeadCount ? <span className="text-amber-700">주소 확인 실패 리드 {nearbyResult.unresolvedLeadCount}곳</span> : null}
                <label className="ml-auto flex items-center gap-1.5">
                  <input checked={showNearbyOnly} onChange={(event) => setShowNearbyOnly(event.target.checked)} type="checkbox" />
                  표에 탐색 결과만 표시
                </label>
              </div>
            ) : null}
          </div>
        ) : null}
      </div>

      <div className="maju-section-card flex-1 overflow-hidden">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["table", "map"] as const).map((mode) => (
              <button
                className={`rounded-md border px-3 py-1.5 text-xs font-black transition ${
                  viewMode === mode ? "border-slate-900 bg-slate-900 text-white" : "border-transparent bg-white text-slate-600 hover:bg-slate-50"
                }`}
                key={mode}
                onClick={() => setViewMode(mode)}
                type="button"
              >
                {mode === "table" ? "표" : "지도"}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-1.5">
            <button className="maju-button-secondary h-8 text-xs" onClick={() => void downloadPermitLeadsExcel()} type="button">
              <Download className="h-3.5 w-3.5" />
              엑셀 다운로드
            </button>
            <button className="maju-button-secondary h-8 text-xs" onClick={loadLeads} type="button">
              <RefreshCw className="h-3.5 w-3.5" />
              새로고침
            </button>
          </div>
        </div>

        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="maju-search-field relative h-9 min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-full w-full border-0 bg-transparent pl-6 pr-0 text-xs font-bold text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:border-0 focus:ring-0"
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="상호명·주소·전화 검색"
                value={tableSearch}
              />
            </label>
            <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setPeriodFilter(event.target.value as "all" | PermitLeadPeriod)} value={periodFilter}>
              {PERMIT_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setIndustryFilter(event.target.value)} value={industryFilter}>
              <option value="">업종 전체</option>
              {industryOptions.map((industry) => (
                <option key={industry} value={industry}>
                  {industry}
                </option>
              ))}
            </select>
            <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setActionFilter(event.target.value)} value={actionFilter}>
              <option value="">액션 전체</option>
              {PERMIT_ACTION_OPTIONS.map((action) => (
                <option key={action} value={action}>
                  {action}
                </option>
              ))}
            </select>
            <button
              className="flex items-center gap-1 rounded-md border border-transparent px-2 py-1.5 text-xs font-black text-slate-500 hover:bg-slate-100"
              onClick={() => setShowAdvancedFilters((value) => !value)}
              type="button"
            >
              <ListFilter className="h-3.5 w-3.5" />
              고급 필터
              <ChevronDown className={`h-3.5 w-3.5 transition ${showAdvancedFilters ? "rotate-180" : ""}`} />
            </button>
          </div>
          {showAdvancedFilters ? (
            <div className="flex flex-wrap items-center gap-3 border-t border-slate-200/80 pt-2">
              <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setGradeFilter(event.target.value)} value={gradeFilter}>
                <option value="">추천 등급 전체</option>
                <option value="A">A등급</option>
                <option value="B">B등급</option>
                <option value="C">C등급</option>
              </select>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <input checked={hasPhoneOnly} onChange={(event) => setHasPhoneOnly(event.target.checked)} type="checkbox" />
                연락처 있는 곳만
              </label>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <input checked={!excludeExcluded} onChange={(event) => setExcludeExcluded(!event.target.checked)} type="checkbox" />
                제외 처리된 리드도 표시
              </label>
            </div>
          ) : null}
        </div>

        {actionMessage ? <p className="mx-3 mt-3 rounded-md bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{actionMessage}</p> : null}

        <div className="p-3">
          {loadState === "loading" ? (
            <p className="rounded-md border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500">신규 리드를 불러오는 중입니다.</p>
          ) : loadState === "error" ? (
            <p className="rounded-md border border-dashed border-rose-200 bg-rose-50 p-8 text-center text-sm font-bold text-rose-700">
              신규 리드를 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.
            </p>
          ) : !filteredLeads.length ? (
            <div className="rounded-md border border-dashed border-slate-200 p-8 text-center">
              <p className="text-sm font-bold text-slate-600">{leads.length ? "조건에 맞는 리드가 없습니다." : "아직 등록된 신규 리드가 없습니다."}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">사업자 인허가 데이터를 업로드하면 여기에 표시됩니다.</p>
            </div>
          ) : viewMode === "map" ? (
            <div className="h-[560px] overflow-hidden rounded-lg border border-slate-200">
              <KakaoAddressMap mapClassName="h-full w-full rounded-none border-0" markers={mapLeadMarkers} onMarkerClick={(marker) => setSelectedLead(filteredLeads.find((lead) => lead.id === marker.id) || null)} showList={false} />
            </div>
          ) : (
            <div className="max-h-[calc(100vh-360px)] overflow-auto rounded-lg border border-slate-200">
              <table className="w-full min-w-[980px] border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs font-black text-slate-500 shadow-[0_1px_0_#e2e8f0] backdrop-blur">
                  <tr>
                    <th className="w-[26%] border-r border-slate-200 px-4 py-3">거래처</th>
                    <th className="w-[90px] border-r border-slate-200 px-4 py-3">업종</th>
                    <th className="w-[72px] border-r border-slate-200 px-4 py-3">등급</th>
                    <th className="w-[130px] border-r border-slate-200 px-4 py-3">전화</th>
                    <th className="w-[110px] border-r border-slate-200 px-4 py-3">인허가일</th>
                    <th className="w-[140px] border-r border-slate-200 px-4 py-3">다음 액션</th>
                    {showNearbyOnly && nearbyResult ? <th className="w-[90px] border-r border-slate-200 px-4 py-3 text-right">거리</th> : null}
                    <th className="px-4 py-3">상태</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredLeads.map((lead) => (
                    <tr
                      className="cursor-pointer bg-white transition hover:bg-slate-50"
                      key={lead.id}
                      onClick={() => setSelectedLead(lead)}
                      onKeyDown={(event) => {
                        if (event.key === "Enter" || event.key === " ") setSelectedLead(lead);
                      }}
                      role="button"
                      tabIndex={0}
                    >
                      <td className="min-w-0 border-r border-slate-100 px-4 py-3">
                        <p className="truncate font-black text-slate-950">{lead.businessName}</p>
                        <p className="mt-1 truncate text-xs font-bold text-slate-500">{lead.address || "주소 확인 필요"}</p>
                      </td>
                      <td className="max-w-[90px] truncate border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{lead.industryPrimary}</td>
                      <td className="border-r border-slate-100 px-4 py-3">
                        <Badge className={`px-1.5 py-0 text-[10px] ${permitGradeToneClassName(lead.grade)}`}>{lead.grade || "-"}</Badge>
                      </td>
                      <td className="border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{lead.phone || "미확인"}</td>
                      <td className="border-r border-slate-100 px-4 py-3 font-bold text-slate-500">{lead.permitDate || "-"}</td>
                      <td className="border-r border-slate-100 px-4 py-3 font-bold text-slate-700">{lead.nextAction || "-"}</td>
                      {showNearbyOnly && nearbyResult ? (
                        <td className="border-r border-slate-100 px-4 py-3 text-right font-black text-teal-700">
                          {nearbyDistanceById.get(lead.id)?.toLocaleString() ?? "-"}km
                        </td>
                      ) : null}
                      <td className="px-4 py-3">
                        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">{lead.status}</span>
                        {lead.leadPeriod === "today" ? (
                          <span className="ml-1 rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700">
                            {PERMIT_PERIOD_BADGE_LABEL[lead.leadPeriod]}
                          </span>
                        ) : null}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {selectedLead ? (
        <PermitLeadDetailPanel
          lead={selectedLead}
          onAction={runLeadAction}
          onClose={() => setSelectedLead(null)}
          onConvert={convertToCustomer}
          onOpenQuote={onOpenQuote}
        />
      ) : null}
    </section>
  );
}

function PermitLeadDetailPanel({
  lead,
  onAction,
  onClose,
  onConvert,
  onOpenQuote
}: {
  readonly lead: PermitLeadItem;
  readonly onAction: (lead: PermitLeadItem, actionType: "call" | "dm" | "visit" | "hold" | "exclude", result?: string) => void;
  readonly onClose: () => void;
  readonly onConvert: (lead: PermitLeadItem) => void;
  readonly onOpenQuote: (lead: PermitLeadItem) => void;
}) {
  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/30" onClick={onClose}>
      <div className="h-full w-full max-w-sm overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Badge className={`px-1.5 py-0 text-[10px] ${permitGradeToneClassName(lead.grade)}`}>{lead.grade ? `${lead.grade}등급` : "등급 미산정"}</Badge>
              <span className="text-[11px] font-black text-slate-400">{PERMIT_PERIOD_BADGE_LABEL[lead.leadPeriod]}</span>
            </span>
            <h3 className="mt-1 truncate text-lg font-black text-slate-950">{lead.businessName}</h3>
            <p className="mt-0.5 truncate text-xs font-bold text-slate-500">
              {lead.industryPrimary}
              {lead.permitStatus ? ` · ${lead.permitStatus}` : ""}
            </p>
          </div>
          <button aria-label="닫기" className="maju-button-secondary h-8 w-8 shrink-0 px-0" onClick={onClose} type="button">
            <X className="h-4 w-4" />
          </button>
        </div>

        <div className="space-y-3 p-4">
          <div className="rounded-lg border border-slate-200 p-3 text-xs font-bold text-slate-600">
            <PermitDetailRow label="주소" value={lead.address || "확인 필요"} />
            <PermitDetailRow label="전화" value={lead.phone || "확인 필요"} />
            <PermitDetailRow label="대표자" value={lead.representativeName || "확인 필요"} />
            <PermitDetailRow label="인허가일" value={lead.permitDate || "확인 필요"} />
            <PermitDetailRow label="관할기관" value={lead.jurisdiction || "확인 필요"} />
          </div>

          {lead.nextActionReasons.length ? (
            <div className="rounded-lg border border-teal-100 bg-teal-50/60 p-3">
              <p className="text-[11px] font-black uppercase tracking-wide text-teal-700">추천 근거</p>
              <ul className="mt-1.5 space-y-1 text-xs font-bold text-teal-900">
                {lead.nextActionReasons.slice(0, 3).map((reason) => (
                  <li key={reason}>· {reason}</li>
                ))}
              </ul>
            </div>
          ) : null}

          {lead.isDuplicate || lead.excludeReason ? (
            <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold text-amber-800">제외 사유: {lead.excludeReason}</p>
          ) : null}

          <p className="text-[11px] font-semibold text-slate-400">현재 상태: {lead.status}</p>

          <div className="grid grid-cols-2 gap-2">
            <PermitActionButton disabled={!lead.phone} icon={Phone} label="전화" onClick={() => onAction(lead, "call", "통화 성공")} />
            <PermitActionButton icon={MessageCircle} label="DM 발송" onClick={() => onAction(lead, "dm")} />
            <PermitActionButton icon={MapPin} label="방문 예정" onClick={() => onAction(lead, "visit", "다음 방문")} />
            <PermitActionButton icon={CircleSlash} label="보류" onClick={() => onAction(lead, "hold")} />
          </div>
          <button className="maju-button-secondary w-full" onClick={() => onOpenQuote(lead)} type="button">
            견적서 작성
          </button>
          <button className="maju-button-primary w-full" onClick={() => onConvert(lead)} type="button">
            <UserCheck className="h-4 w-4" />
            거래처로 전환
          </button>
          <button className="maju-button-secondary w-full text-rose-600" onClick={() => onAction(lead, "exclude", "제외")} type="button">
            영업 제외
          </button>
        </div>
      </div>
    </div>
  );
}

function PermitDetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="truncate text-right text-slate-800">{value}</span>
    </p>
  );
}

function PermitActionButton({ disabled, icon: Icon, label, onClick }: { readonly disabled?: boolean; readonly icon: LucideIcon; readonly label: string; readonly onClick: () => void }) {
  return (
    <button className="maju-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={onClick} type="button">
      <Icon className="h-4 w-4" />
      {label}
    </button>
  );
}

function TodayCourseView({
  dataRegistrationHref,
  markers,
  onPreviewStore,
  onSummaryChange,
  onSelectStore,
  onSelectVehicle,
  routeTotals,
  selectedStoreId,
  selectedVehicle,
  selectedVehicleId,
  sourceReady,
  stores,
  vehicles
}: {
  readonly dataRegistrationHref: string;
  readonly markers: KakaoMapMarker[];
  readonly onPreviewStore: (storeId: string) => void;
  readonly onSummaryChange: (summary: CourseSummary) => void;
  readonly onSelectStore: (storeId: string) => void;
  readonly onSelectVehicle: (vehicleId: string) => void;
  readonly routeTotals: { distanceKm: number; durationMinutes: number; expectedRevenue: number };
  readonly selectedStoreId: string;
  readonly selectedVehicle?: DeliveryVehicle;
  readonly selectedVehicleId: string;
  readonly sourceReady: boolean;
  readonly stores: StoreRow[];
  readonly vehicles: DeliveryVehicle[];
}) {
  const [routeSequence, setRouteSequence] = useState<RouteSequence | null>(null);
  const [routeBatchIndex, setRouteBatchIndex] = useState(0);
  const [routePanelCollapsed, setRoutePanelCollapsed] = useState(false);
  const [routeLeftPanelCollapsed, setRouteLeftPanelCollapsed] = useState(false);
  const [routeQuery, setRouteQuery] = useState("");
  const [routeSelectedStoreId, setRouteSelectedStoreId] = useState("");
  const [selectedRouteStoreIds, setSelectedRouteStoreIds] = useState<string[]>([]);
  const [routeOriginMode, setRouteOriginMode] = useState<"company" | "current">("company");
  const [currentLocationOrigin, setCurrentLocationOrigin] = useState("");
  const [currentLocationMessage, setCurrentLocationMessage] = useState("");
  const [deliveryProofs, setDeliveryProofs] = useState<Record<string, DeliveryProof[]>>(() => readLocalJson(localStoreKeys.deliveryProofs, {}));
  const isVehicleScoped = selectedVehicleId !== "all";
  const selectedDriver = selectedVehicle?.driver || "배송차 선택 필요";
  const orderedStores = [...stores].sort((a, b) => a.order - b.order);
  const orderedStoreIds = orderedStores.map((store) => store.id).join("|");
  const selectedRouteIdSet = new Set(selectedRouteStoreIds);
  const selectedRouteStoresAll = orderedStores.filter((store) => selectedRouteIdSet.has(store.id));
  const routeBatchCount = Math.max(1, Math.ceil(selectedRouteStoresAll.length / tmapWaypointLimit));
  const activeRouteBatchIndex = Math.min(routeBatchIndex, routeBatchCount - 1);
  const routeBatchStart = activeRouteBatchIndex * tmapWaypointLimit;
  const selectedRouteStores = selectedRouteStoresAll.slice(routeBatchStart, routeBatchStart + tmapWaypointLimit);
  const activeRouteIdSet = new Set(selectedRouteStores.map((store) => store.id));
  const selectedRouteTotals = getStoreTotals(selectedRouteStores);
  const routeDistanceKm = routeSequence?.totalDistanceKm ?? selectedRouteTotals.distanceKm;
  const routeDurationMinutes = routeSequence?.totalDurationMinutes ?? selectedRouteTotals.durationMinutes;
  const routeRevenue = selectedRouteTotals.expectedRevenue;
  const routeRoadPointCount = routeSequence ? countFiniteRoutePoints(routeSequence.path) : 0;
  const tmapLegCount = routeSequence?.legs.filter((leg) => leg.provider === "tmap").length || 0;
  const inactiveSelectedCount = Math.max(0, selectedRouteStoresAll.length - selectedRouteStores.length);
  const routeCandidateStores = isVehicleScoped
    ? orderedStores.filter((store) => {
        const keyword = routeQuery.trim().toLowerCase();
        if (!keyword) return true;
        return `${store.name} ${store.address || ""} ${store.region} ${store.deliveryDriver || ""}`.toLowerCase().includes(keyword);
      })
    : [];
  const routeSelectedStore = orderedStores.find((store) => store.id === routeSelectedStoreId) || routeCandidateStores[0] || orderedStores[0];
  const originMarker = markers.find((marker) => marker.tone === "origin");
  const routeOriginAddress = routeOriginMode === "current" && currentLocationOrigin ? currentLocationOrigin : originMarker?.address || "";
  const routeOriginLabel = routeOriginMode === "current" && currentLocationOrigin ? "현위치 출발" : "회사 출발지";
  // 티맵 계산이 이미 좌표를 구했다면(routeSequence.stopPoints) 매장별 길찾기가 다시 지오코딩하지
  // 않고 그 좌표를 그대로 재사용하도록 주소 -> 좌표 맵을 만들어둡니다.
  const routeStopPointByAddress = new Map<string, GeoPoint | null>(
    (routeSequence?.stops || []).map((address, index) => [address, routeSequence?.stopPoints?.[index] || null])
  );
  const sequencedRouteStores = routeSequence?.stops.length
    ? routeSequence.stops
        .map((address) => selectedRouteStores.find((store) => getRouteStopAddress(store) === address))
        .filter((store): store is StoreRow => Boolean(store))
    : selectedRouteStores;
  const routeMapMarkers = [
    ...(originMarker
      ? [
          {
            ...originMarker,
            label: "출발",
            name: routeOriginLabel
          }
        ]
      : []),
    ...sequencedRouteStores.map((store, index) => {
      const marker = markers.find((item) => item.id === store.id);
      return {
        address: marker?.address || store.address || store.region,
        id: store.id,
        label: String(index + 1),
        name: `${index + 1}. ${store.name}`,
        tone: "customer" as const,
        x: marker?.x ?? store.markerX,
        y: marker?.y ?? store.markerY
      };
    })
  ];

  useEffect(() => {
    setRouteSequence(null);
    setRouteBatchIndex(0);
    if (!isVehicleScoped) {
      setSelectedRouteStoreIds([]);
      setRouteSelectedStoreId("");
      return;
    }
    setSelectedRouteStoreIds(orderedStores.slice(0, tmapWaypointLimit).map((store) => store.id));
    setRouteSelectedStoreId(orderedStores[0]?.id || "");
  }, [isVehicleScoped, orderedStoreIds, selectedVehicleId]);

  useEffect(() => {
    setRouteSequence(null);
    setRouteBatchIndex((current) => Math.min(current, Math.max(0, Math.ceil(selectedRouteStoreIds.length / tmapWaypointLimit) - 1)));
  }, [selectedRouteStoreIds]);

  useEffect(() => {
    onSummaryChange({
      distanceKm: routeDistanceKm,
      durationMinutes: routeDurationMinutes,
      expectedRevenue: routeRevenue,
      selectedCount: selectedRouteStores.length
    });
  }, [onSummaryChange, routeDistanceKm, routeDurationMinutes, routeRevenue, selectedRouteStores.length]);

  useEffect(() => saveLocalJson(localStoreKeys.deliveryProofs, deliveryProofs), [deliveryProofs]);

  if (!sourceReady) {
    return (
      <section className="min-h-[620px] rounded-b-xl bg-[#f6f8fb] p-4">
        <OperationalEmptyState
          actionHref={dataRegistrationHref}
          actionLabel="거래처 등록"
          description="거래처 주소와 배송차 배정값을 등록하세요."
          title="경유 코스 계산 대기"
        />
      </section>
    );
  }

  const toggleRouteStore = (storeId: string) => {
    setSelectedRouteStoreIds((current) => {
      if (current.includes(storeId)) return current.filter((id) => id !== storeId);
      return [...current, storeId];
    });
  };
  const selectDefaultRouteStores = () => {
    setRouteBatchIndex(0);
    setSelectedRouteStoreIds(orderedStores.slice(0, tmapWaypointLimit).map((store) => store.id));
  };
  const selectAllRouteStores = () => {
    setRouteBatchIndex(0);
    setSelectedRouteStoreIds(orderedStores.map((store) => store.id));
  };
  const clearRouteStores = () => {
    setRouteSequence(null);
    setRouteBatchIndex(0);
    setSelectedRouteStoreIds([]);
  };
  const goToPreviousRouteBatch = () => {
    setRouteSequence(null);
    setRouteBatchIndex((current) => Math.max(0, current - 1));
  };
  const goToNextRouteBatch = () => {
    setRouteSequence(null);
    setRouteBatchIndex((current) => Math.min(routeBatchCount - 1, current + 1));
  };
  const openRouteStore = (storeId: string) => {
    setRouteSelectedStoreId(storeId);
  };
  const useCurrentLocationAsOrigin = () => {
    if (typeof navigator === "undefined" || !navigator.geolocation) {
      setCurrentLocationMessage("이 브라우저에서는 현위치 기능을 사용할 수 없습니다.");
      return;
    }

    setCurrentLocationMessage("현위치를 확인 중입니다.");
    navigator.geolocation.getCurrentPosition(
      (position) => {
        const lat = roundToSix(position.coords.latitude);
        const lng = roundToSix(position.coords.longitude);
        setCurrentLocationOrigin(`${lat},${lng}`);
        setRouteOriginMode("current");
        setRouteSequence(null);
        setCurrentLocationMessage("현위치를 출발 기준으로 설정했습니다.");
      },
      () => {
        setRouteOriginMode("company");
        setCurrentLocationMessage("현위치 권한을 받을 수 없어 회사 출발지를 사용합니다.");
      },
      { enableHighAccuracy: true, maximumAge: 60000, timeout: 8000 }
    );
  };
  const saveDeliveryProof = async (storeId: string, proof: DeliveryProofInput) => {
    let persisted = false;
    const memo = `${proof.memo}\n\n배송 상태: ${deliveryStatusLabel(proof.deliveryStatus)}\n알림 방식: ${proof.messageChannel === "kakao" ? "카톡 발송 대기" : "문자 발송 대기"}${proof.fileName ? `\n증빙 파일: ${proof.fileName}` : ""}`;

    try {
      const noteRequest = fetch("/api/customer-operations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action: "note",
          customerId: storeId,
          memo,
          nextAction: proof.messageChannel === "kakao" ? "카카오 알림톡 발송" : "문자 발송",
          noteType: "delivery"
        })
      });
      const attachmentRequest = proof.file
        ? uploadDeliveryProofFile(storeId, proof.file, proof.fileName || "배송완료 증빙")
        : fetch("/api/customer-operations", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
              action: "attachment",
              attachmentType: "delivery_proof",
              customerId: storeId,
              fileUrl: "",
              mimeType: proof.fileName.toLowerCase().match(/\.(mp4|mov|webm)$/) ? "video/*" : "image/*",
              title: proof.fileName || "배송완료 증빙"
            })
          });
      const [noteResponse, attachmentResponse] = await Promise.all([noteRequest, attachmentRequest]);

      persisted = noteResponse.ok && attachmentResponse.ok;
    } catch {
      persisted = false;
    }

    setDeliveryProofs((current) => ({
      ...current,
      [storeId]: [
        {
          ...proof,
          persisted,
          recordedAt: new Date().toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" }),
          storeId
        },
        ...(current[storeId] || [])
      ]
    }));
  };

  // 좌측(경유 코스 목록)·우측(경유 순서) 패널을 각각 독립적으로 접었다 펼 수 있어 4가지 조합이 나옵니다.
  // Tailwind가 클래스를 정적으로 스캔할 수 있도록 조합별 전체 클래스 문자열을 그대로 나열합니다.
  const routeGridColsClassName = routeLeftPanelCollapsed
    ? routePanelCollapsed
      ? "xl:grid-cols-[56px_minmax(0,1fr)_56px]"
      : "xl:grid-cols-[56px_minmax(0,1fr)_400px]"
    : routePanelCollapsed
      ? "xl:grid-cols-[280px_minmax(0,1fr)_56px]"
      : "xl:grid-cols-[280px_minmax(0,1fr)_400px]";

  return (
    <section className={`grid min-h-[480px] flex-1 grid-cols-1 overflow-hidden rounded-b-xl bg-[#f6f8fb] xl:min-h-0 ${routeGridColsClassName}`}>
      <aside className="flex h-full min-h-0 flex-col border-r border-slate-200/80 bg-white">
        {routeLeftPanelCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
            <button
              aria-label="경유 코스 목록 패널 열기"
              className="maju-button-secondary h-10 w-10 px-0"
              onClick={() => setRouteLeftPanelCollapsed(false)}
              type="button"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="[writing-mode:vertical-rl] text-xs font-black text-slate-500">경유 코스</div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{vehicles.length}</span>
          </div>
        ) : (
          <>
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">경유 코스</p>
                <p className="mt-1 text-xs font-bold text-slate-500">차량을 고른 뒤 경유 거래처를 계산합니다.</p>
              </div>
              <button
                aria-label="경유 코스 목록 패널 접기"
                className="maju-button-secondary h-9 w-9 shrink-0 px-0"
                onClick={() => setRouteLeftPanelCollapsed(true)}
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="border-b border-slate-200/80 p-3">
              <div className="maju-panel bg-slate-50 p-3">
                <p className="text-xs font-black text-slate-500">실사용 순서</p>
                <div className="mt-3 grid gap-2">
                  <RouteWorkStep active={!isVehicleScoped} done={isVehicleScoped} label="배송차 선택" />
                  <RouteWorkStep active={isVehicleScoped && selectedRouteStores.length > 0} done={isVehicleScoped && selectedRouteStores.length > 0} label="경유 거래처 선택" />
                  <RouteWorkStep active={isVehicleScoped && selectedRouteStores.length > 0 && !routeSequence} done={Boolean(routeSequence)} label="티맵 도로 계산" />
                  <RouteWorkStep active={Boolean(routeSequence)} done={Boolean(routeSequence)} label="코스 확인" />
                </div>
              </div>
            </div>
            <div className="min-h-0 flex-1 space-y-2 overflow-auto p-3">
              <button
                className={`w-full rounded-md border p-3 text-left transition ${selectedVehicleId === "all" ? "border-slate-900 bg-slate-50 ring-1 ring-slate-900/5" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                onClick={() => onSelectVehicle("all")}
                type="button"
              >
                <div className="flex items-center justify-between gap-2">
                  <p className="text-sm font-black text-slate-950">전체 거래처 보기</p>
                  <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-blue-700 ring-1 ring-inset ring-blue-200">{stores.length}곳</span>
                </div>
                <p className="mt-1 text-xs font-bold text-slate-500">전체 위치 확인용 · 경유 계산은 차량 선택 후 진행</p>
              </button>
              {vehicles.map((vehicle) => (
                <button
                  className={`w-full rounded-md border p-3 text-left transition ${selectedVehicleId === vehicle.id ? "border-emerald-300 bg-emerald-50" : "border-slate-200 bg-white hover:bg-slate-50"}`}
                  key={vehicle.id}
                  onClick={() => onSelectVehicle(vehicle.id)}
                  type="button"
                >
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-sm font-black text-slate-950">{vehicle.name}</p>
                    <span className="rounded-full bg-white px-2 py-0.5 text-xs font-black text-emerald-700 ring-1 ring-inset ring-emerald-200">{vehicle.stops.length}곳</span>
                  </div>
                  <p className="mt-1 text-xs font-bold text-slate-500">{vehicle.driver} · {vehicle.area}</p>
                </button>
              ))}
            </div>
          </>
        )}
      </aside>

      <div className="relative h-[620px] min-h-0 min-w-0 bg-slate-100 xl:h-full">
        <div className="h-full min-h-0 [&>div]:h-full">
          <KakaoAddressMap
            focusedMarkerId={routeSelectedStoreId || selectedStoreId || undefined}
            mapClassName="h-full min-h-[620px] rounded-none border-0 xl:min-h-0"
            markers={routeMapMarkers}
            onMarkerClick={(marker) => {
              if (!marker.id || marker.tone === "origin") return;
              openRouteStore(marker.id);
              onPreviewStore(marker.id);
            }}
            routePath={routeSequence?.path || []}
            showList={false}
          />
        </div>
        {routeSelectedStoreId && routeSelectedStore ? (
          <StoreQuickCard
            onClose={() => setRouteSelectedStoreId("")}
            onOpenDetail={() => onSelectStore(routeSelectedStore.id)}
            originAddress={routeOriginAddress}
            store={routeSelectedStore}
            variant="grid"
          />
        ) : null}
      </div>

      <aside className="min-h-0 border-l border-slate-200/80 bg-white">
        {routePanelCollapsed ? (
          <div className="flex h-full flex-col items-center gap-3 px-2 py-3">
            <button
              aria-label="경유 코스 패널 열기"
              className="maju-button-secondary h-10 w-10 px-0"
              onClick={() => setRoutePanelCollapsed(false)}
              type="button"
            >
              <PanelLeftOpen className="h-4 w-4" />
            </button>
            <div className="[writing-mode:vertical-rl] text-xs font-black text-slate-500">경유 코스</div>
            <span className="rounded-full bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{selectedRouteStores.length}</span>
          </div>
        ) : (
          <div className="flex h-full min-h-0 flex-col">
            <div className="flex items-start justify-between gap-3 border-b border-slate-200/80 px-4 py-3">
              <div className="min-w-0">
                  <p className="text-sm font-black text-slate-950">{selectedDriver} 경유 순서</p>
                  <p className="mt-1 text-xs font-bold text-slate-500">
                  선택 {selectedRouteStoresAll.length}곳 · 계산 {selectedRouteStores.length}/{tmapWaypointLimit}곳 · 경유 {routeDistanceKm.toLocaleString()}km · {formatMinutes(routeDurationMinutes)}
                </p>
              </div>
              <button
                aria-label="경유 코스 패널 접기"
                className="maju-button-secondary h-9 w-9 shrink-0 px-0"
                onClick={() => setRoutePanelCollapsed(true)}
                type="button"
              >
                <PanelLeftClose className="h-4 w-4" />
              </button>
            </div>
            <div className="min-h-0 flex-1 overflow-auto">
              <div className="border-b border-slate-200/80 p-3">
                <div className="maju-panel mb-3 p-3">
                  <div className="flex items-start justify-between gap-3">
                    <div>
                      <p className="text-sm font-black text-slate-950">출발 기준</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        회사 출발지 또는 현재 위치에서 바로 경유 계산을 시작할 수 있습니다.
                      </p>
                    </div>
                    <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-700">{routeOriginLabel}</span>
                  </div>
                  <div className="mt-3 grid grid-cols-2 gap-2">
                    <button
                      className={`h-9 rounded-md border px-3 text-xs font-black transition ${
                        routeOriginMode === "company" ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-slate-50 text-slate-700 hover:bg-white"
                      }`}
                      onClick={() => {
                        setRouteOriginMode("company");
                        setRouteSequence(null);
                      }}
                      type="button"
                    >
                      회사 출발지
                    </button>
                    <button
                      className={`h-9 rounded-md border px-3 text-xs font-black transition ${
                        routeOriginMode === "current" ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:border-slate-300 hover:bg-slate-50"
                      }`}
                      onClick={useCurrentLocationAsOrigin}
                      type="button"
                    >
                      현위치 출발
                    </button>
                  </div>
                  <p className="mt-2 truncate text-xs font-bold text-slate-500" title={routeOriginAddress || currentLocationMessage}>
                    {currentLocationMessage || (routeOriginMode === "current" ? routeOriginAddress || "현위치를 먼저 확인하세요." : originMarker?.address || "회사 출발지 확인 필요")}
                  </p>
                </div>
                <div className="mb-3 grid grid-cols-3 gap-2">
                  <RouteMetric label="계산 대상" value={`${selectedRouteStores.length}곳`} />
                  <RouteMetric label={routeSequence ? "티맵 경유 거리" : "출발지-거래처 거리합"} value={`${routeDistanceKm.toLocaleString()}km`} />
                  <RouteMetric label={routeSequence ? "티맵 경유 시간" : "출발지 기준 시간합"} value={formatMinutes(routeDurationMinutes)} />
                </div>
                <div className={`mb-3 rounded-md border p-3 ${routeSequence ? "border-emerald-200 bg-emerald-50" : isVehicleScoped && selectedRouteStores.length ? "border-slate-200 bg-slate-50" : "border-amber-200 bg-amber-50"}`}>
                  <p className={`text-sm font-black ${routeSequence ? "text-emerald-800" : isVehicleScoped && selectedRouteStores.length ? "text-slate-900" : "text-amber-800"}`}>
                    {routeSequence ? "티맵 계산 완료" : isVehicleScoped && selectedRouteStores.length ? "티맵 계산 대기" : isVehicleScoped ? "경유지 선택 필요" : "배송차 선택 필요"}
                  </p>
                  <p className={`mt-1 text-xs font-bold leading-5 ${routeSequence ? "text-emerald-700" : isVehicleScoped && selectedRouteStores.length ? "text-slate-600" : "text-amber-800"}`}>
                    {routeSequence
                      ? `현재 묶음 ${selectedRouteStores.length}곳의 도로 경로를 지도에 반영했습니다.`
                      : isVehicleScoped && selectedRouteStores.length
                        ? `${activeRouteBatchIndex + 1}묶음 ${selectedRouteStores.length}곳을 계산할 준비가 됐습니다. 버튼을 눌러 도로 기준 경유 거리와 시간을 갱신하세요.`
                        : isVehicleScoped
                          ? "아래 거래처 목록에서 경유지를 추가하세요."
                          : "왼쪽에서 배송차를 선택하면 해당 차량의 거래처만 경유 계산 대상으로 표시됩니다."}
                  </p>
                </div>
                {isVehicleScoped ? (
                  <RouteSequenceAction
                    buttonLabel={`${activeRouteBatchIndex + 1}묶음 티맵 계산`}
                    destinations={selectedRouteStores.map((store) => getRouteStopAddress(store)).filter(Boolean)}
                    onSequenceChange={setRouteSequence}
                    originAddress={routeOriginAddress}
                    showMap={false}
                  />
                ) : null}
                {routeSequence && sequencedRouteStores.length ? (
                  <FullRouteNavigateAction originLabel={routeOriginLabel} originPoint={routeSequence.originPoint} stores={sequencedRouteStores} stopPointByAddress={routeStopPointByAddress} />
                ) : null}
                {routeSelectedStore ? (
                  <DeliveryProofPanel
                    onSave={(proof) => saveDeliveryProof(routeSelectedStore.id, proof)}
                    proofs={deliveryProofs[routeSelectedStore.id] || []}
                    store={routeSelectedStore}
                  />
                ) : null}
              </div>
              <div className="space-y-2 border-b border-slate-200/80 p-3">
                <label className="relative block">
                  <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <input
                    className="maju-search-field h-10 w-full bg-slate-50 pl-9 pr-3"
                    onChange={(event) => setRouteQuery(event.target.value)}
                    placeholder="경유 거래처 검색..."
                    value={routeQuery}
                  />
                </label>
                <div className="flex flex-wrap gap-2">
                  <button className="maju-button-primary h-8 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!isVehicleScoped} onClick={selectDefaultRouteStores} type="button">
                    기본 15곳 선택
                  </button>
                  <button className="maju-button-secondary h-8 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isVehicleScoped} onClick={selectAllRouteStores} type="button">
                    전체 선택
                  </button>
                  <button className="maju-button-secondary h-8 text-slate-600 disabled:cursor-not-allowed disabled:opacity-40" disabled={!isVehicleScoped} onClick={clearRouteStores} type="button">
                    선택 해제
                  </button>
                  <span className="inline-flex h-8 items-center rounded-md bg-slate-100 px-3 text-xs font-black text-slate-700">
                    {activeRouteBatchIndex + 1}/{routeBatchCount}묶음 · 계산 {selectedRouteStores.length}곳
                  </span>
                  {inactiveSelectedCount ? <span className="inline-flex h-8 items-center rounded-md bg-slate-100 px-3 text-xs font-black text-slate-600">다른 묶음 {inactiveSelectedCount}곳</span> : null}
                </div>
                {routeBatchCount > 1 ? (
                  <div className="flex flex-wrap gap-2">
                    <button
                      className="maju-button-secondary h-8 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeRouteBatchIndex === 0}
                      onClick={goToPreviousRouteBatch}
                      type="button"
                    >
                      이전 15곳
                    </button>
                    <button
                      className="maju-button-secondary h-8 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={activeRouteBatchIndex >= routeBatchCount - 1}
                      onClick={goToNextRouteBatch}
                      type="button"
                    >
                      다음 15곳
                    </button>
                  </div>
                ) : null}
                <div className="maju-filter-box bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-500">
                  티맵 경유지 제한 때문에 실제 도로 계산은 최대 {tmapWaypointLimit}곳씩 나눠 처리합니다.
                </div>
              </div>
              <div className="border-b border-slate-200 bg-slate-50/80 p-3">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-950">선택한 경유지</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">현재 묶음 {selectedRouteStores.length}곳을 티맵 계산에 사용합니다.</p>
                  </div>
                  <span className="rounded-md bg-white px-2 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">
                    {activeRouteBatchIndex + 1}/{routeBatchCount}
                  </span>
                </div>
                {selectedRouteStores.length ? (
                  <div className="max-h-[260px] space-y-2 overflow-auto pr-1">
                    {selectedRouteStores.map((store, index) => (
                      <button
                        className={`w-full rounded-md border p-3 text-left transition hover:bg-white ${
                          store.id === routeSelectedStore?.id ? "border-slate-900 bg-white shadow-sm ring-1 ring-slate-900/5" : "border-slate-200 bg-white/80"
                        }`}
                        key={store.id}
                        onClick={() => openRouteStore(store.id)}
                        type="button"
                      >
                        <div className="flex items-start gap-3">
                          <span className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-teal-700 text-xs font-black text-white shadow-sm">{routeBatchStart + index + 1}</span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-black text-slate-950">{store.name}</span>
                            <span className="mt-1 block truncate text-xs font-bold text-slate-500">{store.address || store.region}</span>
                            <span className="mt-2 block text-xs font-bold text-slate-400">
                              출발지 기준 {store.distanceKm?.toLocaleString() || "-"}km · {formatMinutes(store.durationMinutes || 0)} · 매출 {store.expectedRevenue.toLocaleString()}만원
                            </span>
                          </span>
                          <span className="flex shrink-0 flex-col items-end gap-2">
                            <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                            <span className="flex items-center gap-1" onClick={(event) => event.stopPropagation()}>
                              <NavigateMenu
                                compact
                                destinationAddress={getRouteStopAddress(store)}
                                destinationName={store.name}
                                knownDestinationPoint={routeStopPointByAddress.get(getRouteStopAddress(store))}
                                knownOriginPoint={routeSequence?.originPoint}
                                originAddress={routeOriginAddress}
                              />
                              <span
                                className="maju-button-secondary px-2 py-1 text-[11px]"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  toggleRouteStore(store.id);
                                }}
                              >
                                해제
                              </span>
                            </span>
                          </span>
                        </div>
                      </button>
                    ))}
                  </div>
                ) : (
                  <div className="maju-empty-state bg-white p-4">
                    <p className="text-sm font-black text-slate-700">선택한 경유지가 없습니다.</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">아래 거래처 목록에서 추가 버튼을 누르세요.</p>
                  </div>
                )}
                {inactiveSelectedCount ? (
                  <div className="mt-2 rounded-md bg-white px-3 py-2 text-xs font-bold text-slate-500 ring-1 ring-inset ring-slate-200">
                    다른 묶음에 대기 중인 경유지 {inactiveSelectedCount}곳이 있습니다. 다음 15곳 버튼으로 이어서 계산합니다.
                  </div>
                ) : null}
              </div>
              <div className="p-3">
                {routeSequence?.legs.length ? (
                  <div className={`mb-3 rounded-md border p-3 ${routeRoadPointCount ? "border-emerald-200 bg-emerald-50" : "border-amber-200 bg-amber-50"}`}>
                    <p className={`text-xs font-black ${routeRoadPointCount ? "text-emerald-800" : "text-amber-800"}`}>
                      {routeRoadPointCount ? "티맵 경유 경로 반영됨" : "거리·시간 계산됨 · 도로 경로 좌표 없음"}
                    </p>
                    <p className={`mt-1 text-xs font-bold leading-5 ${routeRoadPointCount ? "text-emerald-700" : "text-amber-800"}`}>
                      경유지 {routeSequence.stops.length}곳 · 실도로 {tmapLegCount}/{routeSequence.legs.length}구간 · 경유 코스 {routeSequence.totalDistanceKm.toLocaleString()}km · {formatMinutes(routeSequence.totalDurationMinutes)} · 도로 좌표 {routeRoadPointCount.toLocaleString()}개
                    </p>
                    {tmapLegCount < routeSequence.legs.length ? <p className="mt-1 text-xs font-bold leading-5 text-amber-800">일부 구간은 티맵 주소 지오코딩이 실패해 도로선 없이 기초 거리값만 반영됐습니다.</p> : null}
                  </div>
                ) : null}
                <div className="mb-2 flex items-center justify-between gap-2">
                  <div>
                    <p className="text-sm font-black text-slate-950">{isVehicleScoped ? "거래처 선택" : "배송차 선택 필요"}</p>
                    <p className="mt-1 text-xs font-bold text-slate-500">
                      {isVehicleScoped ? "거래처를 누르면 지도 위치가 이동하고, 추가 버튼으로 경유지에 넣습니다." : "왼쪽에서 배송차를 선택하면 해당 차량의 거래처가 표시됩니다."}
                    </p>
                  </div>
                  <span className="rounded-md bg-slate-100 px-2 py-1 text-xs font-black text-slate-600">{routeCandidateStores.length}곳</span>
                </div>
                <div className="space-y-2">
                  {routeCandidateStores.length ? (
                    routeCandidateStores.map((store, index) => {
                    const selectedForRoute = selectedRouteIdSet.has(store.id);
                    const activeForRoute = activeRouteIdSet.has(store.id);
                    const selectedOrder = selectedRouteStoreIds.indexOf(store.id) + 1;
                    return (
                    <button
                      className={`w-full rounded-md border p-3 text-left transition hover:bg-slate-50 ${
                        store.id === routeSelectedStore?.id
                          ? "border-slate-900 bg-slate-50"
                          : activeForRoute
                            ? "border-slate-300 bg-slate-50/80"
                            : selectedForRoute
                              ? "border-slate-300 bg-slate-50"
                              : "border-slate-200 bg-white"
                      }`}
                      key={store.id}
                      onClick={() => openRouteStore(store.id)}
                      type="button"
                    >
                      <div className="flex items-start gap-3">
                        <span
                          className={`grid h-7 w-7 shrink-0 place-items-center rounded-full text-xs font-black ${
                            activeForRoute ? "bg-teal-700 text-white" : selectedForRoute ? "bg-teal-600 text-white" : "bg-slate-100 text-slate-500"
                          }`}
                        >
                          {selectedForRoute ? selectedOrder : index + 1}
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block truncate text-sm font-black text-slate-950">{store.name}</span>
                          <span className="mt-1 block truncate text-xs font-bold text-slate-500">{store.address || store.region}</span>
                          <span className="mt-2 block text-xs font-bold text-slate-400">출발지 기준 {store.distanceKm?.toLocaleString() || "-"}km · {formatMinutes(store.durationMinutes || 0)} · 매출 {store.expectedRevenue.toLocaleString()}만원</span>
                        </span>
                        <span className="flex shrink-0 flex-col items-end gap-2">
                          <span className={gradeBadgeClass(store.grade)}>{store.grade}</span>
                          {activeForRoute ? (
                            <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">계산</span>
                          ) : selectedForRoute ? (
                            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">대기</span>
                          ) : null}
                          <span
                            className={`rounded-md px-2 py-1 text-[11px] font-black ${
                              selectedForRoute ? "bg-teal-600 text-white" : "bg-teal-700 text-white hover:bg-teal-800"
                            }`}
                            onClick={(event) => {
                              event.stopPropagation();
                              toggleRouteStore(store.id);
                            }}
                          >
                            {selectedForRoute ? "해제" : "추가"}
                          </span>
                        </span>
                      </div>
                    </button>
                  );
                    })
                  ) : (
                    <div className="maju-empty-state bg-white p-4">
                      <p className="text-sm font-black text-slate-700">{isVehicleScoped ? "조건에 맞는 거래처가 없습니다." : "배송차를 먼저 선택하세요."}</p>
                      <p className="mt-1 text-xs font-bold leading-5 text-slate-500">
                        {isVehicleScoped ? "검색어를 조정하거나 다른 배송차를 선택하세요." : "왼쪽 배송차 목록에서 1호차, 2호차처럼 실제 차량을 선택하면 경유지를 고를 수 있습니다."}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        )}
      </aside>
    </section>
  );
}

function DirectoryStat({ label, tone = "slate", value }: { readonly label: string; readonly tone?: "rose" | "slate"; readonly value: string }) {
  return (
    <div className="maju-stat-card px-4 py-3">
      <p className="maju-muted-label">{label}</p>
      <p className={`mt-1 text-[24px] font-black leading-none ${tone === "rose" ? "text-rose-600" : "text-slate-950"}`}>{value}</p>
    </div>
  );
}

function OperationalEmptyState({
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

function DeliveryProofPanel({
  onSave,
  proofs,
  store
}: {
  readonly onSave: (proof: DeliveryProofInput) => Promise<void>;
  readonly proofs: DeliveryProof[];
  readonly store: StoreRow;
}) {
  const [file, setFile] = useState<File | null>(null);
  const [fileName, setFileName] = useState("");
  const [deliveryStatus, setDeliveryStatus] = useState<DeliveryProof["deliveryStatus"]>("arrived");
  const [isSaving, setIsSaving] = useState(false);
  const [saveMessage, setSaveMessage] = useState("");
  const [memo, setMemo] = useState("");
  const [messageChannel, setMessageChannel] = useState<DeliveryProof["messageChannel"]>("kakao");
  const [copyMessage, setCopyMessage] = useState("");
  const ownerMessage = createDeliveryOwnerMessage(store, memo, deliveryStatus, fileName);

  const saveProof = async () => {
    setIsSaving(true);
    setSaveMessage("");
    await onSave({
      deliveryStatus,
      file,
      fileName: fileName || "현장 사진 미첨부",
      memo: ownerMessage,
      messageChannel
    });
    setSaveMessage(file ? "배송완료 사진/영상과 메모를 저장했습니다." : "배송완료 메모를 저장했습니다. 사진은 나중에 추가할 수 있습니다.");
    setFile(null);
    setFileName("");
    setIsSaving(false);
    setMemo("");
  };
  const copyOwnerMessage = async () => {
    try {
      await navigator.clipboard.writeText(ownerMessage);
      setCopyMessage("점주 발송 문구를 복사했습니다.");
    } catch {
      setCopyMessage("복사 권한을 받을 수 없습니다. 문구를 직접 선택해 복사하세요.");
    }
  };

  return (
      <div className="maju-panel mt-3 border-slate-200 bg-slate-50 p-3">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="flex items-center gap-2 text-sm font-black text-slate-950">
            <Camera className="h-4 w-4 text-slate-700" />
            배송완료 증빙
          </p>
          <p className="mt-1 text-xs font-bold leading-5 text-slate-600">
            {store.name} 도착 후 사진을 남기고 점주님께 발송할 알림을 준비합니다.
          </p>
        </div>
        <span className="rounded-full bg-white px-2 py-1 text-xs font-black text-slate-700 ring-1 ring-inset ring-slate-200">{proofs.length}건</span>
      </div>
        <label className="mt-3 flex min-h-16 cursor-pointer items-center gap-3 rounded-md border border-dashed border-slate-300 bg-white px-3 py-3 text-left transition hover:border-slate-400 hover:bg-slate-50">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-700 text-white">
          <Plus className="h-4 w-4" />
        </span>
        <span className="min-w-0">
          <span className="block truncate text-sm font-black text-slate-900">{fileName || "도착 사진/영상 선택"}</span>
          <span className="mt-1 block text-xs font-bold text-slate-500">파일명과 발송 상태를 기록합니다.</span>
        </span>
        <input
          accept="image/*,video/*"
          className="hidden"
          onChange={(event) => {
            const nextFile = event.target.files?.[0] || null;
            setFile(nextFile);
            setFileName(nextFile?.name || "");
          }}
          type="file"
        />
      </label>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {[
          { label: "카톡 발송 대기", value: "kakao" },
          { label: "문자 발송 대기", value: "sms" }
        ].map((item) => (
          <button
            className={`h-9 rounded-md border px-3 text-xs font-black transition ${
              messageChannel === item.value ? "border-slate-900 bg-slate-900 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={item.value}
            onClick={() => setMessageChannel(item.value as DeliveryProof["messageChannel"])}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <div className="mt-3 grid grid-cols-3 gap-2">
        {[
          { label: "도착완료", value: "arrived" },
          { label: "부분배송", value: "partial" },
          { label: "이슈발생", value: "issue" }
        ].map((item) => (
          <button
            className={`h-9 rounded-md border px-2 text-xs font-black transition ${
              deliveryStatus === item.value ? "border-teal-700 bg-teal-700 text-white" : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
            }`}
            key={item.value}
            onClick={() => setDeliveryStatus(item.value as DeliveryProof["deliveryStatus"])}
            type="button"
          >
            {item.label}
          </button>
        ))}
      </div>
      <textarea
        className="mt-3 min-h-20 w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
        onChange={(event) => setMemo(event.target.value)}
        placeholder="추가 메모 예: 요청하신 냉장고 앞에 적재했습니다."
        value={memo}
      />
      <div className="maju-panel mt-3 border-slate-200 p-3">
        <div className="flex items-center justify-between gap-2">
          <p className="text-xs font-black text-slate-500">점주 발송 문구</p>
          <button
            className="maju-button-secondary h-8 px-2.5"
            onClick={copyOwnerMessage}
            type="button"
          >
            <Copy className="h-3.5 w-3.5" />
            복사
          </button>
        </div>
        <p className="mt-2 whitespace-pre-line rounded-md bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-700">{ownerMessage}</p>
        {copyMessage ? <p className="mt-2 text-xs font-bold text-slate-700">{copyMessage}</p> : null}
      </div>
      <button
        className="maju-button-primary mt-2 w-full disabled:cursor-not-allowed disabled:bg-slate-300"
        disabled={isSaving}
        onClick={saveProof}
        type="button"
      >
        <MessageSquareText className="h-3.5 w-3.5" />
        {isSaving ? "저장 중" : "배송완료 기록 저장"}
      </button>
      {saveMessage ? <p className="mt-2 text-xs font-bold leading-5 text-slate-700">{saveMessage}</p> : null}
      {proofs.length ? (
        <div className="mt-3 space-y-2">
          {proofs.slice(0, 3).map((proof) => (
            <div className="rounded-md border border-slate-200 bg-white p-2" key={`${proof.recordedAt}-${proof.fileName}`}>
              <div className="flex items-center justify-between gap-2">
                <p className="truncate text-xs font-black text-slate-900">{proof.fileName}</p>
                <span className={`rounded px-2 py-0.5 text-[11px] font-black ${proof.persisted ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {proof.persisted ? "저장 완료" : "로컬 기록"} · {proof.messageChannel === "kakao" ? "카톡" : "문자"}
                </span>
              </div>
              <p className="mt-1 text-[11px] font-black text-slate-700">{deliveryStatusLabel(proof.deliveryStatus)}</p>
              <p className="mt-1 line-clamp-2 text-xs font-bold leading-5 text-slate-500">{proof.memo}</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">{proof.recordedAt}</p>
            </div>
          ))}
        </div>
      ) : null}
    </div>
  );
}

async function uploadDeliveryProofFile(storeId: string, file: File, title: string) {
  const formData = new FormData();
  formData.append("attachmentType", "delivery_proof");
  formData.append("customerId", storeId);
  formData.append("file", file);
  formData.append("title", title);

  return fetch("/api/customer-attachments/upload", {
    method: "POST",
    body: formData
  });
}

function createDeliveryOwnerMessage(store: StoreRow, memo: string, status: DeliveryProof["deliveryStatus"], fileName: string) {
  const statusText = deliveryStatusLabel(status);
  const baseMemo = memo.trim() || (status === "arrived" ? "요청하신 위치에 배송 적재 완료했습니다." : status === "partial" ? "일부 품목은 현장 상황 확인 후 별도 안내드리겠습니다." : "배송 중 확인이 필요한 사항이 있어 안내드립니다.");
  const proofText = fileName ? `\n증빙자료: ${fileName}` : "";

  return `[MAJU 배송 안내]\n${store.name} ${statusText}\n${baseMemo}${proofText}`;
}

function deliveryStatusLabel(status: DeliveryProof["deliveryStatus"]) {
  if (status === "partial") return "부분배송";
  if (status === "issue") return "이슈발생";
  return "도착완료";
}

function getRouteStopAddress(store: StoreRow) {
  return store.address || store.region;
}

function countFiniteRoutePoints(path: RouteSequence["path"]) {
  return path.filter((point) => Number.isFinite(point.lat) && Number.isFinite(point.lng)).length;
}

function StoreDetail({
  areaOptions,
  attachments,
  driverOptions,
  history,
  onAddDriver,
  onAddVehicle,
  onClose,
  onClearHistory,
  onDeleteHistory,
  onSaveAttachment,
  onSaveLoadingMedia,
  onUpdateRelationshipStatus,
  onUpdateStore,
  onWriteHistory,
  store,
  vehicleOptions
}: {
  readonly areaOptions: string[];
  readonly attachments: StoreAttachment;
  readonly driverOptions: string[];
  readonly history: StoreHistoryItem[];
  readonly onAddDriver: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  readonly onAddVehicle: (vehicleName: string) => Promise<{ ok: boolean; message?: string }>;
  readonly onClose: () => void;
  readonly onClearHistory: (storeId: string) => void;
  readonly onDeleteHistory: (storeId: string, historyId: string) => void;
  readonly onSaveAttachment: (slot: "bankbookCopy" | "businessCertificate", file: AttachmentFile) => void;
  readonly onSaveLoadingMedia: (files: AttachmentFile[]) => void;
  readonly onUpdateRelationshipStatus: (storeId: string, status: string, note?: string) => Promise<{ persisted: boolean } | void>;
  readonly onUpdateStore: (storeId: string, edit: StoreEdit) => Promise<{ persisted: boolean } | void>;
  readonly onWriteHistory: (storeId: string, memo: string) => void;
  readonly store: StoreRow;
  readonly vehicleOptions: string[];
}) {
  const [draftAccountCopyStatus, setDraftAccountCopyStatus] = useState(store.accountCopyStatus);
  const [draftAddress, setDraftAddress] = useState(store.address || "");
  const [draftBankAccount, setDraftBankAccount] = useState(store.bankAccount);
  const [draftBirthDate, setDraftBirthDate] = useState(store.birthDate);
  const [draftBusinessCertificateStatus, setDraftBusinessCertificateStatus] = useState(store.businessCertificateStatus);
  const [draftBusinessNumber, setDraftBusinessNumber] = useState(store.businessRegistrationNumber);
  const [draftBusinessStatus, setDraftBusinessStatus] = useState(store.businessStatus);
  const [draftBusinessHours, setDraftBusinessHours] = useState(store.businessHours || "");
  const [draftMenuSummary, setDraftMenuSummary] = useState(store.menuSummary || "");
  const [draftReviewSummary, setDraftReviewSummary] = useState(store.reviewSummary || "");
  const [draftReviewKeywords, setDraftReviewKeywords] = useState((store.reviewKeywords || []).join(", "));
  const [draftReviewSource, setDraftReviewSource] = useState(store.reviewSource || "");
  const [draftDeliveryArea, setDraftDeliveryArea] = useState(store.deliveryArea || store.region);
  const [draftDeliveryDriver, setDraftDeliveryDriver] = useState(store.deliveryDriver || "");
  const [draftDeliveryVehicleName, setDraftDeliveryVehicleName] = useState(store.deliveryVehicleName || "");
  const [draftEmail, setDraftEmail] = useState(store.email);
  const [draftGrade, setDraftGrade] = useState<RevenueGrade>(store.grade);
  const [draftIndustry, setDraftIndustry] = useState(store.industry);
  const [draftName, setDraftName] = useState(store.name);
  const [draftOpeningDate, setDraftOpeningDate] = useState(store.openingDate);
  const [draftPhone, setDraftPhone] = useState(store.phone);
  const [draftRelationshipStatus, setDraftRelationshipStatus] = useState(store.relationshipStatus || "거래중");
  const [draftRepresentativeName, setDraftRepresentativeName] = useState(store.representativeName);
  const [draftRevenue, setDraftRevenue] = useState(String(store.expectedRevenue));
  const [historyMemo, setHistoryMemo] = useState("");
  const [ocrSuggestion, setOcrSuggestion] = useState<BusinessOcrSuggestion | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isSavingRelationshipStatus, setIsSavingRelationshipStatus] = useState(false);
  const [relationshipStatusError, setRelationshipStatusError] = useState("");
  const [savedAt, setSavedAt] = useState("");
  const [saveError, setSaveError] = useState("");
  const [isSyncingReviews, setIsSyncingReviews] = useState(false);
  const [reviewSyncMessage, setReviewSyncMessage] = useState("");
  const [pasteReviewSource, setPasteReviewSource] = useState("네이버");
  const [pasteReviewText, setPasteReviewText] = useState("");
  const [isSummarizingPaste, setIsSummarizingPaste] = useState(false);
  const [pasteSummaryMessage, setPasteSummaryMessage] = useState("");
  const activeOcrSuggestion = ocrSuggestion || (attachments.businessCertificate ? createBusinessOcrSuggestion(store, attachments.businessCertificate.name) : null);
  const businessNumberValid = isValidBusinessRegistrationNumber(draftBusinessNumber);
  const saveDraft = async () => {
    if (!businessNumberValid) {
      setSaveError("사업자번호가 유효하지 않습니다. 사업자등록증 OCR 후보값을 반영하거나 10자리 번호를 확인하세요.");
      return;
    }

    setIsSaving(true);
    setSaveError("");

    try {
      const result = await onUpdateStore(store.id, {
      accountCopyStatus: draftAccountCopyStatus,
      address: draftAddress,
      bankAccount: draftBankAccount,
      birthDate: draftBirthDate,
      businessCertificateStatus: draftBusinessCertificateStatus,
      businessRegistrationNumber: draftBusinessNumber,
      businessStatus: draftBusinessStatus,
      businessHours: draftBusinessHours,
      menuSummary: draftMenuSummary,
      reviewSummary: draftReviewSummary,
      reviewKeywords: draftReviewKeywords
        .split(",")
        .map((keyword) => keyword.trim())
        .filter(Boolean),
      reviewSource: draftReviewSource,
      deliveryArea: draftDeliveryArea,
      deliveryDriver: draftDeliveryDriver,
      deliveryVehicleName: draftDeliveryVehicleName,
      email: draftEmail,
      expectedRevenue: Number(draftRevenue) || store.expectedRevenue,
      grade: draftGrade,
      industry: draftIndustry,
      name: draftName,
      openingDate: draftOpeningDate,
      phone: draftPhone,
      representativeName: draftRepresentativeName
      });
      const persistedLabel = result?.persisted === false ? "저장 미확인" : "저장 완료";
      setSavedAt(`${persistedLabel} · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSaving(false);
    }
  };
  // 구글 리뷰를 지금 바로 다시 수집합니다(공식 Places API). 서버에 즉시 저장되므로, 성공하면 이
  // 폼의 입력값도 그 결과로 갱신해 사용자가 바로 확인할 수 있게 합니다.
  const syncGoogleReviews = async () => {
    setIsSyncingReviews(true);
    setReviewSyncMessage("");
    try {
      const companyId = permitLeadCompanyId();
      const response = await fetch(`/api/customers/${store.id}/sync-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyId ? { companyId } : {})
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        updated?: boolean;
        result?: { summary?: string; keywords?: string[]; source?: string };
      } | null;
      if (!response.ok) {
        setReviewSyncMessage(payload?.message || "리뷰 새로고침에 실패했습니다.");
        return;
      }
      if (payload?.updated && payload.result) {
        setDraftReviewSummary(payload.result.summary || "");
        setDraftReviewKeywords((payload.result.keywords || []).join(", "));
        setDraftReviewSource(payload.result.source || "");
        setReviewSyncMessage(`구글 리뷰 반영 완료 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
      } else {
        setReviewSyncMessage(payload?.message || "구글에서 리뷰를 찾지 못했습니다.");
      }
    } catch (error) {
      setReviewSyncMessage(error instanceof Error ? error.message : "리뷰 새로고침 중 오류가 발생했습니다.");
    } finally {
      setIsSyncingReviews(false);
    }
  };
  // 네이버·카카오 리뷰는 자동으로 가져오지 않습니다(설계 문서 참고). 담당자가 링크를 열어 직접
  // 읽고 복사해온 텍스트만 받아서, 그 텍스트를 AI(규칙 기반 요약기)로 즉시 요약·키워드화합니다.
  const summarizePastedReviews = async () => {
    if (!pasteReviewText.trim()) {
      setPasteSummaryMessage("붙여넣은 리뷰 텍스트가 없습니다.");
      return;
    }
    setIsSummarizingPaste(true);
    setPasteSummaryMessage("");
    try {
      const companyId = permitLeadCompanyId();
      const response = await fetch(`/api/customers/${store.id}/summarize-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(companyId ? { companyId } : {}),
          rawText: pasteReviewText,
          source: pasteReviewSource
        })
      });
      const payload = (await response.json().catch(() => null)) as {
        message?: string;
        result?: { summary?: string; keywords?: string[]; source?: string };
      } | null;
      if (!response.ok || !payload?.result) {
        setPasteSummaryMessage(payload?.message || "리뷰 요약에 실패했습니다.");
        return;
      }
      setDraftReviewSummary(payload.result.summary || "");
      setDraftReviewKeywords((payload.result.keywords || []).join(", "));
      setDraftReviewSource(payload.result.source || pasteReviewSource);
      setPasteSummaryMessage(`요약 반영 완료 · ${new Date().toLocaleTimeString("ko-KR", { hour: "2-digit", minute: "2-digit" })}`);
    } catch (error) {
      setPasteSummaryMessage(error instanceof Error ? error.message : "리뷰 요약 중 오류가 발생했습니다.");
    } finally {
      setIsSummarizingPaste(false);
    }
  };

  const toggleRelationshipStatus = async () => {
    const nextStatus = draftRelationshipStatus === "거래종료" ? "거래중" : "거래종료";
    if (nextStatus === "거래종료" && !window.confirm(`${draftName}을(를) 거래 종료로 표시할까요? 이후 대시보드·이탈 위험 알림·경로 계획에서 제외됩니다.`)) return;

    setIsSavingRelationshipStatus(true);
    setRelationshipStatusError("");
    try {
      await onUpdateRelationshipStatus(store.id, nextStatus);
      setDraftRelationshipStatus(nextStatus);
    } catch (error) {
      setRelationshipStatusError(error instanceof Error ? error.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSavingRelationshipStatus(false);
    }
  };

  return (
    <>
      <button aria-label="거래처 상세 닫기" className="fixed inset-0 z-30 bg-slate-950/20" onClick={onClose} type="button" />
      <aside className="fixed right-0 top-0 z-40 flex h-screen w-full max-w-[960px] flex-col border-l border-slate-200 bg-white shadow-2xl">
        <header className="maju-card-header border-b px-4 py-4">
          <div className="flex items-start justify-between gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-blue-700">거래처 상세</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <h3 className="truncate text-2xl font-black text-slate-950">{draftName}</h3>
                <span className={gradeBadgeClass(draftGrade)}>{draftGrade}</span>
                <span className={businessStatusClass(draftBusinessStatus)}>{getBusinessStatusLabel(draftBusinessStatus)}</span>
                <span className={businessNumberValid ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700" : "rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700"}>
                  {businessNumberValid ? "사업자번호 유효" : "사업자번호 확인"}
                </span>
                {draftRelationshipStatus === "거래종료" ? (
                  <span className="rounded-full bg-slate-200 px-2 py-0.5 text-[11px] font-black text-slate-700">거래 종료</span>
                ) : null}
              </div>
              <p className="mt-2 text-sm font-bold text-slate-500">
                {store.deliveryVehicleName || store.region} · {draftDeliveryDriver || "담당자 미지정"} · {draftAddress || "주소 미등록"}
              </p>
              {savedAt ? <p className="mt-2 text-xs font-black text-emerald-700">변경사항 반영 · {savedAt}</p> : null}
              {saveError ? <p className="mt-2 text-xs font-black text-rose-600">{saveError}</p> : null}
              {relationshipStatusError ? <p className="mt-2 text-xs font-black text-rose-600">{relationshipStatusError}</p> : null}
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <button
                className={
                  draftRelationshipStatus === "거래종료"
                    ? "maju-button-secondary inline-flex h-9 items-center gap-2 px-3 text-sm"
                    : "inline-flex h-9 items-center gap-2 rounded-md border border-rose-200 bg-white px-3 text-sm font-black text-rose-700 transition hover:bg-rose-50"
                }
                disabled={isSavingRelationshipStatus}
                onClick={toggleRelationshipStatus}
                type="button"
              >
                {isSavingRelationshipStatus ? "저장 중..." : draftRelationshipStatus === "거래종료" ? "거래 재개로 표시" : "거래 종료로 표시"}
              </button>
              <Link
                className="maju-button-secondary inline-flex h-9 items-center gap-2 px-3 text-sm"
                href={`/crm/timeline?customerId=${encodeURIComponent(store.id)}`}
              >
                히스토리 열기
              </Link>
              <button
                className="maju-button-primary inline-flex h-9 items-center gap-2 px-3 text-sm"
                disabled={isSaving}
                onClick={saveDraft}
                type="button"
              >
                <Check className="h-4 w-4" />
                {isSaving ? "저장 중" : "변경 저장"}
              </button>
              <button aria-label="닫기" className="grid h-9 w-9 place-items-center rounded-md bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-rose-50 hover:text-rose-700" onClick={onClose} type="button">
                <X className="h-4 w-4" />
              </button>
            </div>
          </div>
        </header>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-4 py-4">
          <div className="space-y-5">
              <CollapsibleSection defaultOpen title="기본 정보">
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <EditRow label="거래처명" onChange={setDraftName} value={draftName} />
                  <BusinessNumberEditRow onChange={setDraftBusinessNumber} valid={businessNumberValid} value={draftBusinessNumber} />
                  <EditRow label="대표자명" onChange={setDraftRepresentativeName} value={draftRepresentativeName} />
                  <EditRow label="연락처" onChange={(value) => setDraftPhone(formatPhoneNumberInput(value))} value={draftPhone} />
                  <EditRow label="이메일" onChange={setDraftEmail} value={draftEmail} />
                  <EditRow label="개업일" onChange={setDraftOpeningDate} type="date" value={draftOpeningDate} />
                  <EditRow label="생년월일" onChange={setDraftBirthDate} type="date" value={draftBirthDate} />
                  <EditRow label="주소" onChange={setDraftAddress} value={draftAddress} />
                  <EditRow label="업종" onChange={setDraftIndustry} value={draftIndustry} />
                  <EditRow label="영업시간" onChange={setDraftBusinessHours} value={draftBusinessHours} />
                  <EditRow label="주요 메뉴/취급 품목" onChange={setDraftMenuSummary} value={draftMenuSummary} />
                  <EditRow label="계좌정보" onChange={setDraftBankAccount} value={draftBankAccount} />
                  <SelectRow
                    label="사업자등록증"
                    onChange={(value) => setDraftBusinessCertificateStatus(value as StoreRow["businessCertificateStatus"])}
                    options={[
                      { label: "수취 완료", value: "received" },
                      { label: "미수취", value: "missing" }
                    ]}
                    value={draftBusinessCertificateStatus}
                  />
                  <SelectRow
                    label="통장사본"
                    onChange={(value) => setDraftAccountCopyStatus(value as StoreRow["accountCopyStatus"])}
                    options={[
                      { label: "수취 완료", value: "received" },
                      { label: "미수취", value: "missing" }
                    ]}
                    value={draftAccountCopyStatus}
                  />
                  <EditRow label="예상매출" onChange={setDraftRevenue} value={draftRevenue} />
                  <SelectRow
                    label="매출등급"
                    onChange={(value) => setDraftGrade(value as RevenueGrade)}
                    options={[
                      { label: "A등급", value: "A" },
                      { label: "B등급", value: "B" },
                      { label: "C등급", value: "C" }
                    ]}
                    value={draftGrade}
                  />
                  <InfoRow label="매출정보" value="거래원장 기준" />
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs font-black text-slate-500">담당자</span>
                    <DriverSelectField driverOptions={driverOptions} onAddDriver={onAddDriver} onChange={setDraftDeliveryDriver} value={draftDeliveryDriver} />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs font-black text-slate-500">배송차</span>
                    <DriverSelectField
                      driverOptions={vehicleOptions}
                      entityLabel="배송차"
                      onAddDriver={onAddVehicle}
                      onChange={setDraftDeliveryVehicleName}
                      value={draftDeliveryVehicleName}
                    />
                  </label>
                  <SelectRow label="배송권역" onChange={setDraftDeliveryArea} options={areaOptions.map((area) => ({ label: area, value: area }))} value={draftDeliveryArea} />
                </div>
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-black text-slate-500">외부 거래처 정보</p>
                  <PlaceLinkRow store={store} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="담당자 연락처">
                <CustomerContactsSection customerId={store.id} />
              </CollapsibleSection>

              <CollapsibleSection title="리뷰 요약 · 키워드 (AI)">
                <div className="mt-4 space-y-3">
                  <div className="flex items-start justify-between gap-2 maju-filter-box border-slate-200 bg-slate-50 px-3 py-2">
                    <p className="text-xs font-bold leading-5 text-slate-600">
                      구글 리뷰는 공식 API로 자동 수집됩니다. 네이버플레이스·카카오맵 리뷰는 아직 자동 수집이 없어 아래에 직접 남겨두면 거래처 카드에 표시됩니다.
                    </p>
                    <button
                      className="shrink-0 rounded-md border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                      disabled={isSyncingReviews}
                      onClick={syncGoogleReviews}
                      type="button"
                    >
                      {isSyncingReviews ? "수집 중…" : "구글 리뷰 새로고침"}
                    </button>
                  </div>
                  {reviewSyncMessage ? <p className="text-[11px] font-bold text-teal-600">{reviewSyncMessage}</p> : null}
                  <div className="maju-filter-box space-y-2 border-slate-200 bg-white px-3 py-3">
                    <p className="text-xs font-black text-slate-500">
                      네이버·카카오 리뷰 붙여넣기 — 위 "외부 거래처 정보"의 링크를 열어 리뷰를 확인한 뒤, 리뷰 텍스트를 복사해서 아래에 붙여넣고 버튼을 누르면 AI가 즉시 요약합니다.
                    </p>
                    <div className="flex items-center gap-2">
                      <select
                        className="h-8 rounded-md border border-slate-200 px-2 text-xs font-bold outline-none focus:border-teal-300"
                        onChange={(event) => setPasteReviewSource(event.target.value)}
                        value={pasteReviewSource}
                      >
                        <option value="네이버">네이버</option>
                        <option value="카카오">카카오</option>
                        <option value="기타">기타</option>
                      </select>
                      <button
                        className="shrink-0 rounded-md border border-teal-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-teal-700 transition hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-50"
                        disabled={isSummarizingPaste}
                        onClick={summarizePastedReviews}
                        type="button"
                      >
                        {isSummarizingPaste ? "요약 중…" : "AI 요약 생성"}
                      </button>
                    </div>
                    <textarea
                      className="min-h-20 w-full rounded-md border border-slate-200 bg-slate-50 p-2 text-xs font-bold text-slate-700 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                      onChange={(event) => setPasteReviewText(event.target.value)}
                      placeholder="네이버·카카오 리뷰 원문을 여기에 붙여넣으세요 (여러 개면 줄바꿈으로 구분)"
                      value={pasteReviewText}
                    />
                    {pasteSummaryMessage ? <p className="text-[11px] font-bold text-teal-600">{pasteSummaryMessage}</p> : null}
                  </div>
                  {draftReviewKeywords.split(",").map((keyword) => keyword.trim()).filter(Boolean).length ? (
                    <div className="flex flex-wrap gap-1.5">
                      {draftReviewKeywords
                        .split(",")
                        .map((keyword) => keyword.trim())
                        .filter(Boolean)
                        .map((keyword) => (
                          <span className="rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700" key={keyword}>
                            #{keyword}
                          </span>
                        ))}
                    </div>
                  ) : null}
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs font-black text-slate-500">키워드 뱃지 (쉼표로 구분)</span>
                    <input
                      className="h-9 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300"
                      onChange={(event) => setDraftReviewKeywords(event.target.value)}
                      placeholder="예: 친절해요, 재료가 신선해요, 회전율 빠름"
                      value={draftReviewKeywords}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs font-black text-slate-500">AI 리뷰 요약</span>
                    <textarea
                      className="min-h-24 w-full rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                      onChange={(event) => setDraftReviewSummary(event.target.value)}
                      placeholder="리뷰 전반의 분위기를 2~3문장으로 요약해두세요."
                      value={draftReviewSummary}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs font-black text-slate-500">출처</span>
                    <input
                      className="h-9 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300"
                      onChange={(event) => setDraftReviewSource(event.target.value)}
                      placeholder="예: 네이버플레이스"
                      value={draftReviewSource}
                    />
                  </label>
                  {store.reviewsUpdatedAt ? <p className="text-[11px] font-bold text-slate-400">마지막 업데이트: {new Date(store.reviewsUpdatedAt).toLocaleString("ko-KR")}</p> : null}
                </div>
              </CollapsibleSection>

              <CollapsibleSection defaultOpen title="첨부자료">
                <div className="mt-4 space-y-3">
                  <LoadingMediaBox files={attachments.loadingPositionMedia || []} onSave={onSaveLoadingMedia} />
                  <AttachmentBox
                    description="업로드하면 OCR 후보값을 읽어 기본정보와 비교합니다."
                    file={attachments.businessCertificate}
                    label="사업자등록증"
                    onSave={(file) => {
                      onSaveAttachment("businessCertificate", file);
                      setDraftBusinessCertificateStatus("received");
                      setOcrSuggestion(createBusinessOcrSuggestion(store, file.name));
                    }}
                  />
                  {activeOcrSuggestion ? (
                    <BusinessOcrPanel
                      current={{
                        businessRegistrationNumber: draftBusinessNumber,
                        companyName: draftName,
                        openingDate: draftOpeningDate,
                        representativeName: draftRepresentativeName
                      }}
                      onApply={() => {
                        setDraftBusinessNumber(activeOcrSuggestion.businessRegistrationNumber);
                        setDraftBusinessStatus(activeOcrSuggestion.businessStatus);
                        setDraftBusinessCertificateStatus("received");
                        setDraftName(activeOcrSuggestion.companyName);
                        setDraftOpeningDate(activeOcrSuggestion.openingDate);
                        setDraftRepresentativeName(activeOcrSuggestion.representativeName);
                      }}
                      suggestion={activeOcrSuggestion}
                    />
                  ) : null}
                  <AttachmentBox description="정산과 결제 확인용 자료입니다." file={attachments.bankbookCopy} label="통장사본" onSave={(file) => onSaveAttachment("bankbookCopy", file)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="메모 히스토리">
                <div className="maju-filter-box mt-4 border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
                  메모는 상담·배송 이력이라 운영에서는 삭제 로그를 남기는 방식이 안전합니다. 개별 삭제와 전체 삭제는 확인 후 실행됩니다.
                </div>
                <textarea
                  className="mt-4 min-h-28 w-full rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                  onChange={(event) => setHistoryMemo(event.target.value)}
                  placeholder="상담, 배송 특이사항, 대표 요청사항 등을 기록하세요."
                  value={historyMemo}
                />
                <button
                  className="maju-button-primary mt-2 h-9 w-full text-sm"
                  onClick={() => {
                    const memo = historyMemo.trim();
                    if (!memo) return;
                    onWriteHistory(store.id, memo);
                    setHistoryMemo("");
                  }}
                  type="button"
                >
                  메모 저장
                </button>
                {history.length ? (
                  <button
                    className="mt-2 h-9 w-full rounded-md border border-rose-200 bg-white text-sm font-black text-rose-600 transition hover:bg-rose-50"
                    onClick={() => {
                      if (window.confirm("이 거래처의 메모 히스토리를 모두 삭제할까요?")) onClearHistory(store.id);
                    }}
                    type="button"
                  >
                    메모 전체 삭제
                  </button>
                ) : null}
                <div className="mt-4 space-y-2">
                  {history.length ? (
                    history.map((item) => (
                      <div className="maju-stat-card p-3" key={item.id}>
                        <div className="flex items-center justify-between gap-3">
                          <p className="text-xs font-black text-slate-400">{item.recordedAt}</p>
                          <button className="text-xs font-black text-rose-500 hover:text-rose-700" onClick={() => onDeleteHistory(store.id, item.id)} type="button">
                            삭제
                          </button>
                        </div>
                        <p className="mt-1 text-sm font-bold leading-5 text-slate-700">{item.memo}</p>
                      </div>
                    ))
                  ) : (
                    <p className="maju-empty-state p-3 text-sm font-bold text-slate-400">아직 기록된 메모가 없습니다.</p>
                  )}
                </div>
              </CollapsibleSection>
              <CollapsibleSection defaultOpen title="배송·방문 정보">
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MetricRow icon={<Navigation className="h-4 w-4" />} label="거리" value={`${store.distanceKm?.toLocaleString() || "-"}km`} />
                  <MetricRow icon={<Clock className="h-4 w-4" />} label="출발지 기준 시간" value={formatMinutes(store.durationMinutes || 0)} />
                  <MetricRow icon={<CalendarDays className="h-4 w-4" />} label="방문순서" value={`${store.order}번째`} />
                  <MetricRow label="경로출처" value={getProviderLabel(store.routeProvider)} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="AI 추천 근거">
                <div className="mt-4 grid gap-2 sm:grid-cols-3">
                  {(store.reasons?.length ? store.reasons : ["배송 반경", "예상 매출", "지역 확장성"]).map((reason) => (
                    <p className="maju-filter-box px-3 py-2 text-sm font-bold text-slate-700" key={reason}>
                      {reason}
                    </p>
                  ))}
                </div>
              </CollapsibleSection>
          </div>
        </div>
      </aside>
    </>
  );
}

const CONTACT_ROLE_PRESETS = ["대표", "실장", "부장", "매니저", "담당자"];

function CustomerContactsSection({ customerId }: { readonly customerId: string }) {
  const [contacts, setContacts] = useState<CustomerContactItem[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [unsupported, setUnsupported] = useState(false);
  const [isAdding, setIsAdding] = useState(false);
  const [addError, setAddError] = useState("");
  const [draftRole, setDraftRole] = useState(CONTACT_ROLE_PRESETS[0]);
  const [draftName, setDraftName] = useState("");
  const [draftPhone, setDraftPhone] = useState("");
  const [draftBirthDate, setDraftBirthDate] = useState("");
  const [draftMemo, setDraftMemo] = useState("");
  const [editingId, setEditingId] = useState("");
  const [editRole, setEditRole] = useState("");
  const [editName, setEditName] = useState("");
  const [editPhone, setEditPhone] = useState("");
  const [editBirthDate, setEditBirthDate] = useState("");
  const [editMemo, setEditMemo] = useState("");
  const [rowBusyId, setRowBusyId] = useState("");

  const loadContacts = useCallback(async () => {
    setIsLoading(true);
    setLoadError("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts`), { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "연락처를 불러오지 못했습니다.");
      setContacts(Array.isArray(data?.contacts) ? data.contacts : []);
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "연락처를 불러오지 못했습니다.");
    } finally {
      setIsLoading(false);
    }
  }, [customerId]);

  useEffect(() => {
    loadContacts();
  }, [loadContacts]);

  const addContact = async () => {
    if (!draftName.trim()) {
      setAddError("담당자 이름을 입력하세요.");
      return;
    }
    setIsAdding(true);
    setAddError("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: draftRole || "담당자",
          name: draftName.trim(),
          phone: draftPhone.trim(),
          birthDate: draftBirthDate,
          memo: draftMemo.trim()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        if (response.status === 400 && typeof data?.message === "string" && data.message.includes("마이그레이션")) setUnsupported(true);
        throw new Error(data?.message || "연락처 저장에 실패했습니다.");
      }
      setDraftName("");
      setDraftPhone("");
      setDraftBirthDate("");
      setDraftMemo("");
      setDraftRole(CONTACT_ROLE_PRESETS[0]);
      if (data?.message) setAddError(data.message);
      await loadContacts();
    } catch (error) {
      setAddError(error instanceof Error ? error.message : "연락처 저장에 실패했습니다.");
    } finally {
      setIsAdding(false);
    }
  };

  const startEdit = (contact: CustomerContactItem) => {
    setEditingId(contact.id);
    setEditRole(contact.role);
    setEditName(contact.name);
    setEditPhone(contact.phone || "");
    setEditBirthDate(contact.birthDate || "");
    setEditMemo(contact.memo || "");
  };

  const saveEdit = async (contactId: string) => {
    if (!editName.trim()) return;
    setRowBusyId(contactId);
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(contactId)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole || "담당자",
          name: editName.trim(),
          phone: editPhone.trim(),
          birthDate: editBirthDate,
          memo: editMemo.trim()
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "연락처 수정에 실패했습니다.");
      setEditingId("");
      await loadContacts();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "연락처 수정에 실패했습니다.");
    } finally {
      setRowBusyId("");
    }
  };

  const removeContact = async (contactId: string) => {
    if (!window.confirm("이 연락처를 삭제할까요?")) return;
    setRowBusyId(contactId);
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(contactId)}`), { method: "DELETE" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data?.message || "삭제에 실패했습니다.");
      await loadContacts();
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "삭제에 실패했습니다.");
    } finally {
      setRowBusyId("");
    }
  };

  return (
    <div className="mt-4 space-y-3">
      <p className="maju-filter-box border-slate-200 bg-slate-50 px-3 py-2 text-xs font-bold leading-5 text-slate-600">
        대표 연락처 외에 실장·부장·매니저 등 이 거래처의 추가 담당자를 등록해두면 방문·주문 확인 시 참고할 수 있습니다.
      </p>

      {loadError ? <p className="text-xs font-black text-rose-600">{loadError}</p> : null}

      {unsupported ? (
        <p className="maju-filter-box border-amber-200 bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800">
          다중 연락처 기능을 사용하려면 관리자가 customer_contacts 테이블 마이그레이션을 먼저 실행해야 합니다.
        </p>
      ) : null}

      {isLoading ? (
        <p className="maju-empty-state p-3 text-sm font-bold text-slate-400">불러오는 중...</p>
      ) : contacts.length ? (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div className="maju-stat-card p-3" key={contact.id}>
              {editingId === contact.id ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <input className="h-9 w-24 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" list="contact-role-presets" onChange={(event) => setEditRole(event.target.value)} placeholder="직책" value={editRole} />
                  <input className="h-9 w-28 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setEditName(event.target.value)} placeholder="이름" value={editName} />
                  <input className="h-9 w-36 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setEditPhone(formatPhoneNumberInput(event.target.value))} placeholder="연락처" value={editPhone} />
                  <input className="h-9 w-36 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setEditBirthDate(event.target.value)} type="date" value={editBirthDate} />
                  <input className="h-9 min-w-[120px] flex-1 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setEditMemo(event.target.value)} placeholder="메모" value={editMemo} />
                  <button className="maju-button-primary h-9 px-3 text-xs" disabled={rowBusyId === contact.id} onClick={() => saveEdit(contact.id)} type="button">
                    {rowBusyId === contact.id ? "저장 중..." : "저장"}
                  </button>
                  <button className="maju-button-secondary h-9 px-3 text-xs" onClick={() => setEditingId("")} type="button">
                    취소
                  </button>
                </div>
              ) : (
                <div className="flex flex-wrap items-center gap-x-3 gap-y-1.5">
                  <span className="shrink-0 rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-700">{contact.role}</span>
                  <span className="shrink-0 text-sm font-black text-slate-950">{contact.name}</span>
                  {contact.phone ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-500">
                      <Phone className="h-3.5 w-3.5" />
                      {contact.phone}
                    </span>
                  ) : null}
                  {contact.birthDate ? (
                    <span className="inline-flex shrink-0 items-center gap-1 text-xs font-bold text-slate-500">
                      <CalendarDays className="h-3.5 w-3.5" />
                      {contact.birthDate}
                    </span>
                  ) : null}
                  {contact.memo ? <span className="min-w-0 flex-1 truncate text-xs font-bold text-slate-400">{contact.memo}</span> : null}
                  <div className="ml-auto flex shrink-0 items-center gap-1.5">
                    <button aria-label="연락처 수정" className="grid h-8 w-8 place-items-center rounded-md text-slate-500 hover:bg-slate-100" onClick={() => startEdit(contact)} type="button">
                      <Edit3 className="h-4 w-4" />
                    </button>
                    <button
                      aria-label="연락처 삭제"
                      className="grid h-8 w-8 place-items-center rounded-md text-rose-500 hover:bg-rose-50"
                      disabled={rowBusyId === contact.id}
                      onClick={() => removeContact(contact.id)}
                      type="button"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                </div>
              )}
            </div>
          ))}
        </div>
      ) : (
        <p className="maju-empty-state p-3 text-sm font-bold text-slate-400">등록된 추가 담당자가 없습니다.</p>
      )}

      <datalist id="contact-role-presets">
        {CONTACT_ROLE_PRESETS.map((role) => (
          <option key={role} value={role} />
        ))}
      </datalist>

      <div className="maju-filter-box border-slate-200 bg-white p-3">
        <div className="flex flex-wrap items-center gap-1.5">
          <input className="h-9 w-24 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" list="contact-role-presets" onChange={(event) => setDraftRole(event.target.value)} placeholder="직책" value={draftRole} />
          <input className="h-9 w-28 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setDraftName(event.target.value)} placeholder="담당자 이름" value={draftName} />
          <input className="h-9 w-36 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setDraftPhone(formatPhoneNumberInput(event.target.value))} placeholder="010-0000-0000" value={draftPhone} />
          <input className="h-9 w-36 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold text-slate-500 outline-none focus:border-teal-300 focus:text-slate-950" onChange={(event) => setDraftBirthDate(event.target.value)} type="date" value={draftBirthDate} />
          <input className="h-9 min-w-[120px] flex-1 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setDraftMemo(event.target.value)} placeholder="메모(선택)" value={draftMemo} />
          <button className="maju-button-primary inline-flex h-9 shrink-0 items-center gap-1.5 px-3 text-sm" disabled={isAdding} onClick={addContact} type="button">
            <Plus className="h-4 w-4" />
            {isAdding ? "추가 중..." : "담당자 추가"}
          </button>
        </div>
        {addError ? <p className="mt-1.5 text-xs font-black text-rose-600">{addError}</p> : null}
      </div>
    </div>
  );
}

function CollapsibleSection({ children, defaultOpen = false, title }: { readonly children: ReactNode; readonly defaultOpen?: boolean; readonly title: string }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <section className="maju-section-card">
      <button className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left" onClick={() => setOpen((value) => !value)} type="button">
        <span className="text-sm font-black text-slate-900">{title}</span>
        <ChevronDown className={`h-4 w-4 text-slate-400 transition-transform ${open ? "rotate-180" : ""}`} />
      </button>
      {open ? <div className="border-t border-slate-200 px-4 pb-5">{children}</div> : null}
    </section>
  );
}

function LoadingMediaBox({ files, onSave }: { readonly files: AttachmentFile[]; readonly onSave: (files: AttachmentFile[]) => void }) {
  return (
    <div className="rounded-md border border-slate-300 bg-slate-50 p-4">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className="grid h-10 w-10 shrink-0 place-items-center rounded-md bg-teal-700 text-white">
            <FileImage className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-900">배송 적재위치 사진/영상</p>
              <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-black text-white">배송 필수</span>
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-700 ring-1 ring-inset ring-slate-200">{files.length}개</span>
            </div>
            <p className="mt-1 max-w-xl text-xs font-bold leading-5 text-slate-500">기사님이 출고 전 확인하는 핵심 자료입니다. 적재 위치, 입구, 냉장/냉동 구분 사진과 짧은 영상을 여러 개 저장할 수 있습니다.</p>
          </div>
        </div>
        <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-black text-white shadow-sm hover:bg-teal-800">
          <Plus className="h-4 w-4" />
          추가
          <input
            accept="image/*,video/*"
            className="sr-only"
            multiple
            onChange={(event) => {
              const selectedFiles = Array.from(event.target.files || []);
              if (!selectedFiles.length) return;
              Promise.all(
                selectedFiles.map(
                  (selectedFile) =>
                    new Promise<AttachmentFile>((resolve) => {
                      const mediaType = selectedFile.type.startsWith("video/") ? "video" : "image";
                      const reader = new FileReader();
                      reader.onload = () => resolve({ dataUrl: String(reader.result || ""), mediaType, name: selectedFile.name });
                      reader.readAsDataURL(selectedFile);
                    })
                )
              ).then(onSave);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {files.length ? (
          files.map((file, index) => (
            <MediaPreview file={file} key={`${file.name}-${index}`} />
          ))
        ) : (
          <div className="col-span-full grid h-28 place-items-center rounded-md border border-dashed border-slate-300 bg-white text-center">
            <div>
              <p className="text-xs font-black text-slate-600">아직 업로드된 적재위치 자료가 없습니다.</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">오른쪽 + 버튼으로 사진/영상을 추가하세요.</p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function MediaPreview({ file }: { readonly file: AttachmentFile }) {
  return (
    <div className="maju-stat-card min-w-0 p-2">
      {file.mediaType === "video" ? (
        <video className="h-28 w-full rounded bg-slate-100 object-cover" controls src={file.dataUrl} />
      ) : file.dataUrl ? (
        <img alt={file.name} className="h-28 w-full rounded bg-slate-100 object-cover" src={file.dataUrl} />
      ) : (
        <div className="grid h-28 place-items-center rounded bg-slate-100 text-xs font-black text-slate-500">파일</div>
      )}
      <p className="mt-2 truncate text-xs font-bold text-slate-500">{file.name}</p>
    </div>
  );
}

function BusinessOcrPanel({
  current,
  onApply,
  suggestion
}: {
  readonly current: Pick<BusinessOcrSuggestion, "businessRegistrationNumber" | "companyName" | "openingDate" | "representativeName">;
  readonly onApply: () => void;
  readonly suggestion: BusinessOcrSuggestion;
}) {
  const rows = [
    { current: current.companyName, label: "상호명", value: suggestion.companyName },
    { current: formatBusinessRegistrationNumber(current.businessRegistrationNumber), label: "사업자번호", value: formatBusinessRegistrationNumber(suggestion.businessRegistrationNumber) },
    { current: current.representativeName, label: "대표자명", value: suggestion.representativeName },
    { current: current.openingDate, label: "개업일", value: suggestion.openingDate }
  ];
  const suggestionNumberValid = isValidBusinessRegistrationNumber(suggestion.businessRegistrationNumber);

  return (
    <div className="rounded-md border border-slate-200 bg-slate-50 p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-black text-slate-900">OCR 인식 결과 확인</p>
            <span className={suggestionNumberValid ? "rounded-full bg-emerald-100 px-2 py-0.5 text-[11px] font-black text-emerald-700" : "rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-black text-rose-700"}>
              {suggestionNumberValid ? "사업자번호 검증 통과" : "사업자번호 확인 필요"}
            </span>
          </div>
          <p className="mt-1 text-xs font-bold text-slate-500">사업자등록증에서 읽은 후보값입니다. 기존 값과 비교 후 반영하세요.</p>
        </div>
        <button className="h-9 rounded-md bg-teal-700 px-3 text-xs font-black text-white hover:bg-teal-800 disabled:cursor-not-allowed disabled:bg-slate-300" disabled={!suggestionNumberValid} onClick={onApply} type="button">
          기본정보에 반영
        </button>
      </div>
      <div className="mt-3 grid gap-2 md:grid-cols-2">
        {rows.map((row) => {
          const matched = row.current === row.value;
          return (
            <div className="rounded-md border border-white bg-white/80 p-3" key={row.label}>
              <div className="flex items-center justify-between gap-2">
                <p className="text-xs font-black text-slate-500">{row.label}</p>
                <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${matched ? "bg-emerald-50 text-emerald-700" : "bg-amber-50 text-amber-700"}`}>
                  {matched ? "일치" : "확인필요"}
                </span>
              </div>
              <p className="mt-2 break-words text-sm font-black text-slate-950">{row.value}</p>
              {!matched ? <p className="mt-1 break-words text-xs font-bold text-slate-400">현재값: {row.current || "미입력"}</p> : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function AttachmentBox({
  description,
  file,
  important = false,
  label,
  onSave
}: {
  readonly description: string;
  readonly file?: AttachmentFile;
  readonly important?: boolean;
  readonly label: string;
  readonly onSave: (file: AttachmentFile) => void;
}) {
  return (
    <div className={`rounded-md border p-4 ${important ? "border-slate-300 bg-slate-50" : "border-slate-200 bg-white"}`}>
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex min-w-0 flex-1 items-start gap-3">
          <span className={`grid h-10 w-10 shrink-0 place-items-center rounded-md ${important ? "bg-teal-700 text-white" : "bg-white text-slate-400"}`}>
            <FileImage className="h-4 w-4" />
          </span>
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <p className="text-sm font-black text-slate-900">{label}</p>
              {important ? <span className="rounded-full bg-teal-700 px-2 py-0.5 text-[11px] font-black text-white">중요</span> : null}
            </div>
            <p className="mt-1 text-xs font-bold leading-5 text-slate-500">{description}</p>
          </div>
        </div>
        <label className="maju-button-secondary inline-flex h-10 cursor-pointer items-center gap-2 px-3 text-sm">
          <Plus className="h-4 w-4" />
          추가
          <input
            accept="image/*,.pdf"
            className="sr-only"
            onChange={(event) => {
              const selectedFile = event.target.files?.[0];
              if (!selectedFile) return;
              if (!selectedFile.type.startsWith("image/")) {
                onSave({ mediaType: "file", name: selectedFile.name });
                event.target.value = "";
                return;
              }
              const reader = new FileReader();
              reader.onload = () => onSave({ dataUrl: String(reader.result || ""), mediaType: "image", name: selectedFile.name });
              reader.readAsDataURL(selectedFile);
              event.target.value = "";
            }}
            type="file"
          />
        </label>
      </div>
      <div className="mt-4">
        {file ? (
          <MediaPreview file={file} />
      ) : (
          <div className="maju-empty-state grid h-24 place-items-center text-center">
          <div>
              <p className="text-xs font-black text-slate-600">아직 업로드된 자료가 없습니다.</p>
              <p className="mt-1 text-[11px] font-bold text-slate-400">+ 버튼으로 이미지/PDF를 추가하세요.</p>
          </div>
        </div>
      )}
      </div>
    </div>
  );
}

function EditRow({
  label,
  onChange,
  type = "text",
  value
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly type?: "date" | "text";
  readonly value: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-black text-slate-500">{label}</span>
      <input className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => onChange(event.target.value)} type={type} value={value} />
    </label>
  );
}

function BusinessNumberEditRow({ onChange, valid, value }: { readonly onChange: (value: string) => void; readonly valid: boolean; readonly value: string }) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="flex items-center justify-between gap-2">
        <span className="text-xs font-black text-slate-500">사업자번호</span>
        <span className={valid ? "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700" : "rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700"}>
          {valid ? "유효" : "확인필요"}
        </span>
      </span>
      <input
        className={`h-10 min-w-0 rounded-md border bg-white px-3 font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100 ${valid ? "border-slate-200" : "border-rose-200"}`}
        inputMode="numeric"
        onChange={(event) => onChange(formatBusinessRegistrationNumber(event.target.value))}
        placeholder="000-00-00000"
        value={value}
      />
    </label>
  );
}

function SelectRow({
  label,
  onChange,
  options,
  value
}: {
  readonly label: string;
  readonly onChange: (value: string) => void;
  readonly options: Array<{ label: string; value: string }>;
  readonly value: string;
}) {
  return (
    <label className="grid gap-1.5 text-sm">
      <span className="text-xs font-black text-slate-500">{label}</span>
      <select className="h-10 min-w-0 rounded-md border border-slate-200 bg-white px-3 font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => onChange(event.target.value)} value={value}>
        {options.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
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
    <div className={`relative min-w-0 overflow-hidden border-r border-slate-200/80 px-4 py-2.5 last:border-r-0 ${backgroundClass}`}>
      <span className={`absolute inset-x-0 top-0 h-0.5 ${accentClass}`} />
      <p className="truncate text-[11px] font-black text-slate-500">{label}</p>
      <p className={`mt-1 truncate text-[20px] font-black leading-none ${valueClass}`}>{value}</p>
      {helper ? <p className="mt-1.5 truncate text-[10px] font-bold text-slate-400">{helper}</p> : null}
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
      {helper ? <p className="truncate text-[10px] font-bold text-slate-500">{helper}</p> : null}
    </div>
  );
}

function RouteMetric({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="min-w-0 rounded-md border border-slate-200 bg-white px-3 py-2">
      <p className="truncate text-[11px] font-black text-slate-400">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
    </div>
  );
}

function RouteWorkStep({ active, done, label }: { active: boolean; done: boolean; label: string }) {
  return (
    <div className={`flex items-center gap-2 rounded-md border px-2.5 py-2 ${done ? "border-emerald-200 bg-white text-emerald-800" : active ? "border-slate-300 bg-white text-slate-900" : "border-slate-200 bg-white text-slate-500"}`}>
      <span className={`grid h-5 w-5 shrink-0 place-items-center rounded-full ${done ? "bg-emerald-600 text-white" : active ? "bg-teal-700 text-white" : "bg-slate-200 text-slate-500"}`}>
        {done ? <CheckCircle2 className="h-3.5 w-3.5" /> : <span className="h-1.5 w-1.5 rounded-full bg-current" />}
      </span>
      <span className="text-xs font-black">{label}</span>
    </div>
  );
}

function PanelTitle({ title }: { readonly title: string }) {
  return <p className="border-b border-slate-200 pb-2 text-xs font-black text-slate-500">{title}</p>;
}

function InfoRow({ icon, label, value }: { readonly icon?: React.ReactNode; readonly label: string; readonly value: string }) {
  return (
    <div className="grid gap-1.5 text-sm">
      <span className="text-xs font-black text-slate-500">{label}</span>
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
        deliveryDriver: (store as RoutePlanStop & { deliveryDriver?: string }).deliveryDriver || defaultDriverByIndex(index),
        email: store.email || "",
        grade: getRevenueGrade(store.expectedRevenue),
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
        deliveryDriver: defaultDriverByIndex(index),
        distanceKm: 0,
        durationMinutes: 0,
        email: "",
        expectedRevenue,
        grade: normalizeRevenueGrade(marker.grade) || getRevenueGrade(expectedRevenue),
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
      const globalIndex = vehicleIndex * 15 + storeIndex;
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
        grade: getRevenueGrade(store.expectedRevenue),
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

function normalizeRevenueGrade(value: string | undefined): RevenueGrade | undefined {
  if (value === "A" || value === "B" || value === "C") return value;
  return undefined;
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
    visitCount: Number(store.order || 0)
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
  extraVehicles: string[] = []
): DeliveryVehicle[] {
  const groups = new Map<string, StoreRow[]>();
  const explicitVehicleKeys = new Set<string>();

  stores.forEach((store, index) => {
    const driver = store.deliveryDriver || defaultDriverByIndex(index);
    const area = store.deliveryArea || store.region || "미분류";
    // routeSeedStores(서버 원본 데이터)에는 deliveryVehicleName이 아니라 deliveryVehicle 필드로
    // 값이 들어옵니다(RoutePlanStop.deliveryVehicle). deliveryVehicleName은 createDeliveryStoreRows가
    // 그룹핑 이후 화면 표시용으로 파생시키는 필드라 여기서는 아직 존재하지 않아, 이 값으로 확인하면
    // 항상 비어 있어 그룹핑이 담당자 기준 자동 그룹으로만 폴백해버립니다.
    const vehicleKey = store.deliveryVehicle || driver;
    if (store.deliveryVehicle) explicitVehicleKeys.add(vehicleKey);
    groups.set(vehicleKey, [...(groups.get(vehicleKey) || []), { ...store, deliveryDriver: driver, deliveryArea: area }]);
  });

  // 아직 거래처가 배정되지 않은, 방금 추가한 배송차도 빈 그룹으로 목록에 나타나야 합니다.
  extraVehicles.forEach((vehicleName) => {
    explicitVehicleKeys.add(vehicleName);
    if (!groups.has(vehicleName)) groups.set(vehicleName, []);
  });

  return Array.from(groups.entries()).map(([vehicleKey, stops], index) => {
    const orderedStops = stops.map((stop, stopIndex) => ({
      ...stop,
      order: stopIndex + 1
    }));
    const isExplicitVehicle = explicitVehicleKeys.has(vehicleKey);
    const representativeDriver = mostFrequentDriver(orderedStops) || (isExplicitVehicle ? "" : vehicleKey);
    const vehicleName = isExplicitVehicle ? vehicleKey : `배송 ${index + 1}호차`;

    return {
      addresses: orderedStops.map((stop) => stop.address || stop.region),
      area: summarizeVehicleArea(orderedStops),
      driver: representativeDriver,
      expectedRevenue: orderedStops.reduce((total, stop) => total + Number(stop.expectedRevenue || 0), 0),
      fuelType: vehicleFuelTypes?.[representativeDriver] || "diesel",
      id: `vehicle-${index + 1}`,
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

function defaultDriverByIndex(index: number) {
  return ["김배송 매니저", "박배송 매니저", "이배송 매니저", "최배송 매니저", "정배송 매니저", "한배송 매니저", "오배송 매니저", "서배송 매니저", "신배송 매니저", "문배송 매니저"][index % 10];
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

function createMarkers(existingMarkers: KakaoMapMarker[], stores: StoreRow[], mode: MarkerViewMode, vehicleMeta: Record<string, { color: string; label: string }>): KakaoMapMarker[] {
  const origin = existingMarkers.find((marker) => marker.tone === "origin");
  const originWithId = origin ? { ...origin, id: origin.id || originMarkerId } : undefined;
  const storeMarkers = spreadMarkers(
    stores.map((store) => {
      const vehicle = store.deliveryVehicleId ? vehicleMeta[store.deliveryVehicleId] : undefined;

      return {
        address: store.address || `${store.region} ${store.name}`,
        grade: mode === "grade" ? store.grade : undefined,
        id: store.id,
        label: mode === "vehicle" ? vehicle?.label || "?" : store.grade,
        markerColor: mode === "vehicle" ? vehicle?.color : undefined,
        name: mode === "vehicle" ? `${store.deliveryVehicleName || "배송차 미지정"} · ${store.name}` : store.name,
        // 이전에는 여기가 "lead"로 잘못 표시되어 있어서, 지도 탭의 onMarkerClick이 등록된
        // 거래처 마커를 신규 리드로 오인해 setPreviewLeadId를 호출했습니다. leadRadiusResult가
        // 없을 때는(기본 상태) 그 조건도 항상 거짓이라 아무 카드도 뜨지 않았던 것이 "마커
        // 선택하면 카드가 안 보임" 버그의 실제 원인이었습니다.
        tone: "customer" as const,
        x: store.markerX,
        y: store.markerY
      };
    })
  );

  return mergeMarkers(originWithId ? [originWithId, ...storeMarkers] : storeMarkers);
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

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function createBusinessOcrSuggestion(store: StoreRow, fileName: string): BusinessOcrSuggestion {
  const seed = fileName.length + store.name.length;
  const currentNumber = isValidBusinessRegistrationNumber(store.businessRegistrationNumber) ? store.businessRegistrationNumber : "";
  const generatedNumber = currentNumber || createBusinessNumber(seed);
  return {
    businessRegistrationNumber: formatBusinessRegistrationNumber(generatedNumber),
    businessStatus: "active",
    companyName: store.name,
    openingDate: store.openingDate,
    representativeName: store.representativeName
  };
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

function createBusinessNumber(index: number) {
  const middle = String(10 + (index % 89)).padStart(2, "0");
  const serial = String(1000 + ((index * 7919) % 8999)).padStart(4, "0");
  const base = `123${middle}${serial}`;
  return formatBusinessRegistrationNumber(`${base}${getBusinessRegistrationCheckDigit(base)}`);
}

function normalizeBusinessRegistrationNumber(value: string) {
  return value.replace(/[^0-9]/g, "").slice(0, 10);
}

function formatBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value);
  if (digits.length <= 3) return digits;
  if (digits.length <= 5) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 5)}-${digits.slice(5)}`;
}

function isValidBusinessRegistrationNumber(value: string) {
  const digits = normalizeBusinessRegistrationNumber(value);
  if (!/^[0-9]{10}$/.test(digits)) return false;
  return getBusinessRegistrationCheckDigit(digits.slice(0, 9)) === Number(digits[9]);
}

// 휴대폰(010 등, 3-4-4)과 서울(02)/지역 번호를 입력 자릿수에 맞춰 실시간으로 하이픈 처리합니다.
function formatPhoneNumberInput(value: string) {
  const digits = value.replace(/[^0-9]/g, "").slice(0, 11);
  if (!digits) return "";

  if (digits.startsWith("02")) {
    if (digits.length <= 2) return digits;
    if (digits.length <= 5) return `${digits.slice(0, 2)}-${digits.slice(2)}`;
    if (digits.length <= 9) return `${digits.slice(0, 2)}-${digits.slice(2, 5)}-${digits.slice(5)}`;
    return `${digits.slice(0, 2)}-${digits.slice(2, 6)}-${digits.slice(6, 10)}`;
  }

  if (digits.length <= 3) return digits;
  if (digits.length <= 7) return `${digits.slice(0, 3)}-${digits.slice(3)}`;
  if (digits.length <= 10) return `${digits.slice(0, 3)}-${digits.slice(3, 6)}-${digits.slice(6)}`;
  return `${digits.slice(0, 3)}-${digits.slice(3, 7)}-${digits.slice(7, 11)}`;
}

function getBusinessRegistrationCheckDigit(firstNineDigits: string) {
  const digits = normalizeBusinessRegistrationNumber(firstNineDigits).slice(0, 9).padEnd(9, "0");
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10;
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
      grade: edit?.grade || getRevenueGrade(expectedRevenue)
    };
  });
}

function applyVehicleEdits(vehicles: DeliveryVehicle[], edits: Record<string, VehicleEdit>) {
  return vehicles.map((vehicle) => ({
    ...vehicle,
    ...edits[vehicle.id]
  }));
}

function getDeliveryDefaults(vehicles: DeliveryVehicle[]) {
  // 배송차 안에 담당자가 여러 명 섞여 있을 수 있어(같은 트럭을 나눠 쓰는 경우), 배송차의 대표
  // 담당자(vehicle.driver)만 모으면 일부 담당자를 놓칠 수 있습니다. 각 배송차에 실제로 배정된
  // 모든 거래처의 담당자를 함께 모아 정확한 담당자 목록을 만듭니다.
  const driverSet = new Set<string>();
  vehicles.forEach((vehicle) => {
    if (vehicle.driver) driverSet.add(vehicle.driver);
    vehicle.stops.forEach((stop) => {
      if (stop.deliveryDriver) driverSet.add(stop.deliveryDriver);
    });
  });
  const drivers = Array.from(driverSet).sort();
  const areas = Array.from(new Set(vehicles.map((vehicle) => vehicle.area).filter(Boolean))).sort();
  return { areas, drivers };
}

function readLocalJson<T>(key: string, fallback: T): T {
  if (typeof window === "undefined") return fallback;
  try {
    const raw = window.localStorage.getItem(key);
    return raw ? (JSON.parse(raw) as T) : fallback;
  } catch {
    return fallback;
  }
}

function saveLocalJson(key: string, value: unknown) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Attachments can be large because previews are stored as data URLs in the browser.
  }
}

function getStoreTotals(stores: StoreRow[]) {
  return {
    distanceKm: roundToOneDecimal(stores.reduce((total, store) => total + Number(store.distanceKm || 0), 0)),
    durationMinutes: stores.reduce((total, store) => total + Number(store.durationMinutes || 0), 0),
    expectedRevenue: stores.reduce((total, store) => total + Number(store.expectedRevenue || 0), 0)
  };
}

function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}시간 ${rest}분` : `${rest}분`;
}

function estimateFuelCostWon(distanceKm: number, pricePerLiter: number, mileageKmPerLiter = 7.5) {
  if (!Number.isFinite(distanceKm) || distanceKm <= 0) return 0;
  if (!Number.isFinite(pricePerLiter) || pricePerLiter <= 0) return 0;
  if (!Number.isFinite(mileageKmPerLiter) || mileageKmPerLiter <= 0) return 0;

  return Math.round((distanceKm / mileageKmPerLiter) * pricePerLiter);
}

function getProviderLabel(provider?: RoutePlanStop["routeProvider"]) {
  if (provider === "cached") return "티맵 캐시";
  if (provider === "tmap") return "티맵";
  if (provider === "estimated") return "티맵 계산 전";
  return "계산 전";
}

function getBusinessStatusLabel(status: StoreRow["businessStatus"]) {
  if (status === "active") return "정상";
  if (status === "closed") return "폐업";
  return "확인필요";
}

function getDocumentStatusLabel(status: StoreRow["businessCertificateStatus"]) {
  return status === "received" ? "수취 완료" : "미수취";
}

function businessStatusClass(status: StoreRow["businessStatus"]) {
  if (status === "active") return "rounded-full bg-emerald-50 px-2 py-0.5 text-[11px] font-black text-emerald-700";
  if (status === "closed") return "rounded-full bg-rose-50 px-2 py-0.5 text-[11px] font-black text-rose-700";
  return "rounded-full bg-amber-50 px-2 py-0.5 text-[11px] font-black text-amber-700";
}

function roundToOneDecimal(value: number) {
  return Math.round(value * 10) / 10;
}

function roundToSix(value: number) {
  return Math.round(value * 1000000) / 1000000;
}

function gradeBadgeClass(grade: RevenueGrade) {
  if (grade === "A") return "rounded-full bg-emerald-500 px-2.5 py-1 text-xs font-black text-white";
  if (grade === "B") return "rounded-full bg-slate-700 px-2.5 py-1 text-xs font-black text-white";
  return "rounded-full bg-slate-500 px-2.5 py-1 text-xs font-black text-white";
}
