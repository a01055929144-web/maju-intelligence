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
  const managerOptions = Array.from(new Set(customerMaster.customers.map((customer) => customer.deliveryManager).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, "ko")
  );
  const vehicleOptions = Array.from(new Set(customerMaster.customers.map((customer) => customer.deliveryVehicle).filter((value): value is string => Boolean(value)))).sort((a, b) =>
    a.localeCompare(b, "ko")
  );

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
