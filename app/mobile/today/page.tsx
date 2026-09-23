import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, History, MessageSquareText, Route, Store } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MobileDeliveryProofPanel } from "@/components/mobile-delivery-proof-panel";
import { MobileLocationReporter } from "@/components/mobile-location-reporter";
import { MobileThemeShell } from "@/components/mobile-theme-shell";
import { MobileRouteList } from "@/components/mobile-route-list";
import { MobileRouteActionPanel } from "@/components/mobile-route-action-panel";
import { MobileVisitNoteForm } from "@/components/mobile-visit-note-form";
import { getCustomerAssignmentKeys, getCustomerOperationalName, getCustomerSession, shouldScopeCustomerData } from "@/lib/auth";
import { getCompanySettings, getDeliveryCompletionEvents, getTodayRoutePlan } from "@/lib/store";
import { normalizeWorkspaceRole, workspaceRoleLabels } from "@/lib/workspace";

export default async function MobileTodayPage({ searchParams }: { searchParams?: Promise<{ customer?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getCustomerSession();
  if (!session) redirect("/mobile/join");

  const assignmentKeys = getCustomerAssignmentKeys(session);
  const isScopedStaffView = shouldScopeCustomerData(session);
  const driverName = getCustomerOperationalName(session);
  const [routePlan, companySettings, completionEvents] = await Promise.all([
    getTodayRoutePlan(session.companyId, { assignmentKeys }),
    getCompanySettings(session.companyId, session.companyName),
    getDeliveryCompletionEvents(session.companyId, { deliveryVehicle: session.assignedVehicle, driverName, hours: 20 })
  ]);
  const sourceReady = routePlan.source === "supabase";
  const normalizedDriverName = driverName.trim();
  const allStops = sourceReady ? routePlan.groups.flatMap((group) => group.stops) : [];
  // 2026-08-28 피드백 대응: 데스크톱에서 확정한 순서(order 필드, route_plan_confirmations 반영)를
  // 그대로 사용하도록 정렬을 명시적으로 추가합니다 — 정렬을 안 하면 원장에 저장된 순서(무작위에
  // 가까움)로 보일 수 있습니다.
  // 2026-09-06 피드백("거래처가 0곳으로 뜸") 대응: 배송담당자 이름을 세션 이름과 정확히
  // 일치(===)시켜야만 코스가 보였는데, 카카오 프로필 이름 표기가 조금만 달라도(공백, 별명 등)
  // 전부 비어 보였습니다. 이제 일반 직원(운영/영업 등, owner·manager가 아닌 계정)은 이미
  // getTodayRoutePlan 단계에서 assignmentKeys(세션 userId/이름/이메일)로 담당 거래처만 걸러
  // 받아오므로 여기서 다시 이름을 엄격히 매칭할 필요가 없습니다.
  const myStops = (isScopedStaffView
    ? allStops
    : normalizedDriverName
      ? allStops.filter((stop) => stop.deliveryDriver?.trim() === normalizedDriverName)
      : []
  ).sort((a, b) => a.order - b.order);
  const isPersonalized = myStops.length > 0;
  // 2026-08-28 피드백 대응(담당자 이름이 정확히 안 맞으면 엉뚱한 거래처 목록이 뜸): 예전에는
  // 담당자 이름이 매칭되지 않으면 이 기사님과 무관한, 매출 상위 권역의 아무 거래처 6곳을 그냥
  // 보여줘서 실제 내 코스인 것처럼 착각하기 쉬웠습니다. 이제는 매칭된 코스가 없으면 목록을
  // 비워서 아래의 "오늘 배정된 코스가 없습니다" 안내로 명확히 차단합니다.
  const todayStops = isPersonalized ? myStops : [];
  // 직원 화면에서는 담당 거래처 수만 노출합니다. routePlan.totalStops는 회사 전체 건수이므로
  // 배정이 0건인 직원에게 폴백으로 보여주면 데이터 범위 정책을 우회해 전체 규모가 노출됩니다.
  const visibleRouteTotal = isScopedStaffView ? todayStops.length : routePlan.totalStops;
  const myRegions = Array.from(new Set(myStops.map((stop) => stop.region)));
  const routeArea = isPersonalized
    ? myRegions.length > 1
      ? `${myRegions[0]} 외 ${myRegions.length - 1}곳`
      : myRegions[0] || "전체 권역"
    : sourceReady
      ? normalizedDriverName
        ? "담당 배정 필요"
        : "거래처 등록 필요"
      : "거래처 등록 필요";
  // 2026-08-28 피드백 대응: 담당 코스가 없을 때 회사 전체 거리/시간(routePlan.totalDistanceKm 등)을
  // 보여주면 "이게 내 오늘 거리구나"라고 착각할 수 있어, 매칭된 코스가 없을 때는 0으로 표시합니다.
  const routeDistanceKm = isPersonalized
    ? Math.round(myStops.reduce((total, stop) => total + Number(stop.distanceKm || 0), 0) * 10) / 10
    : 0;
  const routeDurationMinutes = isPersonalized ? myStops.reduce((total, stop) => total + Number(stop.durationMinutes || 0), 0) : 0;
  const completedCustomerIds = new Set(completionEvents.map((event) => event.customerId));
  const selectedStop = todayStops.find((stop) => stop.id === resolvedSearchParams?.customer) || todayStops.find((stop) => !completedCustomerIds.has(stop.id)) || todayStops[0];
  const selectedStopIndex = selectedStop ? todayStops.findIndex((stop) => stop.id === selectedStop.id) : -1;
  const nextPendingStop = selectedStopIndex >= 0
    ? [...todayStops.slice(selectedStopIndex + 1), ...todayStops.slice(0, selectedStopIndex)]
        .find((stop) => !completedCustomerIds.has(stop.id))
    : undefined;
  const selectedStopCompleted = selectedStop ? completedCustomerIds.has(selectedStop.id) : false;
  const hasExplicitSelectedStop = Boolean(resolvedSearchParams?.customer && todayStops.some((stop) => stop.id === resolvedSearchParams.customer));
  const workspaceRole = normalizeWorkspaceRole(session.workspaceRole || session.role);
  const roleLabel = workspaceRoleLabels[workspaceRole];
  const heroCopy = getMobileHeroCopy(workspaceRole);

  return (
    <main className="min-h-screen bg-[#0b1019] text-white">
      <MobileThemeShell>
      <section className="mobile-app-frame mx-auto flex min-h-screen w-full max-w-[480px] flex-col shadow-[0_20px_80px_rgba(0,0,0,0.28)]">
        <header className="mobile-card sticky top-0 z-10 shrink-0 border-b px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-semibold">MAJU 오늘의 배송</p>
              <p className="mobile-muted mt-0.5 truncate text-xs font-bold">{driverName} · {session.companyName}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge className="whitespace-nowrap bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{roleLabel}</Badge>
              <Link className="inline-flex h-9 items-center rounded-lg px-3 text-xs font-semibold text-slate-600 ring-1 ring-inset ring-slate-200" href="/dashboard">PC</Link>
            </div>
          </div>
          <MobileLocationReporter currentCustomerId={selectedStop?.id} currentCustomerName={selectedStop?.name} deliveryVehicle={selectedStop?.deliveryVehicle} />
        </header>

        <div className="flex-1 space-y-3 px-3 pb-[calc(6rem+env(safe-area-inset-bottom))] pt-3">
          {!sourceReady ? (
            <MobileOperationalEmptyState />
          ) : null}

          {sourceReady && !isPersonalized && normalizedDriverName ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800 ring-1 ring-inset ring-amber-100">
              배정된 거래처가 없습니다. 관리자에게 확인해주세요.
            </p>
          ) : null}

          {false && !isScopedStaffView ? (
            <MobileRouteContextBar
              area={routeArea}
              selectedStopName={selectedStop?.name || "선택 거래처 없음"}
              totalStops={sourceReady ? visibleRouteTotal : 0}
              visibleStops={todayStops.length}
            />
          ) : null}

          <MobileRouteList completedCustomerIds={Array.from(completedCustomerIds)} driverName={driverName} initialStops={todayStops} routeArea={routeArea} selectedStopId={selectedStop?.id} />

          {selectedStop ? (
            <section className="mobile-card scroll-mt-24 overflow-hidden rounded-xl border" id="selected-customer">
              <div className="border-b border-[var(--mobile-border)] px-4 py-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
            <p className={`text-xs font-semibold ${selectedStopCompleted ? "text-teal-400" : "mobile-warning"}`}>
              {selectedStopCompleted ? "배송완료" : "진행 중"}
            </p>
                    <h2 className="mt-1 truncate text-xl font-bold">{selectedStop.name}</h2>
                    <p className="mobile-muted mt-1 truncate text-xs font-bold">{selectedStop.address || selectedStop.region} · {selectedStop.distanceKm || 0}km</p>
                  </div>
                  <Badge className="shrink-0 bg-white text-teal-800 ring-1 ring-inset ring-teal-200">{selectedStop.industry || "업종"}</Badge>
                </div>
              </div>
              <div className="p-3">
                <MobileRouteActionPanel
                  address={selectedStop.address || selectedStop.region || selectedStop.name}
                  customerId={selectedStop.id}
                  customerName={selectedStop.name}
                  distanceKm={selectedStop.distanceKm}
                  durationMinutes={selectedStop.durationMinutes}
                  phone={selectedStop.phone}
                />
              </div>
            </section>
          ) : <MobileOperationalEmptyState />}

          {selectedStop ? (
            <>
            <section>
              <MobileDeliveryProofPanel
                companyName={companySettings.name || session.companyName}
                customerId={selectedStop.id}
                customerName={selectedStop.name}
                deliveryCompleteMessage={companySettings.deliveryCompleteMessage}
                deliveryIssueMessage={companySettings.deliveryIssueMessage}
                deliveryPartialMessage={companySettings.deliveryPartialMessage}
                loadingPosition={selectedStop.loadingPosition}
                nextCustomerId={nextPendingStop?.id}
                nextCustomerName={nextPendingStop?.name}
                notificationPhone={companySettings.notificationPhone}
                notificationSenderName={companySettings.notificationSenderName}
                driverName={driverName}
                driverPhone={session.operationalPhone}
              />
            </section>
              <details className="mobile-card group mt-3 rounded-xl border">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-semibold text-slate-600">
                  추가 방문 메모
                  <span className="text-teal-700 group-open:hidden">선택 입력</span>
                  <span className="hidden text-teal-700 group-open:inline">닫기</span>
                </summary>
                <MobileVisitNoteForm customerId={selectedStop.id} customerName={selectedStop.name} />
              </details>
            </>
          ) : <MobileOperationalEmptyState />}
        </div>

        <footer aria-label="모바일 보조 메뉴" className="mobile-bottom-nav sticky bottom-0 z-20 grid grid-cols-4 border-t px-2 pb-[calc(0.4rem+env(safe-area-inset-bottom))] pt-1.5">
          <FooterItem active href="#route-list" icon={Route} label="오늘 배송" />
          <FooterItem href="/customers/data" icon={Store} label="전체 거래처" />
          <FooterItem href="/dashboard/settings#message-templates" icon={MessageSquareText} label="메시지 편집" />
          <FooterItem href="#delivery-history" icon={History} label="배송 기록" />
        </footer>
      </section>
      </MobileThemeShell>
    </main>
  );
}

function MobileRouteContextBar({
  area,
  selectedStopName,
  totalStops,
  visibleStops
}: {
  area: string;
  selectedStopName: string;
  totalStops: number;
  visibleStops: number;
}) {
  const items = [
    { label: "권역", value: area },
    { label: "코스", value: `${visibleStops.toLocaleString()}/${totalStops.toLocaleString()}곳` },
    { label: "선택", value: selectedStopName }
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="grid grid-cols-3 divide-x divide-slate-100">
        {items.map((item) => (
          <div className="min-w-0 px-3 py-2.5" key={item.label}>
            <p className="text-xs font-medium text-slate-500">{item.label}</p>
            <p className="mt-1 truncate text-sm font-semibold text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function FooterItem({ active, href, icon: Icon, label }: { active?: boolean; href: string; icon: typeof Route; label: string }) {
  return <Link className={`mobile-bottom-nav-item flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-1 py-2 text-xs font-semibold ${active ? "is-active" : ""}`} href={href}><Icon className="h-4 w-4" />{label}</Link>;
}

function MobileDriverRouteSummary({
  area,
  distanceKm,
  durationMinutes,
  sourceReady,
  totalStops
}: {
  area: string;
  distanceKm: number;
  durationMinutes: number;
  sourceReady: boolean;
  totalStops: number;
}) {
  return (
    <section className="flex items-center justify-between gap-3 rounded-xl bg-teal-700 px-4 py-3 text-white shadow-[0_10px_24px_rgba(15,118,110,0.16)]">
      <div className="min-w-0">
        <p className="truncate text-xs font-bold text-white/70">오늘 코스 · {area}</p>
        <p className="mt-0.5 text-lg font-bold">{sourceReady ? `${totalStops.toLocaleString()}곳` : "코스 확인 필요"}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-semibold">{sourceReady ? `${distanceKm.toLocaleString()}km` : "-"}</p>
        <p className="mt-0.5 text-xs font-bold text-white/70">{sourceReady ? formatMinutes(durationMinutes) : "-"}</p>
      </div>
    </section>
  );
}

function MobileOperationalEmptyState() {
  return (
    <section className="rounded-xl border border-dashed border-teal-200 bg-teal-50/70 p-4">
      <div className="flex items-start gap-3">
        <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-white text-teal-700 shadow-sm ring-1 ring-inset ring-teal-100">
          <Building2 className="h-5 w-5" />
        </span>
        <div className="min-w-0">
          <p className="font-semibold text-slate-950">매장 등록 필요</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">관리자가 매장과 코스를 배정하면 표시됩니다.</p>
          <Link className="mt-3 inline-flex h-10 items-center justify-center rounded-md bg-teal-700 px-4 text-xs font-semibold text-white shadow-sm" href="/?type=customer-master">
            등록 화면
          </Link>
        </div>
      </div>
    </section>
  );
}

function MobileMetric({ icon: Icon, label, value }: { icon: typeof Route; label: string; value: string }) {
  return (
    <div className="min-h-[92px] rounded-xl border border-slate-200 bg-white p-3">
      <Icon className="h-4 w-4 text-teal-700" />
      <p className="mt-3 text-xs font-medium text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-bold text-slate-950">{value}</p>
    </div>
  );
}

function getMobileHeroCopy(role: ReturnType<typeof normalizeWorkspaceRole>) {
  if (role === "driver") {
    return {
      title: "오늘 코스 확인",
      description: "매장을 선택해 지도, 전화, 적재위치 사진/영상, 배송 특이사항을 바로 처리합니다."
    };
  }
  if (role === "sales") {
    return {
      title: "오늘 코스 확인",
      description: "매장을 선택해 전화, 위치, 상담 메모, 다음 액션을 빠르게 남깁니다."
    };
  }
  if (role === "manager" || role === "owner") {
    return {
      title: "오늘 코스 확인",
      description: "배송·영업 담당자의 오늘 코스, 매장 정보, 현장 기록을 모바일에서 함께 관리합니다."
    };
  }
  return {
    title: "오늘 코스 확인",
    description: "매장을 선택하면 전화, 지도, 적재위치, 방문 메모 액션을 바로 실행할 수 있습니다."
  };
}


function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}
