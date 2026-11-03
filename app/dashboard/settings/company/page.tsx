import { redirect } from "next/navigation";
import { areHoldModulesEnabled } from "@/lib/feature-modules";
import { customerHasCapability, getCustomerSession } from "@/lib/auth";
import { getAppUserLoginMethods, getCompanySettings } from "@/lib/store";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { MyAccountLoginCard } from "@/components/my-account-login-card";
import { CompanyProfileForm } from "@/components/company-profile-form";
import { StoreOrderSettingsWorkspace } from "@/components/store-order-settings-workspace";
import { CompanySettingsForm } from "../settings-form";
import { SalesKpiSettingsPanel } from "../sales-kpi-settings-panel";
import { SettingsShell } from "../settings-shell";
import { SalesRegionSettings } from "../sales-region-settings";

/**
 * 11/3: 회사 정보 한 곳에서 기본·품목·배송·주문·결제·상담·서류를 입력합니다.
 * 예전 '회사 기준정보'(회사명·출발지)는 기본 탭, 배송 알림 문구·영업 지역은 배송 탭, 주문 설정은 주문 탭으로 옮겼습니다.
 * 문자 발신 정보는 설정 > 문자 발송 탭.
 */
export default async function CompanyInformationSettingsPage({ searchParams }: { searchParams?: Promise<{ kakao?: string; tab?: string }> }) {
  const session = await getCustomerSession();
  if (!session) redirect("/dashboard/login");
  const showHoldModules = areHoldModulesEnabled(session.companyId);
  const [company, loginMethods, params] = await Promise.all([
    getCompanySettings(session.companyId, session.companyName),
    getAppUserLoginMethods(session.userId || ""),
    searchParams
  ]);
  const orderEnabled = priceSheetsEnabled() && storeOrderingEnabled() && isFeatureEnabled("PRICING", session.companyId) && isFeatureEnabled("STORE_ORDERING", session.companyId) && canManagePriceSheets(session);
  return (
    <SettingsShell activePath="/dashboard/settings/company" session={session} showHoldModules={showHoldModules} subtitle="영업·주문·배송에 쓰이는 회사 정보를 한 곳에서 관리합니다." title="회사 정보">
      {session.userId ? <MyAccountLoginCard kakao={loginMethods.kakao} loginId={loginMethods.loginId} status={params?.kakao} /> : null}
      <CompanyProfileForm
        initialTab={params?.tab || "basic"}
        orderContent={orderEnabled ? <StoreOrderSettingsWorkspace companyId={session.companyId} /> : undefined}
        slots={{
          basic: <CompanySettingsForm hideAside initial={company} sections={["company"]} showHoldModules={showHoldModules} />,
          delivery: (
            <>
              <CompanySettingsForm hideAside initial={company} sections={["deliveryTemplates"]} showHoldModules={showHoldModules} />
              <SalesRegionSettings />
            </>
          )
        }}
      />
      {showHoldModules ? <CompanySettingsForm hideAside initial={company} sections={["quote"]} showHoldModules={showHoldModules} /> : null}
      {showHoldModules ? <SalesKpiSettingsPanel canManage={customerHasCapability(session, "manage_company")} /> : null}
    </SettingsShell>
  );
}
