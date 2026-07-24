import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, Camera, CheckCircle2, ChevronRight, Clock, MapPinned, MessageSquareText, Navigation, Phone, Route, Truck } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MobileLoadingAttachmentPanel } from "@/components/mobile-loading-attachment-panel";
import { MobileVisitNoteForm } from "@/components/mobile-visit-note-form";
import { getCustomerSession } from "@/lib/auth";
import { getTodayRoutePlan } from "@/lib/store";
import { normalizeWorkspaceRole, workspaceRoleLabels } from "@/lib/workspace";

export default async function MobileTodayPage({ searchParams }: { searchParams?: { customer?: string } }) {
  const session = getCustomerSession();
  if (!session) redirect("/mobile/join");

  const routePlan = await getTodayRoutePlan(session.companyId);
  const firstGroup = routePlan.groups[0];
  const todayStops = firstGroup?.stops.slice(0, 6) || [];
  const driverName = session.name || "모바일 담당자";
  const routeArea = firstGroup?.region || "전체 권역";
  const selectedStop = todayStops.find((stop) => stop.id === searchParams?.customer) || todayStops[0];
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
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">{roleLabel}</Badge>
          </div>
        </header>

        <div className="flex-1 space-y-4 px-5 py-5">
          <section className="rounded-2xl bg-teal-700 p-5 text-white shadow-[0_16px_36px_rgba(15,118,110,0.22)]">
            <p className="text-xs font-black uppercase text-white/70">Today Route</p>
            <h1 className="mt-2 text-[28px] font-black leading-tight">{heroCopy.title}</h1>
            <p className="mt-3 text-sm font-semibold leading-6 text-white/78">
              {heroCopy.description}
            </p>
          </section>

          <section className="grid grid-cols-3 gap-2">
            <MobileMetric icon={Building2} label="방문처" value={`${todayStops.length || routePlan.totalStops}곳`} />
            <MobileMetric icon={Route} label="거리" value={`${routePlan.totalDistanceKm.toLocaleString()}km`} />
            <MobileMetric icon={Clock} label="시간" value={formatMinutes(routePlan.totalDurationMinutes)} />
          </section>

          {selectedStop ? (
            <section className="overflow-hidden rounded-xl border border-teal-200 bg-white shadow-[0_12px_30px_rgba(15,118,110,0.08)]">
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
                <ActionLink href={`/mobile/today?customer=${encodeURIComponent(selectedStop.id)}#visit-memo`} icon={MessageSquareText} label="메모" value="방문 기록" />
              </div>
            </section>
          ) : null}

          <section className="rounded-xl border border-slate-200 bg-white">
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
                <div className="p-5 text-sm font-bold leading-6 text-slate-500">
                  오늘 배정된 코스가 없습니다. 관리자 또는 고객사 담당자가 배송차별 코스를 먼저 확정해야 합니다.
                </div>
              ) : null}
            </div>
          </section>

          {selectedStop ? (
            <>
              <MobileLoadingAttachmentPanel customerId={selectedStop.id} customerName={selectedStop.name} loadingPosition={selectedStop.loadingPosition} />
              <MobileVisitNoteForm customerId={selectedStop.id} customerName={selectedStop.name} />
            </>
          ) : null}

          <section className="grid gap-2">
            <MobileTask icon={Navigation} title="티맵 경로 열기" description="다음 단계에서 차량별 경유 순서를 티맵 링크로 연결합니다." />
            <MobileTask icon={Camera} title="배송 적재위치 확인" description="거래처별 사진/영상 첨부자료를 모바일에서 바로 확인합니다." />
          </section>
        </div>

        <footer className="grid grid-cols-3 border-t border-slate-200 bg-white px-3 py-2">
          <FooterItem active href="/mobile/today" icon={Route} label="오늘" />
          <FooterItem href="/crm/timeline" icon={Building2} label="거래처" />
          <FooterItem href="/dashboard/settings" icon={CheckCircle2} label="관리" />
        </footer>
      </section>
    </main>
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
      title: "오늘 배송 코스를 확인하세요.",
      description: "매장을 선택해 지도, 전화, 적재위치 사진/영상, 배송 특이사항을 바로 처리합니다."
    };
  }
  if (role === "sales") {
    return {
      title: "오늘 방문할 거래처를 확인하세요.",
      description: "매장을 선택해 전화, 위치, 상담 메모, 다음 액션을 빠르게 남깁니다."
    };
  }
  if (role === "manager" || role === "owner") {
    return {
      title: "현장 코스와 직원 기록을 확인하세요.",
      description: "배송·영업 담당자의 오늘 코스, 매장 정보, 현장 기록을 모바일에서 함께 관리합니다."
    };
  }
  return {
    title: "오늘 배정된 업무를 확인하세요.",
    description: "매장을 선택하면 전화, 지도, 적재위치, 방문 메모 액션을 바로 실행할 수 있습니다."
  };
}


function formatMinutes(minutes: number) {
  if (!minutes) return "-";
  const hours = Math.floor(minutes / 60);
  const rest = minutes % 60;
  return hours ? `${hours}h ${rest}m` : `${rest}m`;
}
