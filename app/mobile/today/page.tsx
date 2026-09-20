import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Camera, CheckCircle2, ChevronRight, Clock, MapPinned, Phone, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MobileDeliveryProofPanel } from "@/components/mobile-delivery-proof-panel";
import { MobileAccordionStep } from "@/components/mobile-accordion-step";
import { MobileLocationReporter } from "@/components/mobile-location-reporter";
import { MobileRouteList } from "@/components/mobile-route-list";
import { MobileLoadingAttachmentPanel } from "@/components/mobile-loading-attachment-panel";
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
  const selectedStop = todayStops.find((stop) => stop.id === resolvedSearchParams?.customer) || todayStops[0];
  const hasExplicitSelectedStop = Boolean(resolvedSearchParams?.customer && todayStops.some((stop) => stop.id === resolvedSearchParams.customer));
  const workspaceRole = normalizeWorkspaceRole(session.workspaceRole || session.role);
  const roleLabel = workspaceRoleLabels[workspaceRole];
  const heroCopy = getMobileHeroCopy(workspaceRole);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-white shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{session.companyName}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{driverName}님</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <Badge className="whitespace-nowrap bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{roleLabel}</Badge>
              <Link className="inline-flex h-8 items-center rounded-lg px-2 text-[11px] font-black text-slate-500 ring-1 ring-inset ring-slate-200" href="/dashboard">PC</Link>
            </div>
          </div>
          <MobileLocationReporter currentCustomerId={selectedStop?.id} currentCustomerName={selectedStop?.name} deliveryVehicle={selectedStop?.deliveryVehicle} />
        </header>

        <div className="flex-1 space-y-3 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
          {isScopedStaffView ? (
            <MobileDriverRouteSummary
              area={routeArea}
              distanceKm={routeDistanceKm}
              durationMinutes={routeDurationMinutes}
              sourceReady={sourceReady}
              totalStops={visibleRouteTotal}
            />
          ) : (
            <>
              <section className="rounded-xl bg-teal-700 p-4 text-white shadow-[0_12px_28px_rgba(15,118,110,0.18)]">
                <p className="text-xs font-black text-white/70">오늘 코스</p>
                <h1 className="mt-1 truncate text-2xl font-black leading-tight">{heroCopy.title}</h1>
              </section>
              <section className="grid grid-cols-3 gap-2">
                <MobileMetric icon={Building2} label="방문처" value={sourceReady ? `${visibleRouteTotal}곳` : "등록 필요"} />
                <MobileMetric icon={Route} label="거리" value={sourceReady ? `${routeDistanceKm.toLocaleString()}km` : "-"} />
                <MobileMetric icon={Clock} label="시간" value={sourceReady ? formatMinutes(routeDurationMinutes) : "-"} />
              </section>
            </>
          )}

          {!sourceReady ? (
            <MobileOperationalEmptyState />
          ) : null}

          {sourceReady && !isPersonalized && normalizedDriverName ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800 ring-1 ring-inset ring-amber-100">
              배정된 거래처가 없습니다. 관리자에게 확인해주세요.
            </p>
          ) : null}

          {!isScopedStaffView ? (
            <MobileRouteContextBar
              area={routeArea}
              selectedStopName={selectedStop?.name || "선택 거래처 없음"}
              totalStops={sourceReady ? visibleRouteTotal : 0}
              visibleStops={todayStops.length}
            />
          ) : null}

          <MobileAccordionStep defaultOpen={!hasExplicitSelectedStop} label="1. 오늘 코스 · 길게 눌러 순서 변경" targetId="route-list">
            <MobileRouteList completedCustomerIds={completionEvents.map((event) => event.customerId)} driverName={driverName} initialStops={todayStops} routeArea={routeArea} selectedStopId={selectedStop?.id} />
          </MobileAccordionStep>

          {selectedStop ? (
            <MobileAccordionStep defaultOpen={hasExplicitSelectedStop} label="2. 매장 · 지도 · 전화" targetId="selected-customer">
            <section className="scroll-mt-24 overflow-hidden rounded-xl border border-teal-200 bg-white shadow-[0_12px_30px_rgba(15,118,110,0.08)]" id="selected-customer">
              <div className="border-b border-teal-100 bg-teal-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
            <p className="text-xs font-black text-teal-700">선택 매장</p>
                    <h2 className="mt-1 truncate text-xl font-black text-slate-950">{selectedStop.name}</h2>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{selectedStop.address || selectedStop.region}</p>
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
            </MobileAccordionStep>
          ) : null}

          {/* Legacy server-rendered list retained only as source reference. */}
          {false ? <section className="scroll-mt-24 rounded-xl border border-slate-200 bg-white" id="route-list-legacy">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div className="min-w-0">
                <p className="truncate font-black text-slate-950">{driverName}</p>
                <p className="mt-1 truncate text-xs font-bold text-slate-500">{routeArea} · 모바일 코스</p>
              </div>
              <Truck className="h-5 w-5 shrink-0 text-teal-700" />
            </div>
            <div className="divide-y divide-slate-100">
              {todayStops.map((stop, index) => (
                // 2026-08-28 피드백 대응(기사님이 "전화" 배지를 눌러도 실제로 전화가 안 걸림):
                // 예전에는 이 배지가 전체 카드를 감싸는 <Link> 안의 장식용 <span>이라 눌러도 상세
                // 페이지로 이동만 됐습니다. tel: 링크는 진짜 <a>라야 하는데, <Link>(=<a>) 안에
                // <a>를 중첩하면 무효한 HTML이라, 카드 전체 클릭은 배경에 깔린 투명 오버레이
                // <Link>로 처리하고 전화 배지만 그 위(z-10)에 별도 형제 <a href="tel:...">로 둡니다.
                <div className={`relative flex items-start gap-3 p-4 transition hover:bg-slate-50 ${selectedStop?.id === stop.id ? "bg-teal-50/70" : ""}`} key={stop.id}>
                  <Link aria-label={stop.name} className="absolute inset-0" href={`/mobile/today?customer=${encodeURIComponent(stop.id)}`} />
                  <span className={`relative z-10 grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black text-white ${selectedStop?.id === stop.id ? "bg-teal-700" : "bg-slate-900"}`}>{index + 1}</span>
                  <div className="relative z-10 min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-black text-slate-950">{stop.name}</p>
                      <Badge className="shrink-0 bg-slate-100 text-slate-700">{stop.region}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{stop.address || "주소 확인 필요"}</p>
                    <div className="relative z-10 mt-2 flex flex-wrap gap-1.5">
                      <SmallAction icon={MapPinned} label={`${stop.distanceKm}km`} />
                      <SmallAction icon={Clock} label={`${stop.durationMinutes}분`} />
                      {stop.phone ? (
                        <a
                          className="relative z-10 inline-flex items-center gap-1 rounded-md bg-teal-50 px-2 py-1 text-[11px] font-black text-teal-700 hover:bg-teal-100"
                          href={`tel:${stop.phone}`}
                        >
                          <Phone className="h-3 w-3" />
                          전화
                        </a>
                      ) : (
                        <SmallAction icon={Phone} label="연락처 없음" />
                      )}
                    </div>
                  </div>
                  <ChevronRight className="relative z-10 mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </div>
              ))}
              {!todayStops.length ? (
                <div className="p-4 text-sm font-bold leading-6 text-slate-500">
                  오늘 배정된 코스가 없습니다.
                </div>
              ) : null}
            </div>
          </section> : null}

          {selectedStop ? (
            <section className="space-y-3">
              <MobileAccordionStep label="3. 적재위치" targetId="loading-position">
              <MobileLoadingAttachmentPanel customerId={selectedStop.id} customerName={selectedStop.name} loadingPosition={selectedStop.loadingPosition} />
              </MobileAccordionStep>
              <MobileAccordionStep label="4. 배송완료 · 사진 · 메모" targetId="delivery-proof">
              <MobileDeliveryProofPanel
                companyName={companySettings.name || session.companyName}
                customerId={selectedStop.id}
                customerName={selectedStop.name}
                deliveryCompleteMessage={companySettings.deliveryCompleteMessage}
                deliveryIssueMessage={companySettings.deliveryIssueMessage}
                deliveryPartialMessage={companySettings.deliveryPartialMessage}
                loadingPosition={selectedStop.loadingPosition}
                notificationPhone={companySettings.notificationPhone}
                notificationSenderName={companySettings.notificationSenderName}
              />
              <details className="group border-t border-blue-100 bg-white">
                <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between px-4 text-sm font-black text-slate-600">
                  추가 방문 메모
                  <span className="text-teal-700 group-open:hidden">선택 입력</span>
                  <span className="hidden text-teal-700 group-open:inline">닫기</span>
                </summary>
                <MobileVisitNoteForm customerId={selectedStop.id} customerName={selectedStop.name} />
              </details>
              </MobileAccordionStep>
            </section>
          ) : null}

        </div>

        <footer aria-label="현장 처리 순서" className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-slate-200 bg-white px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_rgba(15,23,42,0.08)]">
          <FooterItem active href="/mobile/today#route-list" icon={Route} label="코스" />
          <FooterItem href={selectedStop ? `/mobile/today?customer=${encodeURIComponent(selectedStop.id)}#selected-customer` : "/mobile/today#route-list"} icon={Building2} label="매장·이동" />
          <FooterItem href={selectedStop ? `/mobile/today?customer=${encodeURIComponent(selectedStop.id)}#loading-position` : "/mobile/today#route-list"} icon={Camera} label="적재" />
          <FooterItem href={selectedStop ? `/mobile/today?customer=${encodeURIComponent(selectedStop.id)}#delivery-proof` : "/mobile/today#route-list"} icon={CheckCircle2} label="완료·메모" />
        </footer>
      </section>
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
            <p className="text-[11px] font-black text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
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
        <p className="mt-0.5 text-lg font-black">{sourceReady ? `${totalStops.toLocaleString()}곳` : "코스 확인 필요"}</p>
      </div>
      <div className="shrink-0 text-right">
        <p className="text-sm font-black">{sourceReady ? `${distanceKm.toLocaleString()}km` : "-"}</p>
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
          <p className="font-black text-slate-950">매장 등록 필요</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">관리자가 매장과 코스를 배정하면 표시됩니다.</p>
          <Link className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-xs font-black text-white shadow-sm" href="/?type=customer-master">
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
      <p className="mt-3 text-[11px] font-black text-slate-500">{label}</p>
      <p className="mt-1 truncate text-lg font-black text-slate-950">{value}</p>
    </div>
  );
}

function SmallAction({ icon: Icon, label }: { icon: typeof MapPinned; label: string }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-md bg-slate-50 px-2 py-1 text-[11px] font-black text-slate-600">
      <Icon className="h-3 w-3" />
      {label}
    </span>
  );
}

function FooterItem({ active, href, icon: Icon, label }: { active?: boolean; href: string; icon: typeof Route; label: string }) {
  return (
    <Link className={`flex min-h-12 flex-col items-center justify-center gap-1 rounded-lg px-2 py-2 text-xs font-black ${active ? "bg-teal-50 text-teal-800" : "text-slate-400"}`} href={href}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
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
