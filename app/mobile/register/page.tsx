import Link from "next/link";
import { redirect } from "next/navigation";
import { Building2, CheckCircle2, PlusCircle, Route } from "lucide-react";
import { Badge } from "@/components/ui/badge";
import { MobileRegisterWorkspace } from "@/components/mobile-register-workspace";
import { getCustomerSession } from "@/lib/auth";

export default async function MobileRegisterPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/mobile/join");

  return (
    <main className="min-h-screen bg-[#f5f7fb] text-slate-950">
      <section className="mx-auto flex min-h-screen w-full max-w-[480px] flex-col bg-white shadow-[0_20px_80px_rgba(15,23,42,0.12)]">
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-5 py-4 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{session.companyName}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{session.name}님 모바일 업무</p>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">신규 거래처 등록</Badge>
          </div>
          <Link className="mt-2 inline-flex items-center gap-1 text-xs font-bold text-teal-700 underline decoration-teal-200 underline-offset-2" href="/dashboard">
            PC 버전(전체 화면)으로 보기
          </Link>
        </header>

        <div className="flex-1 space-y-4 px-5 py-5">
          <MobileRegisterWorkspace />
        </div>

        <footer className="grid grid-cols-4 border-t border-slate-200 bg-white px-3 py-2">
          <FooterItem href="/mobile/today#route-list" icon={Route} label="코스" />
          <FooterItem href="/mobile/today#selected-customer" icon={Building2} label="거래처" />
          <FooterItem active href="/mobile/register" icon={PlusCircle} label="등록" />
          <FooterItem href="/mobile/today#field-records" icon={CheckCircle2} label="기록" />
        </footer>
      </section>
    </main>
  );
}

function FooterItem({ active, href, icon: Icon, label }: { active?: boolean; href: string; icon: typeof Route; label: string }) {
  return (
    <Link className={`flex flex-col items-center gap-1 rounded-lg px-2 py-2 text-xs font-black ${active ? "bg-teal-50 text-teal-800" : "text-slate-400"}`} href={href}>
      <Icon className="h-4 w-4" />
      {label}
    </Link>
  );
}
