"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import type { LucideIcon } from "lucide-react";
import {
  CalendarDays,
  Check,
  CheckCircle2,
  ChevronDown,
  CircleSlash,
  Copy,
  Crosshair,
  Download,
  ExternalLink,
  EyeOff,
  FileImage,
  Gauge,
  Instagram,
  ListFilter,
  Loader2,
  MapPin,
  MapPinPlus,
  MessageCircle,
  MessageSquareText,
  Phone,
  Radar,
  RefreshCw,
  Search,
  Trash2,
  Upload,
  UserCheck,
  X
} from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { buildPlaceSearchLinks } from "@/lib/place-links";
import { InlineLoading } from "@/components/inline-loading";
import { KakaoAddressMap, KakaoMapMarker } from "@/components/kakao-address-map";
import { PermitLeadActionItem, PermitLeadItem, PermitLeadPeriod, PermitLeadQueues } from "@/lib/store";
import {
  BulkLeadActionBusy,
  CompanyLeadSearchRegion,
  DirectoryStat,
  GovSyncResult,
  KakaoKeywordLeadSweepResult,
  LIST_PAGE_SIZE_OPTIONS,
  LeadOpenDateFilterMode,
  ListPageSize,
  NearbyPermitLeadResult,
  PERMIT_ACTION_OPTIONS,
  PERMIT_PERIOD_BADGE_LABEL,
  PERMIT_PERIOD_OPTIONS,
  PermitLeadActionIntent,
  PermitLeadActionKind,
  PermitLeadActionResult,
  PermitLeadEnrichResponse,
  PermitLeadSourceStatus,
  PermitUploadResult,
  QUOTE_DRAFT_UPDATED_EVENT,
  QUOTE_FOLLOW_UP_STATUS_FILTER,
  QuoteDraft,
  QuoteSubject,
  SeoulSyncResult,
  StoreRow,
  buildLeadDmScript,
  buildOutboundItemNotes,
  formatLeadOpenDateFilterLabel,
  getLeadConfidence,
  getLeadInstagramHandle,
  getLeadInstagramSearchTokens,
  getLeadInstagramSearchUrl,
  getPermitLeadOpenDate,
  getPermitLeadQuoteSubject,
  getPermitLeadTableAction,
  isPermitLeadInOpenDateFilter,
  isPermitLeadUnscored,
  localStoreKeys,
  normalizeInstagramHandleValue,
  normalizeLeadSearchToken,
  parsePermitExcelFile,
  permitGradeToneClassName,
  permitLeadActionLabel,
  quoteDraftId,
  readLocalJson,
  readQuoteDraft,
  withPermitLeadCompanyQuery
} from "@/components/sales-route-map-workspace";

// 2026-08-24 피드백: "전반적으로 속도가 더뎌, 빠른 속도가 중요할 것 같아" — 신규 리드 탭(PermitLeadsView +
// PermitLeadDetailPanel)이 지도 홈 컴포넌트 파일의 약 4분의 1을 차지하고 있어서, 지도·거래처·코스
// 탭만 보는 사용자도 이 코드를 전부 내려받고 있었습니다. next/dynamic으로 별도 청크로 분리해,
// "리드" 탭을 실제로 열 때만 이 파일의 JS를 내려받도록 합니다.

export function PermitLeadsView({ onOpenQuote, stores }: { readonly onOpenQuote: (lead: PermitLeadItem) => void; readonly stores: StoreRow[] }) {
  const [leads, setLeads] = useState<PermitLeadItem[]>([]);
  const [queues, setQueues] = useState<PermitLeadQueues | null>(null);
  const [loadState, setLoadState] = useState<"loading" | "ready" | "error">("loading");
  const [viewMode, setViewMode] = useState<"table" | "map">("table");

  const [periodFilter, setPeriodFilter] = useState<"all" | PermitLeadPeriod>("all");
  const [openDateFilterMode, setOpenDateFilterMode] = useState<LeadOpenDateFilterMode>("all");
  const [openDateYear, setOpenDateYear] = useState("");
  const [openDateMonth, setOpenDateMonth] = useState("");
  const [openDateStart, setOpenDateStart] = useState("");
  const [openDateEnd, setOpenDateEnd] = useState("");
  const [industryFilter, setIndustryFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [gradeFilter, setGradeFilter] = useState("");
  const [hasPhoneOnly, setHasPhoneOnly] = useState(false);
  const [hasInstagramOnly, setHasInstagramOnly] = useState(false);
  const [excludeExcluded, setExcludeExcluded] = useState(true);
  const [showAdvancedFilters, setShowAdvancedFilters] = useState(false);
  const [tableSearch, setTableSearch] = useState("");
  const [selectedLeadIds, setSelectedLeadIds] = useState<string[]>([]);
  const [bulkMessage, setBulkMessage] = useState("");
  const [bulkActionBusy, setBulkActionBusy] = useState<BulkLeadActionBusy>("");
  const [dismissingLeadId, setDismissingLeadId] = useState("");
  const [bulkNextActionDate, setBulkNextActionDate] = useState("");
  const [leadPage, setLeadPage] = useState(1);
  const [leadPageSize, setLeadPageSize] = useState<ListPageSize>(30);

  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadBusy, setUploadBusy] = useState(false);
  const [uploadResult, setUploadResult] = useState<PermitUploadResult | null>(null);
  const [uploadWarning, setUploadWarning] = useState("");
  const [govSyncBusy, setGovSyncBusy] = useState(false);
  const [govSyncResult, setGovSyncResult] = useState<GovSyncResult | null>(null);
  const [govSyncWarning, setGovSyncWarning] = useState("");
  const [seoulSyncBusy, setSeoulSyncBusy] = useState(false);
  const [seoulSyncResult, setSeoulSyncResult] = useState<SeoulSyncResult | null>(null);
  const [seoulSyncWarning, setSeoulSyncWarning] = useState("");
  const [showSourceDetails, setShowSourceDetails] = useState(false);
  const [sourceStatus, setSourceStatus] = useState<PermitLeadSourceStatus | null>(null);

  // "영업리드(신규리드, 개업일자 아님)" 확장 탐색 — 2026-08-31 피드백: 개업일자와 무관하게 이미
  // 운영 중인 매장까지 카카오 로컬 키워드 검색으로 찾아온다. 반경 자동(등록 거래처) + 고객사
  // 지정 지역을 함께 기준점으로 쓴다.
  const [keywordSearchRegions, setKeywordSearchRegions] = useState<CompanyLeadSearchRegion[]>([]);
  const [newRegionLabel, setNewRegionLabel] = useState("");
  const [regionBusy, setRegionBusy] = useState(false);
  const [regionMessage, setRegionMessage] = useState("");
  const [keywordSweepBusy, setKeywordSweepBusy] = useState(false);
  const [keywordSweepResult, setKeywordSweepResult] = useState<KakaoKeywordLeadSweepResult | null>(null);
  const [keywordSweepWarning, setKeywordSweepWarning] = useState("");

  const anySyncBusy = govSyncBusy || seoulSyncBusy;
  const [recommendBusy, setRecommendBusy] = useState(false);
  const [recommendMessage, setRecommendMessage] = useState("");
  const [recommendTopIndustries, setRecommendTopIndustries] = useState<string[]>([]);

  const [selectedLead, setSelectedLead] = useState<PermitLeadItem | null>(null);
  const [selectedLeadIntent, setSelectedLeadIntent] = useState<PermitLeadActionIntent>("");
  const [actionMessage, setActionMessage] = useState("");
  const [quoteDraftRevision, setQuoteDraftRevision] = useState(0);

  const [nearbyOpen, setNearbyOpen] = useState(false);
  const [anchorMode, setAnchorMode] = useState<"customer" | "all">("customer");
  const [anchorCustomerId, setAnchorCustomerId] = useState("");
  const [radiusKm, setRadiusKm] = useState(5);
  const [nearbySearching, setNearbySearching] = useState(false);
  const [nearbyResult, setNearbyResult] = useState<NearbyPermitLeadResult | null>(null);
  const [nearbyError, setNearbyError] = useState("");
  const [showNearbyOnly, setShowNearbyOnly] = useState(false);

  // "신규 리드"(인허가 최신순, 기본) vs "영업리드"(키워드 검색량순) — 2026-08-20 피드백: "신규리드 >
  // 인허가데이터로 진행 / 영업리드 > 키워드 검색량 순으로 진행". 검색량 점수는 네이버 데이터랩으로
  // 조회해 DB(keyword_volume)에 캐시하고, 화면은 그 값으로 로컬 정렬만 다시 합니다.
  const [leadQualityMode, setLeadQualityMode] = useState<"permit" | "keyword">("permit");
  const [keywordVolumeScores, setKeywordVolumeScores] = useState<Record<string, number>>({});
  const [keywordVolumeLoading, setKeywordVolumeLoading] = useState(false);
  const [keywordVolumeConfigured, setKeywordVolumeConfigured] = useState(true);

  const geocodableStores = useMemo(() => stores.filter((store) => store.address?.trim()), [stores]);
  const quoteDrafts = useMemo(() => readLocalJson<Record<string, QuoteDraft>>(localStoreKeys.quoteDrafts, {}), [quoteDraftRevision]);

  useEffect(() => {
    const refreshQuoteDrafts = () => setQuoteDraftRevision((value) => value + 1);
    window.addEventListener(QUOTE_DRAFT_UPDATED_EVENT, refreshQuoteDrafts);
    return () => window.removeEventListener(QUOTE_DRAFT_UPDATED_EVENT, refreshQuoteDrafts);
  }, []);

  const loadLeads = useCallback(() => {
    setLoadState((current) => (current === "ready" ? current : "loading"));
    const params = new URLSearchParams();
    if (periodFilter !== "all") params.set("period", periodFilter);
    if (industryFilter) params.set("industry", industryFilter);
    if (actionFilter) params.set("action", actionFilter);
    if (statusFilter && statusFilter !== QUOTE_FOLLOW_UP_STATUS_FILTER) params.set("status", statusFilter);
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
  }, [periodFilter, industryFilter, actionFilter, statusFilter, gradeFilter, hasPhoneOnly, excludeExcluded]);

  useEffect(() => {
    loadLeads();
  }, [loadLeads]);

  useEffect(() => {
    fetch(withPermitLeadCompanyQuery("/api/leads/permits/sources"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload) setSourceStatus(payload);
      })
      .catch(() => null);
  }, []);

  const loadKeywordSearchRegions = useCallback(() => {
    fetch(withPermitLeadCompanyQuery("/api/leads/permits/keyword-search-regions"), { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (payload?.regions) setKeywordSearchRegions(payload.regions);
      })
      .catch(() => null);
  }, []);

  useEffect(() => {
    loadKeywordSearchRegions();
  }, [loadKeywordSearchRegions]);

  async function handleAddKeywordSearchRegion() {
    if (!newRegionLabel.trim()) return;
    setRegionBusy(true);
    setRegionMessage("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/keyword-search-regions"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ label: newRegionLabel })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setRegionMessage(payload?.message || "지역 추가에 실패했습니다.");
        return;
      }
      setNewRegionLabel("");
      loadKeywordSearchRegions();
    } catch (error) {
      setRegionMessage(error instanceof Error ? error.message : "네트워크 오류로 지역을 추가하지 못했습니다.");
    } finally {
      setRegionBusy(false);
    }
  }

  async function handleRemoveKeywordSearchRegion(regionId: string) {
    setRegionBusy(true);
    setRegionMessage("");
    try {
      // 2026-08-31 에러 처리 감사 대응: 응답 상태를 확인하지 않고 바로 화면 목록에서 지웠던
      // 탓에, 서버가 삭제에 실패해도 화면은 이미 삭제된 것처럼 보였습니다.
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/keyword-search-regions?id=${encodeURIComponent(regionId)}`), {
        method: "DELETE"
      });
      if (!response.ok) {
        setRegionMessage("지역 삭제에 실패했습니다. 다시 시도해주세요.");
        return;
      }
      setKeywordSearchRegions((current) => current.filter((region) => region.id !== regionId));
    } catch {
      setRegionMessage("네트워크 오류로 지역을 삭제하지 못했습니다.");
    } finally {
      setRegionBusy(false);
    }
  }

  // "영업리드 추가 탐색" 수동 버튼 — 등록 거래처 반경 + 위 지정 지역을 기준점으로 카카오 로컬
  // 키워드 검색을 돌려, 개업일자와 무관하게 이미 운영 중인 매장을 리드로 채워 넣습니다.
  async function handleKeywordLeadSweep() {
    setKeywordSweepBusy(true);
    setKeywordSweepResult(null);
    setKeywordSweepWarning("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/keyword-search"), {
        method: "POST",
        headers: { "Content-Type": "application/json" }
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setKeywordSweepWarning(payload?.message || "영업리드 탐색에 실패했습니다.");
        return;
      }
      setKeywordSweepResult(payload);
      loadLeads();
    } catch (error) {
      setKeywordSweepWarning(error instanceof Error ? error.message : "네트워크 오류로 영업리드 탐색을 실행하지 못했습니다.");
    } finally {
      setKeywordSweepBusy(false);
    }
  }

  const industryCounts = useMemo(() => {
    const counts = new Map<string, number>();
    leads.forEach((lead) => {
      if (!lead.industryPrimary) return;
      counts.set(lead.industryPrimary, (counts.get(lead.industryPrimary) || 0) + 1);
    });
    return counts;
  }, [leads]);
  const industryOptions = useMemo(() => Array.from(industryCounts.keys()).sort(), [industryCounts]);
  const quickIndustryOptions = useMemo(
    () => Array.from(industryCounts.entries()).sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "ko")).slice(0, 10),
    [industryCounts]
  );
  const openDateOptions = useMemo(() => {
    const yearCounts = new Map<string, number>();
    const monthCounts = new Map<string, number>();
    leads.forEach((lead) => {
      const openDate = getPermitLeadOpenDate(lead);
      if (!openDate) return;
      const year = openDate.slice(0, 4);
      const month = openDate.slice(0, 7);
      yearCounts.set(year, (yearCounts.get(year) || 0) + 1);
      monthCounts.set(month, (monthCounts.get(month) || 0) + 1);
    });
    return {
      months: Array.from(monthCounts.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([value, count]) => ({ count, value })),
      years: Array.from(yearCounts.entries())
        .sort((a, b) => b[0].localeCompare(a[0]))
        .map(([value, count]) => ({ count, value }))
    };
  }, [leads]);
  const quickOpenMonthOptions = useMemo(() => openDateOptions.months.slice(0, 6), [openDateOptions.months]);
  const openDateCoverageSummary = useMemo(() => {
    const withOpenDate = leads.filter((lead) => getPermitLeadOpenDate(lead)).length;
    return {
      missing: Math.max(0, leads.length - withOpenDate),
      total: leads.length,
      withOpenDate
    };
  }, [leads]);

  const nearbyLeadIds = useMemo(() => new Set((nearbyResult?.leads || []).map((lead) => lead.id)), [nearbyResult]);
  const nearbyDistanceById = useMemo(() => {
    const map = new Map<string, number>();
    (nearbyResult?.leads || []).forEach((lead) => map.set(lead.id, lead.distanceKm));
    return map;
  }, [nearbyResult]);

  const filteredLeads = useMemo(() => {
    const keyword = tableSearch.trim().toLowerCase();
    const normalizedKeyword = normalizeLeadSearchToken(keyword);
    return leads
      .filter((lead) => !showNearbyOnly || nearbyLeadIds.has(lead.id))
      .filter((lead) => isPermitLeadInOpenDateFilter(lead, openDateFilterMode, openDateYear, openDateMonth, openDateStart, openDateEnd))
      .filter((lead) => !hasInstagramOnly || Boolean(getLeadInstagramHandle(lead)))
      .filter((lead) => statusFilter !== QUOTE_FOLLOW_UP_STATUS_FILTER || lead.status === "견적 발송" || lead.status === "재연락 예정")
      .filter(
        (lead) =>
          !keyword ||
          [lead.businessName, lead.address, lead.phone, lead.representativeName, lead.industryPrimary]
            .concat(getLeadInstagramSearchTokens(lead))
            .filter(Boolean)
            .some((value) => {
              const text = String(value).toLowerCase();
              return text.includes(keyword) || (normalizedKeyword && normalizeLeadSearchToken(text).includes(normalizedKeyword));
            })
      );
  }, [leads, tableSearch, showNearbyOnly, nearbyLeadIds, openDateFilterMode, openDateYear, openDateMonth, openDateStart, openDateEnd, statusFilter, hasInstagramOnly]);

  // "영업리드(키워드 검색량순)"로 바꾸면 지금 화면에 보이는 리드 중 아직 점수가 없는 것만 조회합니다
  // (전체 리드를 한 번에 조회하지 않아 API 호출을 아낍니다). 이미 값이 있으면(캐시 또는 리드 자체의
  // keywordVolume) 다시 조회하지 않습니다.
  useEffect(() => {
    if (leadQualityMode !== "keyword") return;
    const targetIds = filteredLeads
      .filter((lead) => typeof keywordVolumeScores[lead.id] !== "number" && !lead.keywordVolume)
      .slice(0, 60)
      .map((lead) => lead.id);
    if (!targetIds.length) return;

    setKeywordVolumeLoading(true);
    fetch(withPermitLeadCompanyQuery("/api/leads/permits/keyword-volume"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ leadIds: targetIds })
    })
      .then((response) => (response.ok ? response.json() : null))
      .then((payload) => {
        if (!payload) return;
        if (payload.configured === false) setKeywordVolumeConfigured(false);
        if (payload.scores) setKeywordVolumeScores((current) => ({ ...current, ...payload.scores }));
      })
      .catch(() => null)
      .finally(() => setKeywordVolumeLoading(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [leadQualityMode, filteredLeads]);

  function keywordVolumeOf(lead: PermitLeadItem): number {
    return keywordVolumeScores[lead.id] ?? lead.keywordVolume ?? 0;
  }

  // "영업리드"는 검색량만이 아니라 "영업이 잘되는지·리뷰가 좋은지"까지 함께 봐야 한다는 피드백
  // (2026-08-24)을 반영한 정렬 지표입니다. lib/store.ts의 computePermitLeadScoreBreakdown과 같은
  // 가중치를 써서(검색량 최대 15점 + 평점 최대 8점 + 리뷰수 최대 7점, 로그 스케일) 화면에 뜨는
  // 숫자와 저장되는 등급 점수가 서로 어긋나지 않게 합니다.
  // "왜 이 리드를 추천하는지"를 짧은 태그로 보여줍니다(2026-08-24 피드백: "거래 성사 확률이 높은
  // 곳을 추천해야 한다" — 등급 알파벳만으로는 담당자가 이유를 알 수 없어서 추가). route_fit_score/
  // industry_fit_score는 refreshPermitLeadRecommendationScores가 채운 값을 그대로 읽고, 업종 일치
  // 여부는 "추천 점수 갱신"을 이번 세션에서 실행했을 때만(recommendTopIndustries) 정확히 표시됩니다.
  function recommendationTagsOf(lead: PermitLeadItem): string[] {
    const tags: string[] = [];
    if (lead.leadPeriod === "today" || lead.leadPeriod === "week") tags.push("개업 임박");
    const routeFit = lead.scoreBreakdown?.route_fit_score ?? 0;
    if (routeFit >= 15) tags.push("기거래처 인근");
    else if (routeFit >= 11) tags.push("기거래처 근접");
    if (recommendTopIndustries.includes(lead.industryPrimary)) tags.push("주력 업종");
    return tags;
  }

  function businessAttractivenessOf(lead: PermitLeadItem): number {
    const keywordPoints = Math.min(15, Math.round(keywordVolumeOf(lead) / 5));
    const ratingPoints = lead.rating ? Math.round((Math.min(lead.rating, 5) / 5) * 8) : 0;
    const reviewCountPoints = lead.reviewCount ? Math.min(7, Math.round(Math.log10(lead.reviewCount + 1) * 3)) : 0;
    return keywordPoints + ratingPoints + reviewCountPoints;
  }

  const sortedLeads = useMemo(() => {
    if (leadQualityMode !== "keyword") return filteredLeads;
    return [...filteredLeads].sort((a, b) => businessAttractivenessOf(b) - businessAttractivenessOf(a));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [filteredLeads, leadQualityMode, keywordVolumeScores]);
  const leadTotalPages = Math.max(1, Math.ceil(sortedLeads.length / leadPageSize));
  const pagedLeads = useMemo(() => {
    const start = (leadPage - 1) * leadPageSize;
    return sortedLeads.slice(start, start + leadPageSize);
  }, [leadPage, leadPageSize, sortedLeads]);
  const leadPageStart = sortedLeads.length ? (leadPage - 1) * leadPageSize + 1 : 0;
  const leadPageEnd = Math.min(sortedLeads.length, leadPage * leadPageSize);
  const selectedLeads = useMemo(() => {
    const selected = new Set(selectedLeadIds);
    return sortedLeads.filter((lead) => selected.has(lead.id));
  }, [selectedLeadIds, sortedLeads]);
  const selectedLeadSummary = useMemo(
    () => ({
      instagram: selectedLeads.filter((lead) => getLeadInstagramHandle(lead)).length,
      phone: selectedLeads.filter((lead) => lead.phone).length,
      quoteRequested: selectedLeads.filter((lead) => lead.status === "견적 요청" || lead.status === "견적 발송").length
    }),
    [selectedLeads]
  );
  const allVisibleSelected = Boolean(pagedLeads.length && pagedLeads.every((lead) => selectedLeadIds.includes(lead.id)));

  useEffect(() => {
    setLeadPage((current) => Math.min(Math.max(current, 1), leadTotalPages));
  }, [leadTotalPages]);

  useEffect(() => {
    setLeadPage(1);
  }, [
    actionFilter,
    excludeExcluded,
    gradeFilter,
    hasInstagramOnly,
    hasPhoneOnly,
    industryFilter,
    leadPageSize,
    leadQualityMode,
    openDateEnd,
    openDateFilterMode,
    openDateMonth,
    openDateStart,
    openDateYear,
    periodFilter,
    showNearbyOnly,
    statusFilter,
    tableSearch
  ]);

  useEffect(() => {
    const visibleIds = new Set(sortedLeads.map((lead) => lead.id));
    setSelectedLeadIds((current) => current.filter((id) => visibleIds.has(id)));
  }, [sortedLeads]);

  useEffect(() => {
    if (!selectedLeadIds.length) setBulkNextActionDate("");
  }, [selectedLeadIds.length]);

  useEffect(() => {
    if (openDateFilterMode === "year" && !openDateYear && openDateOptions.years[0]) setOpenDateYear(openDateOptions.years[0].value);
    if (openDateFilterMode === "month" && !openDateMonth && openDateOptions.months[0]) setOpenDateMonth(openDateOptions.months[0].value);
  }, [openDateFilterMode, openDateYear, openDateMonth, openDateOptions.months, openDateOptions.years]);

  useEffect(() => {
    if (openDateFilterMode !== "custom" || !openDateStart || !openDateEnd || openDateStart <= openDateEnd) return;
    setOpenDateEnd(openDateStart);
  }, [openDateFilterMode, openDateStart, openDateEnd]);

  const visibleLeadSummary = useMemo(
    () => ({
      call: filteredLeads.filter((lead) => lead.nextAction === "오늘 바로 전화").length,
      dm: filteredLeads.filter((lead) => lead.nextAction === "오늘 DM 발송").length,
      phone: filteredLeads.filter((lead) => lead.phone).length,
      instagram: filteredLeads.filter((lead) => getLeadInstagramHandle(lead)).length,
      enrichment: filteredLeads.filter((lead) => lead.nextAction === "정보 보강").length,
      followup: filteredLeads.filter((lead) => lead.status === "견적 발송" || lead.status === "재연락 예정").length,
      total: filteredLeads.length
    }),
    [filteredLeads]
  );
  const openDateFilterLabel = useMemo(
    () => formatLeadOpenDateFilterLabel(openDateFilterMode, openDateYear, openDateMonth, openDateStart, openDateEnd),
    [openDateFilterMode, openDateYear, openDateMonth, openDateStart, openDateEnd]
  );
  const hasActiveLeadFilters = Boolean(
    periodFilter !== "all" ||
      openDateFilterMode !== "all" ||
      industryFilter ||
      actionFilter ||
      statusFilter ||
      gradeFilter ||
      hasPhoneOnly ||
      hasInstagramOnly ||
      !excludeExcluded ||
      showNearbyOnly ||
      tableSearch
  );

  function clearLeadFilters() {
    setPeriodFilter("all");
    setOpenDateFilterMode("all");
    setOpenDateYear("");
    setOpenDateMonth("");
    setOpenDateStart("");
    setOpenDateEnd("");
    setIndustryFilter("");
    setActionFilter("");
    setStatusFilter("");
    setGradeFilter("");
    setHasPhoneOnly(false);
    setHasInstagramOnly(false);
    setExcludeExcluded(true);
    setShowNearbyOnly(false);
    setTableSearch("");
  }

  function toggleLeadSelection(leadId: string) {
    setBulkMessage("");
    setSelectedLeadIds((current) => (current.includes(leadId) ? current.filter((id) => id !== leadId) : [...current, leadId]));
  }

  function toggleAllVisibleLeads() {
    setBulkMessage("");
    setSelectedLeadIds((current) => {
      const visibleIds = pagedLeads.map((lead) => lead.id);
      if (!visibleIds.length) return [];
      if (visibleIds.every((id) => current.includes(id))) return current.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...current, ...visibleIds]));
    });
  }

  async function copySelectedLeadOutboundList() {
    if (!selectedLeads.length) return;
    const text = selectedLeads
      .map((lead, index) => {
        const handle = getLeadInstagramHandle(lead);
        return [
          `${index + 1}. ${lead.businessName}`,
          `업종: ${lead.industryPrimary || "미분류"}`,
          `전화: ${lead.phone || "미확인"}`,
          `인스타: ${handle || "검색 필요"}`,
          `주소: ${lead.address || "확인 필요"}`,
          `다음 액션: ${lead.nextAction || "상세 확인"}`
        ].join("\n");
      })
      .join("\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setBulkMessage(`${selectedLeads.length.toLocaleString()}곳 영업 리스트를 복사했습니다.`);
    } catch {
      setBulkMessage("복사 권한이 없어 브라우저에서 클립보드를 사용할 수 없습니다.");
    }
  }

  async function copySelectedLeadContactList(type: "instagram" | "phone") {
    if (!selectedLeads.length) return;
    const values = selectedLeads
      .map((lead) => (type === "phone" ? lead.phone : getLeadInstagramHandle(lead)))
      .filter(Boolean);
    if (!values.length) {
      setBulkMessage(type === "phone" ? "선택한 리드에 복사할 전화번호가 없습니다." : "선택한 리드에 복사할 인스타 ID가 없습니다.");
      return;
    }

    try {
      await navigator.clipboard.writeText(values.join("\n"));
      setBulkMessage(`${values.length.toLocaleString()}개 ${type === "phone" ? "전화번호" : "인스타 ID"}를 복사했습니다.`);
    } catch {
      setBulkMessage("복사 권한이 없어 브라우저에서 클립보드를 사용할 수 없습니다.");
    }
  }

  async function copySelectedLeadDmScripts() {
    if (!selectedLeads.length) return;
    const text = selectedLeads
      .map((lead, index) => {
        const handle = getLeadInstagramHandle(lead);
        return [`${index + 1}. ${lead.businessName}${handle ? ` (${handle})` : ""}`, buildLeadDmScript(lead)].join("\n");
      })
      .join("\n\n---\n\n");
    try {
      await navigator.clipboard.writeText(text);
      setBulkMessage(`${selectedLeads.length.toLocaleString()}곳 DM 문안을 복사했습니다.`);
    } catch {
      setBulkMessage("복사 권한이 없어 브라우저에서 클립보드를 사용할 수 없습니다.");
    }
  }

  function downloadSelectedLeadCsv() {
    if (!selectedLeads.length) return;
    const headers = ["상호명", "업종", "전화", "인스타", "주소", "상태", "다음 액션", "개시일"];
    const rows = selectedLeads.map((lead) => [
      lead.businessName,
      lead.industryPrimary || "",
      lead.phone || "",
      getLeadInstagramHandle(lead) || "",
      lead.address || "",
      lead.status || "",
      lead.nextAction || "",
      getPermitLeadOpenDate(lead) || ""
    ]);
    const csv = [headers, ...rows]
      .map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(","))
      .join("\n");
    const blob = new Blob([`\ufeff${csv}`], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `maju-selected-leads-${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(anchor);
    anchor.click();
    anchor.remove();
    URL.revokeObjectURL(url);
    setBulkMessage(`${selectedLeads.length.toLocaleString()}곳 선택 리드 CSV를 다운로드했습니다.`);
  }

  async function recordSelectedLeadActions(actionType: PermitLeadActionKind, result: string, busyKey: BulkLeadActionBusy = actionType) {
    if (!selectedLeads.length || bulkActionBusy) return;
    const targets = selectedLeads.slice(0, 100);
    setBulkActionBusy(busyKey);
    setBulkMessage("");
    let successCount = 0;
    let failCount = 0;
    const statusById = new Map<string, string>();

    for (const lead of targets) {
      try {
        const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/action`), {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            actionType,
            memo: [`일괄 처리: ${result}`, bulkNextActionDate ? `다음 액션일: ${bulkNextActionDate}` : ""].filter(Boolean).join("\n"),
            result
          })
        });
        const payload = (await response.json().catch(() => null)) as { message?: string; status?: string } | null;
        if (!response.ok) {
          failCount += 1;
          continue;
        }
        successCount += 1;
        if (payload?.status) statusById.set(lead.id, payload.status);
      } catch {
        failCount += 1;
      }
    }

    if (statusById.size) {
      setLeads((current) => current.map((lead) => (statusById.has(lead.id) ? { ...lead, status: statusById.get(lead.id) || lead.status } : lead)));
      setSelectedLead((current) => (current && statusById.has(current.id) ? { ...current, status: statusById.get(current.id) || current.status } : current));
    }

    const skippedCount = selectedLeads.length - targets.length;
    setBulkMessage(
      [
        successCount ? `${successCount.toLocaleString()}곳 ${result} 이력을 저장했습니다.` : "",
        failCount ? `${failCount.toLocaleString()}곳은 저장하지 못했습니다.` : "",
        skippedCount ? `한 번에 최대 100곳까지만 처리했습니다.` : ""
      ]
        .filter(Boolean)
        .join(" ")
    );
    if (successCount && !failCount && !skippedCount) {
      setSelectedLeadIds([]);
      if (busyKey === "quoteFollowUp") setBulkNextActionDate("");
    }
    setBulkActionBusy("");
    void loadLeads();
  }

  function focusLeadQueue(action: string, queueLeads: PermitLeadItem[]) {
    setShowNearbyOnly(false);
    setTableSearch("");
    setActionFilter(action);
    setStatusFilter("");
    if (queueLeads[0]) {
      setSelectedLeadIntent(action === "오늘 바로 전화" ? "call" : action === "오늘 DM 발송" ? "dm" : action === "정보 보강" ? "info" : "");
      setSelectedLead(queueLeads[0]);
    }
  }

  function focusLeadStatus(status: string, queueLeads: PermitLeadItem[]) {
    setShowNearbyOnly(false);
    setTableSearch("");
    setActionFilter("");
    setStatusFilter(status);
    if (queueLeads[0]) {
      setSelectedLeadIntent(status === QUOTE_FOLLOW_UP_STATUS_FILTER || status === "견적 발송" || status === "재연락 예정" ? "followup" : "");
      setSelectedLead(queueLeads[0]);
    }
  }

  function focusQuoteFollowUps(queueLeads: PermitLeadItem[]) {
    setShowNearbyOnly(false);
    setTableSearch("");
    setActionFilter("");
    setStatusFilter(QUOTE_FOLLOW_UP_STATUS_FILTER);
    if (queueLeads[0]) {
      setSelectedLeadIntent("followup");
      setSelectedLead(queueLeads[0]);
    }
  }

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

  // 전국 공공데이터(행정안전부_식품_일반음식점) 자동 수집: GOV_RESTAURANT_API_KEY 필요.
  // days=14(이 소스의 최대 조회 범위) — 이 API는 "최근 변경분만" 걸러주는 파라미터가 없어 매일
  // 전체 스냅샷의 한 구간(약 15만 행)만 훑고 그 안에서 최근 변경분을 골라냅니다. days를 크게
  // 잡을수록 같은 구간 안에서 더 많은 변경분이 걸립니다(2026-08-23, "DB가 적다" 피드백 대응).
  async function handleGovAutoSync() {
    setGovSyncBusy(true);
    setGovSyncResult(null);
    setGovSyncWarning("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/gov-sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14 })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setGovSyncWarning(payload?.message || "자동 수집에 실패했습니다.");
        return;
      }
      setGovSyncResult(payload);
      loadLeads();
    } catch (error) {
      setGovSyncWarning(error instanceof Error ? error.message : "네트워크 오류로 자동 수집하지 못했습니다.");
    } finally {
      setGovSyncBusy(false);
    }
  }

  // 서울시 공공데이터(서울 열린데이터광장) 자동 수집: SEOUL_OPENDATA_API_KEY 필요.
  // days=14(이 소스의 최대 조회 범위) — 행정안전부 소스와 같은 이유로 구간 회전 방식이라, days를
  // 크게 잡을수록 오늘 훑는 구간 안에서 더 많은 변경분이 걸립니다(2026-08-23 피드백 대응).
  async function handleSeoulAutoSync() {
    setSeoulSyncBusy(true);
    setSeoulSyncResult(null);
    setSeoulSyncWarning("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/seoul-sync"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ days: 14 })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        setSeoulSyncWarning(payload?.message || "자동 수집에 실패했습니다.");
        return;
      }
      setSeoulSyncResult(payload);
      loadLeads();
    } catch (error) {
      setSeoulSyncWarning(error instanceof Error ? error.message : "네트워크 오류로 자동 수집하지 못했습니다.");
    } finally {
      setSeoulSyncBusy(false);
    }
  }

  // 두 데이터 소스 모두 매일 새벽 cron으로 이미 자동 수집됩니다(설정된 소스만). 이 버튼은 지금 바로 최신
  // 데이터를 당겨오고 싶을 때 쓰는 수동 새로고침이라, 소스별로 따로 누르지 않도록 한 번에 묶어서 호출합니다.
  async function handleAllSourcesSync() {
    await Promise.all([handleGovAutoSync(), handleSeoulAutoSync()]);
  }

  // "기거래처 주변 리드 + 업종 유사도" 추천 점수 갱신(2026-08-24 피드백: "거래 성사 확률이 높은 곳을
  // 추천해야 한다"). 기존 리드 탐색(전체 거래처 반경) 지오코딩을 재사용해 route_fit_score/
  // industry_fit_score를 다시 계산하므로, 버튼을 눌러야만 실행됩니다(Tmap 호출량 때문에 자동 실행 안 함).
  async function handleRecommendationRefresh() {
    setRecommendBusy(true);
    setRecommendMessage("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery("/api/leads/permits/recommend-refresh"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ radiusKm: 30 })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) {
        setRecommendMessage(payload?.message || "추천 점수 갱신에 실패했습니다.");
        return;
      }
      const industryLabel = payload.topIndustries?.length ? payload.topIndustries.join("·") : "확인 필요";
      setRecommendMessage(`${payload.updated.toLocaleString()}곳 갱신 완료 · 주력 업종: ${industryLabel}`);
      setRecommendTopIndustries(Array.isArray(payload.topIndustries) ? payload.topIndustries : []);
      loadLeads();
    } catch {
      setRecommendMessage("추천 점수 갱신 중 오류가 발생했습니다.");
    } finally {
      setRecommendBusy(false);
    }
  }

  async function runLeadAction(lead: PermitLeadItem, actionType: PermitLeadActionKind, result?: string, memo?: string): Promise<PermitLeadActionResult> {
    setActionMessage("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/action`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actionType, result, memo })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok) {
        const message = payload?.message || "처리에 실패했습니다.";
        setActionMessage(message);
        return { message, ok: false };
      }
      setActionMessage(`${lead.businessName} · "${payload.status}"로 갱신했습니다.`);
      if (actionType === "exclude") {
        setSelectedLead(null);
        setSelectedLeadIntent("");
      } else {
        setSelectedLead((current) => (current?.id === lead.id ? { ...current, status: payload.status || current.status } : current));
        setLeads((current) => current.map((item) => (item.id === lead.id ? { ...item, status: payload.status || item.status } : item)));
      }
      void loadLeads();
      return { action: payload.action, ok: true, status: payload.status };
    } catch {
      const message = "네트워크 오류로 처리하지 못했습니다.";
      setActionMessage(message);
      return { message, ok: false };
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
        "인허가/개시일",
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
        { value: getPermitLeadOpenDate(lead) || "" },
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
  const govRestaurantConfigured = Boolean(sourceStatus?.sources?.govRestaurant);
  const seoulRestaurantConfigured = Boolean(sourceStatus?.sources?.seoulRestaurant);
  const kakaoKeywordSearchConfigured = Boolean(sourceStatus?.sources?.kakaoKeywordSearch);
  const keywordVolumeSourceConfigured = Boolean(sourceStatus?.enrichment?.keywordVolume);
  const googleReviewsSourceConfigured = Boolean(sourceStatus?.enrichment?.googleReviews);
  const leadSourceCards = [
    {
      description: uploadResult ? `신규 ${uploadResult.inserted.toLocaleString()} · 갱신 ${uploadResult.updated.toLocaleString()}` : "ERP/공공데이터 파일 직접 반영",
      status: uploadBusy ? "처리 중" : uploadResult ? "최근 업로드 완료" : "필요 시 사용",
      tone: uploadWarning ? "warning" : uploadResult ? "ready" : "idle",
      title: "수동 업로드"
    },
    {
      description: govSyncResult
        ? `수집 ${govSyncResult.fetched.toLocaleString()} · 신규 ${govSyncResult.ingest.inserted.toLocaleString()}`
        : govSyncWarning || "전국 음식점 인허가",
      status: govSyncBusy ? "수집 중" : govSyncResult || govRestaurantConfigured ? "연결됨" : govSyncWarning ? "확인 필요" : "설정 필요",
      tone: govSyncWarning || (!govRestaurantConfigured && sourceStatus) ? "warning" : govSyncResult || govRestaurantConfigured ? "ready" : "idle",
      title: "전국 공공데이터"
    },
    {
      description: seoulSyncResult
        ? `수집 ${seoulSyncResult.fetched.toLocaleString()} · 신규 ${seoulSyncResult.ingest.inserted.toLocaleString()}`
        : seoulSyncWarning || "서울 음식점 좌표 포함",
      status: seoulSyncBusy ? "수집 중" : seoulSyncResult || seoulRestaurantConfigured ? "연결됨" : seoulSyncWarning ? "확인 필요" : "설정 필요",
      tone: seoulSyncWarning || (!seoulRestaurantConfigured && sourceStatus) ? "warning" : seoulSyncResult || seoulRestaurantConfigured ? "ready" : "idle",
      title: "서울시 공공데이터"
    },
    {
      description: keywordSweepResult
        ? `기준점 ${keywordSweepResult.anchorsUsed.toLocaleString()} · 신규 ${keywordSweepResult.ingest.inserted.toLocaleString()}`
        : keywordSweepWarning || "운영중 매장(개업일 무관)",
      status: keywordSweepBusy ? "탐색 중" : keywordSweepResult || kakaoKeywordSearchConfigured ? "연결됨" : keywordSweepWarning ? "확인 필요" : "설정 필요",
      tone: keywordSweepWarning || (!kakaoKeywordSearchConfigured && sourceStatus) ? "warning" : keywordSweepResult || kakaoKeywordSearchConfigured ? "ready" : "idle",
      title: "영업리드 탐색"
    }
  ];
  const externalSourceSummary = [
    keywordVolumeSourceConfigured ? "검색량 연결" : "검색량 설정 필요",
    googleReviewsSourceConfigured ? "리뷰 연결" : "리뷰 설정 필요"
  ].join(" · ");

  return (
    <section className="flex min-h-[480px] flex-1 flex-col gap-3 overflow-visible rounded-b-xl bg-[#f6f8fb] p-4 pb-6">
      <div className="grid gap-2 sm:grid-cols-2 xl:grid-cols-6">
        <DirectoryStat label="신규 리드" value={summary ? `${summary.active.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="오늘 신규" value={summary ? `${summary.todayNew.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="A등급" value={summary ? `${summary.gradeA.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="전화 가능" value={summary ? `${summary.hasPhone.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="견적 요청" value={summary ? `${summary.quoteRequests.toLocaleString()}곳` : "—"} />
        <DirectoryStat label="견적 후속" value={summary ? `${summary.quoteFollowUps.toLocaleString()}곳` : "—"} />
      </div>

      <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-6">
        <PermitLeadQueueCard
          description="인허가 신규성과 연락처가 모두 확인된 곳"
          icon={Phone}
          leads={queues?.callToday || []}
          onFocus={() => focusLeadQueue("오늘 바로 전화", queues?.callToday || [])}
          tone="teal"
          title="오늘 전화"
        />
        <PermitLeadQueueCard
          description="인스타·플레이스 확인 후 DM 문안 복사"
          icon={Instagram}
          leads={queues?.dmCandidates || []}
          onFocus={() => focusLeadQueue("오늘 DM 발송", queues?.dmCandidates || [])}
          tone="pink"
          title="DM 후보"
        />
        <PermitLeadQueueCard
          description="주소·전화·업종을 보강하면 영업 가능"
          icon={ListFilter}
          leads={queues?.needsEnrichment || []}
          onFocus={() => focusLeadQueue("정보 보강", queues?.needsEnrichment || [])}
          tone="amber"
          title="정보 보강"
        />
        <PermitLeadQueueCard
          description="기존 거래처 권역과 겹치는 방문 후보"
          icon={MapPin}
          leads={queues?.visitThisWeek || []}
          onFocus={() => {
            setShowNearbyOnly(false);
            setTableSearch("");
            if (queues?.visitThisWeek?.[0]) setSelectedLead(queues.visitThisWeek[0]);
          }}
          tone="blue"
          title="방문 후보"
        />
        <PermitLeadQueueCard
          description="관심 확인 후 견적서 작성이 필요한 리드"
          icon={FileImage}
          leads={queues?.quoteRequests || []}
          onFocus={() => focusLeadStatus("견적 요청", queues?.quoteRequests || [])}
          tone="teal"
          title="견적 요청"
        />
        <PermitLeadQueueCard
          description="견적 발송 후 재연락이 필요한 리드"
          icon={MessageCircle}
          leads={queues?.quoteFollowUps || []}
          onFocus={() => focusQuoteFollowUps(queues?.quoteFollowUps || [])}
          tone="pink"
          title="견적 후속"
        />
      </div>

      <div className="maju-section-card p-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div>
            <p className="text-sm font-black text-slate-950">리드 공급원</p>
            <p className="mt-0.5 text-xs font-semibold text-slate-500">신규리드는 공공 인허가와 업로드 파일에서 들어오고, 영업리드는 외부 정보 보강 후 우선순위를 정합니다.</p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ring-inset ${
              keywordVolumeSourceConfigured && googleReviewsSourceConfigured
                ? "bg-teal-50 text-teal-700 ring-teal-100"
                : "bg-amber-50 text-amber-800 ring-amber-100"
            }`}>
              {externalSourceSummary}
            </span>
            <button className="maju-button-secondary h-8 text-xs" disabled={anySyncBusy} onClick={() => void handleAllSourcesSync()} type="button">
              <Radar className="h-3.5 w-3.5" />
              {anySyncBusy ? "수집 중" : "전체 소스 갱신"}
            </button>
            <button
              className="maju-button-secondary h-8 text-xs"
              disabled={recommendBusy}
              onClick={() => void handleRecommendationRefresh()}
              title="기거래처 반경 안 리드에 근접도 점수를, 주력 업종과 같은 리드에 업종 가산점을 매깁니다."
              type="button"
            >
              <Radar className="h-3.5 w-3.5" />
              {recommendBusy ? "계산 중" : "추천 점수 갱신"}
            </button>
          </div>
        </div>
        {recommendMessage ? <p className="mt-2 text-xs font-bold text-teal-700">{recommendMessage}</p> : null}
        <div className="mt-3 grid gap-2 md:grid-cols-2 xl:grid-cols-4">
          {leadSourceCards.map((source) => (
            <LeadSourceStatusCard
              description={source.description}
              key={source.title}
              status={source.status}
              title={source.title}
              tone={source.tone as "idle" | "ready" | "warning"}
            />
          ))}
        </div>
      </div>

      <div className="maju-section-card p-3">
        <div className="flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="flex items-center gap-1.5 text-sm font-black text-slate-950">
              <MapPinPlus className="h-4 w-4 text-primary" />
              영업리드 확장 탐색
            </p>
            <p className="mt-0.5 text-xs font-semibold leading-5 text-slate-500">
              개업일자와 무관하게 이미 운영 중인 매장까지 찾아옵니다. 등록 거래처 반경을 자동으로 훑고, 아래 지역을 추가하면 그 지역도 함께
              탐색합니다. 야간에 기준점 일부를 자동으로 회전 탐색하고, 지금 바로 넓게 훑고 싶으면 버튼을 누르세요.
            </p>
          </div>
          <button className="maju-button-secondary h-8 shrink-0 text-xs" disabled={keywordSweepBusy || !kakaoKeywordSearchConfigured} onClick={() => void handleKeywordLeadSweep()} type="button">
            <Radar className="h-3.5 w-3.5" />
            {keywordSweepBusy ? "탐색 중" : "영업리드 추가 탐색"}
          </button>
        </div>
        {!kakaoKeywordSearchConfigured && sourceStatus ? (
          <p className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">KAKAO_REST_KEY가 설정되지 않아 영업리드 확장 탐색을 쓸 수 없습니다.</p>
        ) : null}
        {keywordSweepWarning ? <p className="mt-2 rounded-md bg-destructive/10 px-3 py-2 text-xs font-bold text-destructive">{keywordSweepWarning}</p> : null}
        {keywordSweepResult ? (
          <div className="mt-2 flex flex-wrap gap-2 rounded-md bg-slate-50 p-3 text-xs font-bold text-slate-600">
            <span>기준점 {keywordSweepResult.anchorsUsed.toLocaleString()}곳</span>
            <span>검색 {keywordSweepResult.callsMade.toLocaleString()}회</span>
            <span className="text-slate-700">후보 {keywordSweepResult.candidatesFound.toLocaleString()}곳</span>
            <span className="text-emerald-700">신규 {keywordSweepResult.ingest.inserted.toLocaleString()}</span>
          </div>
        ) : null}
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <input
            className="h-9 min-w-0 flex-1 rounded-md border border-input bg-white px-3 text-xs font-bold outline-none focus:ring-2 focus:ring-ring"
            onChange={(event) => setNewRegionLabel(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void handleAddKeywordSearchRegion();
            }}
            placeholder="탐색 지역 추가 (예: 서울 마포구 합정동)"
            value={newRegionLabel}
          />
          <button className="maju-button-secondary h-9 text-xs" disabled={regionBusy || !newRegionLabel.trim()} onClick={() => void handleAddKeywordSearchRegion()} type="button">
            추가
          </button>
        </div>
        {regionMessage ? <p className="mt-1.5 text-xs font-bold text-destructive">{regionMessage}</p> : null}
        {keywordSearchRegions.length ? (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {keywordSearchRegions.map((region) => (
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 py-1 pl-3 pr-1.5 text-xs font-bold text-slate-700" key={region.id}>
                {region.label}
                {typeof region.latitude !== "number" ? <span className="text-amber-600">(좌표 확인 필요)</span> : null}
                <button
                  aria-label={`${region.label} 삭제`}
                  className="rounded-full p-0.5 text-slate-400 hover:bg-slate-200 hover:text-slate-700"
                  disabled={regionBusy}
                  onClick={() => void handleRemoveKeywordSearchRegion(region.id)}
                  type="button"
                >
                  <Trash2 className="h-3 w-3" />
                </button>
              </span>
            ))}
          </div>
        ) : null}
      </div>

      <div className="maju-section-card">
        <button className="flex w-full items-center justify-between gap-3 border-b border-slate-200 px-4 py-3 text-left" onClick={() => setUploadOpen((value) => !value)} type="button">
          <span className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-slate-400" />
            <span className="text-sm font-black text-slate-950">파일 업로드·소스 상세</span>
          </span>
          <ChevronDown className={`h-4 w-4 text-slate-400 transition ${uploadOpen ? "rotate-180" : ""}`} />
        </button>
        {uploadOpen ? (
          <div className="space-y-2 p-3">
            <p className="text-xs font-semibold leading-5 text-slate-500">
              연결된 데이터 소스(지방행정 인허가·전국/서울시 공공데이터)는 <span className="text-slate-700">매일 새벽 자동으로 수집</span>됩니다. 직접
              모은 엑셀/CSV 파일을 올리거나, 지금 바로 최신 데이터를 확인하고 싶을 때만 아래 버튼을 누르면 됩니다. 같은 사업자번호는 최신 인허가
              상태로 갱신되고, 이미 거래처로 등록된 사업자번호는 자동으로 제외 처리됩니다.
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
              <button className="maju-button-secondary inline-flex w-fit items-center gap-2" disabled={anySyncBusy} onClick={() => void handleAllSourcesSync()} type="button">
                <Radar className="h-4 w-4" />
                {anySyncBusy ? "수집 중..." : "신규 리드 지금 수집"}
              </button>
              <button
                className="text-[11px] font-bold text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-600"
                onClick={() => setShowSourceDetails((value) => !value)}
                type="button"
              >
                {showSourceDetails ? "소스 정보 접기" : "어떤 소스에서 가져오나요?"}
              </button>
            </div>
            {showSourceDetails ? (
              <p className="text-[11px] font-semibold leading-4 text-slate-400">
                "전국 공공데이터"는 행정안전부_식품_일반음식점 조회서비스(전국 약 229만 건, GOV_RESTAURANT_API_KEY 필요)에서, "서울시 공공데이터"는
                서울 열린데이터광장(서울시만 약 53만 건, SEOUL_OPENDATA_API_KEY 필요)에서 가져오며 좌표를 직접 변환해 채워 더 빠릅니다. 미설정된
                소스는 건너뛰고 설정된 소스만 수집합니다 — 두 API 모두 최근 변경분만 걸러주지 않아 한 번에 전체를 다 훑을 수 없어, 매일 다른
                구간을 훑도록 되어 있고 완전 커버리지까지 시간이 걸릴 수 있습니다.
              </p>
            ) : null}
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
            {sourceStatus?.syncStatus ? (
              <div className="space-y-1 rounded-md border border-slate-200 bg-white p-3 text-xs font-bold leading-5">
                <p className="text-slate-500">야간 자동 동기화 상태 (새로고침해도 유지됨)</p>
                {(
                  [
                    { key: "gov", label: "전국 공공데이터", entry: sourceStatus.syncStatus.gov },
                    { key: "seoul", label: "서울시 공공데이터", entry: sourceStatus.syncStatus.seoul },
                    { key: "kakaoKeyword", label: "영업리드 탐색", entry: sourceStatus.syncStatus.kakaoKeyword }
                  ] as const
                ).map(({ key, label, entry }) => (
                  <p key={key} className={entry.status === "error" ? "text-rose-600" : entry.lastAt ? "text-slate-700" : "text-slate-400"}>
                    {label} ·{" "}
                    {entry.lastAt
                      ? `${new Date(entry.lastAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short", timeZone: "Asia/Seoul" })} ${
                          entry.status === "error" ? "실패" : "성공"
                        }${entry.status === "error" && entry.message ? ` (${entry.message.slice(0, 60)})` : ""}`
                      : "아직 자동 동기화 기록이 없습니다."}
                  </p>
                ))}
              </div>
            ) : null}
            {govSyncResult || seoulSyncResult || govSyncWarning || seoulSyncWarning ? (
              <div className="space-y-1.5 rounded-md bg-slate-50 p-3">
                {govSyncResult ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-teal-800">
                    <span className="text-slate-500">전국 공공데이터 ·</span>
                    <span className="text-emerald-700">신규 {govSyncResult.ingest.inserted.toLocaleString()}</span>
                    <span className="text-blue-700">갱신 {govSyncResult.ingest.updated.toLocaleString()}</span>
                    <span className="text-slate-400">중복 {govSyncResult.ingest.duplicates.toLocaleString()}</span>
                  </div>
                ) : null}
                {govSyncWarning ? <p className="text-xs font-bold text-amber-800">전국 공공데이터 · {govSyncWarning}</p> : null}
                {seoulSyncResult ? (
                  <div className="flex flex-wrap items-center gap-2 text-xs font-bold text-teal-800">
                    <span className="text-slate-500">서울시 공공데이터 ·</span>
                    <span className="text-emerald-700">신규 {seoulSyncResult.ingest.inserted.toLocaleString()}</span>
                    <span className="text-blue-700">갱신 {seoulSyncResult.ingest.updated.toLocaleString()}</span>
                    <span className="text-slate-400">중복 {seoulSyncResult.ingest.duplicates.toLocaleString()}</span>
                  </div>
                ) : null}
                {seoulSyncWarning ? <p className="text-xs font-bold text-amber-800">서울시 공공데이터 · {seoulSyncWarning}</p> : null}
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

      <div className="maju-section-card !overflow-visible">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-200 p-3">
          <div className="flex flex-wrap items-center gap-1.5">
            {(["table", "map"] as const).map((mode) => (
              <button
                className={`rounded-md border px-3 py-1.5 text-xs font-black transition ${
                  viewMode === mode ? "border-teal-700 bg-teal-700 text-white" : "border-transparent bg-white text-slate-600 hover:bg-slate-50"
                }`}
                key={mode}
                onClick={() => setViewMode(mode)}
                type="button"
              >
                {mode === "table" ? "표" : "지도"}
              </button>
            ))}
          </div>
          <div className="flex h-8 items-center rounded-md border border-slate-200 bg-white p-0.5" title="신규 리드는 인허가 최신순, 영업리드는 네이버 검색어 트렌드 기반 키워드 검색량순으로 정렬합니다.">
            {(
              [
                { value: "permit" as const, label: "신규 리드" },
                { value: "keyword" as const, label: "영업리드" }
              ]
            ).map((item) => (
              <button
                className={`rounded px-2.5 py-1 text-xs font-black transition ${
                  leadQualityMode === item.value ? "bg-teal-700 text-white" : "text-slate-500 hover:bg-slate-50"
                }`}
                key={item.value}
                onClick={() => setLeadQualityMode(item.value)}
                type="button"
              >
                {item.label}
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
        {leadQualityMode === "keyword" && !keywordVolumeConfigured ? (
          <p className="mx-3 mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs font-bold text-amber-800">
            네이버 검색량 API가 아직 연결되지 않아 검색량순 정렬을 쓸 수 없습니다. 관리자에게 문의하세요.
          </p>
        ) : null}

        <div className="flex flex-col gap-2 border-b border-slate-200 bg-slate-50/60 p-3">
          <div className="flex flex-wrap items-center gap-2">
            <label className="maju-search-field relative h-9 min-w-[200px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                className="h-full w-full border-0 bg-transparent pl-6 pr-0 text-xs font-bold text-slate-900 shadow-none outline-none placeholder:text-slate-400 focus:border-0 focus:ring-0"
                onChange={(event) => setTableSearch(event.target.value)}
                placeholder="상호명·주소·전화·인스타 ID 검색"
                value={tableSearch}
              />
            </label>
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
              onChange={(event) => {
                setPeriodFilter(event.target.value as "all" | PermitLeadPeriod);
                if (event.target.value !== "all") setOpenDateFilterMode("all");
              }}
              value={periodFilter}
            >
              {PERMIT_PERIOD_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
              onChange={(event) => {
                const mode = event.target.value as LeadOpenDateFilterMode;
                setOpenDateFilterMode(mode);
                if (mode !== "all") setPeriodFilter("all");
                if (mode === "custom") setShowAdvancedFilters(true);
              }}
              value={openDateFilterMode}
            >
              <option value="all">개시일 전체</option>
              <option value="year">연도별</option>
              <option value="month">월별</option>
              <option value="custom">직접 기간</option>
              <option value="missing">개시일 미확인</option>
            </select>
            {openDateFilterMode === "year" ? (
              <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setOpenDateYear(event.target.value)} value={openDateYear}>
                <option value="">연도 선택</option>
                {openDateOptions.years.map((year) => (
                  <option key={year.value} value={year.value}>
                    {year.value}년 · {year.count.toLocaleString()}곳
                  </option>
                ))}
              </select>
            ) : null}
            {openDateFilterMode === "month" ? (
              <select className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setOpenDateMonth(event.target.value)} value={openDateMonth}>
                <option value="">월 선택</option>
                {openDateOptions.months.map((month) => (
                  <option key={month.value} value={month.value}>
                    {month.value} · {month.count.toLocaleString()}곳
                  </option>
                ))}
              </select>
            ) : null}
            <select
              className="h-9 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
              onChange={(event) => {
                setStatusFilter(event.target.value);
                if (event.target.value) setActionFilter("");
              }}
              value={statusFilter}
            >
              <option value="">상태 전체</option>
              <option value="견적 요청">견적 요청</option>
              <option value="견적 발송">견적 발송</option>
              <option value="재연락 예정">재연락 예정</option>
              <option value={QUOTE_FOLLOW_UP_STATUS_FILTER}>견적 후속</option>
              <option value="미팅 예정">미팅 예정</option>
              <option value="연락 완료">연락 완료</option>
              <option value="DM 발송">DM 발송</option>
              <option value="방문 대상">방문 대상</option>
              <option value="검토 필요">검토 필요</option>
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
              <select className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100" onChange={(event) => setIndustryFilter(event.target.value)} value={industryFilter}>
                <option value="">업종 전체(상세)</option>
                {industryOptions.map((industry) => (
                  <option key={industry} value={industry}>
                    {industry}
                  </option>
                ))}
              </select>
              <select
                className="h-8 rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                onChange={(event) => {
                  setActionFilter(event.target.value);
                  if (event.target.value) setStatusFilter("");
                }}
                value={actionFilter}
              >
                <option value="">액션 전체</option>
                {PERMIT_ACTION_OPTIONS.map((action) => (
                  <option key={action} value={action}>
                    {action}
                  </option>
                ))}
              </select>
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
                <input checked={hasInstagramOnly} onChange={(event) => setHasInstagramOnly(event.target.checked)} type="checkbox" />
                인스타 확인된 곳만
              </label>
              <label className="flex items-center gap-1.5 text-xs font-bold text-slate-600">
                <input checked={!excludeExcluded} onChange={(event) => setExcludeExcluded(!event.target.checked)} type="checkbox" />
                제외 처리된 리드도 표시
              </label>
              {openDateFilterMode === "custom" ? (
                <div className="flex flex-wrap items-center gap-2 rounded-md border border-slate-200 bg-white px-2 py-1.5">
                  <span className="text-[11px] font-black text-slate-400">개시일</span>
                  <input
                    className="h-7 rounded border border-slate-200 px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setOpenDateStart(event.target.value)}
                    type="date"
                    value={openDateStart}
                  />
                  <span className="text-[11px] font-bold text-slate-400">~</span>
                  <input
                    className="h-7 rounded border border-slate-200 px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                    onChange={(event) => setOpenDateEnd(event.target.value)}
                    type="date"
                    value={openDateEnd}
                  />
                </div>
              ) : null}
            </div>
          ) : null}
          {quickIndustryOptions.length ? (
            <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200/80 pt-2">
              <span className="shrink-0 text-[11px] font-black text-slate-400">업종</span>
              <button
                className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ring-inset transition ${
                  !industryFilter ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                }`}
                onClick={() => setIndustryFilter("")}
                type="button"
              >
                전체
              </button>
              {quickIndustryOptions.map(([industry, count]) => (
                <button
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ring-inset transition ${
                    industryFilter === industry ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                  key={industry}
                  onClick={() => setIndustryFilter(industry)}
                  type="button"
                >
                  {industry} <span className="font-black opacity-70">{count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          ) : null}
          {quickOpenMonthOptions.length ? (
            <div className="flex items-center gap-2 overflow-x-auto border-t border-slate-200/80 pt-2">
              <span className="shrink-0 text-[11px] font-black text-slate-400">개시월</span>
              {quickOpenMonthOptions.map((month) => (
                <button
                  className={`shrink-0 rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ring-inset transition ${
                    openDateFilterMode === "month" && openDateMonth === month.value ? "bg-blue-700 text-white ring-blue-700" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
                  }`}
                  key={month.value}
                  onClick={() => {
                    setPeriodFilter("all");
                    setOpenDateFilterMode("month");
                    setOpenDateMonth(month.value);
                  }}
                  type="button"
                >
                  {month.value} <span className="font-black opacity-70">{month.count.toLocaleString()}</span>
                </button>
              ))}
            </div>
          ) : null}
        </div>

        {loadState === "ready" ? (
          <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 bg-white px-3 py-2">
            <span className="shrink-0 text-[11px] font-black text-slate-400">현재 결과</span>
            {openDateFilterMode !== "all" ? (
              <span className="rounded-full bg-blue-50 px-2.5 py-1 text-[11px] font-black text-blue-700 ring-1 ring-inset ring-blue-100">
                {openDateFilterLabel}
              </span>
            ) : null}
            {openDateCoverageSummary.total ? (
              <span className="rounded-full bg-slate-50 px-2.5 py-1 text-[11px] font-black text-slate-500 ring-1 ring-inset ring-slate-200">
                개시일 {openDateCoverageSummary.withOpenDate.toLocaleString()} · 미확인 {openDateCoverageSummary.missing.toLocaleString()}
              </span>
            ) : null}
            {openDateCoverageSummary.missing ? (
              <button
                className={`rounded-full px-2.5 py-1 text-[11px] font-black ring-1 ring-inset transition ${
                  openDateFilterMode === "missing" ? "bg-amber-600 text-white ring-amber-600" : "bg-amber-50 text-amber-700 ring-amber-100 hover:bg-amber-100"
                }`}
                onClick={() => {
                  setPeriodFilter("all");
                  setOpenDateFilterMode(openDateFilterMode === "missing" ? "all" : "missing");
                }}
                type="button"
              >
                미확인만 보기
              </button>
            ) : null}
            <button
              className="rounded-full bg-teal-700 px-3 py-1 text-[11px] font-black text-white shadow-sm shadow-teal-900/10 hover:bg-teal-800"
              onClick={clearLeadFilters}
              type="button"
            >
              {visibleLeadSummary.total.toLocaleString()}곳 전체 보기
            </button>
            <LeadQuickFilterChip
              active={actionFilter === "오늘 바로 전화"}
              count={visibleLeadSummary.call}
              label="전화"
              onClick={() => {
                setActionFilter("오늘 바로 전화");
                setStatusFilter("");
              }}
            />
            <LeadQuickFilterChip
              active={hasPhoneOnly}
              count={visibleLeadSummary.phone}
              label="전화가능"
              onClick={() => setHasPhoneOnly((value) => !value)}
            />
            <LeadQuickFilterChip
              active={actionFilter === "오늘 DM 발송"}
              count={visibleLeadSummary.dm}
              label="DM"
              onClick={() => {
                setActionFilter("오늘 DM 발송");
                setStatusFilter("");
              }}
            />
            <LeadQuickFilterChip
              active={hasInstagramOnly}
              count={visibleLeadSummary.instagram}
              label="인스타"
              onClick={() => setHasInstagramOnly((value) => !value)}
            />
            <LeadQuickFilterChip
              active={actionFilter === "정보 보강"}
              count={visibleLeadSummary.enrichment}
              label="정보 보강"
              onClick={() => {
                setActionFilter("정보 보강");
                setStatusFilter("");
              }}
            />
            <LeadQuickFilterChip
              active={statusFilter === QUOTE_FOLLOW_UP_STATUS_FILTER}
              count={visibleLeadSummary.followup}
              label="견적 후속"
              onClick={() => {
                setActionFilter("");
                setStatusFilter(QUOTE_FOLLOW_UP_STATUS_FILTER);
              }}
            />
            {hasActiveLeadFilters ? (
              <button className="ml-auto rounded-md px-2 py-1 text-[11px] font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700" onClick={clearLeadFilters} type="button">
                필터 초기화
              </button>
            ) : null}
          </div>
        ) : null}

        {actionMessage ? <p className="mx-3 mt-3 rounded-md bg-teal-50 px-3 py-2 text-xs font-bold text-teal-800">{actionMessage}</p> : null}
        {bulkMessage ? <p className="mx-3 mt-3 rounded-md bg-slate-50 px-3 py-2 text-xs font-bold text-slate-700">{bulkMessage}</p> : null}

        <div className="p-3">
          {loadState === "loading" ? (
            <p className="flex items-center justify-center gap-2 rounded-md border border-dashed border-slate-200 p-8 text-center text-sm font-bold text-slate-500">
              <Loader2 className="h-4 w-4 shrink-0 animate-spin" />
              신규 리드를 불러오는 중입니다.
            </p>
          ) : loadState === "error" ? (
            <p className="rounded-md border border-dashed border-rose-200 bg-rose-50 p-8 text-center text-sm font-bold text-rose-700">
              신규 리드를 불러오지 못했습니다. 새로고침을 눌러 다시 시도하세요.
            </p>
          ) : !filteredLeads.length ? (
            <div className="rounded-md border border-dashed border-slate-200 bg-white p-8 text-center">
              <p className="text-sm font-bold text-slate-600">{leads.length ? "현재 조건에 맞는 리드가 없습니다." : "아직 등록된 신규 리드가 없습니다."}</p>
              <p className="mt-1 text-xs font-semibold text-slate-400">
                {leads.length && hasActiveLeadFilters
                  ? openDateFilterMode !== "all"
                    ? `${openDateFilterLabel} 기준에 맞는 리드가 없습니다. 기간을 넓히거나 필터를 초기화하세요.`
                    : "검색어, 업종, 액션, 상태 조건을 줄이면 리드를 다시 확인할 수 있습니다."
                  : "사업자 인허가 데이터를 업로드하면 여기에 표시됩니다."}
              </p>
              {leads.length && hasActiveLeadFilters ? (
                <button className="maju-button-secondary mx-auto mt-4 h-9 justify-center px-3 text-xs" onClick={clearLeadFilters} type="button">
                  필터 초기화
                </button>
              ) : null}
            </div>
          ) : viewMode === "map" ? (
            <div className="h-[560px] overflow-hidden rounded-lg border border-slate-200">
              <KakaoAddressMap mapClassName="h-full w-full rounded-none border-0" markers={mapLeadMarkers} onMarkerClick={(marker) => setSelectedLead(filteredLeads.find((lead) => lead.id === marker.id) || null)} showList={false} />
            </div>
          ) : (
            <div className="flex min-h-[420px] flex-col overflow-hidden rounded-lg border border-slate-200 bg-white">
              <div className="shrink-0 divide-y divide-slate-100 border-b border-slate-200 bg-white">
                <div className="flex flex-wrap items-center justify-between gap-2 px-3 py-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="rounded-full bg-slate-100 px-2.5 py-1 text-[11px] font-black text-slate-600">
                      선택 {selectedLeads.length.toLocaleString()}곳
                    </span>
                    {selectedLeads.length ? (
                      <span className="flex flex-wrap items-center gap-1">
                        <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-700 ring-1 ring-inset ring-teal-100">전화 {selectedLeadSummary.phone.toLocaleString()}</span>
                        <span className="rounded-full bg-pink-50 px-2 py-0.5 text-[11px] font-black text-pink-700 ring-1 ring-inset ring-pink-100">인스타 {selectedLeadSummary.instagram.toLocaleString()}</span>
                        <span className="rounded-full bg-blue-50 px-2 py-0.5 text-[11px] font-black text-blue-700 ring-1 ring-inset ring-blue-100">견적 {selectedLeadSummary.quoteRequested.toLocaleString()}</span>
                      </span>
                    ) : null}
                    <button className="rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-[11px] font-black text-slate-600 hover:bg-slate-50" onClick={toggleAllVisibleLeads} type="button">
                      {allVisibleSelected ? "페이지 선택 해제" : "현재 페이지 선택"}
                    </button>
                  </div>
                  <div className="flex flex-wrap items-center gap-1.5">
                    <label className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-500">
                      보기
                      <select
                        className="h-6 border-0 bg-transparent p-0 text-[11px] font-black text-slate-900 outline-none focus:ring-0"
                        onChange={(event) => setLeadPageSize(Number(event.target.value) as ListPageSize)}
                        value={leadPageSize}
                      >
                        {LIST_PAGE_SIZE_OPTIONS.map((size) => (
                          <option key={size} value={size}>
                            {size}개
                          </option>
                        ))}
                      </select>
                    </label>
                    <span className="rounded-full bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-500">
                      {leadPageStart.toLocaleString()}-{leadPageEnd.toLocaleString()} / {sortedLeads.length.toLocaleString()}곳
                    </span>
                    <button
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={leadPage <= 1}
                      onClick={() => setLeadPage((page) => Math.max(1, page - 1))}
                      type="button"
                    >
                      이전
                    </button>
                    <span className="text-[11px] font-black text-slate-400">
                      {leadPage.toLocaleString()} / {leadTotalPages.toLocaleString()}
                    </span>
                    <button
                      className="rounded-md border border-slate-200 bg-white px-2 py-1 text-[11px] font-black text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
                      disabled={leadPage >= leadTotalPages}
                      onClick={() => setLeadPage((page) => Math.min(leadTotalPages, page + 1))}
                      type="button"
                    >
                      다음
                    </button>
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-2 bg-slate-50/70 px-3 py-2">
                  <button
                    className="maju-button-secondary h-8 text-xs disabled:opacity-50"
                    disabled={!selectedLeads.length || Boolean(bulkActionBusy)}
                    onClick={() => void recordSelectedLeadActions("dm", "DM 발송")}
                    type="button"
                  >
                    {bulkActionBusy === "dm" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Instagram className="h-3.5 w-3.5" />}
                    DM 기록
                  </button>
                  <button
                    className="maju-button-secondary h-8 text-xs disabled:opacity-50"
                    disabled={!selectedLeads.length || Boolean(bulkActionBusy)}
                    onClick={() => void recordSelectedLeadActions("call", "전화 대상")}
                    type="button"
                  >
                    {bulkActionBusy === "call" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                    전화 기록
                  </button>
                  <button
                    className="maju-button-secondary h-8 text-xs disabled:opacity-50"
                    disabled={!selectedLeads.length || Boolean(bulkActionBusy)}
                    onClick={() => void recordSelectedLeadActions("quote", "견적 요청")}
                    type="button"
                  >
                    {bulkActionBusy === "quote" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileImage className="h-3.5 w-3.5" />}
                    견적 요청
                  </button>
                  {selectedLeads.length ? (
                    <label className="flex h-8 items-center gap-1 rounded-md border border-slate-200 bg-white px-2 text-[11px] font-black text-slate-500">
                      후속일
                      <input
                        className="h-6 w-[112px] border-0 bg-transparent p-0 text-[11px] font-bold text-slate-800 outline-none focus:ring-0"
                        disabled={Boolean(bulkActionBusy)}
                        onChange={(event) => setBulkNextActionDate(event.target.value)}
                        type="date"
                        value={bulkNextActionDate}
                      />
                    </label>
                  ) : null}
                  <button
                    className="maju-button-secondary h-8 text-xs disabled:opacity-50"
                    disabled={!selectedLeads.length || !bulkNextActionDate || Boolean(bulkActionBusy)}
                    onClick={() => void recordSelectedLeadActions("quote", "재연락 예정", "quoteFollowUp")}
                    type="button"
                  >
                    {bulkActionBusy === "quoteFollowUp" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                    재연락
                  </button>
                  <button className="maju-button-secondary h-8 text-xs disabled:opacity-50" disabled={!selectedLeads.length || Boolean(bulkActionBusy)} onClick={() => void copySelectedLeadOutboundList()} type="button">
                    <Copy className="h-3.5 w-3.5" />
                    영업 리스트 복사
                  </button>
                  <button className="maju-button-secondary h-8 text-xs disabled:opacity-50" disabled={!selectedLeadSummary.phone || Boolean(bulkActionBusy)} onClick={() => void copySelectedLeadContactList("phone")} type="button">
                    <Phone className="h-3.5 w-3.5" />
                    번호 복사
                  </button>
                  <button className="maju-button-secondary h-8 text-xs disabled:opacity-50" disabled={!selectedLeadSummary.instagram || Boolean(bulkActionBusy)} onClick={() => void copySelectedLeadContactList("instagram")} type="button">
                    <Instagram className="h-3.5 w-3.5" />
                    인스타 복사
                  </button>
                  <button className="maju-button-secondary h-8 text-xs disabled:opacity-50" disabled={!selectedLeads.length || Boolean(bulkActionBusy)} onClick={() => void copySelectedLeadDmScripts()} type="button">
                    <MessageCircle className="h-3.5 w-3.5" />
                    DM 문안
                  </button>
                  <button className="maju-button-secondary h-8 text-xs disabled:opacity-50" disabled={!selectedLeads.length || Boolean(bulkActionBusy)} onClick={downloadSelectedLeadCsv} type="button">
                    <Download className="h-3.5 w-3.5" />
                    CSV
                  </button>
                  <button className="rounded-md px-2 py-1 text-[11px] font-black text-slate-400 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-50" disabled={!selectedLeadIds.length || Boolean(bulkActionBusy)} onClick={() => setSelectedLeadIds([])} type="button">
                    선택 해제
                  </button>
                </div>
                {selectedLeads.length ? (
                  <p className="bg-slate-50/70 px-3 pb-2 text-[11px] font-bold text-slate-400">
                    선택한 리드는 현재 필터 화면 기준으로 처리됩니다. 전화·DM·견적·재연락 기록은 영업 이력에 저장됩니다.
                  </p>
                ) : null}
              </div>
              <div className="max-h-[calc(100dvh-360px)] min-h-[360px] overflow-auto overscroll-contain">
              <table className="w-full min-w-[1220px] border-separate border-spacing-0 text-left text-sm">
                <thead className="sticky top-0 z-10 bg-slate-50/95 text-xs font-black text-slate-500 shadow-[0_1px_0_#e2e8f0] backdrop-blur">
                  <tr>
                    <th className="w-[40px] border-r border-slate-200 px-2 py-2">
                      <input
                        aria-label="현재 페이지 전체 선택"
                        checked={allVisibleSelected}
                        onChange={toggleAllVisibleLeads}
                        type="checkbox"
                      />
                    </th>
                    <th className="w-[24%] border-r border-slate-200 px-3 py-2">거래처</th>
                    <th className="w-[84px] border-r border-slate-200 px-3 py-2">업종</th>
                    <th
                      className="w-[64px] border-r border-slate-200 px-3 py-2"
                      title="인허가 신선도·업종 적합도·리뷰활동·연락처 확보 여부를 합산한 리드 우선순위 등급입니다(A 85점↑ · B 70점↑ · C 55점↑). 거래처 매출등급과는 별개 기준입니다."
                    >
                      등급
                    </th>
                    <th className="w-[84px] border-r border-slate-200 px-3 py-2">안정도</th>
                    <th className="w-[110px] border-r border-slate-200 px-3 py-2">인스타</th>
                    <th className="w-[118px] border-r border-slate-200 px-3 py-2">전화</th>
                    <th
                      className="w-[110px] border-r border-slate-200 px-3 py-2 text-right"
                      title="네이버·카카오·구글에서 확보한 평점·리뷰수입니다. '영업리드' 모드에서는 검색량 지수까지 합친 매력도 점수도 함께 봅니다."
                    >
                      리뷰
                    </th>
                    <th className="w-[110px] border-r border-slate-200 px-3 py-2">다음 액션</th>
                    {showNearbyOnly && nearbyResult ? <th className="w-[80px] border-r border-slate-200 px-3 py-2 text-right">거리</th> : null}
                    <th className="w-[140px] border-r border-slate-200 px-3 py-2">상태</th>
                    <th className="w-[164px] px-3 py-2">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {pagedLeads.map((lead) => {
                    const tableAction = getPermitLeadTableAction(lead);
                    const quoteDraft = quoteDrafts[quoteDraftId(getPermitLeadQuoteSubject(lead))];
                    const tableActionLabel = tableAction.mode === "quote" && quoteDraft ? "이어 작성" : tableAction.label;
                    const selected = selectedLeadIds.includes(lead.id);
                    const instagramHandle = getLeadInstagramHandle(lead);
                    const instagramSearchUrl = getLeadInstagramSearchUrl(lead);
                    return (
                      <tr
                        className={`cursor-pointer bg-white transition hover:bg-slate-50 ${selected ? "bg-teal-50/40" : ""}`}
                        key={lead.id}
                        onClick={() => {
                          setSelectedLeadIntent(tableAction.intent);
                          setSelectedLead(lead);
                        }}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            setSelectedLeadIntent(tableAction.intent);
                            setSelectedLead(lead);
                          }
                        }}
                        role="button"
                        tabIndex={0}
                      >
                        <td className="border-r border-slate-100 px-2 py-2">
                          <input
                            aria-label={`${lead.businessName} 선택`}
                            checked={selected}
                            onChange={() => toggleLeadSelection(lead.id)}
                            onClick={(event) => event.stopPropagation()}
                            type="checkbox"
                          />
                        </td>
                        <td className="min-w-0 border-r border-slate-100 px-3 py-2">
                          <p className="truncate font-black text-slate-950">{lead.businessName}</p>
                          <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{lead.address || "주소 확인 필요"}</p>
                          {(() => {
                            const tags = recommendationTagsOf(lead).slice(0, 2);
                            return tags.length ? (
                              <div className="mt-0.5 flex flex-nowrap items-center gap-1 overflow-hidden">
                                {tags.map((tag) => (
                                  <span className="shrink-0 rounded-full bg-teal-50 px-1.5 py-0.5 text-[10px] font-black text-teal-700" key={tag}>
                                    {tag}
                                  </span>
                                ))}
                              </div>
                            ) : null;
                          })()}
                        </td>
                        <td className="max-w-[84px] truncate border-r border-slate-100 px-3 py-2 font-bold text-slate-700">{lead.industryPrimary}</td>
                        <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2">
                          <Badge className={`px-1.5 py-0 text-[10px] ${permitGradeToneClassName(lead.grade, isPermitLeadUnscored(lead))}`}>{lead.grade || (isPermitLeadUnscored(lead) ? "채점 전" : "-")}</Badge>
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2">
                          {(() => {
                            const confidence = getLeadConfidence(lead);
                            return (
                              <span className="rounded-full bg-teal-50 px-2 py-0.5 text-[11px] font-black text-teal-800">
                                {confidence.score} · {confidence.label}
                              </span>
                            );
                          })()}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2">
                          <a
                            className={`inline-flex max-w-[96px] items-center gap-1 truncate rounded-full px-2 py-0.5 text-[11px] font-black transition ${
                              instagramHandle ? "bg-pink-50 text-pink-800 hover:bg-pink-100" : "bg-slate-100 text-slate-500 hover:bg-slate-200"
                            }`}
                            href={instagramSearchUrl}
                            onClick={(event) => event.stopPropagation()}
                            rel="noreferrer"
                            target="_blank"
                            title={instagramHandle ? "인스타 프로필 열기" : "인스타 아이디 검색 필요 — 클릭하면 인스타그램 검색이 열립니다."}
                          >
                            <Instagram className="h-3 w-3 shrink-0" />
                            <span className="truncate">{instagramHandle || "검색 필요"}</span>
                          </a>
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2 font-bold text-slate-700">
                          {lead.phone ? (
                            <a className="inline-flex rounded-md px-1 py-0.5 transition hover:bg-teal-50 hover:text-teal-700" href={`tel:${lead.phone.replace(/[^0-9+]/g, "")}`} onClick={(event) => event.stopPropagation()}>
                              {lead.phone}
                            </a>
                          ) : (
                            "미확인"
                          )}
                        </td>
                        <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2 text-right">
                          {lead.rating || lead.reviewCount ? (
                            <>
                              <p className="font-black text-teal-700">{lead.rating ? `★${lead.rating.toFixed(1)}` : "평점 미확인"}</p>
                              <p className="mt-0.5 text-[11px] font-bold text-slate-400">
                                {lead.reviewCount ? `리뷰 ${lead.reviewCount.toLocaleString()}건` : "리뷰 미확인"}
                                {leadQualityMode === "keyword" && keywordVolumeOf(lead) > 0 ? ` · 매력도 ${businessAttractivenessOf(lead).toLocaleString()}` : ""}
                              </p>
                            </>
                          ) : leadQualityMode === "keyword" && keywordVolumeOf(lead) > 0 ? (
                            <p className="font-black text-teal-700">{businessAttractivenessOf(lead).toLocaleString()}점</p>
                          ) : (
                            <span className="font-bold text-slate-400">{leadQualityMode === "keyword" && keywordVolumeLoading ? "조회 중..." : "확인 필요"}</span>
                          )}
                        </td>
                        <td className="max-w-[110px] truncate border-r border-slate-100 px-3 py-2 font-bold text-slate-700">{lead.nextAction || "-"}</td>
                        {showNearbyOnly && nearbyResult ? (
                          <td className="whitespace-nowrap border-r border-slate-100 px-3 py-2 text-right font-black text-teal-700">
                            {nearbyDistanceById.get(lead.id)?.toLocaleString() ?? "-"}km
                          </td>
                        ) : null}
                        <td className="border-r border-slate-100 px-3 py-2">
                          {(() => {
                            // 상태 배지를 한 줄로 유지하려고 부가 배지는 우선순위 1개만 보여줍니다(2026-08-24
                            // 피드백: "표 형식에 글들이 깨지거나 두줄로 보여 간결히 한줄로 보이게 만들어").
                            const extraBadge = lead.leadPeriod === "today"
                              ? { tone: "bg-emerald-50 text-emerald-700", label: PERMIT_PERIOD_BADGE_LABEL[lead.leadPeriod] }
                              : lead.status === "견적 발송"
                                ? { tone: "bg-blue-50 text-blue-700", label: "발송됨" }
                                : lead.status === "재연락 예정"
                                  ? { tone: "bg-amber-50 text-amber-700", label: "후속 예정" }
                                  : quoteDraft
                                    ? { tone: "bg-teal-50 text-teal-700", label: "초안 있음" }
                                    : null;
                            return (
                              <div className="flex flex-nowrap items-center gap-1 overflow-hidden">
                                <span className="shrink-0 truncate rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-700">{lead.status}</span>
                                {extraBadge ? (
                                  <span className={`shrink-0 truncate rounded-full px-2 py-0.5 text-[11px] font-black ${extraBadge.tone}`}>{extraBadge.label}</span>
                                ) : null}
                              </div>
                            );
                          })()}
                        </td>
                        <td className="px-3 py-2">
                          <div className="flex flex-nowrap items-center justify-end gap-1">
                            <button
                              aria-label={`${lead.businessName} 관심 없음 · 숨김 처리`}
                              className="maju-icon-btn grid h-7 w-7 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-400 transition hover:border-rose-200 hover:bg-rose-50 hover:text-rose-600 disabled:opacity-50"
                              disabled={dismissingLeadId === lead.id}
                              onClick={async (event) => {
                                event.stopPropagation();
                                setDismissingLeadId(lead.id);
                                await runLeadAction(lead, "exclude", "제외");
                                setDismissingLeadId("");
                              }}
                              title="관심 없음 · 숨김 처리"
                              type="button"
                            >
                              {dismissingLeadId === lead.id ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <EyeOff className="h-3.5 w-3.5" />}
                            </button>
                            <button
                              className={`${tableAction.primary ? "maju-button-primary" : "maju-button-secondary"} h-7 shrink-0 justify-center whitespace-nowrap px-2 text-[11px]`}
                              onClick={(event) => {
                                event.stopPropagation();
                                if (tableAction.mode === "detail") {
                                  setSelectedLeadIntent(tableAction.intent);
                                  setSelectedLead(lead);
                                  return;
                                }
                                onOpenQuote(lead);
                              }}
                              type="button"
                            >
                              {tableActionLabel}
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
              </div>
            </div>
          )}
        </div>
      </div>

      {selectedLead ? (
        <PermitLeadDetailPanel
          lead={selectedLead}
          intent={selectedLeadIntent}
          onAction={runLeadAction}
          onClose={() => {
            setSelectedLead(null);
            setSelectedLeadIntent("");
          }}
          onConvert={convertToCustomer}
          onLeadUpdated={(updatedLead) => {
            setLeads((current) => current.map((item) => (item.id === updatedLead.id ? updatedLead : item)));
            setSelectedLead(updatedLead);
          }}
          onOpenQuote={onOpenQuote}
        />
      ) : null}
    </section>
  );
}

function PermitLeadDetailPanel({
  intent,
  lead,
  onAction,
  onClose,
  onConvert,
  onLeadUpdated,
  onOpenQuote
}: {
  readonly intent?: PermitLeadActionIntent;
  readonly lead: PermitLeadItem;
  readonly onAction: (lead: PermitLeadItem, actionType: PermitLeadActionKind, result?: string, memo?: string) => Promise<PermitLeadActionResult>;
  readonly onClose: () => void;
  readonly onConvert: (lead: PermitLeadItem) => void;
  readonly onLeadUpdated: (lead: PermitLeadItem) => void;
  readonly onOpenQuote: (lead: PermitLeadItem) => void;
}) {
  const confidence = getLeadConfidence(lead);
  const [savedInstagramUrl, setSavedInstagramUrl] = useState(lead.instagramUrl || "");
  const [instagramDraft, setInstagramDraft] = useState(lead.instagramUrl || "");
  const [instagramSaveMessage, setInstagramSaveMessage] = useState("");
  const [instagramSaving, setInstagramSaving] = useState(false);
  const leadWithSavedInstagram = { ...lead, instagramUrl: savedInstagramUrl };
  const instagramHandle = getLeadInstagramHandle(leadWithSavedInstagram);
  const instagramUrl = getLeadInstagramSearchUrl(leadWithSavedInstagram);
  const fallbackPlaceLinks = buildPlaceSearchLinks({ address: lead.address, customerName: lead.businessName });
  const quoteSubject = useMemo<QuoteSubject>(
    () => ({
      address: lead.address,
      industry: lead.industryPrimary,
      instagramUrl: savedInstagramUrl,
      leadId: lead.id,
      name: lead.businessName,
      outboundNotes: buildOutboundItemNotes(lead.industryPrimary),
      phone: lead.phone,
      reviewCount: lead.reviewCount
    }),
    [lead, savedInstagramUrl]
  );
  const [copyMessage, setCopyMessage] = useState("");
  const [actionMemo, setActionMemo] = useState("");
  const [externalInfoMessage, setExternalInfoMessage] = useState("");
  const [externalInfoSaving, setExternalInfoSaving] = useState(false);
  const [externalSignals, setExternalSignals] = useState({
    googlePlaceUrl: lead.googlePlaceUrl || "",
    kakaoPlaceUrl: lead.kakaoPlaceUrl || "",
    keywordVolume: lead.keywordVolume,
    naverPlaceUrl: lead.naverPlaceUrl || "",
    rating: lead.rating,
    reviewCount: lead.reviewCount
  });
  const placeLinks = {
    googleMapUrl: externalSignals.googlePlaceUrl || fallbackPlaceLinks.googleMapUrl,
    kakaoPlaceUrl: externalSignals.kakaoPlaceUrl || fallbackPlaceLinks.kakaoPlaceUrl,
    naverPlaceUrl: externalSignals.naverPlaceUrl || fallbackPlaceLinks.naverPlaceUrl
  };
  const externalInfoSources = [
    externalSignals.naverPlaceUrl || externalSignals.kakaoPlaceUrl || externalSignals.googlePlaceUrl ? "플레이스" : "",
    externalSignals.reviewCount || externalSignals.rating ? "리뷰" : "",
    externalSignals.keywordVolume ? "검색량" : ""
  ].filter(Boolean);
  const [quoteDraftSavedAt, setQuoteDraftSavedAt] = useState(() => readQuoteDraft(quoteSubject)?.savedAt || "");
  const [nextActionDate, setNextActionDate] = useState("");
  const [actionHistory, setActionHistory] = useState<PermitLeadActionItem[]>([]);
  const [historyState, setHistoryState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [savingAction, setSavingAction] = useState("");
  const [historyOpen, setHistoryOpen] = useState(false);
  const [resultOpen, setResultOpen] = useState(Boolean(intent));
  const intentGuide =
    intent === "call"
      ? { description: "통화 후 결과를 바로 남기면 리드 상태와 이력이 함께 갱신됩니다.", title: "추천 작업 · 통화 결과 기록" }
      : intent === "dm"
        ? { description: "DM 문안을 복사하거나 발송 결과를 남겨 다음 영업 대상과 섞이지 않게 관리합니다.", title: "추천 작업 · DM 발송 기록" }
        : intent === "followup"
          ? { description: "견적 발송 후 재연락일, 답변 내용, 방문 여부를 기록해 후속 누락을 줄입니다.", title: "추천 작업 · 견적 후속 관리" }
          : intent === "info"
            ? { description: "전화, 주소, 대표자, 인스타 등 부족한 정보를 확인하고 메모에 남긴 뒤 다음 액션을 정합니다.", title: "추천 작업 · 정보 보강" }
            : null;

  useEffect(() => {
    setExternalInfoMessage("");
    setInstagramDraft(lead.instagramUrl || "");
    setInstagramSaveMessage("");
    setSavedInstagramUrl(lead.instagramUrl || "");
    setHistoryOpen(false);
    setResultOpen(Boolean(intent));
    setExternalSignals({
      googlePlaceUrl: lead.googlePlaceUrl || "",
      kakaoPlaceUrl: lead.kakaoPlaceUrl || "",
      keywordVolume: lead.keywordVolume,
      naverPlaceUrl: lead.naverPlaceUrl || "",
      rating: lead.rating,
      reviewCount: lead.reviewCount
    });
  }, [intent, lead.googlePlaceUrl, lead.id, lead.instagramUrl, lead.kakaoPlaceUrl, lead.keywordVolume, lead.naverPlaceUrl, lead.rating, lead.reviewCount]);

  useEffect(() => {
    const refreshQuoteDraftState = () => setQuoteDraftSavedAt(readQuoteDraft(quoteSubject)?.savedAt || "");
    refreshQuoteDraftState();
    window.addEventListener(QUOTE_DRAFT_UPDATED_EVENT, refreshQuoteDraftState);
    return () => window.removeEventListener(QUOTE_DRAFT_UPDATED_EVENT, refreshQuoteDraftState);
  }, [quoteSubject]);

  useEffect(() => {
    let cancelled = false;
    setHistoryState("loading");
    setActionHistory([]);

    fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/actions`), { cache: "no-store" })
      .then((response) => response.json().then((payload) => ({ ok: response.ok, payload })))
      .then(({ ok, payload }) => {
        if (cancelled) return;
        if (!ok) {
          setHistoryState("error");
          return;
        }
        setActionHistory(Array.isArray(payload?.actions) ? payload.actions : []);
        setHistoryState("ready");
      })
      .catch(() => {
        if (!cancelled) setHistoryState("error");
      });

    return () => {
      cancelled = true;
    };
  }, [lead.id]);

  function buildActionMemo(result: string) {
    const parts = [
      `결과: ${result}`,
      instagramHandle ? `인스타: ${instagramHandle}` : "",
      nextActionDate ? `다음 액션일: ${nextActionDate}` : "",
      actionMemo.trim()
    ].filter(Boolean);
    return parts.join("\n");
  }

  async function saveInstagramProfile() {
    setInstagramSaveMessage("");
    const normalizedHandle = normalizeInstagramHandleValue(instagramDraft);
    const normalizedValue = normalizedHandle || instagramDraft.trim();
    if (instagramDraft.trim() && !normalizedHandle) {
      setInstagramSaveMessage("인스타 ID는 @아이디, 아이디, 또는 instagram.com/아이디 형태로 입력하세요.");
      return;
    }

    setInstagramSaving(true);
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ instagramUrl: normalizedValue || null })
      });
      const payload = await response.json().catch(() => null);
      if (!response.ok || !payload?.ok) throw new Error(payload?.message || "인스타 정보를 저장하지 못했습니다.");

      const updatedLead = payload.lead as PermitLeadItem | undefined;
      if (updatedLead) {
        onLeadUpdated(updatedLead);
        setSavedInstagramUrl(updatedLead.instagramUrl || "");
        setInstagramDraft(updatedLead.instagramUrl || "");
      } else {
        setSavedInstagramUrl(normalizedValue);
        setInstagramDraft(normalizedValue);
      }
      setInstagramSaveMessage(normalizedValue ? "인스타 ID를 저장했습니다." : "인스타 정보를 비웠습니다.");
      setHistoryOpen(true);
    } catch (error) {
      setInstagramSaveMessage(error instanceof Error ? error.message : "인스타 정보를 저장하지 못했습니다.");
    } finally {
      setInstagramSaving(false);
    }
  }

  async function recordAction(actionType: PermitLeadActionKind, result: string): Promise<boolean> {
    const memo = buildActionMemo(result);
    setSavingAction(result);
    const saved = await onAction(lead, actionType, result, memo);
    setSavingAction("");
    if (!saved.ok || actionType === "exclude") return false;

    const savedAction: PermitLeadActionItem = saved.action || {
      actionType,
      createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      id: `local-${Date.now()}`,
      memo,
      result
    };
    setActionHistory((items) => [savedAction, ...items]);
    setActionMemo("");
    setNextActionDate("");
    setHistoryState("ready");
    setHistoryOpen(true);
    return true;
  }

  async function recordQuoteRequest() {
    const saved = await recordAction("quote", "견적 요청");
    if (saved) onOpenQuote(lead);
  }

  async function recordQuoteSent() {
    const memo = quoteDraftSavedAt ? `견적 초안 저장본 기준 발송\n${actionMemo.trim()}`.trim() : buildActionMemo("견적 발송");
    setSavingAction("견적 발송");
    const saved = await onAction(lead, "quote", "견적 발송", memo);
    setSavingAction("");
    if (!saved.ok) return;
    const savedAction: PermitLeadActionItem = saved.action || {
      actionType: "quote",
      createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      id: `local-${Date.now()}`,
      memo,
      result: "견적 발송"
    };
    setActionHistory((items) => [savedAction, ...items]);
    setActionMemo("");
    setNextActionDate("");
    setHistoryState("ready");
    setHistoryOpen(true);
  }

  async function recordQuoteFollowUp() {
    const memo = buildActionMemo("재연락 예정");
    setSavingAction("재연락 예정");
    const saved = await onAction(lead, "quote", "재연락 예정", memo);
    setSavingAction("");
    if (!saved.ok) return;
    const savedAction: PermitLeadActionItem = saved.action || {
      actionType: "quote",
      createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
      id: `local-${Date.now()}`,
      memo,
      result: "재연락 예정"
    };
    setActionHistory((items) => [savedAction, ...items]);
    setActionMemo("");
    setNextActionDate("");
    setHistoryState("ready");
    setHistoryOpen(true);
  }

  function openQuoteDraft() {
    onOpenQuote(lead);
  }

  async function copyDmScript() {
    try {
      await navigator.clipboard.writeText(buildLeadDmScript(lead));
      setCopyMessage("인스타 DM 문안을 복사했습니다.");
    } catch {
      setCopyMessage("복사 권한이 없어 문안을 직접 선택해 복사해주세요.");
    }
  }

  async function enrichExternalInfo() {
    setExternalInfoSaving(true);
    setExternalInfoMessage("");
    try {
      const response = await fetch(withPermitLeadCompanyQuery(`/api/leads/permits/${lead.id}/enrich`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({})
      });
      const payload = (await response.json().catch(() => null)) as PermitLeadEnrichResponse | null;
      if (!response.ok || !payload?.ok) {
        setExternalInfoMessage(payload?.message || "외부 정보 보강에 실패했습니다.");
        return;
      }

      const updatedLead = payload.lead;
      if (updatedLead) {
        setExternalSignals({
          googlePlaceUrl: updatedLead.googlePlaceUrl || externalSignals.googlePlaceUrl,
          kakaoPlaceUrl: updatedLead.kakaoPlaceUrl || externalSignals.kakaoPlaceUrl,
          keywordVolume: updatedLead.keywordVolume ?? externalSignals.keywordVolume,
          naverPlaceUrl: updatedLead.naverPlaceUrl || externalSignals.naverPlaceUrl,
          rating: updatedLead.rating ?? externalSignals.rating,
          reviewCount: updatedLead.reviewCount ?? externalSignals.reviewCount
        });
      }
      const confirmedSources = [
        payload.sources?.placeLinks ? "플레이스" : "",
        payload.sources?.googleReviews ? "리뷰/평점" : "",
        payload.sources?.keywordVolume ? "검색량" : ""
      ].filter(Boolean);
      setExternalInfoMessage(
        payload.message ||
          (confirmedSources.length
            ? `${confirmedSources.join(", ")} 정보를 확인했습니다.`
            : payload.persisted
              ? "외부 정보 확인 이력을 저장했습니다."
              : "외부 정보를 확인했지만 저장된 값은 없습니다.")
      );
      setActionHistory((items) => [
        {
          actionType: "hold",
          actorName: "MAJU",
          createdAt: new Date().toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }),
          id: `local-enrich-${Date.now()}`,
          memo: confirmedSources.length ? `${confirmedSources.join(", ")} 보강 실행` : "외부 정보 보강 실행",
          result: "외부 정보 보강"
        },
        ...items
      ]);
      setHistoryState("ready");
    } catch {
      setExternalInfoMessage("외부 정보 보강 중 오류가 발생했습니다.");
    } finally {
      setExternalInfoSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-40 flex justify-end bg-slate-950/45" onClick={onClose}>
      <div className="h-full w-full max-w-md overflow-y-auto bg-white shadow-2xl" onClick={(event) => event.stopPropagation()}>
        <div className="flex items-start justify-between gap-2 border-b border-slate-200 p-4">
          <div className="min-w-0">
            <span className="flex items-center gap-1.5">
              <Badge className={`px-1.5 py-0 text-[10px] ${permitGradeToneClassName(lead.grade, isPermitLeadUnscored(lead))}`}>{lead.grade ? `${lead.grade}등급` : isPermitLeadUnscored(lead) ? "채점 전" : "등급 미달"}</Badge>
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
          <div className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm shadow-slate-900/5">
            <div className="flex items-center justify-between gap-3">
              <div className="min-w-0">
                <p className="truncate text-sm font-black text-slate-950">{lead.nextAction || "상세 확인"}</p>
                <p className="mt-0.5 truncate text-[11px] font-bold text-slate-400">현재 상태 · {lead.status}</p>
              </div>
              <span className="shrink-0 rounded-full bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-700 ring-1 ring-inset ring-teal-100">
                {confidence.score}점
              </span>
            </div>
            <div className="mt-3 grid grid-cols-4 gap-2">
              <PermitLeadActionRailButton
                disabled={!lead.phone || Boolean(savingAction)}
                icon={Phone}
                label="전화"
                loading={savingAction === "통화 성공"}
                onClick={() => void recordAction("call", "통화 성공")}
                primary={intent === "call"}
              />
              <PermitLeadActionRailButton icon={Instagram} label="DM" onClick={() => void copyDmScript()} primary={intent === "dm"} />
              <PermitLeadActionRailButton icon={FileImage} label="견적" onClick={openQuoteDraft} primary={intent === "followup"} />
              <PermitLeadActionRailButton icon={UserCheck} label="전환" onClick={() => onConvert(lead)} primary={false} />
            </div>
          </div>

          <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">인스타 영업 정보</p>
                <p className="mt-0.5 text-xs font-semibold text-slate-500">
                  {instagramHandle ? `${instagramHandle} 저장됨` : "인스타 ID를 확인한 뒤 저장하면 검색·DM 작업에 반영됩니다."}
                </p>
              </div>
              <a className="maju-button-secondary h-8 shrink-0 px-2 text-xs" href={instagramUrl} rel="noreferrer" target="_blank">
                <ExternalLink className="h-3.5 w-3.5" />
                검색
              </a>
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] gap-2">
              <input
                className="h-9 min-w-0 rounded-lg border border-pink-100 bg-white px-3 text-xs font-bold text-slate-900 outline-none transition placeholder:text-slate-400 focus:border-pink-300 focus:ring-2 focus:ring-pink-100"
                onChange={(event) => setInstagramDraft(event.target.value)}
                placeholder="@instagram_id 또는 instagram.com/id"
                value={instagramDraft}
              />
              <button className="maju-button-primary h-9 justify-center px-3 text-xs disabled:opacity-50" disabled={instagramSaving || instagramDraft.trim() === savedInstagramUrl.trim()} onClick={() => void saveInstagramProfile()} type="button">
                {instagramSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Check className="h-3.5 w-3.5" />}
                저장
              </button>
            </div>
            {instagramSaveMessage ? <p className="mt-2 text-[11px] font-bold text-pink-700">{instagramSaveMessage}</p> : null}
          </div>

          {intentGuide ? (
            <div className="rounded-xl border border-blue-100 bg-blue-50/70 p-3">
              <p className="text-sm font-black text-blue-950">{intentGuide.title}</p>
              <p className="mt-1 text-xs font-semibold leading-5 text-blue-800">{intentGuide.description}</p>
              <div className="mt-3 grid grid-cols-2 gap-2">
                {intent === "call" ? (
                  <>
                    <button className="maju-button-primary h-8 justify-center text-xs" disabled={!lead.phone || Boolean(savingAction)} onClick={() => void recordAction("call", "통화 성공")} type="button">
                      {savingAction === "통화 성공" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                      통화 성공
                    </button>
                    <button className="maju-button-secondary h-8 justify-center text-xs" disabled={!lead.phone || Boolean(savingAction)} onClick={() => void recordAction("call", "부재중")} type="button">
                      {savingAction === "부재중" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Phone className="h-3.5 w-3.5" />}
                      부재중
                    </button>
                  </>
                ) : null}
                {intent === "dm" ? (
                  <>
                    <button className="maju-button-primary h-8 justify-center text-xs" disabled={Boolean(savingAction)} onClick={() => void recordAction("dm", "DM 발송")} type="button">
                      {savingAction === "DM 발송" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                      DM 발송
                    </button>
                    <button className="maju-button-secondary h-8 justify-center text-xs" disabled={Boolean(savingAction)} onClick={() => void copyDmScript()} type="button">
                      <Copy className="h-3.5 w-3.5" />
                      문안 복사
                    </button>
                  </>
                ) : null}
                {intent === "followup" ? (
                  <>
                    <label className="col-span-2 text-[11px] font-black text-blue-900">
                      재연락일
                      <input
                        className="mt-1 h-8 w-full rounded-lg border border-blue-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"
                        onChange={(event) => setNextActionDate(event.target.value)}
                        type="date"
                        value={nextActionDate}
                      />
                    </label>
                    <button className="maju-button-primary h-8 justify-center text-xs disabled:opacity-50" disabled={!nextActionDate || Boolean(savingAction)} onClick={() => void recordQuoteFollowUp()} type="button">
                      {savingAction === "재연락 예정" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                      재연락 예정
                    </button>
                    <button className="maju-button-secondary h-8 justify-center text-xs" disabled={Boolean(savingAction)} onClick={() => void recordAction("visit", "다음 방문")} type="button">
                      {savingAction === "다음 방문" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MapPin className="h-3.5 w-3.5" />}
                      방문 예정
                    </button>
                  </>
                ) : null}
                {intent === "info" ? (
                  <>
                    <button className="maju-button-primary h-8 justify-center text-xs" disabled={Boolean(savingAction)} onClick={() => void recordAction("hold", "보류")} type="button">
                      {savingAction === "보류" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CircleSlash className="h-3.5 w-3.5" />}
                      보류 기록
                    </button>
                    <button className="maju-button-secondary h-8 justify-center text-xs" onClick={openQuoteDraft} type="button">
                      <FileImage className="h-3.5 w-3.5" />
                      견적 초안
                    </button>
                  </>
                ) : null}
              </div>
              {intent === "followup" && !nextActionDate ? (
                <p className="mt-2 text-[11px] font-semibold text-blue-700">재연락일을 선택하면 바로 후속 기록을 남길 수 있습니다.</p>
              ) : null}
            </div>
          ) : null}

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] font-black uppercase tracking-wide text-slate-400">리드 안정도</p>
                <p className="mt-0.5 text-2xl font-black text-slate-950">
                  {confidence.score}점 <span className="text-sm text-teal-700">{confidence.label}</span>
                </p>
              </div>
              <Gauge className="h-8 w-8 text-teal-700" />
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {confidence.reasons.length ? (
                confidence.reasons.map((reason) => (
                  <span className="rounded-full bg-white px-2 py-1 text-[11px] font-black text-slate-600 ring-1 ring-inset ring-slate-200" key={reason}>
                    {reason}
                  </span>
                ))
              ) : (
                <span className="text-xs font-bold text-slate-500">전화·주소·사업자 상태를 보강하면 안정도가 올라갑니다.</span>
              )}
            </div>
          </div>

          <div className="rounded-xl border border-pink-100 bg-pink-50/50 p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="flex items-center gap-1.5 text-xs font-black text-pink-800">
                  <Instagram className="h-4 w-4" />
                  인스타 DM 영업
                </p>
                <p className="mt-1 truncate text-sm font-black text-slate-950">{instagramHandle || "인스타 ID 미확인"}</p>
                <p className="mt-1 text-[11px] font-semibold leading-4 text-slate-500">실제 ID가 없으면 상호명으로 인스타 검색을 열어 확인합니다.</p>
              </div>
              <a className="maju-button-secondary h-8 shrink-0 px-2 text-xs" href={instagramUrl} rel="noreferrer" target="_blank">
                검색
              </a>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="maju-button-primary h-8 justify-center text-xs" onClick={() => void copyDmScript()} type="button">
                <Copy className="h-3.5 w-3.5" />
                DM 문안 복사
              </button>
              <button className="maju-button-secondary h-8 justify-center text-xs" onClick={openQuoteDraft} type="button">
                견적 품목 보기
              </button>
            </div>
            {copyMessage ? (
              <div className="mt-2 flex items-center justify-between gap-2 rounded-md bg-white px-2 py-1.5">
                <p className="min-w-0 text-[11px] font-bold text-pink-800">{copyMessage}</p>
                <button
                  className="shrink-0 rounded-md bg-pink-600 px-2 py-1 text-[11px] font-black text-white disabled:opacity-50"
                  disabled={Boolean(savingAction)}
                  onClick={() => void recordAction("dm", "DM 발송")}
                  type="button"
                >
                  기록
                </button>
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <p className="text-sm font-black text-slate-950">외부 정보 확인</p>
                  <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${
                    externalInfoSources.length ? "bg-teal-50 text-teal-700 ring-1 ring-inset ring-teal-100" : "bg-amber-50 text-amber-800 ring-1 ring-inset ring-amber-100"
                  }`}>
                    {externalInfoSources.length ? `${externalInfoSources.join(" · ")} 확보` : "보강 필요"}
                  </span>
                </div>
                <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">플레이스, 리뷰, 사진, 메뉴 정보를 열어 영업 전 보강합니다.</p>
              </div>
              <ExternalLink className="h-4 w-4 shrink-0 text-slate-400" />
            </div>
            <div className="mt-3 grid grid-cols-3 gap-2">
              <a className="maju-button-secondary h-8 justify-center px-2 text-xs" href={placeLinks.naverPlaceUrl} rel="noreferrer" target="_blank">
                네이버
              </a>
              <a className="maju-button-secondary h-8 justify-center px-2 text-xs" href={placeLinks.kakaoPlaceUrl} rel="noreferrer" target="_blank">
                카카오
              </a>
              <a className="maju-button-secondary h-8 justify-center px-2 text-xs" href={placeLinks.googleMapUrl} rel="noreferrer" target="_blank">
                구글
              </a>
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 rounded-lg bg-slate-50 p-2">
              <PermitSignal label="리뷰" value={externalSignals.reviewCount ? `${externalSignals.reviewCount.toLocaleString()}개` : "확인 필요"} />
              <PermitSignal label="평점" value={externalSignals.rating ? `${externalSignals.rating.toLocaleString()}점` : "확인 필요"} />
              <PermitSignal label="검색량" value={externalSignals.keywordVolume ? externalSignals.keywordVolume.toLocaleString() : "확인 필요"} />
              <PermitSignal label="플레이스" value={externalSignals.naverPlaceUrl || externalSignals.kakaoPlaceUrl || externalSignals.googlePlaceUrl ? "연결됨" : "검색 필요"} />
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button
                className="maju-button-primary h-8 justify-center text-xs"
                disabled={externalInfoSaving}
                onClick={() => void enrichExternalInfo()}
                type="button"
              >
                {externalInfoSaving ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <RefreshCw className="h-3.5 w-3.5" />}
                다시 보강
              </button>
              <button
                className="maju-button-secondary h-8 justify-center text-xs"
                disabled={Boolean(savingAction)}
                onClick={() => void recordAction("hold", "외부 정보 확인")}
                type="button"
              >
                {savingAction === "외부 정보 확인" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CheckCircle2 className="h-3.5 w-3.5" />}
                이력 기록
              </button>
            </div>
            {externalInfoMessage ? <p className="mt-2 rounded-md bg-slate-50 px-2 py-1.5 text-[11px] font-bold text-slate-600">{externalInfoMessage}</p> : null}
          </div>

          <div className="rounded-xl border border-teal-100 bg-white p-3">
            <div className="flex items-start justify-between gap-3">
              <div className="min-w-0">
                <p className="text-sm font-black text-slate-950">견적 진행</p>
                <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">
                  견적 요청 리드는 초안을 저장해두고, DM/문자 발송 직전에 다시 열어 수정합니다.
                </p>
              </div>
              <FileImage className="h-4 w-4 shrink-0 text-teal-600" />
            </div>
            <div className="mt-3 grid grid-cols-[1fr_auto] items-center gap-2 rounded-lg bg-slate-50 px-3 py-2">
              <span className="min-w-0 text-xs font-bold text-slate-600">
                {quoteDraftSavedAt
                  ? `초안 저장됨 · ${new Date(quoteDraftSavedAt).toLocaleString("ko-KR", { dateStyle: "short", timeStyle: "short" })}`
                  : "아직 저장된 견적 초안이 없습니다."}
              </span>
              <button className="maju-button-primary h-8 justify-center px-2.5 text-xs" onClick={openQuoteDraft} type="button">
                {quoteDraftSavedAt ? "이어 작성" : "초안 작성"}
              </button>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-2">
              <button className="maju-button-secondary h-8 justify-center text-xs" disabled={Boolean(savingAction)} onClick={() => void recordQuoteRequest()} type="button">
                {savingAction === "견적 요청" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileImage className="h-3.5 w-3.5" />}
                견적 요청 기록
              </button>
              <button className="maju-button-primary h-8 justify-center text-xs disabled:opacity-50" disabled={!quoteDraftSavedAt || Boolean(savingAction)} onClick={() => void recordQuoteSent()} type="button">
                {savingAction === "견적 발송" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <MessageCircle className="h-3.5 w-3.5" />}
                견적 발송 기록
              </button>
              <button
                className="maju-button-secondary col-span-2 h-8 justify-center text-xs disabled:opacity-50"
                disabled={!nextActionDate || Boolean(savingAction)}
                onClick={() => void recordQuoteFollowUp()}
                type="button"
              >
                {savingAction === "재연락 예정" ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <CalendarDays className="h-3.5 w-3.5" />}
                {nextActionDate ? "재연락 예정 기록" : "재연락일 선택 필요"}
              </button>
            </div>
            <p className="mt-2 text-[11px] font-semibold leading-4 text-slate-400">
              {nextActionDate ? `재연락 예정은 ${nextActionDate} 기준으로 저장됩니다.` : "상단 빠른 액션 또는 아래 영업 결과 기록에서 재연락일을 먼저 선택하세요."}
            </p>
          </div>

          <div className="rounded-lg border border-slate-200 p-3 text-xs font-bold text-slate-600">
            <PermitDetailRow label="리드 출처" value={permitLeadSourceLabel(lead.source)} />
            <PermitDetailRow label="주소" value={lead.address || "확인 필요"} />
            <PermitDetailRow label="전화" value={lead.phone || "확인 필요"} />
            <PermitDetailRow label="대표자" value={lead.representativeName || "확인 필요"} />
            <PermitDetailRow label="개시일" value={getPermitLeadOpenDate(lead) || "확인 필요"} />
            <PermitDetailRow label={lead.source === "kakao_keyword_search" ? "탐색 기준점" : "관할기관"} value={lead.jurisdiction || "확인 필요"} />
            <PermitDetailRow label="인스타" value={instagramHandle || "검색 필요"} />
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

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setHistoryOpen((value) => !value)} type="button">
              <div>
                <p className="text-sm font-black text-slate-950">최근 영업 이력</p>
                <p className="mt-0.5 text-[11px] font-semibold text-slate-500">
                  {actionHistory.length ? `${actionHistory.length.toLocaleString()}건 기록됨` : "아직 기록 없음"}
                </p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-slate-400">
                <MessageSquareText className="h-4 w-4" />
                <ChevronDown className={`h-4 w-4 transition ${historyOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {historyOpen ? (
              <div className="mt-3 space-y-2">
                {historyState === "loading" ? (
                  <p className="flex items-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                    <Loader2 className="h-3 w-3 shrink-0 animate-spin" />
                    이력을 불러오는 중입니다.
                  </p>
                ) : actionHistory.length ? (
                  actionHistory.slice(0, 5).map((action) => (
                    <div className="rounded-lg border border-slate-100 bg-slate-50 px-3 py-2" key={action.id}>
                      <div className="flex items-center justify-between gap-2">
                        <span className="truncate text-xs font-black text-slate-950">{action.result || permitLeadActionLabel(action.actionType)}</span>
                        <span className="shrink-0 text-[10px] font-bold text-slate-400">{action.createdAt}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-semibold text-slate-500">{action.actorName || "담당자 미기록"}</p>
                      {action.memo ? <p className="mt-1 whitespace-pre-wrap text-xs font-semibold leading-5 text-slate-700">{action.memo}</p> : null}
                    </div>
                  ))
                ) : (
                  <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs font-bold text-slate-500">
                    {historyState === "error" ? "이력을 불러오지 못했습니다." : "아직 기록된 영업 이력이 없습니다."}
                  </p>
                )}
              </div>
            ) : null}
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-3">
            <button className="flex w-full items-start justify-between gap-3 text-left" onClick={() => setResultOpen((value) => !value)} type="button">
              <div>
                <p className="text-sm font-black text-slate-950">영업 결과 기록</p>
                <p className="mt-0.5 text-[11px] font-semibold leading-4 text-slate-500">{resultOpen ? "통화, DM, 방문 결과를 저장합니다." : "메모와 다음 액션일을 기록할 때 펼치세요."}</p>
              </div>
              <span className="flex shrink-0 items-center gap-2 text-slate-400">
                <CalendarDays className="h-4 w-4" />
                <ChevronDown className={`h-4 w-4 transition ${resultOpen ? "rotate-180" : ""}`} />
              </span>
            </button>
            {resultOpen ? (
              <div className="mt-3 grid grid-cols-2 gap-2">
              <label className="col-span-2 text-[11px] font-black text-slate-500">
                다음 액션일
                <input
                  className="mt-1 h-9 w-full rounded-lg border border-slate-200 bg-white px-3 text-xs font-bold text-slate-800 outline-none focus:border-teal-500"
                  onChange={(event) => setNextActionDate(event.target.value)}
                  type="date"
                  value={nextActionDate}
                />
              </label>
              <textarea
                className="col-span-2 min-h-20 resize-none rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs font-semibold leading-5 text-slate-700 outline-none focus:border-teal-500"
                onChange={(event) => setActionMemo(event.target.value)}
                placeholder="통화 내용, DM 답변, 방문 시 확인할 내용 등을 남겨주세요."
                value={actionMemo}
              />
              <PermitActionButton disabled={!lead.phone || Boolean(savingAction)} icon={Phone} label="통화 성공" loading={savingAction === "통화 성공"} onClick={() => void recordAction("call", "통화 성공")} />
              <PermitActionButton disabled={!lead.phone || Boolean(savingAction)} icon={Phone} label="부재중" loading={savingAction === "부재중"} onClick={() => void recordAction("call", "부재중")} />
              <PermitActionButton disabled={Boolean(savingAction)} icon={MessageCircle} label="DM 발송" loading={savingAction === "DM 발송"} onClick={() => void recordAction("dm", "DM 발송")} />
              <PermitActionButton disabled={Boolean(savingAction)} icon={MessageCircle} label="관심 있음" loading={savingAction === "관심 있음"} onClick={() => void recordAction("dm", "관심 있음")} />
              <PermitActionButton disabled={Boolean(savingAction)} icon={MapPin} label="방문 예정" loading={savingAction === "다음 방문"} onClick={() => void recordAction("visit", "다음 방문")} />
              <PermitActionButton disabled={Boolean(savingAction)} icon={CircleSlash} label="보류" loading={savingAction === "보류"} onClick={() => void recordAction("hold", "보류")} />
              </div>
            ) : null}
          </div>
          <div className="rounded-xl border border-rose-100 bg-rose-50/40 p-3">
            <p className="text-sm font-black text-rose-950">관리 작업</p>
            <p className="mt-0.5 text-[11px] font-semibold leading-4 text-rose-700">중복, 비대상, 영업 제외 리드는 목록에서 제외 처리합니다.</p>
            <button className="maju-button-secondary mt-3 w-full justify-center text-rose-600" disabled={Boolean(savingAction)} onClick={() => void recordAction("exclude", "제외")} type="button">
              {savingAction === "제외" ? <Loader2 className="h-4 w-4 animate-spin" /> : <CircleSlash className="h-4 w-4" />}
              영업 제외
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// 리드가 어디서 왔는지(공공 인허가 신규 개업 vs 카카오 키워드 탐색으로 찾은 기존 운영 매장)를
// 사람이 읽을 수 있는 라벨로 바꿉니다. 2026-08-31 피드백으로 추가된 영업리드 확장 탐색 소스는
// 개업일자 신뢰도가 낮아(개업일 자체가 없음) 담당자가 헷갈리지 않도록 명시적으로 구분합니다.
function permitLeadSourceLabel(source?: string): string {
  switch (source) {
    case "kakao_keyword_search":
      return "영업리드 탐색(카카오, 운영중 매장)";
    case "gov_restaurant_api":
      return "전국 공공데이터(자동)";
    case "seoul_opendata_api":
      return "서울시 공공데이터(자동)";
    case "localdata_api":
      return "지방행정 인허가(자동)";
    case "manual_upload":
      return "수동 업로드";
    default:
      return "확인 필요";
  }
}

function PermitDetailRow({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <p className="flex items-center justify-between gap-2 border-b border-slate-100 py-1 last:border-0">
      <span className="shrink-0 text-slate-400">{label}</span>
      <span className="truncate text-right text-slate-800">{value}</span>
    </p>
  );
}

function PermitSignal({ label, value }: { readonly label: string; readonly value: string }) {
  return (
    <div className="rounded-md bg-white px-2.5 py-2 ring-1 ring-inset ring-slate-200">
      <p className="text-[10px] font-black text-slate-400">{label}</p>
      <p className="mt-0.5 truncate text-xs font-black text-slate-800">{value}</p>
    </div>
  );
}

function PermitActionButton({
  disabled,
  icon: Icon,
  label,
  loading,
  onClick
}: {
  readonly disabled?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly loading?: boolean;
  readonly onClick: () => void;
}) {
  return (
    <button className="maju-button-secondary justify-center disabled:cursor-not-allowed disabled:opacity-50" disabled={disabled} onClick={onClick} type="button">
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      {label}
    </button>
  );
}

function PermitLeadActionRailButton({
  disabled,
  icon: Icon,
  label,
  loading,
  onClick,
  primary
}: {
  readonly disabled?: boolean;
  readonly icon: LucideIcon;
  readonly label: string;
  readonly loading?: boolean;
  readonly onClick: () => void;
  readonly primary?: boolean;
}) {
  return (
    <button
      className={`flex h-14 min-w-0 flex-col items-center justify-center gap-1 rounded-lg border text-[11px] font-black transition disabled:cursor-not-allowed disabled:opacity-50 ${
        primary ? "border-teal-700 bg-teal-700 text-white shadow-sm shadow-teal-900/15" : "border-slate-200 bg-slate-50 text-slate-700 hover:border-teal-200 hover:bg-teal-50 hover:text-teal-800"
      }`}
      disabled={disabled}
      onClick={onClick}
      type="button"
    >
      {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <Icon className="h-4 w-4" />}
      <span className="truncate">{label}</span>
    </button>
  );
}

function PermitLeadQueueCard({
  description,
  icon: Icon,
  leads,
  onFocus,
  title,
  tone
}: {
  readonly description: string;
  readonly icon: LucideIcon;
  readonly leads: PermitLeadItem[];
  readonly onFocus: () => void;
  readonly title: string;
  readonly tone: "amber" | "blue" | "pink" | "teal";
}) {
  const toneClassName =
    tone === "teal"
      ? "border-teal-100 bg-teal-50/70 text-teal-800"
      : tone === "pink"
        ? "border-pink-100 bg-pink-50/70 text-pink-800"
        : tone === "amber"
          ? "border-amber-100 bg-amber-50/70 text-amber-800"
          : "border-blue-100 bg-blue-50/70 text-blue-800";

  return (
    <button
      className="group flex min-h-[156px] flex-col rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-teal-200 hover:shadow-md"
      onClick={onFocus}
      type="button"
    >
      <span className="flex items-start justify-between gap-3">
        <span className={`grid h-9 w-9 shrink-0 place-items-center rounded-lg border ${toneClassName}`}>
          <Icon className="h-4 w-4" />
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-black text-slate-600">{leads.length.toLocaleString()}곳</span>
      </span>
      <span className="mt-3 text-sm font-black text-slate-950">{title}</span>
      <span className="mt-1 text-xs font-semibold leading-5 text-slate-500">{description}</span>
      <span className="mt-auto space-y-1 pt-3">
        {leads.slice(0, 2).map((lead) => {
          const confidence = getLeadConfidence(lead);
          return (
            <span className="flex min-w-0 items-center justify-between gap-2 rounded-md bg-slate-50 px-2 py-1.5" key={lead.id}>
              <span className="min-w-0 truncate text-xs font-black text-slate-800">{lead.businessName}</span>
              <span className="shrink-0 text-[11px] font-black text-teal-700">{confidence.score}</span>
            </span>
          );
        })}
        {!leads.length ? <span className="block rounded-md bg-slate-50 px-2 py-2 text-xs font-bold text-slate-400">현재 대기 없음</span> : null}
      </span>
    </button>
  );
}

function LeadSourceStatusCard({
  description,
  status,
  title,
  tone
}: {
  readonly description: string;
  readonly status: string;
  readonly title: string;
  readonly tone: "idle" | "ready" | "warning";
}) {
  const toneClassName =
    tone === "ready"
      ? "border-teal-100 bg-teal-50/60 text-teal-800"
      : tone === "warning"
        ? "border-amber-200 bg-amber-50/70 text-amber-800"
        : "border-slate-200 bg-white text-slate-600";
  const dotClassName = tone === "ready" ? "bg-teal-500" : tone === "warning" ? "bg-amber-500" : "bg-slate-300";

  return (
    <div className={`rounded-lg border px-3 py-2.5 ${toneClassName}`}>
      <div className="flex items-center justify-between gap-2">
        <p className="min-w-0 truncate text-xs font-black text-slate-950">{title}</p>
        <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-white/80 px-2 py-0.5 text-[11px] font-black">
          <span className={`h-1.5 w-1.5 rounded-full ${dotClassName}`} />
          {status}
        </span>
      </div>
      <p className="mt-1 truncate text-xs font-bold">{description}</p>
    </div>
  );
}

function LeadQuickFilterChip({
  active,
  count,
  label,
  onClick
}: {
  readonly active: boolean;
  readonly count: number;
  readonly label: string;
  readonly onClick: () => void;
}) {
  return (
    <button
      className={`rounded-full px-3 py-1 text-[11px] font-black ring-1 ring-inset transition ${
        active ? "bg-teal-700 text-white ring-teal-700" : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50"
      }`}
      onClick={onClick}
      type="button"
    >
      {label} {count.toLocaleString()}
    </button>
  );
}
