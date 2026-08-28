import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Camera, CheckCircle2, ChevronRight, Clock, MapPinned, MessageSquareText, Navigation, Phone, PlusCircle, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MobileDeliveryProofPanel } from "@/components/mobile-delivery-proof-panel";
import { MobileLoadingAttachmentPanel } from "@/components/mobile-loading-attachment-panel";
import { MobileRouteActionPanel } from "@/components/mobile-route-action-panel";
import { MobileVisitNoteForm } from "@/components/mobile-visit-note-form";
import { getCustomerSession } from "@/lib/auth";
import { getTodayRoutePlan } from "@/lib/store";
import { normalizeWorkspaceRole, workspaceRoleLabels } from "@/lib/workspace";

export default async function MobileTodayPage({ searchParams }: { searchParams?: Promise<{ customer?: string }> }) {
  const resolvedSearchParams = await searchParams;
  const session = await getCustomerSession();
  if (!session) redirect("/mobile/join");

  const routePlan = await getTodayRoutePlan(session.companyId);
  const sourceReady = routePlan.source === "supabase";
  const driverName = session.name || "모바일 담당자";
  const normalizedDriverName = session.name?.trim();
  const allStops = sourceReady ? routePlan.groups.flatMap((group) => group.stops) : [];
  // 2026-08-28 피드백 대응: 데스크톱에서 확정한 순서(order 필드, route_plan_confirmations 반영)를
  // 그대로 사용하도록 정렬을 명시적으로 추가합니다 — 정렬을 안 하면 원장에 저장된 순서(무작위에
  // 가까움)로 보일 수 있습니다.
  const myStops = normalizedDriverName
    ? allStops.filter((stop) => stop.deliveryDriver?.trim() === normalizedDriverName).sort((a, b) => a.order - b.order)
    : [];
  const isPersonalized = myStops.length > 0;
  // 2026-08-28 피드백 대응(담당자 이름이 정확히 안 맞으면 엉뚱한 거래처 목록이 뜸): 예전에는
  // 담당자 이름이 매칭되지 않으면 이 기사님과 무관한, 매출 상위 권역의 아무 거래처 6곳을 그냥
  // 보여줘서 실제 내 코스인 것처럼 착각하기 쉬웠습니다. 이제는 매칭된 코스가 없으면 목록을
  // 비워서 아래의 "오늘 배정된 코스가 없습니다" 안내로 명확히 차단합니다.
  const todayStops = isPersonalized ? myStops : [];
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
  const workspaceRole = normalizeWorkspaceRole(session.workspaceRole || session.role);
  const roleLabel = workspaceRoleLabels[workspaceRole];
  const heroCopy = getMobileHeroCopy(workspaceRole);

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-white shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{session.companyName}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{session.name}님 모바일 업무</p>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">업무 구분 · {roleLabel}</Badge>
          </div>
          <Link
            className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-700 underline decoration-teal-200 underline-offset-2"
            href="/dashboard"
          >
            PC 버전(전체 화면)으로 보기
          </Link>
        </header>

        <div className="flex-1 space-y-4 px-5 py-5">
          <section className="rounded-2xl bg-teal-700 p-4 text-white shadow-[0_16px_36px_rgba(15,118,110,0.22)]">
            <p className="text-xs font-black uppercase text-white/70">Today Route</p>
            <h1 className="mt-2 text-[28px] font-black leading-tight">{heroCopy.title}</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-white/78">
              {heroCopy.description}
            </p>
          </section>

          <section className="grid grid-cols-3 gap-2">
            <MobileMetric icon={Building2} label="방문처" value={sourceReady ? `${todayStops.length || routePlan.totalStops}곳` : "등록 필요"} />
            <MobileMetric icon={Route} label="거리" value={sourceReady ? `${routeDistanceKm.toLocaleString()}km` : "-"} />
            <MobileMetric icon={Clock} label="시간" value={sourceReady ? formatMinutes(routeDurationMinutes) : "-"} />
          </section>

          {!sourceReady ? (
            <MobileOperationalEmptyState />
          ) : null}

          {sourceReady && !isPersonalized && normalizedDriverName ? (
            <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs font-bold leading-5 text-amber-800 ring-1 ring-inset ring-amber-100">
              {driverName}님 이름으로 배정된 담당 거래처가 없습니다. 거래처 관리에서 배송담당자 이름을 계정 이름과 정확히 동일하게 배정해야 코스가 표시됩니다.
            </p>
          ) : null}

          <MobileFieldFlowPanel hasSelectedStop={Boolean(selectedStop)} selectedStopName={selectedStop?.name || "선택 거래처 없음"} />

          <MobileOperationBasisPanel
            area={routeArea}
            driverName={driverName}
            roleLabel={roleLabel}
            selectedStopName={selectedStop?.name || "선택 거래처 없음"}
            totalStops={sourceReady ? routePlan.totalStops : 0}
            visibleStops={todayStops.length}
          />

          {selectedStop ? (
            <section className="scroll-mt-24 overflow-hidden rounded-xl border border-teal-200 bg-white shadow-[0_12px_30px_rgba(15,118,110,0.08)]" id="selected-customer">
              <div className="border-b border-teal-100 bg-teal-50 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-xs font-black text-teal-700">선택 거래처</p>
                    <h2 className="mt-1 truncate text-xl font-black text-slate-950">{selectedStop.name}</h2>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{selectedStop.address || selectedStop.region}</p>
                  </div>
                  <Badge className="shrink-0 bg-white text-teal-800 ring-1 ring-inset ring-teal-200">{selectedStop.industry || "업종"}</Badge>
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2 p-4">
                <ActionLink href={selectedStop.phone ? `tel:${selectedStop.phone}` : "#"} icon={Phone} label="전화" value={selectedStop.phone || "연락처 없음"} />
                <ActionLink href={createKakaoMapSearchUrl(selectedStop.address || selectedStop.name)} icon={MapPinned} label="지도" value={`${selectedStop.distanceKm || 0}km`} />
                <ActionLink href={`/mobile/today?customer=${encodeURIComponent(selectedStop.id)}#loading-position`} icon={Camera} label="적재위치" value={selectedStop.loadingPosition || "확인 필요"} />
                <ActionLink href={`/mobile/today?customer=${encodeURIComponent(selectedStop.id)}#delivery-proof`} icon={CheckCircle2} label="배송완료" value="사진·문구" />
              </div>
            </section>
          ) : null}

          <section className="scroll-mt-24 rounded-xl border border-slate-200 bg-white" id="route-list">
            <div className="flex items-center justify-between gap-3 border-b border-slate-200 p-4">
              <div>
                <p className="font-black text-slate-950">{driverName}</p>
                <p className="mt-1 text-xs font-bold text-slate-500">{routeArea} · 모바일 코스</p>
              </div>
              <Truck className="h-5 w-5 text-teal-700" />
            </div>
            <div className="divide-y divide-slate-100">
              {todayStops.map((stop, index) => (
                <Link
                  className={`flex items-start gap-3 p-4 transition hover:bg-slate-50 ${selectedStop?.id === stop.id ? "bg-teal-50/70" : ""}`}
                  href={`/mobile/today?customer=${encodeURIComponent(stop.id)}`}
                  key={stop.id}
                >
                  <span className={`grid h-8 w-8 shrink-0 place-items-center rounded-full text-xs font-black text-white ${selectedStop?.id === stop.id ? "bg-teal-700" : "bg-slate-900"}`}>{index + 1}</span>
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <p className="truncate font-black text-slate-950">{stop.name}</p>
                      <Badge className="shrink-0 bg-slate-100 text-slate-700">{stop.region}</Badge>
                    </div>
                    <p className="mt-1 truncate text-xs font-bold text-slate-500">{stop.address || "주소 확인 필요"}</p>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      <SmallAction icon={MapPinned} label={`${stop.distanceKm}km`} />
                      <SmallAction icon={Clock} label={`${stop.durationMinutes}분`} />
                      <SmallAction icon={Phone} label="전화" />
                    </div>
                  </div>
                  <ChevronRight className="mt-1 h-4 w-4 shrink-0 text-slate-300" />
                </Link>
              ))}
              {!todayStops.length ? (
                <div className="p-4 text-sm font-bold leading-6 text-slate-500">
                  오늘 배정된 코스가 없습니다. 관리자 또는 고객사 담당자가 배송차별 코스를 먼저 확정해야 합니다.
                </div>
              ) : null}
            </div>
          </section>

          {selectedStop ? (
            <section className="scroll-mt-24 space-y-4" id="field-records">
              <MobileRouteActionPanel
                address={selectedStop.address || selectedStop.region || selectedStop.name}
                customerId={selectedStop.id}
                customerName={selectedStop.name}
                distanceKm={selectedStop.distanceKm}
                durationMinutes={selectedStop.durationMinutes}
                phone={selectedStop.phone}
              />
              <MobileLoadingAttachmentPanel customerId={selectedStop.id} customerName={selectedStop.name} loadingPosition={selectedStop.loadingPosition} />
              <MobileDeliveryProofPanel customerId={selectedStop.id} customerName={selectedStop.name} loadingPosition={selectedStop.loadingPosition} />
              <MobileVisitNoteForm customerId={selectedStop.id} customerName={selectedStop.name} />
            </section>
          ) : null}

          <section className="grid scroll-mt-24 gap-2" id="mobile-actions">
            <MobileTask icon={Navigation} title="현장 업무 흐름" description="지도 열기, 주소 복사, 전화, 배송완료 기록을 선택 거래처 기준으로 처리합니다." />
            <MobileTask icon={Camera} title="배송 증빙 관리" description="도착 사진/영상과 점주 발송 문구가 거래처 히스토리에 함께 저장됩니다." />
          </section>
        </div>

        <footer className="grid grid-cols-4 border-t border-slate-200 bg-white px-3 py-2">
          <FooterItem active href="/mobile/today#route-list" icon={Route} label="코스" />
          <FooterItem href="/mobile/today#selected-customer" icon={Building2} label="거래처" />
          <FooterItem href="/mobile/register" icon={PlusCircle} label="등록" />
          <FooterItem href="/mobile/today#field-records" icon={CheckCircle2} label="기록" />
        </footer>
      </section>
    </main>
  );
}

function MobileOperationBasisPanel({
  area,
  driverName,
  roleLabel,
  selectedStopName,
  totalStops,
  visibleStops
}: {
  area: string;
  driverName: string;
  roleLabel: string;
  selectedStopName: string;
  totalStops: number;
  visibleStops: number;
}) {
  const items = [
    { label: "담당자", value: driverName },
    { label: "업무 구분", value: roleLabel },
    { label: "권역", value: area },
    { label: "표시 코스", value: `${visibleStops.toLocaleString()}/${totalStops.toLocaleString()}곳` }
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <div className="border-b border-slate-100 bg-slate-50 px-4 py-3">
        <p className="text-sm font-black text-slate-950">운영 기준 데이터</p>
        <p className="mt-1 text-xs font-bold leading-5 text-slate-500">관리자가 확정한 거래처 원장과 배송차 코스를 모바일에서 실행합니다. 업무 구분은 표시와 필터 기준입니다.</p>
      </div>
      <div className="grid grid-cols-2 divide-x divide-y divide-slate-100">
        {items.map((item) => (
          <div className="min-w-0 px-4 py-3" key={item.label}>
            <p className="text-[11px] font-black text-slate-400">{item.label}</p>
            <p className="mt-1 truncate text-sm font-black text-slate-950">{item.value}</p>
          </div>
        ))}
      </div>
      <div className="border-t border-slate-100 px-4 py-3">
        <p className="text-[11px] font-black text-slate-400">선택 거래처</p>
        <p className="mt-1 truncate text-sm font-black text-slate-950">{selectedStopName}</p>
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
          <p className="font-black text-slate-950">운영 거래처 등록이 필요합니다.</p>
          <p className="mt-1 text-sm font-semibold leading-6 text-slate-600">
            관리자 또는 고객사 담당자가 거래처를 등록하면 오늘 코스, 지도, 전화, 배송완료 기록이 모바일에 표시됩니다.
          </p>
          <Link className="mt-3 inline-flex h-9 items-center justify-center rounded-md bg-teal-700 px-3 text-xs font-black text-white shadow-sm" href="/?type=customer-master">
            거래처 등록 화면으로 이동
          </Link>
        </div>
      </div>
    </section>
  );
}

function MobileFieldFlowPanel({
  hasSelectedStop,
  selectedStopName
}: {
  hasSelectedStop: boolean;
  selectedStopName: string;
}) {
  const steps = [
    { label: "매장 선택", value: selectedStopName, done: hasSelectedStop },
    { label: "지도·전화", value: hasSelectedStop ? "바로 실행" : "선택 필요", done: hasSelectedStop },
    { label: "적재위치", value: hasSelectedStop ? "사진 확인" : "선택 필요", done: false },
    { label: "배송완료", value: hasSelectedStop ? "사진·메모 저장" : "선택 필요", done: false }
  ];

  return (
    <section className="overflow-hidden rounded-xl border border-blue-100 bg-blue-50/70">
      <div className="border-b border-blue-100 px-4 py-3">
        <div className="flex items-start justify-between gap-3">
          <div>
            <p className="text-sm font-black text-slate-950">현장 실행 순서</p>
            <p className="mt-1 text-xs font-bold leading-5 text-blue-800">모바일에서는 선택한 거래처 기준으로 이동, 연락, 적재위치, 완료 기록을 처리합니다.</p>
          </div>
          <Badge className={hasSelectedStop ? "bg-white text-blue-800 ring-1 ring-inset ring-blue-100" : "bg-amber-100 text-amber-800"}>
            {hasSelectedStop ? "실행 가능" : "매장 선택"}
          </Badge>
        </div>
      </div>
      <div className="grid grid-cols-2 gap-2 p-3">
        {steps.map((step, index) => (
          <div key={step.label} className="rounded-lg border border-white bg-white px-3 py-2">
            <div className="flex items-center gap-2">
              <span className={`grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-black ${step.done ? "bg-teal-700 text-white" : "bg-slate-100 text-slate-500"}`}>
                {index + 1}
              </span>
              <p className="truncate text-xs font-black text-slate-950">{step.label}</p>
            </div>
            <p className="mt-1 truncate text-xs font-bold text-slate-500">{step.value}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

function ActionLink({ href, icon: Icon, label, value }: { href: string; icon: typeof Phone; label: string; value: string }) {
  return (
    <a className="rounded-lg border border-slate-200 bg-white p-3 transition hover:border-teal-200 hover:bg-teal-50" href={href} target={href.startsWith("http") ? "_blank" : undefined} rel={href.startsWith("http") ? "noreferrer" : undefined}>
      <Icon className="h-4 w-4 text-teal-700" />
      <p className="mt-2 text-xs font-black text-slate-500">{label}</p>
      <p className="mt-1 truncate text-sm font-black text-slate-950">{value}</p>
    </a>
  );
}

function MobileMetric({ icon: Icon, label, value }: { icon: typeof Route; label: string; value: string }) {
  return (
    <div className="rounded-xl border border-slate-200 bg-white p-3">
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

function MobileTask({ description, icon: Icon, id, title }: { description: string; icon: typeof Navigation; id?: string; title: string }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-slate-200 bg-white p-4" id={id}>
      <span className="grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-teal-50 text-teal-700">
        <Icon className="h-5 w-5" />
      </span>
      <div>
        <p className="font-black text-slate-950">{title}</p>
        <p className="mt-1 text-sm font-semibold leading-6 text-slate-500">{description}</p>
      </div>
    </div>
  );
}

function createKakaoMapSearchUrl(query: string) {
  return `https://map.kakao.com/link/search/${encodeURIComponent(query)}`;
}

function FooterItem({ active, href, icon: Icon, label }: { active?: boolean; href: string; icon: typeof Route; label: string }) {
  return (
    <Link className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-black ${active ? "bg-teal-50 text-teal-800" : "text-slate-400"}`} href={href}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}

function getMobileHeroCopy(role: ReturnType<typeof normalizeWorkspaceRole>) {
  if (role === "driver") {
    return {
      title: "오늘 현장 코스를 확인하세요.",
      description: "매장을 선택해 지도, 전화, 적재위치 사진/영상, 배송 특이사항을 바로 처리합니다."
    };
  }
  if (role === "sales") {
    return {
      title: "오늘 현장 코스를 확인하세요.",
      description: "매장을 선택해 전화, 위치, 상담 메모, 다음 액션을 빠르게 남깁니다."
    };
  }
  if (role === "manager" || role === "owner") {
    return {
      title: "오늘 현장 코스를 확인하세요.",
      description: "배송·영업 담당자의 오늘 코스, 매장 정보, 현장 기록을 모바일에서 함께 관리합니다."
    };
  }
  return {
    title: "오늘 현장 코스를 확인하세요.",
    description: "매장을 선택하면 전화, 지도, 적재위치, 방문 메모 액션을 바로 실행할 수 있습니다."
  };
}


function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}
