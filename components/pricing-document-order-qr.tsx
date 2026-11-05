"use client";
import { useState } from "react";
import type { DocumentVersion } from "@/domains/pricing/document";
import { documentOrderQr } from "@/lib/pricing/document-order-qr";
import { Button } from "./ui/button";

export type DocumentOrderQr = { dataUrl: string; customerName: string };
type Customer = { id: string; customer_name: string; address?: string | null };
export function PricingDocumentOrderQr({ companyId, version, onInsert }: {
  companyId: string; version: DocumentVersion; onInsert: (qr: DocumentOrderQr | null) => void;
}) {
  const [open, setOpen] = useState(false), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState(""), [qr, setQr] = useState<DocumentOrderQr | null>(null);
  async function load(after?: string) {
    setBusy(true); setMessage("");
    try {
      const params = new URLSearchParams({ companyId, customerPage: "1" });
      if (after) params.set("afterId", after);
      const response = await fetch(`/api/pricing-store-links?${params}`, { cache: "no-store" });
      const result = await response.json() as { items?: Customer[]; nextCursor?: string | null; message?: string };
      if (!response.ok || !Array.isArray(result.items)) throw new Error(result.message || "거래처를 불러오지 못했습니다.");
      const items = result.items;
      setCustomers(previous => after ? [...previous, ...items] : items);
      setCursor(result.nextCursor ?? null); setOpen(true);
    } catch (error) { setOpen(true); setMessage(error instanceof Error ? error.message : "거래처를 불러오지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function generate() {
    const customer = customers.find(item => item.id === selected);
    if (!customer) return;
    setBusy(true); setMessage(""); setQr(null); onInsert(null);
    try {
      const response = await fetch("/api/pricing-store-links", { method: "POST", headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyId, action: "create", customerId: customer.id, documentVersionId: version.id }) });
      const result = await response.json();
      if (!response.ok) throw new Error(result.message || "주문 링크를 만들지 못했습니다.");
      const dataUrl = await documentOrderQr(result.url);
      setQr({ dataUrl, customerName: customer.customer_name });
      setMessage(`${customer.customer_name} · 게시 버전 ${version.version} 주문 QR을 만들었습니다. 이 거래처에만 전달해 주세요.`);
    } catch (error) { setMessage(error instanceof Error ? error.message : "QR을 만들지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
  return <section className="pricing-no-print space-y-3 rounded border p-3" aria-label="주문 링크 QR">
    <Button disabled={busy} onClick={() => open ? setOpen(false) : void load()} type="button">주문 링크 QR 만들기</Button>
    {open ? <div className="space-y-3">
      <p className="text-sm">게시 버전 {version.version}의 거래처별 주문 링크를 만듭니다. 기존 활성 링크는 재사용합니다. QR은 이번 인쇄·PNG에만 넣으며 게시 원문은 바꾸지 않습니다.</p>
      <label className="block text-sm">QR을 받을 거래처<select disabled={busy} aria-label="QR을 받을 거래처" className="mt-1 min-h-11 w-full rounded border p-2" value={selected} onChange={event => { setSelected(event.target.value); setQr(null); onInsert(null); }}>
        <option value="">거래처 선택</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.customer_name}{customer.address ? ` · ${customer.address}` : ""}</option>)}
      </select></label>
      {!customers.length ? <p className="text-sm">거래처가 없습니다. 거래처 등록 상태를 확인하거나 다시 불러와 주세요.</p> : null}
      <div className="flex flex-wrap gap-2"><Button disabled={busy || !selected} onClick={() => void generate()} type="button">선택 거래처 QR 생성</Button><Button disabled={busy} onClick={() => void load()} type="button">거래처 다시 불러오기</Button>{cursor ? <Button disabled={busy} onClick={() => void load(cursor)} type="button">거래처 더 보기</Button> : null}</div>
      {qr ? <div className="space-y-2"><img src={qr.dataUrl} width={160} height={160} alt={`${qr.customerName} 주문 QR 미리보기`} /><div className="flex flex-wrap gap-2">
        <Button onClick={() => { onInsert(qr); setMessage("인쇄·PNG에 QR을 넣었습니다. 전달할 거래처와 버전을 확인해 주세요."); }} type="button">문서에 QR 넣기</Button>
        <Button onClick={() => { const a = document.createElement("a"); a.href = qr.dataUrl; a.download = `order-qr-v${version.version}.png`; a.click(); }} type="button">QR PNG 저장</Button>
        <Button onClick={() => { onInsert(null); setMessage("문서에서 QR을 뺐습니다. 발급된 주문 링크는 유지됩니다."); }} type="button">문서에서 QR 빼기</Button>
      </div></div> : null}
    </div> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
