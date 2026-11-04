import { redirect } from "next/navigation";
import { getCustomerSession } from "@/lib/auth";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { getBusinessNumberExceptions } from "@/lib/store";
import { BusinessNumberExceptionsPanel } from "../business-number-exceptions-panel";
import { SettingsShell } from "../settings-shell";

export default async function AdvancedSettingsPage() {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  if (session.workspaceRole !== "owner") redirect("/dashboard/settings/company");
  // 11/4: 회사 탈퇴는 고객 화면에서 숨깁니다. 관리자가 판단해 '중지/탈퇴'로 바꾸고, 다시 쓰면 관리자 화면에서 '운영'으로 되살립니다.
  const businessNumberExceptions = await getBusinessNumberExceptions(session.companyId).catch(() => ({ exceptions: [], persisted: false }));
  return (
    <SettingsShell activePath="/dashboard/settings/advanced" session={session} showHoldModules={areHoldModulesEnabled(session.companyId)} subtitle="사업자번호 예외를 관리합니다. 이용 종료는 MAJU 관리자에게 요청해 주세요." title="고급 설정">
      <BusinessNumberExceptionsPanel initialExceptions={businessNumberExceptions.exceptions} />
      <p className="rounded-xl border border-slate-200 bg-white p-4 text-sm font-semibold text-slate-600">회사 이용을 멈추거나 다시 시작하려면 MAJU 관리자에게 요청해 주세요. 데이터는 지워지지 않고 보관됩니다.</p>
    </SettingsShell>
  );
}
