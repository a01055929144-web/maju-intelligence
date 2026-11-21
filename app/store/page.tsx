import { cookies } from "next/headers";
import { StoreAppShell } from "@/components/store-app-shell";
import Link from "next/link";
import { PublicPricingDocument } from "@/components/public-pricing-document";
import { ErrorState } from "@/components/ui/state";
import { StoreMemberViews } from "@/components/store-member-views";
import { STORE_VIEWS, storeViewFrom } from "@/lib/store-navigation";
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
import { listStorePortalAccounts, listStorePortalOrders, type StorePortalOrder } from "@/lib/store/07-store-portal";
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
  const directFixture = isCiLayoutFixturesEnabled() && /^store-direct-signup-(guest|new|profile|connected)$/.test(String(params.fixture)) ? String(params.fixture) : undefined;
  if (directFixture) { portalError = false; accounts = directFixture === "store-direct-signup-guest" ? null : directFixture === "store-direct-signup-connected"? [{ companyId: "00000000-0000-4000-8000-000000000001", storeAccountId: "20000000-0000-4000-8000-0000000000c1", customerName: "합성 연결 유통 매장", hasCostAccess: false, canManageMembers: false, canManageAddress: false, documents: [] }] : []; }
  const fixture = isCiLayoutFixturesEnabled() && (params.fixture === "s1-single" || params.fixture === "s1-multi" || params.fixture === "s6-history" || params.fixture === "s4-documents" || params.fixture === "cx63-price-search") ? params.fixture : null;
  const legacyFixture = isCiLayoutFixturesEnabled() && params.fixture === "store-portal-source-document";
  const fixtureAccounts = fixture ? Array.from({ length: fixture === "s1-multi" ? 2 : 1 }, (_, index) => ({
    companyId: "00000000-0000-4000-8000-000000000001",
    storeAccountId: `20000000-0000-4000-8000-00000000000${index + 1}`,
    ...(fixture === "s4-documents" ? { businessType: "농산", companyName: "합성 유통", catalogHref: "/store?view=order#synthetic-catalog" } : {}),
    customerName: index === 0 ? "합성 가 매장" : "합성 나 매장",
    settlementAccount: { bank: "합성은행", number: "123-456-7890", holder: "합성 유통" },
    hasCostAccess: index === 0, canManageMembers: index === 0,
    canManageAddress: false,
    documents: fixture === "cx63-price-search" ? [
      { title: "합성 받은 단가표", kind: "sheet" as const, href: "/store#synthetic-cx63-sheet", canOrder: true, validUntil: "2099-12-31" },
      { title: "합성 받은 견적서", kind: "quote" as const, href: "/pricing-document#synthetic-cx63-quote", canOrder: false, validUntil: "2099-12-31" },
    ] : fixture === "s4-documents" ? [
      { title: "합성 농산 단가표", industry: "농산", kind: "sheet" as const, href: "/store#synthetic-s4-valid", canOrder: true, validUntil: "2099-12-31", itemCount: 8 },
      { title: "합성 기간 지난 단가표", industry: "주류", kind: "sheet" as const, href: "/store#synthetic-s4-expired", canOrder: false, validUntil: "2000-01-01", itemCount: 3 },
    ] : index === 0 ? [
      { title: "합성 주문 문서", kind: "sheet" as const, href: "/store#synthetic-s1-order", canOrder: true, validUntil: "2099-12-31" },
      { title: "합성 공유 문서", kind: "sheet" as const, href: "/pricing-document#synthetic-s3-share", canOrder: false, validUntil: "2099-12-31" },
    ] : [],
  })) : null;
  const memberAccounts = fixtureAccounts ?? (directFixture || legacyFixture ? [] : accounts ?? []);
  const keyOf = (account: { companyId: string; storeAccountId: string }) => `${account.companyId}:${account.storeAccountId}`;
  const cookie = (await cookies()).get("maju_store_choice")?.value;
  const preferred = scoped ? `${companyId}:${storeAccountId}` : cookie;
  const selected = memberAccounts.find(account => keyOf(account) === preferred) ??
    (memberAccounts.length === 1 ? memberAccounts[0] : undefined);
  const view = storeViewFrom(typeof params.view === "string" ? params.view : scoped && costAccess && "companyId" in costAccess ? "data" : undefined);
  const storeHref = (nextView: string, account?: typeof selected) => {
    const next = new URLSearchParams({ view: nextView });
    if (account && memberAccounts.length > 1) {
      next.set("companyId", account.companyId);
      next.set("storeAccountId", account.storeAccountId);
    }
    if (fixture) next.set("fixture", fixture);
    return `/store?${next}`;
  };
  const stores = memberAccounts.map(account => ({ key: keyOf(account), name: account.customerName, href: storeHref(view, account) }));
  const historyDetails = fixture === "s6-history" || Boolean(selected && isFeatureEnabled("STORE_ORDER_HISTORY", selected.companyId));
  let orders: StorePortalOrder[] = [], historyError = false;
  if (view === "history" && selected) {
    if (fixture === "s6-history") orders = [{
      id: "synthetic-delivered", delivery_date: "2099-01-02", status: "delivered", known_total: 11100,
      submitted_at: "2099-01-01T00:00:00Z", has_market_price: true, lines: [
        { id: "synthetic-line-1", product_name: "합성 양파", specification: "10 kg", sales_unit: "박스", quantity: 1, unit_price: 11100, total_amount: 11100 },
        { id: "synthetic-line-2", product_name: "합성 대파", specification: "1 kg", sales_unit: "단", quantity: 2, unit_price: null, total_amount: null },
      ],
      document: { id: "30000000-0000-4000-8000-000000000001", revision: 2, documentNumber: "합성-명세서-001", totalAmount: 11100,
        lines: [{ id: "line-1", name: "합성 양파", specification: "10kg", unit: "망", quantity: 1, unitPrice: 10000, lineAmount: 10000 }, { id: "line-2", name: "배송비", unit: "건", quantity: 1, unitPrice: 1100, lineAmount: 1100 }] },
    }];
    else if (fixture) orders = [{ id: "synthetic-order", delivery_date: "2099-01-02", status: "submitted", known_total: selected === memberAccounts[0] ? 11100 : 22200, submitted_at: "2099-01-01T00:00:00Z", has_market_price: false }];
    else {
      try { orders = await listStorePortalOrders(selected, historyDetails); } catch { historyError = true; }
    }
  }
  // Only documents already visible to the selected member can be embedded.
  const documentKey = (href: string) => {
    const [path, token] = href.split("#");
    return `${path === "/pricing-document" ? "shared" : "issued"}-${token?.split(".")[0] ?? ""}`;
  };
  const requestedDocument = view === "home" && typeof params.document === "string" ? params.document : null;
  const openedDocument = requestedDocument && selected?.documents.find(document => documentKey(document.href) === requestedDocument);
  const homeHref = storeHref("home", selected);
  const documentView = requestedDocument ? <div className="space-y-3">
    <Link className="inline-flex min-h-11 items-center underline" href={homeHref}>받은 문서 목록</Link>
    {openedDocument ? openedDocument.href.startsWith("/pricing-document#")
      ? <PublicPricingDocument key={requestedDocument} embedded={{ token: openedDocument.href.split("#")[1], orderHref: storeHref("order", selected) }} />
      : <StorefrontWorkspace key={requestedDocument} previewToken={openedDocument.href.split("#")[1]} />
      : <ErrorState message="받은 문서를 사용할 수 없습니다." description="선택한 매장과 링크의 열람기간을 확인해 주세요." />}
  </div> : null;
  const receivedDocuments = Boolean(selected && view === "home" && !requestedDocument &&
    (fixture === "s4-documents" || isFeatureEnabled("STORE_RECEIVED_DOCUMENTS_HOME", selected.companyId)));
  const orderHref = selected?.documents.find(document => document.canOrder && document.href.startsWith("/store#"))?.href;
  const scheduleHref = orderHref ?? selected?.catalogHref;
  let cutoff: string | undefined;
  if (receivedDocuments && fixture === "s4-documents") cutoff = "2099-01-01 22:00";
  else if (receivedDocuments && scheduleHref) {
    try {
      const { readStorefront } = await import("@/lib/pricing/storefront");
      const storefront = await readStorefront(scheduleHref.split("#")[1]);
      if (storefront?.canOrder && storefront.nextDeliveryDate) {
        const day = new Date(`${storefront.nextDeliveryDate}T00:00:00Z`);
        day.setUTCDate(day.getUTCDate() - storefront.policy.cutoffDaysBefore);
        cutoff = `${day.toISOString().slice(0, 10)} ${storefront.policy.cutoffTime.slice(0, 5)}`;
      }
    } catch { /* Documents remain available when delivery policy cannot be read. */ }
  }
  const documentHref = (document: { href: string }) =>
    `${homeHref}&document=${encodeURIComponent(documentKey(document.href))}`;
  const home = selected ? <StorePortal accounts={[selected]} loginEnabled memberView documentHref={documentHref} /> : null;
  const ReceivedDocuments = receivedDocuments ? (await import("@/components/store-received-documents")).StoreReceivedDocuments : null;
  const PriceSearch = selected && view === "home" && !requestedDocument &&
    (fixture === "cx63-price-search" || isFeatureEnabled("STORE_PRICE_SEARCH", selected.companyId))
    ? (await import("@/components/store-price-search")).StorePriceSearch : null;
  const memberView = memberAccounts.length ? <StoreMemberViews
    key={selected ? keyOf(selected) : "choose"} account={selected} view={view} stores={stores}
    deliveryPhotosEnabled={Boolean(selected && isFeatureEnabled("DELIVERY_ORDER_PHOTOS", selected.companyId))}
    menu={STORE_VIEWS.map(value => storeHref(value, selected))}
    orders={orders} historyError={historyError} historyDetails={historyDetails} documentView={documentView}
    home={<>
      {selected && PriceSearch && <PriceSearch companyId={selected.companyId} storeAccountId={selected.storeAccountId}
        documents={selected.documents.map(document => ({ key: documentKey(document.href), title: document.title, kind: document.kind }))} />}
      {selected && ReceivedDocuments ? <>
      <div className="md:hidden">{home}</div>
      <div className="hidden md:block">
        <ReceivedDocuments account={selected} today={new Date().toLocaleDateString("sv-SE", { timeZone: "Asia/Seoul" })}
          industry={typeof params.industry === "string" ? params.industry : undefined} cutoff={cutoff}
          cartHref={orderHref?.replace("/store#", "/store?view=order#") ?? selected.catalogHref}
          industryHref={industry => industry ? `${homeHref}&industry=${encodeURIComponent(industry)}` : homeHref}
          documentHref={documentHref}
          orderHref={document => document.href.replace("/store#", "/store?view=order#")} />
      </div>
      </> : home}
    </>}
  /> : null;
  return <><meta name="referrer" content="no-referrer" /><PublicStoreTestBanner /><StoreAppShell stores={stores} selectedStore={selected && memberAccounts.length > 1 ? keyOf(selected) : undefined}>
    {!memberView && addressAccess && <div className="mx-auto max-w-6xl px-5 pt-5"><a className="inline-flex min-h-[44px] w-full items-center justify-center rounded-lg border border-teal-700 bg-white px-4 font-medium text-teal-800 sm:w-auto" href="#store-address-management">배송지 주소 확인·수정</a></div>}
    <StorefrontWorkspace key={costAccess && "companyId" in costAccess ? `${costAccess.companyId}:${costAccess.storeAccountId}` : "public"} costAccess={costAccess} storeLogin={storeLogin} memberView={memberView} portal={<StorePortal accounts={accounts} fixture={directFixture} error={portalError} loginEnabled={directFixture ? true : storeMemberSessionEnabled()} view={view} />} />
    {!memberView && addressAccess && <main id="store-address-management" className="mx-auto max-w-6xl scroll-mt-4 p-5"><StoreAddressManagementPanel companyId={companyId} storeAccountId={storeAccountId} /></main>}</StoreAppShell></>;
}
