import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { getCustomerSession } from "@/lib/auth";
import { getCompanySettings } from "@/lib/store";
import { CompanySettingsForm } from "./settings-form";

export default async function CompanySettingsPage() {
  const session = getCustomerSession();
  if (!session) redirect("/dashboard/login");

  const company = await getCompanySettings(session.companyId, session.companyName);

  return (
    <main className="min-h-screen bg-background text-foreground">
      <header className="border-b border-border bg-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-4 sm:px-6">
          <div>
            <p className="text-sm font-black">{session.companyName}</p>
            <p className="text-xs text-muted-foreground">회사 설정</p>
          </div>
          <Link
            className="inline-flex h-10 items-center justify-center gap-2 rounded-md border border-border bg-white px-3 text-sm font-bold transition hover:bg-muted"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </Link>
        </div>
      </header>
      <section className="mx-auto max-w-7xl px-4 py-6 sm:px-6">
        <CompanySettingsForm initial={company} />
      </section>
    </main>
  );
}
