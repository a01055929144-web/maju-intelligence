import { PublicQuoteActions } from "@/components/public-quote-actions";
import { getPublicSalesQuote } from "@/lib/store";

export const dynamic = "force-dynamic";

export default async function PublicQuotePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const quote = await getPublicSalesQuote(token);
  if (!quote) {
    return (
      <main className="grid min-h-screen place-items-center bg-slate-100 px-4 py-10 text-slate-950">
        <section className="w-full max-w-lg rounded-2xl border border-slate-200 bg-white px-6 py-10 text-center shadow-sm sm:px-10">
          <div className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-teal-700 text-lg font-black text-white" aria-hidden="true">
            M
          </div>
          <p className="mt-4 text-sm font-bold tracking-wide text-teal-700">MAJU Intelligence</p>
          <h1 className="mt-5 text-2xl font-black tracking-tight">견적서를 확인할 수 없습니다</h1>
          <p className="mt-3 text-sm font-medium leading-6 text-slate-600">
            이 견적 링크가 만료되었거나 더 이상 유효하지 않습니다.<br className="hidden sm:block" /> 담당 영업사원에게 새 견적을 요청해주세요.
          </p>
          <div className="mt-7 rounded-xl bg-slate-50 px-4 py-3 text-xs font-semibold leading-5 text-slate-500">
            견적 링크는 발행 시 설정된 유효기간 동안만 열람할 수 있습니다.
          </div>
        </section>
      </main>
    );
  }
  return (
    <main className="min-h-screen bg-slate-100 px-4 py-8 text-slate-950 print:bg-white print:p-0">
      <article className="mx-auto max-w-4xl rounded-2xl border border-slate-200 bg-white p-6 shadow-sm print:border-0 print:shadow-none sm:p-10">
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-slate-200 pb-6">
          <div><p className="text-sm font-bold text-teal-700">{quote.companyName}</p><h1 className="mt-2 text-2xl font-black">{quote.title}</h1><p className="mt-2 text-sm text-slate-500">견적번호 {quote.quoteNumber}</p></div>
          <div className="text-right text-sm"><p className="font-bold">{quote.recipientName || "거래처 담당자"} 귀하</p><p className="mt-1 text-slate-500">유효기간 {new Date(quote.validUntil).toLocaleDateString("ko-KR")}까지</p></div>
        </header>
        <div className="mt-6 overflow-x-auto"><table className="w-full min-w-[620px] border-collapse text-sm"><thead><tr className="bg-slate-900 text-white"><th className="p-3 text-left">상품명</th><th className="p-3 text-left">규격·단위</th><th className="p-3 text-right">수량</th><th className="p-3 text-right">판매단가</th><th className="p-3 text-right">금액</th></tr></thead><tbody>{quote.items.map((item, index) => <tr className="border-b border-slate-200" key={`${item.productName}-${index}`}><td className="p-3 font-bold"><span className="flex items-center gap-3">{item.photoUrl ? <img alt="" className="h-12 w-12 rounded-lg object-cover" src={item.photoUrl} /> : null}<span>{item.productName}</span></span></td><td className="p-3">{[item.specification, item.unit].filter(Boolean).join(" / ")}</td><td className="p-3 text-right">{item.quantity.toLocaleString()}</td><td className="p-3 text-right">{item.salesUnitPrice.toLocaleString()}원</td><td className="p-3 text-right font-bold">{item.amount.toLocaleString()}원</td></tr>)}</tbody></table></div>
        <div className="mt-6 flex justify-end"><p className="text-xl font-black">합계 {quote.total.toLocaleString()}원</p></div>
        <p className="mt-8 rounded-xl bg-slate-50 p-4 text-sm leading-6 text-slate-600">본 견적은 표시된 유효기간 동안 확인할 수 있습니다. 실제 납품 조건과 재고는 담당자와 최종 협의 후 확정됩니다.</p>
        <PublicQuoteActions quote={quote} />
        <p className="mt-3 text-center text-xs font-medium text-slate-500 print:hidden">공유 파일에는 판매단가와 판매금액만 포함되며 내부 매입가·마진 정보는 제외됩니다.</p>
      </article>
    </main>
  );
}
