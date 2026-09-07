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
        <header className="sticky top-0 z-10 border-b border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
          <div className="flex items-center justify-between gap-3">
            <div className="min-w-0">
              <p className="truncate text-sm font-black text-slate-950">{session.companyName}</p>
              <p className="mt-0.5 truncate text-xs font-bold text-slate-500">{session.name}님</p>
            </div>
            <Badge className="bg-teal-50 text-teal-800 ring-1 ring-inset ring-teal-100">등록</Badge>
          </div>
          <Link className="mt-2 inline-flex h-8 items-center rounded-full bg-slate-50 px-3 text-xs font-black text-teal-700 ring-1 ring-inset ring-slate-200" href="/dashboard">
            PC 화면
          </Link>
        </header>

        <div className="flex-1 space-y-4 px-5 pb-[calc(7rem+env(safe-area-inset-bottom))] pt-5">
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
