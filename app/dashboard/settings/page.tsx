import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { getCustomerSession } from "@/lib/auth";
import { getCompanySettings } from "@/lib/store";
import { CompanySettingsForm } from "./settings-form";

export default async function CompanySettingsPage() {
  const session = getCustomerSession();
  if (!session) redirect("/dashboard/login");

  const company = await getCompanySettings(session.companyId, session.companyName);

  return (
    <CustomerAppShell
      active="settings"
      companyName={session.companyName}
      rightAction={
          <Link
            className="inline-flex h-9 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </Link>
      }
      subtitle="회사명, 담당자, 물류 출발지 주소를 운영 기준값으로 관리합니다."
      title="회사 설정"
      userName={session.name}
    >
      <section className="mx-auto max-w-[1560px] px-4 py-6 sm:px-6">
        <CompanySettingsForm initial={company} />
      </section>
    </CustomerAppShell>
  );
}
