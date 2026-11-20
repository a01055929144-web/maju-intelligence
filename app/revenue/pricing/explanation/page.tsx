import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { CustomerAppShell } from "@/components/customer-app-shell";
import { PricingTabs } from "@/components/pricing-tabs";
import { canManagePriceSheets } from "@/domains/pricing/access";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { isFeatureEnabled } from "@/lib/feature-flags";
import { priceSheetsEnabled } from "@/lib/pricing/feature";
import { readPriceExplanation, searchPriceExplanationOptions } from "@/lib/pricing/price-explanation";
import { companyUsesStorePrices } from "@/lib/pricing/store-price-usage";

export const dynamic = "force-dynamic";
type Params = { companyId?: string; storeQ?: string; productQ?: string; customerId?: string; productId?: string };
const won = (value: number) => `${value.toLocaleString("ko-KR")}원`;
const href = (params: Record<string, string | undefined>) => `/revenue/pricing/explanation?${new URLSearchParams(Object.entries(params).filter((entry): entry is [string, string] => Boolean(entry[1]))).toString()}`;

export default async function PriceExplanationPage({ searchParams }: { searchParams?: Promise<Params> }) {
  if (!priceSheetsEnabled()) notFound();
  const query = await searchParams || {};
  const customer = await getCustomerSession(), admin = await getAdminSession();
  if (!customer && !admin) redirect("/dashboard/login");
  const companyId = resolvePageCompanyId(customer, admin, query.companyId);
  if (!companyId || !isFeatureEnabled("PRICING", companyId) || !isFeatureEnabled("PRICE_EXPLANATION", companyId) || (customer && (!canManagePriceSheets(customer) || !customerHasCapability(customer, "manage_sales")))) notFound();
  const preview = Boolean(admin && !customer), companyParam = preview ? companyId : undefined;
  const [{ customers, products }, explanation, showStorePrices] = await Promise.all([
    searchPriceExplanationOptions(companyId, query.storeQ || "", query.productQ || ""),
    query.customerId && query.productId ? readPriceExplanation(companyId, query.customerId, query.productId) : Promise.resolve(null),
    companyUsesStorePrices(companyId),
  ]);
  const common = { companyId: companyParam, storeQ: query.storeQ, productQ: query.productQ, customerId: query.customerId, productId: query.productId };
  const steps = explanation ? [
    { name: "계약 단가", value: explanation.agreement?.price, selected: explanation.current?.source === "store", detail: explanation.agreement ? (explanation.agreement.acceptedQuote ? "수락한 견적에서 확정된 계약 단가입니다." : "이 매장에 등록된 개별 계약 단가입니다.") : "적용 중인 계약 단가가 없습니다." },
    { name: "등급 단가", value: explanation.gradePrice, selected: explanation.current?.source === "grade", detail: explanation.gradePrice ? "서버의 매장 등급·마진 템플릿 결과입니다." : "적용할 등급 단가가 없습니다." },
    { name: "기본 판매가", value: explanation.basePrice, selected: explanation.current?.source === "base", detail: explanation.basePrice ? "가격 관리에 등록된 현재 기본 판매가입니다." : "사용 가능한 기본 판매가가 없습니다." },
  ] : [];
  return <CustomerAppShell headerNav={<PricingTabs active="catalog" previewCompanyId={companyParam} showStorePrices={showStorePrices} />} active="revenue" companyName={customer?.companyName || "선택 고객사"} mode={preview ? "admin-preview" : "customer"} previewCompanyId={companyParam} title="단가 근거" userName={customer?.name || admin?.name} workspaceRole={customer?.workspaceRole}>
    <main className="mx-auto w-full max-w-6xl space-y-6 pb-12">
      <header className="space-y-2"><div className="flex flex-wrap items-center justify-between gap-3"><h1 className="text-2xl font-bold tracking-tight text-slate-950">단가 근거 보기</h1><Link className="text-sm font-semibold text-blue-700 underline-offset-4 hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" href={`/revenue/pricing/catalog${companyParam ? `?companyId=${encodeURIComponent(companyParam)}` : ""}`}>카탈로그로 돌아가기</Link></div><p className="max-w-3xl text-sm leading-6 text-slate-600">매장과 상품을 선택하면 서버가 정한 일반 주문 단가의 출처와 우선순위를 그대로 설명합니다. 이 화면에서 가격을 계산하거나 변경하지 않습니다.</p></header>
      <section className="grid gap-4 lg:grid-cols-2" aria-label="조회 대상 선택">
        <SearchPanel title="매장 찾기" name="storeQ" value={query.storeQ || ""} hidden={common} placeholder="매장명 검색" results={customers.map(item => ({ ...item, href: href({ ...common, customerId: item.id }) }))} selectedId={query.customerId} />
        <SearchPanel title="상품 찾기" name="productQ" value={query.productQ || ""} hidden={common} placeholder="상품명 검색" results={products.map(item => ({ ...item, href: href({ ...common, productId: item.id }) }))} selectedId={query.productId} />
      </section>
      {query.customerId && query.productId && !explanation ? <p className="rounded-xl border border-amber-300 bg-amber-50 px-4 py-3 text-sm text-amber-950">이 회사에 속한 활성 매장과 상품 조합을 찾지 못했습니다. 검색 결과에서 다시 선택해 주세요.</p> : null}
      {explanation ? <section className="space-y-5" aria-labelledby="result-title">
        <div className="rounded-2xl bg-slate-950 p-5 text-white sm:p-6"><p className="text-sm text-slate-300">{explanation.customer.name} · {explanation.product.name}</p><div className="mt-3 flex flex-wrap items-end justify-between gap-4"><div><h2 id="result-title" className="text-xl font-bold">현재 일반 주문 단가</h2><p className="mt-1 text-sm text-slate-300">{explanation.date} 기준 · {explanation.product.unit}</p></div><p className="text-3xl font-bold tabular-nums">{explanation.product.market ? "시세 상품" : explanation.current ? won(explanation.current.price) : "가격 미등록"}</p></div></div>
        {explanation.product.market ? <div className="rounded-xl border border-sky-200 bg-sky-50 p-5 text-sm leading-6 text-sky-950"><h3 className="font-bold">고정 단가를 표시하지 않는 상품입니다</h3><p className="mt-1">이 상품은 시세 방식으로 관리되어 주문 시점의 별도 가격 확인이 필요합니다.</p></div> : <div className="grid gap-3">
          {steps.map((step, index) => <article key={step.name} className={`rounded-xl border p-4 ${step.selected ? "border-blue-500 bg-blue-50" : "border-slate-200 bg-white"}`}><div className="flex flex-wrap items-start justify-between gap-3"><div className="flex min-w-0 gap-3"><span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-sm font-bold ${step.selected ? "bg-blue-700 text-white" : "bg-slate-100 text-slate-600"}`}>{index + 1}</span><div><h3 className="font-bold text-slate-950">{step.name}</h3><p className="mt-1 text-sm leading-6 text-slate-600">{step.detail}</p></div></div><div className="text-right"><p className="font-bold tabular-nums text-slate-950">{step.value ? won(step.value) : "없음"}</p><p className={`mt-1 text-xs font-semibold ${step.selected ? "text-blue-700" : "text-slate-500"}`}>{step.selected ? "현재 적용" : step.value ? "상위 단가 우선" : "미적용"}</p></div></div></article>)}
        </div>}
        {!explanation.product.market && explanation.promotions.length ? <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-5"><h3 className="font-bold text-emerald-950">선택 가능한 행사 단가</h3><p className="mt-1 text-sm leading-6 text-emerald-900">아래 행사는 이 매장에 적용 가능하지만, 행사 상품을 선택할 때만 사용됩니다. 위 일반 주문 단가를 자동으로 바꾸지 않습니다.</p><ul className="mt-3 divide-y divide-emerald-200">{explanation.promotions.map(promo => <li key={promo.id} className="flex flex-wrap justify-between gap-2 py-3 text-sm"><span className="font-semibold text-emerald-950">{promo.badge} · {promo.name}</span><span className="tabular-nums text-emerald-950">{won(promo.price)} · {promo.endsOn}까지</span></li>)}</ul></div> : null}
      </section> : <div className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-5 py-10 text-center"><h2 className="font-bold text-slate-900">매장과 상품을 선택해 주세요</h2><p className="mt-2 text-sm text-slate-600">두 항목을 모두 선택하면 단가가 결정된 순서를 확인할 수 있습니다.</p></div>}
    </main>
  </CustomerAppShell>;
}

function SearchPanel({ title, name, value, hidden, placeholder, results, selectedId }: { title: string; name: "storeQ" | "productQ"; value: string; hidden: Record<string, string | undefined>; placeholder: string; results: Array<PriceExplanationOptionWithHref>; selectedId?: string }) {
  return <div className="rounded-xl border border-slate-200 bg-white p-4"><h2 className="font-bold text-slate-950">{title}</h2><form className="mt-3 flex gap-2"><input type="hidden" name="companyId" value={hidden.companyId || ""} />{Object.entries(hidden).filter(([key, item]) => key !== "companyId" && key !== name && item).map(([key, item]) => <input key={key} type="hidden" name={key} value={item} />)}<label className="sr-only" htmlFor={name}>{placeholder}</label><input id={name} name={name} defaultValue={value} placeholder={placeholder} className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-950 outline-none placeholder:text-slate-500 focus:border-blue-600 focus:ring-2 focus:ring-blue-100" /><button className="shrink-0 rounded-lg bg-slate-900 px-4 py-2 text-sm font-semibold text-white hover:bg-slate-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600" type="submit">검색</button></form>{results.length ? <ul className="mt-3 max-h-60 divide-y divide-slate-100 overflow-y-auto">{results.map(item => <li key={item.id}><Link aria-current={selectedId === item.id ? "true" : undefined} href={item.href} className={`block px-2 py-3 text-sm hover:bg-slate-50 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 ${selectedId === item.id ? "bg-blue-50" : ""}`}><span className="block font-semibold text-slate-950">{item.name}</span><span className="mt-0.5 block truncate text-slate-600">{item.detail}</span></Link></li>)}</ul> : value ? <p className="mt-4 text-sm text-slate-600">검색 결과가 없습니다.</p> : <p className="mt-4 text-sm text-slate-500">이름을 입력해 검색하세요.</p>}</div>;
}

type PriceExplanationOptionWithHref = { id: string; name: string; detail: string; href: string };
