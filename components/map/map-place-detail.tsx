"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
import { useCallback, useEffect, useState } from "react";
import type { MouseEvent, ReactNode } from "react";
import { DriverSelectField } from "@/components/driver-select-field";
import {
  CalendarDays,
  Check,
  ChevronDown,
  Clock,
  Copy,
  CreditCard,
  Edit3,
  ExternalLink,
  Eye,
  EyeOff,
  FileImage,
  GripVertical,
  KeyRound,
  Loader2,
  Lock,
  MapPin,
  MapPinned,
  MessageCircle,
  MessageSquareText,
  Navigation,
  Phone,
  Plus,
  RefreshCw,
  Store,
  Trash2,
  Truck,
  Warehouse,
  X,
  type LucideIcon
} from "lucide-react";
import { LinkifiedText } from "@/components/linkified-text";
import { CustomerContractPrices } from "@/components/customer-contract-prices";
import { InlineLoading } from "@/components/inline-loading";
import { MapStoreDetailActions, MapStoreDetailDrawer } from "@/components/map-store-detail-drawer";
import type { LoadingPositionMediaItem } from "@/components/loading-position-gallery";
import { buildPlaceSearchLinks } from "@/lib/place-links";
import type {
  CustomerContactItem,
  RoutePlanStop,
} from "@/lib/store";
import { formatUploadSizeMb, MAX_UPLOAD_SIZE_BYTES } from "@/lib/upload-limits";
import { fetchWithTimeout } from "@/lib/fetch-with-timeout";
import { formatPhoneNumber } from "@/lib/phone";
import {
  deliveryCostRatio,
  deliveryWorthLabel,
  estimateFuelCostWon,
  formatDistanceKmLabel,
  formatMinutes,
  gradeBadgeClass,
  type RevenueGrade
} from "@/lib/route-map-utils";
import { businessStatusClass, getBusinessStatusLabel, isGenericNaverSearchLink, type StoreRow } from "@/components/map/map-row-helpers";
import { StoreEdit, StoreHistoryItem, StoreAttachment, AttachmentFile, FuelPriceByType, resolveDisplayIndustry, permitLeadCompanyId, withPermitLeadCompanyQuery, normalizePhoneNumber } from "@/components/map/map-place-helpers";

const LoadingPositionGallery = dynamic(
  () => import("@/components/loading-position-gallery").then((module) => module.LoadingPositionGallery),
  { loading: () => <InlineLoading label="하차지 사진을 불러오는 중입니다." /> }
);
export {
  clamp,
  deliveryCostRatio,
  deliveryWorthLabel,
  estimateFuelCostWon,
  formatDistanceKmLabel,
  formatMinutes,
  getStoreTotals,
  gradeBadgeClass,
  readLocalJson,
  roundToSix,
  saveLocalJson
} from "@/lib/route-map-utils";

type BusinessOcrSuggestion = {
  businessRegistrationNumber: string;
  businessStatus: StoreRow["businessStatus"];
  companyName: string;
  openingDate: string;
  representativeName: string;
};

export function StoreQuickCard({
  driverOptions,
  headerOffsetPx,
  isInRoute,
  leftPanelCollapsed,
  onAddDriver,
  onAddToRoute,
  onAddVehicle,
  onClose,
  onOpenDetail,
  onOpenQuote,
  onSave,
  store,
  variant = "floating",
  vehicleOptions
}: {
  readonly driverOptions?: string[];
  /** 지도 위에 떠 있는 검색 헤더의 현재 높이(px). 헤더가 필터 줄 추가 등으로 커질 때 카드가
   * 헤더 아래로 가려지지 않도록 top 위치를 함께 늘립니다(미전달 시 기존 고정값 사용). */
  readonly headerOffsetPx?: number;
  /** 경유 코스 탭에서만 전달됩니다 — 오늘 경유 선택에 이미 포함돼 있는지 여부. */
  readonly isInRoute?: boolean;
  readonly leftPanelCollapsed?: boolean;
  readonly onAddDriver?: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  /** "경유지 추가" 버튼. 지도 홈에서는 경유 코스 탭으로 이동시키는 콜백, 경유 코스 탭에서는 즉시 토글하는 콜백을 받습니다. */
  readonly onAddToRoute?: () => void;
  readonly onAddVehicle?: (vehicleName: string) => Promise<{ ok: boolean; message?: string }>;
  readonly onClose: () => void;
  readonly onOpenDetail: () => void;
  readonly onOpenQuote?: (store: StoreRow) => void;
  readonly onSave?: (edit: StoreEdit) => Promise<{ persisted: boolean }>;
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
  // 리뷰 요약은 공간을 꽤 차지해서 기본 접힘 상태로 두고, 필요할 때만 펼쳐 보게 합니다.
  const [showReviews, setShowReviews] = useState(false);
  // 메모는 전체 편집 폼(isEditing)을 열지 않고도 카드에서 바로 입력·수정할 수 있어야 현장에서 자주 남깁니다.
  const [isMemoEditing, setIsMemoEditing] = useState(false);
  const [memoDraft, setMemoDraft] = useState("");
  const [isSavingMemo, setIsSavingMemo] = useState(false);
  // 2026-08-31 에러 처리 감사 후속: 이 카드의 저장(메모/전체 편집)은 실패해도 화면에 아무 표시가
  // 없어 사용자가 저장이 안 됐다는 것을 알 방법이 없었습니다(네트워크 오류·동시 편집 충돌 포함).
  const [saveError, setSaveError] = useState("");
  // 출입방법 비밀번호는 카드가 열려 있는 동안 실수로 어깨너머로 노출되지 않도록 기본은 가려두고,
  // 필요할 때만 눌러서 확인합니다.
  const [showAccessPassword, setShowAccessPassword] = useState(false);
  const [revealedAccessPassword, setRevealedAccessPassword] = useState("");
  const [accessPasswordMessage, setAccessPasswordMessage] = useState("");
  // 2026-08-24 피드백: "기거래처 카드도 움직일 수 있도록 해줘" — 지도 위 리드 카드(PermitLeadMapQuickCard)와
  // 같은 방식으로, 기본 위치에서 마우스로 끌어 옮긴 만큼만 transform으로 얹습니다. 다른 거래처를 클릭해
  // 카드 내용이 바뀌면 다시 기본 위치로 돌아갑니다.
  const [dragOffset, setDragOffset] = useState({ x: 0, y: 0 });
  const [draft, setDraft] = useState({
    name: store.name,
    phone: formatPhoneNumber(store.phone),
    deliveryDriver: store.deliveryDriver || "",
    deliveryVehicleName: store.deliveryVehicleName || "",
    memo: store.memo || "",
    businessHours: store.businessHours || "",
    menuSummary: store.menuSummary || ""
  });
  const [addressCopied, setAddressCopied] = useState(false);

  async function copyAddress() {
    const address = store.address || store.region;
    if (!address) return;
    try {
      await navigator.clipboard.writeText(address);
      setAddressCopied(true);
      window.setTimeout(() => setAddressCopied(false), 1500);
    } catch {
      // 클립보드 권한이 없으면 조용히 무시합니다 — 이 카드에는 별도 오류 메시지 영역이 없습니다.
    }
  }

  async function revealAccessPassword() {
    if (showAccessPassword) {
      setShowAccessPassword(false);
      setRevealedAccessPassword("");
      setAccessPasswordMessage("");
      return;
    }
    setAccessPasswordMessage("");
    const response = await fetch(`/api/customers/${encodeURIComponent(store.id)}/sensitive/access-password/reveal`, {
      method: "POST",
      cache: "no-store"
    }).catch(() => null);
    const payload = await response?.json().catch(() => null) as { accessPassword?: string | null; message?: string } | null;
    if (!response?.ok) {
      setAccessPasswordMessage(payload?.message || "출입 비밀번호를 불러오지 못했습니다.");
      return;
    }
    setRevealedAccessPassword(payload?.accessPassword || "미등록");
    setShowAccessPassword(true);
  }

  useEffect(() => {
    setDraft({
      name: store.name,
      phone: formatPhoneNumber(store.phone),
      deliveryDriver: store.deliveryDriver || "",
      deliveryVehicleName: store.deliveryVehicleName || "",
      memo: store.memo || "",
      businessHours: store.businessHours || "",
      menuSummary: store.menuSummary || ""
    });
    setIsEditing(false);
    setIsMemoEditing(false);
    setShowAccessPassword(false);
    setRevealedAccessPassword("");
    setAccessPasswordMessage("");
    setDragOffset({ x: 0, y: 0 });
    setSaveError("");
  }, [store.id]);

  function onDragHandleMouseDown(event: MouseEvent) {
    event.preventDefault();
    const startX = event.clientX;
    const startY = event.clientY;
    const originX = dragOffset.x;
    const originY = dragOffset.y;
    function handleMove(moveEvent: globalThis.MouseEvent) {
      setDragOffset({ x: originX + (moveEvent.clientX - startX), y: originY + (moveEvent.clientY - startY) });
    }
    function handleUp() {
      window.removeEventListener("mousemove", handleMove);
      window.removeEventListener("mouseup", handleUp);
    }
    window.addEventListener("mousemove", handleMove);
    window.addEventListener("mouseup", handleUp);
  }

  function startMemoEdit() {
    setMemoDraft(store.memo || "");
    setIsMemoEditing(true);
    setSaveError("");
  }

  async function saveMemo() {
    if (!onSave || isSavingMemo) return;
    setIsSavingMemo(true);
    setSaveError("");
    try {
      await onSave({ memo: memoDraft });
      setIsMemoEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "메모 저장에 실패했습니다.");
    } finally {
      setIsSavingMemo(false);
    }
  }

  async function handleSave() {
    if (!onSave) return;
    setIsSaving(true);
    setSaveError("");
    try {
      await onSave({ ...draft, phone: normalizePhoneNumber(draft.phone) });
      setIsEditing(false);
    } catch (error) {
      setSaveError(error instanceof Error ? error.message : "거래처 정보 저장에 실패했습니다.");
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
          leftPanelCollapsed ? "lg:left-3 lg:w-[min(300px,calc(100%-24px))]" : "lg:left-[384px] lg:w-[min(300px,calc(100%-408px))] xl:left-[424px] xl:w-[min(300px,calc(100%-448px))]"
        }`;
  const topClassName = variant === "grid" ? "top-4" : "top-4 lg:top-[var(--quick-card-top,5rem)]";

  return (
    <div
      className={`absolute ${topClassName} z-30 h-auto overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_18px_40px_rgba(15,23,42,.18)] ${positionClassName}`}
      style={{
        ["--quick-card-top" as string]: headerOffsetPx ? `${headerOffsetPx + 12}px` : undefined,
        transform: dragOffset.x || dragOffset.y ? `translate(${dragOffset.x}px, ${dragOffset.y}px)` : undefined
      } as React.CSSProperties}
    >
      <div className="flex items-start gap-1 px-1.5 pt-1.5">
        <span
          aria-label="카드 위치 옮기기"
          className="grid h-5 w-6 shrink-0 cursor-grab place-items-center rounded text-slate-300 hover:bg-slate-100 hover:text-slate-500 active:cursor-grabbing"
          onMouseDown={onDragHandleMouseDown}
          role="button"
          title="드래그해서 카드 위치 옮기기"
        >
          <GripVertical className="h-3.5 w-3.5" />
        </span>
      </div>
      <div className="flex items-start justify-between gap-2 px-3 pb-2.5 pt-0.5">
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
        <div className="flex items-start gap-1">
          <p className="flex min-w-0 flex-1 gap-2 text-[13px] font-bold leading-5 text-slate-600">
            <MapPin className="mt-0.5 h-3.5 w-3.5 shrink-0 text-blue-500" />
            <span className="line-clamp-2">{store.address || store.region}</span>
          </p>
          {store.address || store.region ? (
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
        {!isEditing ? (
          // 영업·배송 현장에서 실제로 바로 필요한 정보(담당자·배송차, 연락처)를 최상단에 배치합니다.
          // 대표자/사업자번호/개업일 같은 등록 정보는 하루하루 영업엔 급하지 않은 행정 데이터라 아래로 내렸습니다.
          <div className="mt-2 space-y-1">
            <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
              <Truck className="h-3.5 w-3.5 shrink-0 text-teal-600" />
              <span className="min-w-0 flex-1 truncate">
                {[store.deliveryDriver, store.deliveryVehicleName].filter(Boolean).join(" · ") || "담당자·배송차 미지정"}
              </span>
            </p>
            <p className="flex min-w-0 items-center gap-1.5 text-[12.5px] font-bold text-slate-700">
              <Phone className="h-3.5 w-3.5 shrink-0 text-slate-400" />
              <span className="min-w-0 flex-1 truncate">연락처 · {formatPhoneNumber(store.phone) || "미등록"}</span>
            </p>
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
        {/* 배송하는 사람이 현장에서 바로 참고할 적재위치·메모는 리뷰보다 위, 접지 않고 항상 보여줍니다. */}
        {!isEditing && store.loadingPosition ? (
          <p className="mt-1.5 flex gap-1.5 text-[11px] font-bold leading-4 text-slate-600">
            <Warehouse className="mt-0.5 h-3 w-3 shrink-0 text-teal-500" />
            <span className="line-clamp-2">적재위치 · {store.loadingPosition}</span>
          </p>
        ) : null}
        {/* 출입방법·비밀번호(2026-08-24 피드백: "거래처의 출입방법과 비밀번호를 저장해야해 ... 퀵카드,
        상세에도 적재해서 보여줘야해"). 비밀번호는 기본 마스킹, 눌러야만 노출됩니다. 적재위치 사진도
        같이 보여달라는 요청(1-1)에 맞춰 바로 아래에 사진 미리보기를 함께 붙입니다. */}
        {!isEditing && (store.accessMethodType || store.accessNote || store.hasAccessPassword) ? (
          <div className="mt-1.5 rounded-md bg-teal-50/60 px-2 py-1.5">
            <p className="flex items-start gap-1.5 text-[11px] font-bold leading-4 text-slate-700">
              {(() => {
                const AccessIcon = getAccessMethodIcon(store.accessMethodType);
                return <AccessIcon className="mt-0.5 h-3 w-3 shrink-0 text-teal-600" />;
              })()}
              <span className="min-w-0 flex-1">
                {store.accessMethodType ? <span className="font-black text-teal-800">{store.accessMethodType}</span> : null}
                {store.accessMethodType && store.accessNote ? " · " : ""}
                <span className="line-clamp-2">{store.accessNote}</span>
              </span>
            </p>
            {store.hasAccessPassword ? (
              <button
                className="mt-1 inline-flex items-center gap-1 text-[11px] font-black text-teal-700"
                onClick={revealAccessPassword}
                type="button"
              >
                {showAccessPassword ? <EyeOff className="h-3 w-3" /> : <Eye className="h-3 w-3" />}
                비밀번호 {showAccessPassword ? revealedAccessPassword : "••••••"}
              </button>
            ) : null}
            {accessPasswordMessage ? <p className="mt-1 text-[10.5px] font-bold text-amber-700">{accessPasswordMessage}</p> : null}
            <QuickCardAccessPhotoPreview customerId={store.id} />
          </div>
        ) : null}
        {!isEditing && isMemoEditing ? (
          <div className="mt-1.5 flex gap-1.5">
            <MessageSquareText className="mt-2 h-3 w-3 shrink-0 text-slate-400" />
            <div className="min-w-0 flex-1">
              <textarea
                autoFocus
                className="min-h-[52px] w-full resize-none rounded-md border border-teal-300 bg-white p-2 text-[11px] font-bold leading-4 text-slate-700 outline-none focus:ring-2 focus:ring-teal-100"
                onChange={(event) => setMemoDraft(event.target.value)}
                placeholder="메모를 입력하세요 (예: 정기 납품 조건, 현장 특이사항)"
                value={memoDraft}
              />
              <div className="mt-1 flex justify-end gap-1.5">
                <button
                  className="h-6 px-2 text-[10.5px] font-bold text-slate-500 hover:text-slate-700"
                  onClick={() => setIsMemoEditing(false)}
                  type="button"
                >
                  취소
                </button>
                <button
                  className="h-6 rounded-md bg-teal-700 px-2.5 text-[10.5px] font-black text-white hover:bg-teal-800 disabled:opacity-60"
                  disabled={isSavingMemo}
                  onClick={saveMemo}
                  type="button"
                >
                  {isSavingMemo ? "저장 중" : "저장"}
                </button>
              </div>
              {saveError ? <p className="mt-1 text-right text-[10.5px] font-bold text-rose-600">{saveError}</p> : null}
            </div>
          </div>
        ) : !isEditing && onSave ? (
          <button
            className="mt-1.5 flex w-full items-start gap-1.5 rounded-md py-0.5 text-left hover:bg-slate-50"
            onClick={startMemoEdit}
            type="button"
          >
            <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            <span className={`line-clamp-2 text-[11px] font-bold leading-4 ${store.memo ? "text-slate-600" : "text-slate-300"}`}>
              {store.memo ? `메모 · ${store.memo}` : "메모 추가하기"}
            </span>
          </button>
        ) : !isEditing && store.memo ? (
          <p className="mt-1.5 flex gap-1.5 text-[11px] font-bold leading-4 text-slate-600">
            <MessageSquareText className="mt-0.5 h-3 w-3 shrink-0 text-slate-400" />
            <span className="line-clamp-2">메모 · {store.memo}</span>
          </p>
        ) : null}
        {!isEditing && (store.reviewKeywords?.length || store.reviewSummary) ? (
          <button
            className="mt-1.5 text-[11px] font-bold text-slate-400 underline decoration-dotted underline-offset-2 hover:text-slate-600"
            onClick={() => setShowReviews((value) => !value)}
            type="button"
          >
            {showReviews ? "리뷰 요약 접기" : `리뷰 요약 보기${store.reviewKeywords?.length ? ` · #${store.reviewKeywords.length}` : ""}`}
          </button>
        ) : null}
        {!isEditing && showReviews && store.reviewKeywords?.length ? (
          <div className="mt-1.5 flex flex-wrap gap-1">
            {store.reviewKeywords.slice(0, 6).map((keyword) => (
              <span className="rounded-full bg-amber-50 px-1.5 py-0.5 text-xs font-black text-amber-700" key={keyword}>
                #{keyword}
              </span>
            ))}
          </div>
        ) : null}
        {!isEditing && showReviews && store.reviewSummary ? (
          <p className="mt-1.5 flex gap-1.5 text-[11px] font-bold leading-4 text-slate-500">
            <MessageCircle className="mt-0.5 h-3 w-3 shrink-0 text-amber-500" />
            <span>{store.reviewSummary}</span>
          </p>
        ) : null}
        {isEditing ? (
          <div className="mt-2 space-y-1.5">
            <input
              className="h-8 w-full rounded-md border border-slate-200 bg-white px-2 text-xs font-bold text-slate-900 outline-none focus:border-teal-300"
              onChange={(event) => setDraft((current) => ({ ...current, phone: formatPhoneNumber(event.target.value) }))}
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
            {saveError ? <p className="text-right text-[10.5px] font-bold text-rose-600">{saveError}</p> : null}
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
            {store.representativeName || store.businessRegistrationNumber || store.openingDate ? (
              <p className="mt-2.5 truncate text-[10.5px] font-bold text-slate-400">
                {[
                  store.representativeName ? `대표 ${store.representativeName}` : null,
                  store.businessRegistrationNumber ? `사업자번호 · ${formatBusinessRegistrationNumber(store.businessRegistrationNumber)}` : null,
                  store.openingDate ? `개업 ${store.openingDate}` : null
                ]
                  .filter(Boolean)
                  .join(" · ")}
              </p>
            ) : (
              <p className="mt-2.5 text-[10.5px] font-bold text-slate-300">사업자 등록정보 미확인</p>
            )}
            <div className="mt-1.5 flex items-center justify-end gap-2">
              {onSave ? (
                <button
                  className="maju-button-secondary h-8 shrink-0 px-2.5 text-xs"
                  onClick={() => {
                    setSaveError("");
                    setIsEditing(true);
                  }}
                  type="button"
                >
                  <Edit3 className="h-3.5 w-3.5" />
                </button>
              ) : null}
              {onAddToRoute ? (
                <button
                  className={`h-8 shrink-0 px-2.5 text-xs ${isInRoute ? "maju-button-secondary bg-teal-50 text-teal-700" : "maju-button-secondary"}`}
                  onClick={onAddToRoute}
                  type="button"
                >
                  {isInRoute ? <Check className="h-3.5 w-3.5" /> : <Plus className="h-3.5 w-3.5" />}
                  {isInRoute ? "경유지 추가됨" : "경유지 추가"}
                </button>
              ) : null}
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
  const storeNaverPlaceUrl = store.naverPlaceUrl?.trim();
  const links = [
    { label: "네이버", tone: "bg-emerald-50 text-emerald-700 ring-emerald-200", url: !storeNaverPlaceUrl || isGenericNaverSearchLink(storeNaverPlaceUrl) ? searchLinks.naverPlaceUrl : storeNaverPlaceUrl },
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

// DriverSelectField는 components/driver-select-field.tsx로 옮겨서 app/dashboard/settings의
// 직원 배정 기준 화면에서도 같이 씁니다(무거운 지도 워크스페이스 모듈 전체를 끌어오지 않도록
// 이 파일이 그 작은 컴포넌트를 import합니다 — 아래 import 문 참고).

export function StoreDetail({
  attachments,
  locationNote,
  driverOptions,
  fuelPrices,
  history,
  onAddDriver,
  onAddVehicle,
  onClose,
  onClearHistory,
  onDeleteHistory,
  onSaveAttachment,
  onUpdateRelationshipStatus,
  onUpdateStore,
  onWriteHistory,
  store,
  vehicleOptions
}: {
  readonly attachments: StoreAttachment;
  readonly driverOptions: string[];
  readonly fuelPrices: FuelPriceByType;
  readonly history: StoreHistoryItem[];
  readonly onAddDriver: (driverName: string, fuelType?: "gasoline" | "diesel") => Promise<{ ok: boolean; message?: string }>;
  readonly onAddVehicle: (vehicleName: string) => Promise<{ ok: boolean; message?: string }>;
  readonly onClose: () => void;
  readonly onClearHistory: (storeId: string) => void;
  readonly onDeleteHistory: (storeId: string, historyId: string) => void;
  readonly onSaveAttachment: (slot: "bankbookCopy" | "businessCertificate", file: AttachmentFile) => void;
  readonly onUpdateRelationshipStatus: (storeId: string, status: string, note?: string) => Promise<{ persisted: boolean } | void>;
  readonly onUpdateStore: (storeId: string, edit: StoreEdit) => Promise<{ persisted: boolean } | void>;
  readonly onWriteHistory: (storeId: string, memo: string) => void;
  /** 위치 상태 안내(좌표 없음·위치 추정). 정확한 위치면 빈 문자열. */
  readonly locationNote?: string;
  readonly store: StoreRow;
  readonly vehicleOptions: string[];
}) {
  const [detailTab, setDetailTab] = useState<"overview" | "delivery" | "sales" | "order" | "ledger">("overview");
  const [draftAccountCopyStatus, setDraftAccountCopyStatus] = useState(store.accountCopyStatus);
  const [draftAddress, setDraftAddress] = useState(store.address || "");
  const [draftBankAccount, setDraftBankAccount] = useState(store.bankAccount);
  const [draftBirthDate, setDraftBirthDate] = useState(store.birthDate);
  const [draftBusinessCertificateStatus, setDraftBusinessCertificateStatus] = useState(store.businessCertificateStatus);
  const [draftBusinessNumber, setDraftBusinessNumber] = useState(formatBusinessRegistrationNumber(store.businessRegistrationNumber));
  const [draftBusinessStatus, setDraftBusinessStatus] = useState(store.businessStatus);
  const [draftBusinessHours, setDraftBusinessHours] = useState(store.businessHours || "");
  const [draftMenuSummary, setDraftMenuSummary] = useState(store.menuSummary || "");
  // 출입방법(열쇠/카드/비밀번호/숨김위치)·비밀번호(2026-08-24 피드백: "거래처의 출입방법과 비밀번호를
  // 저장해야해. 놓친 것 같아 ... 열쇠인지, 카드인지, 비밀번호인지, 어디 숨겨놓은 건지 등 넣어야해").
  const [draftAccessMethodType, setDraftAccessMethodType] = useState(store.accessMethodType || "");
  const [draftAccessNote, setDraftAccessNote] = useState(store.accessNote || "");
  const [draftAccessPassword, setDraftAccessPassword] = useState("");
  const [accessPasswordChanged, setAccessPasswordChanged] = useState(false);
  const [showDraftAccessPassword, setShowDraftAccessPassword] = useState(false);
  const [draftReviewSummary, setDraftReviewSummary] = useState(store.reviewSummary || "");
  const [draftReviewKeywords, setDraftReviewKeywords] = useState((store.reviewKeywords || []).join(", "));
  const [draftReviewSource, setDraftReviewSource] = useState(store.reviewSource || "");
  const [draftDeliveryArea] = useState(store.deliveryArea || store.region);
  const [draftDeliveryDriver, setDraftDeliveryDriver] = useState(store.deliveryDriver || "");
  const [draftDeliveryVehicleName, setDraftDeliveryVehicleName] = useState(store.deliveryVehicleName || "");
  const [draftEmail, setDraftEmail] = useState(store.email);
  const [draftGrade, setDraftGrade] = useState<RevenueGrade>(store.grade);
  const [draftIndustry, setDraftIndustry] = useState(store.industry);
  const [draftName, setDraftName] = useState(store.name);
  const [draftOpeningDate, setDraftOpeningDate] = useState(store.openingDate);
  const [draftPhone, setDraftPhone] = useState(formatPhoneNumber(store.phone));
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
      businessRegistrationNumber: normalizeBusinessRegistrationNumber(draftBusinessNumber),
      businessStatus: draftBusinessStatus,
      businessHours: draftBusinessHours,
      menuSummary: draftMenuSummary,
      accessMethodType: draftAccessMethodType,
      accessNote: draftAccessNote,
      ...(accessPasswordChanged ? { accessPassword: draftAccessPassword } : {}),
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
      phone: normalizePhoneNumber(draftPhone),
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
      const response = await fetchWithTimeout(`/api/customers/${store.id}/sync-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(companyId ? { companyId } : {})
      }, 20000);
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
      const response = await fetchWithTimeout(`/api/customers/${store.id}/summarize-reviews`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ...(companyId ? { companyId } : {}),
          rawText: pasteReviewText,
          source: pasteReviewSource
        })
      }, 20000);
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

  const updateRelationshipStatus = async (nextStatus: string) => {
    if (nextStatus === draftRelationshipStatus) return;
    if (nextStatus === "거래종료" && !window.confirm(`${draftName}을(를) 거래 종료로 표시할까요? 목록·지도·대시보드·이탈 위험 알림·경로 계획에서 빠집니다(필터 "거래 종료 거래처 보기"로 다시 볼 수 있음).`)) return;

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
  const toggleRelationshipStatus = () => void updateRelationshipStatus(draftRelationshipStatus === "거래종료" ? "거래중" : "거래종료");

  return (
    <MapStoreDetailDrawer onClose={onClose}>
        <header className="maju-card-header border-b px-4 py-4">
          {/* 2026-08-28 피드백 대응(모바일에서 "거래처 상세" 제목이 세로로 한 글자씩 깨져 보임):
              오른쪽 버튼 3개(거래 종료로 표시·히스토리 열기·변경 저장)가 shrink-0라 절대 안 줄어들고,
              제목 영역만 min-w-0로 계속 줄어들다가 좁은 화면에서 한두 글자 폭까지 눌려 한글이
              한 글자씩 줄바꿈되던 문제입니다. sm 미만에서는 제목과 버튼 줄을 아예 위아래로
              나누어 서로의 폭을 침범하지 않게 합니다. */}
          <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
            <div className="min-w-0">
              <p className="text-xs font-black text-blue-700">거래처 상세</p>
              <div className="mt-1 flex min-w-0 flex-wrap items-center gap-2">
                <span className="rounded-md bg-violet-700 px-2 py-1 text-[11px] font-black text-white">거래처</span>
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
              {locationNote ? <p className="mt-1 rounded-md border border-amber-300 bg-amber-50 px-2 py-1 text-xs font-bold text-amber-900" role="status">{locationNote}</p> : null}
              <p className="mt-1 text-sm font-bold text-slate-600">
                연락처 · {formatPhoneNumber(draftPhone) || "미등록"} · 사업자번호 · {formatBusinessRegistrationNumber(draftBusinessNumber) || "미등록"}
              </p>
              <div className="mt-2 flex flex-wrap items-center gap-1" aria-label="영업 단계">
                {(["신규", "연락함", "견적 전달", "재연락", "계약", "제외"] as const).map((stage) => <span className={`rounded-md px-2 py-1 text-[11px] font-black ${stage === "계약" ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-400"}`} key={stage}>{stage}</span>)}
                <span className="ml-1 text-xs font-bold text-amber-700">단계 저장 미연결</span>
              </div>
              {savedAt ? <p className="mt-2 text-xs font-black text-emerald-700">변경사항 반영 · {savedAt}</p> : null}
              {saveError ? <p className="mt-2 text-xs font-black text-rose-600">{saveError}</p> : null}
              {relationshipStatusError ? <p className="mt-2 text-xs font-black text-rose-600">{relationshipStatusError}</p> : null}
            </div>
            <div className="flex flex-wrap shrink-0 items-center gap-2">
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

        <MapStoreDetailActions
          address={draftAddress}
          currentStage={draftRelationshipStatus}
          email={draftEmail}
          name={draftName}
          onDm={() => setDetailTab("sales")}
          onStageChange={(stage) => void updateRelationshipStatus(stage)}
          openHref={`/dashboard?routeMode=map&customer=${encodeURIComponent(store.id)}`}
          phone={draftPhone}
        />

        <nav aria-label="매장 정보 탭" className="flex shrink-0 gap-1 overflow-x-auto border-b border-slate-200 bg-white px-4">
          {([
            ["overview", "개요"], ["delivery", "배송·반품 기록"], ["sales", "영업 기록"], ["order", "주문·링크"], ["ledger", "매출 원장 (준비 중)"]
          ] as const).map(([value, label]) => (
            <button className={`h-11 shrink-0 border-b-[3px] px-3 text-sm font-black ${detailTab === value ? "border-teal-700 text-teal-800" : "border-transparent text-slate-500"}`} key={value} onClick={() => setDetailTab(value)} type="button">{label}</button>
          ))}
        </nav>

        <div className="min-h-0 flex-1 overflow-auto bg-slate-50 px-4 py-4">
          {detailTab === "overview" ? <div className="space-y-5">
              <CollapsibleSection defaultOpen title="기본 정보">
                <div className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                  <EditRow label="거래처명" onChange={setDraftName} value={draftName} />
                  <BusinessNumberEditRow onChange={setDraftBusinessNumber} valid={businessNumberValid} value={draftBusinessNumber} />
                  <EditRow label="대표자명" onChange={setDraftRepresentativeName} value={draftRepresentativeName} />
                  <EditRow label="연락처" onChange={(value) => setDraftPhone(formatPhoneNumber(value))} value={draftPhone} />
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
                </div>
                <div className="mt-3">
                  <p className="mb-1.5 text-xs font-black text-slate-500">외부 거래처 정보</p>
                  <PlaceLinkRow store={store} />
                </div>
              </CollapsibleSection>

              <CollapsibleSection title="담당자 연락처">
                <CustomerContactsSection customerId={store.id} />
              </CollapsibleSection>

              <CollapsibleSection title="계약 단가">
                <CustomerContractPrices customerId={store.id} />
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
                      네이버·카카오 리뷰 붙여넣기 — 위 &quot;외부 거래처 정보&quot;의 링크를 열어 리뷰를 확인한 뒤, 리뷰 텍스트를 복사해서 아래에 붙여넣고 버튼을 누르면 AI가 즉시 요약합니다.
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

              <CollapsibleSection defaultOpen title="출입방법">
                <div className="mt-4 space-y-3">
                  <p className="text-xs font-bold leading-5 text-slate-500">
                    배송 기사님이 현장에서 어떻게 들어가는지 남겨두세요. 열쇠·카드는 어디에 있는지, 비밀번호는 값을 함께 적어두면 헷갈리지 않습니다.
                  </p>
                  <div className="flex flex-wrap gap-1.5">
                    {ACCESS_METHOD_TYPE_OPTIONS.map(({ icon: OptionIcon, label }) => (
                      <button
                        className={`inline-flex h-9 items-center gap-1.5 rounded-md border px-3 text-sm font-black transition ${
                          draftAccessMethodType === label
                            ? "border-teal-600 bg-teal-700 text-white"
                            : "border-slate-200 bg-white text-slate-600 hover:bg-slate-50"
                        }`}
                        key={label}
                        onClick={() => setDraftAccessMethodType((current) => (current === label ? "" : label))}
                        type="button"
                      >
                        <OptionIcon className="h-3.5 w-3.5" />
                        {label}
                      </button>
                    ))}
                  </div>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs font-black text-slate-500">위치/방법 설명</span>
                    <textarea
                      className="min-h-16 w-full resize-none rounded-md border border-slate-200 bg-white p-3 text-sm font-bold text-slate-950 outline-none focus:border-teal-300 focus:ring-2 focus:ring-teal-100"
                      onChange={(event) => setDraftAccessNote(event.target.value)}
                      placeholder="예: 화단 옆 돌 밑에 보조키, 경비실에 카드 맡겨둠, 정문 도어락"
                      value={draftAccessNote}
                    />
                  </label>
                  <label className="grid gap-1.5 text-sm">
                    <span className="text-xs font-black text-slate-500">비밀번호</span>
                    <div className="flex items-center gap-1.5">
                      <input
                        className="h-9 w-full rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300"
                        onChange={(event) => { setDraftAccessPassword(event.target.value); setAccessPasswordChanged(true); }}
                        placeholder={store.hasAccessPassword ? "새 값 입력 시에만 변경" : "도어락 비밀번호 등"}
                        type={showDraftAccessPassword ? "text" : "password"}
                        value={draftAccessPassword}
                      />
                      <button
                        aria-label={showDraftAccessPassword ? "비밀번호 숨기기" : "비밀번호 표시"}
                        className="grid h-9 w-9 shrink-0 place-items-center rounded-md border border-slate-200 text-slate-500 hover:bg-slate-50"
                        onClick={() => setShowDraftAccessPassword((value) => !value)}
                        type="button"
                      >
                        {showDraftAccessPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                      </button>
                    </div>
                  </label>
                  {/* 적재위치 사진도 바로 아래 "첨부자료"에서 함께 보이므로(2026-08-24 피드백: "출입방법은
                  적재위치 사진도 보여주면 사용성이 높아짐"), 출입방법 섹션을 그 바로 위에 붙여둡니다. */}
                </div>
              </CollapsibleSection>

              <CollapsibleSection defaultOpen title="첨부자료">
                <div className="mt-4 space-y-3">
                  <LoadingPositionAttachmentBox customerId={store.id} customerName={store.name} />
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
                        setDraftBusinessNumber(formatBusinessRegistrationNumber(activeOcrSuggestion.businessRegistrationNumber));
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
                        <p className="mt-1 text-sm font-bold leading-5 text-slate-700">
                          <LinkifiedText text={item.memo} />
                        </p>
                      </div>
                    ))
                  ) : (
                    <p className="maju-empty-state p-3 text-sm font-bold text-slate-400">아직 기록된 메모가 없습니다.</p>
                  )}
                </div>
              </CollapsibleSection>
              <CollapsibleSection defaultOpen title="배송·방문 정보">
                <div className="mt-4 grid gap-3 sm:grid-cols-2">
                  <MetricRow icon={<Navigation className="h-4 w-4" />} label="거리" value={formatDistanceKmLabel(store.distanceKm)} />
                  <MetricRow icon={<Clock className="h-4 w-4" />} label="출발지 기준 시간" value={formatMinutes(store.durationMinutes || 0)} />
                  <MetricRow icon={<CalendarDays className="h-4 w-4" />} label="방문순서" value={`${store.order}번째`} />
                  <MetricRow label="경로출처" value={getProviderLabel(store.routeProvider)} />
                </div>
                {(() => {
                  const pricePerLiter = fuelPrices.diesel?.pricePerLiter || fuelPrices.gasoline?.pricePerLiter || 0;
                  const oneWayCost = estimateFuelCostWon(store.distanceKm || 0, pricePerLiter);
                  const roundTripCost = oneWayCost * 2;
                  const ratio = deliveryCostRatio(roundTripCost, store.expectedRevenue);
                  const worth = deliveryWorthLabel(ratio);
                  if (!oneWayCost) {
                    return <p className="mt-2 text-xs font-bold text-slate-400">유가 정보를 불러오는 중이거나 거리 계산이 필요해 예상 물류비를 계산할 수 없습니다.</p>;
                  }
                  return (
                    <div className="mt-3 rounded-lg border border-slate-200 bg-slate-50/70 p-3">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <p className="text-xs font-black text-slate-500">예상 물류비 (편도 {oneWayCost.toLocaleString()}원 · 왕복 {roundTripCost.toLocaleString()}원)</p>
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-black ${worth.toneClassName}`}>{worth.label}</span>
                      </div>
                      <p className="mt-1 text-[11px] font-bold leading-4 text-slate-400">
                        {ratio === null
                          ? "예상매출을 등록하면 왕복 물류비가 매출의 몇 %인지 참고용으로 계산해드립니다."
                          : `왕복 물류비가 예상 월매출의 약 ${(ratio * 100).toFixed(1)}% 수준입니다 (10~15% 이내면 적정, 참고용 추정치).`}
                      </p>
                    </div>
                  );
                })()}
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
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-black text-slate-950">수정 기록</h4>
                <p className="mt-2 rounded-lg bg-slate-50 p-3 text-xs font-bold leading-5 text-slate-500">권한별 이전→이후 감사 로그는 SQL 적용 전이라 읽기 미연결 상태입니다. 실제 기록이 연결되기 전에는 예시 데이터를 표시하지 않습니다.</p>
              </section>
          </div> : null}

          {detailTab === "delivery" ? (
            <div className="mx-auto max-w-5xl space-y-3">
              <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-4 text-sm font-bold text-slate-600">
                <span>기간 <b className="text-slate-950">최근 30일</b></span><span>·</span><span>{draftDeliveryVehicleName || "차량 미배정"}</span><span>·</span><span>{draftDeliveryDriver || "기사 미배정"}</span>
              </div>
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-black text-slate-950">배송·반품 기록</h4>
                <div className="mt-3 grid gap-3 sm:grid-cols-2">
                  <MetricRow icon={<Navigation className="h-4 w-4" />} label="거리" value={formatDistanceKmLabel(store.distanceKm)} />
                  <MetricRow icon={<Clock className="h-4 w-4" />} label="출발지 기준 시간" value={formatMinutes(store.durationMinutes || 0)} />
                  <MetricRow icon={<CalendarDays className="h-4 w-4" />} label="방문순서" value={`${store.order}번째`} />
                  <MetricRow label="경로출처" value={getProviderLabel(store.routeProvider)} />
                </div>
                <p className="mt-4 rounded-lg border border-amber-200 bg-amber-50 p-3 text-xs font-bold leading-5 text-amber-800">배송 완료·반품·파손 사진 원장은 SQL 의존 영역으로 현재 읽기 미연결입니다. 연결 전까지 기록 생성·다운로드 기능은 OFF입니다.</p>
              </section>
            </div>
          ) : null}

          {detailTab === "sales" ? (
            <div className="mx-auto grid max-w-5xl gap-4 lg:grid-cols-[1fr_320px]">
              <section className="rounded-xl border border-slate-200 bg-white p-4">
                <h4 className="text-sm font-black text-slate-950">영업 기록</h4>
                <textarea className="mt-3 min-h-24 w-full rounded-lg border border-slate-200 p-3 text-sm font-bold outline-none focus:border-teal-400" onChange={(event) => setHistoryMemo(event.target.value)} placeholder="통화·방문 결과와 다음 연락 일정을 남기세요." value={historyMemo} />
                <button className="maju-button-primary mt-2 h-10 w-full text-sm" onClick={() => { const memo = historyMemo.trim(); if (!memo) return; onWriteHistory(store.id, memo); setHistoryMemo(""); }} type="button">결과 저장</button>
                <div className="mt-4 space-y-2">{history.length ? history.map((item) => <article className="rounded-lg border border-slate-200 p-3" key={item.id}><p className="text-xs font-black text-slate-400">{item.recordedAt}</p><p className="mt-1 text-sm font-bold text-slate-700"><LinkifiedText text={item.memo} /></p></article>) : <p className="rounded-lg bg-slate-50 p-4 text-sm font-bold text-slate-400">아직 영업 기록이 없습니다.</p>}</div>
              </section>
              <aside className="space-y-3">
                <div className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="text-sm font-black">결과 남기기</h4><p className="mt-2 text-xs font-bold leading-5 text-slate-500">부재·관심·견적 전달·재연락·계약·거절 단계의 구조화 저장은 SQL 적용 전이라 기능 OFF입니다. 현재는 왼쪽 메모 기록을 사용하세요.</p></div>
                <div className="rounded-xl border border-slate-200 bg-white p-4"><h4 className="text-sm font-black">담당</h4><p className="mt-2 text-sm font-bold text-slate-700">{draftDeliveryDriver || "담당자 미지정"}</p></div>
              </aside>
            </div>
          ) : null}

          {detailTab === "order" ? (
            <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center">
              <h4 className="text-base font-semibold text-slate-950">문서에서 주문 링크 만들기</h4>
              <p className="mt-2 text-sm text-slate-600">발행한 견적서·단가표의 공개 링크·QR을 만들면 매장이 카카오로 가입하고 주문할 수 있습니다. 주문 가능 여부는 매장 주소와 배송 권역·요일로 확인합니다.</p>
              <Link className="maju-button-primary mt-4 inline-flex min-h-[44px] items-center px-4" href="/revenue/pricing/documents">견적서·단가표에서 링크 만들기</Link>
              <p className="mt-3 text-xs text-slate-500">이 거래처 상세에서 주문 내역을 직접 보는 기능은 준비 중입니다.</p>
            </div>
          ) : detailTab === "ledger" ? (
            <div className="mx-auto max-w-3xl rounded-xl border border-slate-200 bg-white p-8 text-center"><Lock className="mx-auto h-6 w-6 text-slate-400" /><h4 className="mt-3 text-base font-semibold text-slate-950">매출 원장 연결 준비 중</h4><p className="mt-2 text-sm text-slate-600">이 거래처 상세에서 매출 원장을 조회하는 기능은 준비 중입니다.</p></div>
          ) : null}
        </div>
    </MapStoreDetailDrawer>
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
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts`), { cache: "no-store" }, 10000);
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
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: draftRole || "담당자",
          name: draftName.trim(),
          phone: normalizePhoneNumber(draftPhone),
          birthDate: draftBirthDate,
          memo: draftMemo.trim()
        })
      }, 12000);
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
    setEditPhone(formatPhoneNumber(contact.phone));
    setEditBirthDate(contact.birthDate || "");
    setEditMemo(contact.memo || "");
  };

  const saveEdit = async (contactId: string) => {
    if (!editName.trim()) return;
    setRowBusyId(contactId);
    try {
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(contactId)}`), {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          role: editRole || "담당자",
          name: editName.trim(),
          phone: normalizePhoneNumber(editPhone),
          birthDate: editBirthDate,
          memo: editMemo.trim()
        })
      }, 12000);
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
      const response = await fetchWithTimeout(withPermitLeadCompanyQuery(`/api/customers/${encodeURIComponent(customerId)}/contacts/${encodeURIComponent(contactId)}`), { method: "DELETE" }, 10000);
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
        <InlineLoading label="담당자 목록을 불러오는 중입니다..." />
      ) : contacts.length ? (
        <div className="space-y-2">
          {contacts.map((contact) => (
            <div className="maju-stat-card p-3" key={contact.id}>
              {editingId === contact.id ? (
                <div className="flex flex-wrap items-center gap-1.5">
                  <input className="h-9 w-24 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" list="contact-role-presets" onChange={(event) => setEditRole(event.target.value)} placeholder="직책" value={editRole} />
                  <input className="h-9 w-28 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setEditName(event.target.value)} placeholder="이름" value={editName} />
                  <input className="h-9 w-36 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setEditPhone(formatPhoneNumber(event.target.value))} placeholder="연락처" value={editPhone} />
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
                      {formatPhoneNumber(contact.phone)}
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
          <input className="h-9 w-36 min-w-0 rounded-md border border-slate-200 px-2 text-sm font-bold outline-none focus:border-teal-300" onChange={(event) => setDraftPhone(formatPhoneNumber(event.target.value))} placeholder="010-0000-0000" value={draftPhone} />
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

type CustomerOperationsAttachmentsPayload = { attachments?: Array<LoadingPositionMediaItem & { attachmentType: string }> };

// 2026-08-26 효율화: 거래처를 선택하면 퀵카드 미리보기(QuickCardAccessPhotoPreview)와 상세 패널의
// 첨부자료 박스(LoadingPositionAttachmentBox)가 거의 동시에 마운트되어, 같은 customerId로 같은
// /api/customer-operations를 각자 따로 호출하고 있었습니다. 아직 응답이 오지 않은 "진행 중" 요청만
// 공유해 중복 호출을 막고, 응답이 오면 즉시 캐시를 비워 업로드 후 새로고침 같은 이후 호출은 항상
// 최신 데이터를 다시 받아오게 합니다.
const customerOperationsInFlight = new Map<string, Promise<CustomerOperationsAttachmentsPayload | null>>();

function fetchCustomerOperationsAttachments(customerId: string): Promise<CustomerOperationsAttachmentsPayload | null> {
  const existing = customerOperationsInFlight.get(customerId);
  if (existing) return existing;

  const promise = fetchWithTimeout(`/api/customer-operations?customerId=${encodeURIComponent(customerId)}`, { cache: "no-store" }, 10000)
    .then((response) => (response.ok ? response.json() : null))
    .catch(() => null)
    .finally(() => {
      customerOperationsInFlight.delete(customerId);
    });

  customerOperationsInFlight.set(customerId, promise);
  return promise;
}

// 지도 퀵카드는 공간이 좁아 전체 업로드 박스(LoadingPositionAttachmentBox) 대신 최근 3장만 조회
// 전용으로 가볍게 보여줍니다(2026-08-24 피드백: "출입방법은 적재위치 사진도 보여주면 사용성이
// 높아짐"). 사진이 없으면 카드에 빈 칸을 남기지 않도록 아무것도 렌더링하지 않습니다.
function QuickCardAccessPhotoPreview({ customerId }: { readonly customerId: string }) {
  const [items, setItems] = useState<LoadingPositionMediaItem[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchCustomerOperationsAttachments(customerId).then((payload) => {
      if (cancelled) return;
      setItems(
        (payload?.attachments || [])
          .filter((item) => item.attachmentType === "loading_position" && !item.mimeType?.startsWith("video"))
          .slice(0, 3)
      );
    });
    return () => {
      cancelled = true;
    };
  }, [customerId]);

  if (!items.length) return null;

  return (
    <div className="mt-1.5 flex gap-1">
      {items.map((item) => (
        <img
          alt={item.title}
          className="h-10 w-10 shrink-0 rounded object-cover ring-1 ring-inset ring-teal-100"
          key={item.id}
          loading="lazy"
          src={item.fileUrl}
        />
      ))}
    </div>
  );
}

function LoadingPositionAttachmentBox({ customerId, customerName }: { readonly customerId: string; readonly customerName: string }) {
  const [items, setItems] = useState<LoadingPositionMediaItem[]>([]);
  const [loadState, setLoadState] = useState<"idle" | "loading" | "ready" | "error">("idle");
  const [saveState, setSaveState] = useState<"idle" | "saving" | "error">("idle");
  const [saveError, setSaveError] = useState("");

  async function loadItems() {
    setLoadState("loading");
    const payload = await fetchCustomerOperationsAttachments(customerId);
    if (!payload) {
      setLoadState("error");
      return;
    }
    setItems((payload.attachments || []).filter((item) => item.attachmentType === "loading_position"));
    setLoadState("ready");
  }

  async function uploadFiles(fileList: FileList | null) {
    const files = Array.from(fileList || []);
    if (!files.length || saveState === "saving") return;

    const oversizedFiles = files.filter((file) => file.size > MAX_UPLOAD_SIZE_BYTES);
    if (oversizedFiles.length) {
      setSaveState("error");
      setSaveError(
        oversizedFiles.length === 1
          ? `${oversizedFiles[0].name} 용량이 ${formatUploadSizeMb(oversizedFiles[0].size)}로 최대 50MB를 초과합니다.`
          : `${oversizedFiles.length}개 파일이 최대 50MB를 초과해 업로드할 수 없습니다: ${oversizedFiles.map((file) => file.name).join(", ")}`
      );
      return;
    }

    setSaveError("");
    setSaveState("saving");

    // 2026-08-31 에러 처리/복원력 감사 후속: 예전에는 파일 하나가 실패하면 그 자리에서 멈춰
    // 나머지 파일은 시도조차 하지 않고 조용히 버려졌습니다. 이제 모든 파일을 끝까지 시도하고,
    // 실패한 파일이 있으면 몇 개가 성공했는지와 실패한 파일 이름을 함께 보여줍니다.
    const failedFileNames: string[] = [];
    let successCount = 0;
    for (const file of files) {
      const formData = new FormData();
      formData.append("file", file);
      formData.append("customerId", customerId);
      formData.append("attachmentType", "loading_position");
      formData.append("title", `배송 적재위치 - ${customerName}`);

      const response = await fetchWithTimeout("/api/customer-attachments/upload", { method: "POST", body: formData }, 20000).catch(() => null);
      if (!response?.ok) {
        failedFileNames.push(file.name);
        continue;
      }
      successCount += 1;
    }

    if (failedFileNames.length) {
      setSaveState("error");
      setSaveError(
        successCount
          ? `${successCount}/${files.length}개 업로드 완료, 실패: ${failedFileNames.join(", ")} (다시 시도해주세요)`
          : `업로드에 실패했습니다: ${failedFileNames.join(", ")}`
      );
    } else {
      setSaveState("idle");
    }
    await loadItems();
  }

  useEffect(() => {
    loadItems();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [customerId]);

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
              <span className="rounded-full bg-white px-2 py-0.5 text-[11px] font-black text-slate-700 ring-1 ring-inset ring-slate-200">{items.length}개</span>
            </div>
            <p className="mt-1 max-w-xl text-xs font-bold leading-5 text-slate-500">
              기사님이 출고 전 확인하는 핵심 자료입니다. 가장 최근 자료가 현재 기준이며, 이전 자료는 잠금 표시로 계속 보존됩니다.
            </p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <button
            aria-label="적재위치 자료 새로고침"
            className="grid h-10 w-10 place-items-center rounded-md border border-slate-200 bg-white text-slate-500"
            onClick={loadItems}
            type="button"
          >
            <RefreshCw className={`h-4 w-4 ${loadState === "loading" ? "animate-spin" : ""}`} />
          </button>
          <label className="inline-flex h-10 cursor-pointer items-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-black text-white shadow-sm hover:bg-teal-800">
            {saveState === "saving" ? <Loader2 className="h-4 w-4 animate-spin" /> : <Plus className="h-4 w-4" />}
            {saveState === "saving" ? "업로드 중" : "추가"}
            <input accept="image/*,video/*" className="sr-only" multiple onChange={(event) => uploadFiles(event.target.files)} type="file" />
          </label>
        </div>
      </div>
      {saveState === "error" ? <p className="mt-2 text-xs font-bold text-rose-600">{saveError}</p> : null}
      <div className="mt-4">
        <LoadingPositionGallery
          emptyMessage="아직 업로드된 적재위치 자료가 없습니다. 오른쪽 + 버튼으로 사진/영상을 추가하세요."
          items={items}
        />
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

function getBusinessRegistrationCheckDigit(firstNineDigits: string) {
  const digits = normalizeBusinessRegistrationNumber(firstNineDigits).slice(0, 9).padEnd(9, "0");
  const weights = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  const sum = weights.reduce((total, weight, index) => total + Number(digits[index]) * weight, 0) + Math.floor((Number(digits[8]) * 5) / 10);
  return (10 - (sum % 10)) % 10;
}

function getProviderLabel(provider?: RoutePlanStop["routeProvider"]) {
  if (provider === "cached") return "티맵 캐시";
  if (provider === "tmap") return "티맵";
  if (provider === "estimated") return "티맵 계산 전";
  return "계산 전";
}

// 거래처 출입방법 종류(2026-08-24 피드백: "열쇠인지, 카드인지, 비밀번호인지, 어디 숨겨놓은 건지 등
// 넣어야해"). 자유 텍스트도 허용하되(과거 데이터·기타 케이스), 현장에서 가장 자주 쓰는 4가지는
// 버튼 한 번으로 바로 고를 수 있게 합니다.
const ACCESS_METHOD_TYPE_OPTIONS: Array<{ icon: LucideIcon; label: string }> = [
  { icon: KeyRound, label: "열쇠" },
  { icon: CreditCard, label: "카드" },
  { icon: Lock, label: "비밀번호" },
  { icon: MapPinned, label: "숨김위치" },
  { icon: Store, label: "기타" }
];

function getAccessMethodIcon(type?: string): LucideIcon {
  return ACCESS_METHOD_TYPE_OPTIONS.find((option) => option.label === type)?.icon || KeyRound;
}
