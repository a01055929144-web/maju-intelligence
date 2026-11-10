"use client";
import { useRef, useState } from "react";
import type { DocumentVersion } from "@/domains/pricing/document";
import { documentLinkLastDay } from "@/domains/pricing/document-share";
import type { PreparedDocumentShare } from "@/domains/pricing/document-share";
import { documentRequest } from "@/lib/pricing/document-client";
import { documentOrderQr } from "@/lib/pricing/document-order-qr";
import { Button } from "./ui/button";

export type DocumentOrderQr = { dataUrl: string; customerName: string; audience?: "public"; expiresAt?: string };
type Customer = { id: string; customer_name: string; address?: string | null };
export function PricingDocumentOrderQr({ companyId, version, onInsert, publicSharingAvailable = false, allowCustomerLink = true, initiallyOpen = false }: {
  companyId: string; version: DocumentVersion; onInsert: (qr: DocumentOrderQr | null) => void;
  publicSharingAvailable?: boolean; allowCustomerLink?: boolean;
  initiallyOpen?: boolean;
}) {
  const [open, setOpen] = useState(initiallyOpen), [busy, setBusy] = useState(false), [message, setMessage] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]), [cursor, setCursor] = useState<string | null>(null);
  const [selected, setSelected] = useState(""), [qr, setQr] = useState<DocumentOrderQr | null>(null);
  const [customerMode, setCustomerMode] = useState(!publicSharingAvailable);
  const [shared, setShared] = useState<PreparedDocumentShare | null>(null);
  const retryKey = useRef<string | null>(null);
  async function generatePublic() {
    setBusy(true); setMessage(""); setQr(null); onInsert(null);
    let stage: "request" | "address" | "qr" = "request";
    try {
      retryKey.current ??= crypto.randomUUID();
      const { result } = await documentRequest<PreparedDocumentShare>(companyId, "prepare-share", {
        documentId: version.documentId, documentVersionId: version.id, leadId: null, idempotencyKey: retryKey.current,
      }, true);
      stage = "address";
      const url = new URL(result.publicUrl, window.location.origin);
      if (url.origin !== window.location.origin || url.pathname !== "/pricing-document" || url.search || !url.hash || !Number.isFinite(Date.parse(result.expiresAt)))
        throw new Error("공개 링크를 확인하지 못했습니다. 다시 시도해 주세요.");
      setShared({ ...result, publicUrl: url.href });
      stage = "qr";
      setQr({ dataUrl: await documentOrderQr(url.href), customerName: "공개 문서", audience: "public", expiresAt: result.expiresAt });
      setMessage("거래처 선택 없이 공개 링크를 만들었습니다. 열람은 가입·주문·전달 기록을 만들지 않습니다.");
    } catch (error) {
      setMessage(stage === "qr" ? "공개 링크는 발급됐지만 QR 이미지를 만들지 못했습니다. 공개 링크를 복사해 사용하거나 같은 버튼으로 다시 시도해 주세요." :
        stage === "address" ? "발급된 공개 주소를 확인하지 못했습니다. 같은 버튼으로 다시 시도하거나 담당자에게 문의해 주세요." :
          `${error instanceof Error ? error.message : "공개 링크를 만들지 못했습니다."} 같은 생성 버튼으로 다시 시도해 주세요.`);
    }
    finally { setBusy(false); }
  }
  async function revokePublic() {
    if (!shared) return;
    setBusy(true);
    try {
      await documentRequest(companyId, "revoke-share", { shareLinkId: shared.shareLinkId }, true);
      setShared(null);
      if (qr?.audience === "public") { setQr(null); onInsert(null); }
      retryKey.current = null;
      setMessage("공개 링크를 회수했습니다. 인쇄된 QR도 열리지 않습니다. 새 링크를 만들 수 있습니다.");
    } catch (error) { setMessage(error instanceof Error ? error.message : "회수하지 못했습니다. 다시 시도해 주세요."); }
    finally { setBusy(false); }
  }
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
  const step = "space-y-2 rounded-lg border border-slate-200 bg-white p-3";
  const customerPicker = <div className="space-y-3">
    <p className="text-sm">게시 버전 {version.version}의 거래처별 주문 링크를 만듭니다. 기존 활성 링크는 재사용합니다. QR은 이번 인쇄·PNG에만 넣으며 게시 원문은 바꾸지 않습니다.</p>
    <label className="block text-sm">QR을 받을 거래처<select disabled={busy} aria-label="QR을 받을 거래처" className="mt-1 min-h-11 w-full rounded border p-2" value={selected} onChange={event => { setSelected(event.target.value); setQr(null); onInsert(null); }}>
      <option value="">거래처 선택</option>{customers.map(customer => <option key={customer.id} value={customer.id}>{customer.customer_name}{customer.address ? ` · ${customer.address}` : ""}</option>)}
    </select></label>
    {!customers.length ? <p className="text-sm">거래처가 없습니다. 거래처 등록 상태를 확인하거나 다시 불러와 주세요.</p> : null}
    <div className="flex flex-wrap gap-2"><Button className="min-h-[44px]" disabled={busy || !selected} onClick={() => void generate()} type="button">선택 거래처 QR 생성</Button><Button className="min-h-[44px]" disabled={busy} onClick={() => void load()} type="button">거래처 다시 불러오기</Button>{cursor ? <Button className="min-h-[44px]" disabled={busy} onClick={() => void load(cursor)} type="button">거래처 더 보기</Button> : null}</div>
  </div>;
  return <section className="pricing-no-print space-y-3 rounded border p-3" aria-label="주문 링크 QR">
    <Button className="min-h-[44px]" disabled={busy} onClick={() => open ? setOpen(false) : publicSharingAvailable ? setOpen(true) : void load()} type="button">주문 링크 QR 만들기</Button>
    {open ? <div className="space-y-3">
      {publicSharingAvailable ? <div className={step}>
        <h3 className="font-bold">1 링크 만들기</h3>
        <p className="text-sm">게시 버전 {version.version}을 누구나 열 수 있는 링크·QR로 만듭니다. 주문할 때 카카오 점주 가입과 매장 정보를 확인합니다.</p>
        <Button className="min-h-[44px]" disabled={busy} onClick={() => { setCustomerMode(false); void generatePublic(); }} type="button">공개 링크·QR 생성</Button>
      </div> : null}
      {shared || qr ? <div className={step}>
        <h3 className="font-bold">2 QR·링크 받기</h3>
        <p className="text-sm">링크를 복사해 보내거나 QR을 저장·인쇄에 넣습니다.{shared ? ` 가격·주문: ${version.content.validUntil}까지 · QR 품목 열람: ${documentLinkLastDay(shared.expiresAt)}까지` : ""}</p>
        {shared ? <div className="flex flex-wrap items-center gap-2"><a className="inline-flex min-h-11 items-center break-all underline" href={shared.publicUrl} target="_blank" rel="noreferrer">공개 문서 열기</a><Button className="min-h-[44px]" disabled={busy} onClick={() => { void navigator.clipboard.writeText(shared.publicUrl).then(() => setMessage("공개 링크를 복사했습니다."), () => setMessage("복사하지 못했습니다. 공개 문서를 열어 주소를 복사해 주세요.")); }} type="button">공개 링크 복사</Button></div> : null}
        {qr ? <div className="flex flex-wrap items-center gap-2"><img src={qr.dataUrl} width={160} height={160} alt={`${qr.customerName} 주문 QR 미리보기`} />
          <Button className="min-h-[44px]" onClick={() => { const a = document.createElement("a"); a.href = qr.dataUrl; a.download = `order-qr-v${version.version}.png`; a.click(); }} type="button">QR PNG 저장</Button>
          <Button className="min-h-[44px]" onClick={() => { onInsert(qr); setMessage("인쇄·PNG에 QR을 넣었습니다. 공개 범위와 게시 버전을 확인해 주세요."); }} type="button">문서에 QR 넣기</Button>
          <Button className="min-h-[44px]" onClick={() => { onInsert(null); setMessage("문서에서 QR을 뺐습니다. 발급된 주문 링크는 유지됩니다."); }} type="button">문서에서 QR 빼기</Button>
        </div> : null}
      </div> : null}
      {publicSharingAvailable && (shared || allowCustomerLink) ? <details className={step}>
        <summary className="min-h-11 cursor-pointer content-center font-bold">관리 · 회수와 기존 거래처 전용 QR</summary>
        <p className="text-sm">링크는 언제든 회수할 수 있습니다. 특정 거래처에만 보낼 QR이 필요할 때만 거래처 전용 QR을 씁니다.</p>
        <div className="flex flex-wrap gap-2">
          {shared ? <Button className="min-h-[44px]" disabled={busy} onClick={() => void revokePublic()} type="button">공개 링크 회수</Button> : null}
          {allowCustomerLink ? <Button className="min-h-[44px]" disabled={busy} onClick={() => { setCustomerMode(true); void load(); }} type="button">기존 거래처 전용 QR 선택</Button> : null}
        </div>
        {customerMode && allowCustomerLink ? customerPicker : null}
      </details> : customerMode && allowCustomerLink ? customerPicker : null}
    </div> : null}
    {message ? <p role="status" className="text-sm">{message}</p> : null}
  </section>;
}
