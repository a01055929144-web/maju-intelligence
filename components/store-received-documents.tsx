import Link from "next/link";
import type { StorePortalAccount } from "@/lib/store/07-store-portal";
import { EmptyState } from "./ui/state";
import { StoreSettlementAccountCard } from "./store-settlement-account-card";

type Document = StorePortalAccount["documents"][number];

export function StoreReceivedDocuments({ account, industry, today, cutoff, cartHref, industryHref, documentHref, orderHref }: {
  account: StorePortalAccount;
  industry?: string;
  today: string;
  cutoff?: string;
  cartHref?: string;
  industryHref: (industry?: string) => string;
  documentHref: (document: Document) => string;
  orderHref: (document: Document) => string;
}) {
  const industryOf = (document: Document) => document.industry || account.businessType;
  const industries = Array.from(new Set(account.documents.map(industryOf).filter((value): value is string => Boolean(value))));
  const selected = industry && industries.includes(industry) ? industry : undefined;
  const documents = selected ? account.documents.filter(document => industryOf(document) === selected) : account.documents;

  return (
    <div className="grid items-start gap-4 lg:grid-cols-[9rem_minmax(0,1fr)_14rem]">
      <nav aria-label="단가표 업종" className="flex flex-wrap gap-2 lg:flex-col">
        {[undefined, ...industries].map(value => (
          <Link key={value ?? ""} href={industryHref(value)} aria-current={selected === value ? "page" : undefined}
            className={`flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium ${selected === value ? "border-teal-700 bg-teal-50 text-teal-900" : "border-slate-200 text-slate-700"}`}>
            {value ?? "전체 업종"}
          </Link>
        ))}
      </nav>
      <section aria-labelledby="store-received-heading" className="min-w-0 space-y-3">
        <h3 id="store-received-heading" className="text-lg font-semibold">받은 단가표</h3>
        {documents.length ? (
          <ul className="space-y-3">
            {documents.map(document => {
              const expired = document.validUntil < today;
              return (
                <li key={document.href} className={`rounded-lg border p-4 ${expired ? "bg-slate-50 text-slate-600" : "bg-white"}`}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div className="min-w-0 space-y-1">
                      <p className="text-sm text-slate-600">{[industryOf(document), account.companyName, document.kind === "quote" ? "견적서" : "단가표"].filter(Boolean).join(" · ")}</p>
                      <h4 className="break-words font-semibold">{document.title}</h4>
                      <p className="text-sm text-slate-600">
                        {expired ? "기간 지남 · " : ""}유효기간 {document.validUntil}
                        {document.itemCount === undefined ? "" : ` · ${document.itemCount}개 품목`}
                      </p>
                    </div>
                    <div className="flex flex-wrap gap-2">
                      <Link className="inline-flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium text-teal-800"
                        href={documentHref(document)}>문서 보기</Link>
                      {!expired && document.canOrder && <Link className="maju-button-primary inline-flex min-h-11 items-center px-3 text-sm"
                        href={orderHref(document)}>보고 주문</Link>}
                    </div>
                  </div>
                </li>
              );
            })}
          </ul>
        ) : <EmptyState bare message="받은 단가표가 없습니다." description="유통사 담당자에게 단가표 공유를 요청해 주세요." />}
      </section>
      <aside aria-label="다음 주문" className="space-y-3 rounded-lg border bg-white p-4">
        <StoreSettlementAccountCard account={account.settlementAccount} compact />
        <div className="space-y-1">
          <h3 className="font-semibold">다음 주문 마감</h3>
          {account.companyName && <p className="text-sm font-medium text-slate-900">{account.companyName}</p>}
          <p className="text-sm tabular-nums text-slate-700">{cutoff ?? "확인 가능한 마감이 없습니다."}</p>
        </div>
        {cartHref && <Link className="flex min-h-11 items-center rounded-lg border px-3 text-sm font-medium" href={cartHref}>장바구니 열기</Link>}
        {account.catalogHref && <Link className="maju-button-primary flex min-h-11 items-center px-3 text-sm" href={account.catalogHref}>전체 품목으로 주문</Link>}
      </aside>
    </div>
  );
}
