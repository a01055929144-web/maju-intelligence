import { storeMemberSessionEnabled } from "@/lib/auth";
import type { StoreKakaoLogin } from "@/components/store-kakao-entry";
import { notFound } from "next/navigation";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { storeOrderingEnabled } from "@/lib/pricing/store-order-feature";
import { StorefrontWorkspace } from "@/components/storefront-workspace";
import type { StoreCostAccess } from "@/components/store-cost-panel";
import { hasFeatureRollout, isFeatureEnabled } from "@/lib/feature-flags";
import { getStoreMemberContext } from "@/lib/store/07-store-member-context";
import { canAccessStoreCosts } from "@/domains/organization/store-cost-access";
import { isCiLayoutFixturesEnabled } from "@/lib/ci-layout-fixtures";
import { PublicStoreTestBanner } from "@/components/public-store-test-banner";
import { StoreAddressManagementPanel } from "@/components/store-address-management-panel";
import { isStoreAddressCompanyEnabled } from "@/lib/store/07-store-address-management";
import { listStorePortalAccounts } from "@/lib/store/07-store-portal";
import { StorePortal } from "@/components/store-portal";

export const dynamic = "force-dynamic";

export default async function StorePage({ searchParams }: {
  searchParams?: Promise<Record<string, string | string[] | undefined>>;
}) {
  if (!priceSheetsEnabled() || !storeOrderingEnabled()) notFound();
  const params = await searchParams ?? {};
  let costAccess: StoreCostAccess = null;
  const companyId = typeof params.companyId === "string" ? params.companyId : "";
  const storeAccountId = typeof params.storeAccountId === "string" ? params.storeAccountId : "";
  const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
  if (isFeatureEnabled("STORE_COSTS", companyId)) {
    costAccess = { message: "매장 구성원 로그인과 매장 주소를 확인해 주세요." };
    if (uuid.test(companyId) && uuid.test(storeAccountId)) {
      try {
        const member = await getStoreMemberContext({ companyId, storeAccountId });
        if (member && canAccessStoreCosts(member.role, "read")) {
          costAccess = { companyId, storeAccountId, canManage: canAccessStoreCosts(member.role, "manage") };
        }
      } catch { costAccess = { message: "매장 권한을 확인하지 못했습니다. 잠시 후 다시 시도해 주세요." }; }
    }
  } else if (hasFeatureRollout("STORE_COSTS") && !companyId) {
    costAccess = { message: "원가관리는 구성원 전용 매장 주소에서 이용할 수 있습니다. 점주에게 주소를 확인해 주세요." };
  }
  // Synthetic UI-only fixtures: no session, database, or operating feature switch.
  if (isCiLayoutFixturesEnabled() && /^store-cost-(owner|manager|staff)$/.test(String(params.fixture))) {
    costAccess = { companyId: "00000000-0000-4000-8000-000000000001",
      storeAccountId: "20000000-0000-4000-8000-000000000001", canManage: params.fixture !== "store-cost-staff" };
  }
  if (isCiLayoutFixturesEnabled() && params.fixture === "store-cost-access-error") {
    costAccess = { message: "매장 구성원 로그인과 매장 주소를 확인해 주세요." };
  }
  const rawError = typeof params.error === "string" ? params.error : "";
  const knownErrors = ["store_login_unavailable", "store_membership_required", "store_activation_required",
    "business_status_verification_required", "missing_kakao_code", "kakao_token_failed", "kakao_user_failed", "kakao_callback_failed"];
  const errorCode = rawError ? (knownErrors.includes(rawError) ? rawError : "unknown") : undefined;
  const scoped = uuid.test(companyId) && uuid.test(storeAccountId);
  let storeLogin: StoreKakaoLogin | null = (scoped || errorCode) && !(costAccess && "companyId" in costAccess)
    ? { enabled: storeMemberSessionEnabled(), ...(scoped ? { companyId, storeAccountId } : {}), errorCode } : null;
  if (isCiLayoutFixturesEnabled() && params.fixture === "store-kakao-login") {
    storeLogin = { enabled: true, companyId: "00000000-0000-4000-8000-000000000001", storeAccountId: "20000000-0000-4000-8000-000000000001", errorCode };
  }
  let addressAccess = false;
  if (scoped && isStoreAddressCompanyEnabled(companyId)) {
    try { const member = await getStoreMemberContext({ companyId, storeAccountId });
      addressAccess = member?.role === "owner" || member?.role === "manager"; } catch { addressAccess = false; }
  }
  if (scoped && isCiLayoutFixturesEnabled() && params.fixture === "store-address-management") addressAccess = true;
  let accounts: Awaited<ReturnType<typeof listStorePortalAccounts>> = null;
  let portalError = false;
  try { accounts = await listStorePortalAccounts(); } catch { portalError = true; }
  if (isCiLayoutFixturesEnabled() && params.fixture === "store-portal-source-document") {
    portalError = false; addressAccess = Boolean(scoped);
    accounts = [{companyId:"00000000-0000-4000-8000-000000000001",storeAccountId:"20000000-0000-4000-8000-000000000001",
      customerName:"합성 공개 가입 매장",hasCostAccess:false,canManageMembers:true,canManageAddress:true,
      documents:[{title:"합성 가입 단가표",kind:"sheet",href:"/pricing-document#synthetic-source",canOrder:false,validUntil:"2099-12-31"}]}];
  }
  // CX-11 직접 가입 화면 픽스처(CI 전용, 세션·DB 없음): guest=로그인 전, new=로그인했고 매장 없음(입력 폼), profile=가입 직후 홈.
  const directFixture = isCiLayoutFixturesEnabled() && /^store-direct-signup-(guest|new|profile)$/.test(String(params.fixture)) ? String(params.fixture) : undefined;
  if (directFixture) { portalError = false; accounts = directFixture === "store-direct-signup-guest" ? null : []; }
  return <><meta name="referrer" content="no-referrer" /><PublicStoreTestBanner />
    {addressAccess && <div className="mx-auto max-w-6xl px-5 pt-5"><a className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-teal-700 bg-white px-4 font-medium text-teal-800 sm:w-auto" href="#store-address-management">배송지 주소 확인·수정</a></div>}
    <StorefrontWorkspace key={costAccess && "companyId" in costAccess ? `${costAccess.companyId}:${costAccess.storeAccountId}` : "public"} costAccess={costAccess} storeLogin={storeLogin} portal={<StorePortal accounts={accounts} fixture={directFixture} error={portalError} loginEnabled={directFixture ? true : storeMemberSessionEnabled()} />} />
    {addressAccess && <main id="store-address-management" className="mx-auto max-w-6xl scroll-mt-4 p-5"><StoreAddressManagementPanel companyId={companyId} storeAccountId={storeAccountId} /></main>}</>;
}
