import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CheckCircle2, ChevronRight, Monitor, PlusCircle, Route, Search, Upload } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MobileRegisterWorkspace } from "@/components/mobile-register-workspace";
import { getCustomerSession } from "@/lib/auth";

export default async function MobileRegisterPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/mobile/join");

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-white shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 pb-3 pt-[calc(0.75rem+env(safe-area-inset-top))] backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{session.companyName}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{session.name}님</p>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">새 거래처 등록</Badge>
          </div>
          <Link className="mt-2 inline-flex min-h-11 items-center gap-2 rounded-full bg-slate-50 px-3 text-xs font-black text-teal-700 ring-1 ring-inset ring-slate-200" href="/dashboard">
            <Monitor className="h-3.5 w-3.5" /> PC 운영 화면 <ChevronRight className="h-3.5 w-3.5" />
          </Link>
        </header>

        <div className="flex-1 space-y-3 px-4 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-4">
          <section aria-label="등록 순서" className="grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-1 rounded-xl border border-slate-200 bg-slate-50 p-3 text-center text-[11px] font-black text-slate-600">
            <span className="flex min-w-0 flex-col items-center gap-1"><Search className="h-4 w-4 text-teal-700" />1. 매장 검색</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="flex min-w-0 flex-col items-center gap-1"><CheckCircle2 className="h-4 w-4 text-teal-700" />2. 정보 확인</span>
            <ChevronRight className="h-3.5 w-3.5 text-slate-300" />
            <span className="flex min-w-0 flex-col items-center gap-1"><Upload className="h-4 w-4 text-teal-700" />3. 자료 첨부</span>
          </section>
          <MobileRegisterWorkspace />
        </div>

        <footer className="sticky bottom-0 z-10 grid grid-cols-4 border-t border-slate-200 bg-white px-3 pb-[calc(0.5rem+env(safe-area-inset-bottom))] pt-2 shadow-[0_-16px_40px_rgba(15,23,42,0.08)]">
          <FooterItem href="/mobile/today#route-list" icon={Route} label="코스" />
          <FooterItem href="/mobile/today#selected-customer" icon={Building2} label="매장" />
          <FooterItem active href="/mobile/register" icon={PlusCircle} label="등록" />
          <FooterItem href="/mobile/today#field-records" icon={CheckCircle2} label="완료" />
        </footer>
      </section>
    </main>
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
