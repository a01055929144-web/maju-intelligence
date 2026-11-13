import Link from "next/link";

// CC-30b: 가격 관리 세 화면(판매가·행사·임박·매장 가격)을 한 줄 탭으로 묶는다. 매장 가격 탭은 그 회사가 매장 가격을 쓰기 시작한 뒤에만(사이드 메뉴 "매장 가격"에서는 언제든 열 수 있음).
export type PricingTab = "catalog" | "promotions" | "store-prices";
const TABS: Array<{ key: PricingTab; label: string; href: string }> = [
  { key: "catalog", label: "카탈로그", href: "/revenue/pricing/catalog" },
  { key: "promotions", label: "행사·임박", href: "/revenue/pricing/promotions" },
  { key: "store-prices", label: "매장 가격", href: "/revenue/pricing/store-prices" },
];

export function PricingTabs({ active, showStorePrices, previewCompanyId }: { active: PricingTab; showStorePrices: boolean; previewCompanyId?: string }) {
  return <nav aria-label="가격 관리" className="flex gap-1 border-b border-slate-200">
    {TABS.filter((t) => t.key !== "store-prices" || showStorePrices || active === "store-prices").map((t) =>
      <Link aria-current={t.key === active ? "page" : undefined} className={`min-h-11 content-center px-4 text-sm font-bold ${t.key === active ? "border-b-2 border-teal-700 text-teal-800" : "text-slate-500 hover:text-slate-800"}`} href={previewCompanyId ? `${t.href}?companyId=${previewCompanyId}` : t.href} key={t.key}>{t.label}</Link>)}
  </nav>;
}
