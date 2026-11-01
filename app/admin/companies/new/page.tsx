import { redirect } from "next/navigation";
import { AdminPageHeader } from "@/app/admin/admin-page-header";
import { getAdminSession } from "@/lib/auth";
import { CompanyOnboardingWorkspace } from "./workspace";

export default async function NewAdminCompanyPage() {
  const session = await getAdminSession();
  if (!session) redirect("/admin/login");
  const accountCreationEnabled = ["1", "true"].includes((process.env.ADMIN_COMPANY_ONBOARDING_ACCOUNT_ENABLED || "").toLowerCase());

  return (
    <main className="min-h-screen maju-app-bg">
      <AdminPageHeader active="companies" badge="Company Setup" session={session} subtitle="회사 정보부터 요금제까지 한 화면에서 준비합니다" title="고객사 기초 등록" />
      <CompanyOnboardingWorkspace accountCreationEnabled={accountCreationEnabled} />
    </main>
  );
}
