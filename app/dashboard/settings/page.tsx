import Link from "next/link";
import { redirect } from "next/navigation";
import { ArrowLeft } from "lucide-react";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getBusinessNumberExceptions, getCompanyJobTitles, getCompanySettings, getCompanyStaffInvitations, getCustomerMaster } from "@/lib/store";
import { BusinessNumberExceptionsPanel } from "./business-number-exceptions-panel";
import { CompanyClosurePanel } from "./company-closure-panel";
import { CompanySettingsForm } from "./settings-form";
import { StaffManagementPanel } from "./staff-management-panel";

export default async function CompanySettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");

  const [company, staff, businessNumberExceptions, customerMaster, jobTitles] = await Promise.all([
    getCompanySettings(session.companyId, session.companyName),
    getCompanyStaffInvitations(session.companyId).catch(() => ({ invitations: [], persisted: false })),
    getBusinessNumberExceptions(session.companyId).catch(() => ({ exceptions: [], persisted: false })),
    getCustomerMaster(session.companyId).catch(() => ({ customers: [], source: "empty" as const, truncated: false })),
    getCompanyJobTitles(session.companyId).catch(() => ({ jobTitles: [], persisted: false }))
  ]);

  // 직원 배정 기준(담당자명/배송차량)을 자유 입력이 아니라 실제 거래처에 등록된 값 중에서
  // 고르게 하기 위한 목록입니다. 새 이름이 필요하면 화면에서 바로 추가할 수 있습니다.
  // 2026-09-07 피드백("배송차, 담당자 값들이 통일되지 않은 것 같아 확인해") 대응: 저장 시점에는
  // 이제 trim()하지만(lib/store.ts의 upsertCustomerMaster), 그 전에 이미 앞뒤 공백이 섞여 저장된
  // 기존 거래처 레코드가 있으면 눈에는 똑같아 보이는 값이 서로 다른 옵션으로 두 번 나타납니다.
  // 목록을 만들 때도 trim() 기준으로 모아 이런 레거시 중복이 드롭다운에 더 이상 갈라져 보이지
  // 않도록 합니다(저장된 원본 값 자체를 고치는 것은 아니며, 표시만 정리합니다).
  const managerOptions = Array.from(
    new Set(customerMaster.customers.map((customer) => customer.deliveryManager?.trim()).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, "ko"));
  const vehicleOptions = Array.from(
    new Set(customerMaster.customers.map((customer) => customer.deliveryVehicle?.trim()).filter((value): value is string => Boolean(value)))
  ).sort((a, b) => a.localeCompare(b, "ko"));

  return (
    <CustomerAppShell
      active="settings"
      companyName={session.companyName}
      rightAction={
          <Link
            className="inline-flex min-h-11 items-center justify-center gap-2 rounded-md bg-teal-700 px-3 text-sm font-bold text-white shadow-sm transition hover:bg-teal-800"
            href="/dashboard"
          >
            <ArrowLeft className="h-4 w-4" />
            대시보드
          </Link>
      }
      subtitle="회사 정보와 물류 출발지"
      title="회사 설정"
      userName={session.name}
      workspaceRole={session.workspaceRole}
    >
      <section className="mx-auto max-w-[1560px] px-4 py-4 sm:px-4">
        <div className="space-y-5">
          <CompanySettingsForm initial={company} />
          <StaffManagementPanel
            canManageMembers={customerHasCapability(session, "manage_members")}
            initialInvitations={staff.invitations}
            initialJobTitles={jobTitles.jobTitles}
            managerOptions={managerOptions}
            vehicleOptions={vehicleOptions}
          />
          <BusinessNumberExceptionsPanel initialExceptions={businessNumberExceptions.exceptions} />
          {session.workspaceRole === "owner" ? <CompanyClosurePanel companyName={company.name} /> : null}
        </div>
      </section>
    </CustomerAppShell>
  );
}
