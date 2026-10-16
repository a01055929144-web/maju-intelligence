import { redirect } from "next/navigation";
import { PrintPageButton } from "@/components/print-page-button";
import { customerHasCapability, getAdminSession, getCustomerSession, resolvePageCompanyId } from "@/lib/auth";
import { getBusinessDocument } from "@/lib/business-documents";
import { getCompanySettings } from "@/lib/store";

export const dynamic = "force-dynamic";
const money = (value: number) => `${Math.round(value).toLocaleString("ko-KR")}원`;

export default async function DocumentPrintPage({ params, searchParams }: { params: Promise<{ id: string }>; searchParams?: Promise<{ companyId?: string }> }) {
  const query = await searchParams;
  const customerSession = await getCustomerSession();
  const adminSession = await getAdminSession();
  if (!customerSession && !adminSession) redirect("/dashboard/login");
  if (customerSession && !customerHasCapability(customerSession, "manage_sales")) redirect("/dashboard");
  const companyId = resolvePageCompanyId(customerSession, adminSession, query?.companyId);
  if (!companyId) redirect("/admin/companies");
  const [document, company] = await Promise.all([getBusinessDocument(companyId, (await params).id), getCompanySettings(companyId)]);
  if (document.status !== "confirmed") redirect(`/operations/documents${query?.companyId ? `?companyId=${query.companyId}` : ""}`);
  return <main className="mx-auto min-h-screen max-w-[210mm] bg-white p-[14mm] text-slate-950 print:p-[8mm]">
    <style>{`@media print { @page { size: A4; margin: 8mm; } .print-hidden { display:none!important } body { background:white!important } }`}</style>
    <div className="print-hidden mb-5 flex justify-end"><PrintPageButton /></div>
    <header className="border-b-2 border-slate-900 pb-5 text-center"><h1 className="text-3xl font-black tracking-[0.3em]">거래명세서</h1><p className="mt-2 text-sm text-slate-500">{document.documentNumber} · {document.documentDate}</p></header>
    <section className="mt-6 grid grid-cols-2 gap-4 text-sm"><div className="rounded-xl border p-4"><b className="text-xs text-slate-500">공급자</b><h2 className="mt-2 text-lg font-bold">{company.name}</h2><p>{company.ownerName || "대표자 미등록"}</p><p>{company.originAddress || "주소 미등록"}</p></div><div className="rounded-xl border p-4"><b className="text-xs text-slate-500">공급받는자</b><h2 className="mt-2 text-lg font-bold">{document.partnerName}</h2><p>거래일 {document.documentDate}</p></div></section>
    <table className="mt-6 w-full border-collapse text-sm"><thead><tr className="bg-slate-100"><th className="border p-2 text-left">품목</th><th className="border p-2">규격</th><th className="border p-2">수량</th><th className="border p-2">단가</th><th className="border p-2">공급가액</th><th className="border p-2">부가세</th><th className="border p-2">합계</th></tr></thead><tbody>{document.lines.map((line) => <tr key={line.id}><td className="border p-2">{line.productName}</td><td className="border p-2">{line.specification || "-"}</td><td className="border p-2 text-right">{line.quantity} {line.unit}</td><td className="border p-2 text-right">{money(line.unitPrice)}</td><td className="border p-2 text-right">{money(line.supplyAmount)}</td><td className="border p-2 text-right">{money(line.taxAmount)}</td><td className="border p-2 text-right font-semibold">{money(line.totalAmount)}</td></tr>)}</tbody></table>
    <section className="ml-auto mt-5 grid max-w-sm grid-cols-2 gap-2 text-sm"><span>과세 공급가액</span><b className="text-right">{money(document.taxableSupplyAmount)}</b><span>면세 공급가액</span><b className="text-right">{money(document.exemptSupplyAmount)}</b><span>부가세</span><b className="text-right">{money(document.taxAmount)}</b><span className="border-t pt-2 text-lg font-bold">총액</span><b className="border-t pt-2 text-right text-lg">{money(document.totalAmount)}</b></section>
    {document.memo && <div className="mt-8 rounded-xl border p-4 text-sm"><b>비고</b><p className="mt-1 whitespace-pre-wrap">{document.memo}</p></div>}
  </main>;
}
