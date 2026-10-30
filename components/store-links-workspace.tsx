"use client";

import { useCallback, useEffect, useState } from "react";

type Draft = { id: string; content: { title: string }; revision: number };
type Version = { id: string; version: number; content: { title: string }; publishedAt: string };
type Customer = { id: string; customer_name: string };
type Link = { id: string; customerName: string; documentTitle: string; documentVersion: number | null;
  url: string; issuedAt: string; expiresAt: string; revokedAt: string | null;
  canOrder: boolean; viewCount: number; lastViewedAt: string | null;
  orderCount: number; interest: string };
type Event = { id: string; event_type: string; occurred_at: string;
  device_class: string | null; actor_name: string | null };

export function StoreLinksWorkspace({ companyId }: { companyId: string }) {
  const [documents, setDocuments] = useState<Draft[]>([]);
  const [documentId, setDocumentId] = useState("");
  const [versions, setVersions] = useState<Version[]>([]);
  const [versionId, setVersionId] = useState("");
  const [customerQuery, setCustomerQuery] = useState("");
  const [customers, setCustomers] = useState<Customer[]>([]);
  const [customerId, setCustomerId] = useState("");
  const [links, setLinks] = useState<Link[]>([]);
  const [page, setPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [detail, setDetail] = useState<{ id: string; events: Event[] } | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [createdUrl, setCreatedUrl] = useState("");
  const base = `companyId=${encodeURIComponent(companyId)}`;
  const loadLinks = useCallback(async () => {
    const response = await fetch(`/api/pricing-store-links?${base}&page=${page}`, { cache: "no-store" });
    const result = await response.json() as { items?: Link[]; hasMore?: boolean; message?: string };
    if (!response.ok) throw new Error(result.message || "링크를 불러오지 못했습니다.");
    setLinks(result.items ?? []); setHasMore(result.hasMore === true);
  }, [base, page]);
  useEffect(() => { void loadLinks().catch((error) => setMessage(String(error))); }, [loadLinks]);
  useEffect(() => {
    void fetch(`/api/pricing-documents?${base}&action=list`, { cache: "no-store" })
      .then((response) => response.json()).then((result: { result?: { items?: Draft[] } }) =>
        setDocuments(result.result?.items ?? [])).catch(() => setMessage("발행 문서를 불러오지 못했습니다."));
  }, [base]);
  useEffect(() => {
    if (!documentId) { setVersions([]); return; }
    void fetch(`/api/pricing-documents?${base}&action=versions&id=${encodeURIComponent(documentId)}`, { cache: "no-store" })
      .then((response) => response.json()).then((result: { result?: Version[] }) =>
        setVersions(result.result ?? [])).catch(() => setMessage("문서 버전을 불러오지 못했습니다."));
  }, [base, documentId]);
  async function searchCustomers() {
    try {
      const response = await fetch(`/api/pricing-order-settings?${base}&customerQuery=${encodeURIComponent(customerQuery)}`);
      const result = await response.json() as { customers?: Customer[]; message?: string };
      if (!response.ok) throw new Error(result.message || "거래처를 찾지 못했습니다.");
      setCustomers(result.customers ?? []);
    } catch (error) { setMessage(error instanceof Error ? error.message : "거래처를 찾지 못했습니다."); }
  }
  async function action(payload: Record<string, unknown>) {
    setBusy(true); setMessage("");
    try {
      const response = await fetch("/api/pricing-store-links", { method: "POST",
        headers: { "Content-Type": "application/json" }, body: JSON.stringify({ companyId, ...payload }) });
      const result = await response.json() as { message?: string; url?: string };
      if (!response.ok) throw new Error(result.message || "링크를 저장하지 못했습니다.");
      if (result.url) {
        setCreatedUrl(result.url);
        try {
          await navigator.clipboard.writeText(result.url);
          setMessage("매장 링크를 만들고 복사했습니다. 받을 매장에 직접 전달해 주세요.");
        } catch {
          setMessage("매장 링크는 만들어졌습니다. 아래 주소를 직접 복사해 주세요.");
        }
      } else setMessage("저장되었습니다.");
      await loadLinks();
    } catch (error) { setMessage(error instanceof Error ? error.message : "링크를 저장하지 못했습니다."); }
    finally { setBusy(false); }
  }
  async function showDetail(id: string) {
    try {
      const response = await fetch(`/api/pricing-store-links?${base}&linkId=${encodeURIComponent(id)}`);
      const result = await response.json() as { events?: Event[]; message?: string };
      if (!response.ok) throw new Error(result.message || "열람 기록을 불러오지 못했습니다.");
      setDetail({ id, events: result.events ?? [] });
    } catch (error) { setMessage(error instanceof Error ? error.message : "열람 기록을 불러오지 못했습니다."); }
  }
  return <div className="space-y-6">
    <header><h1 className="text-xl font-semibold">공개 범위 · 매장 링크</h1>
      <p className="text-sm text-slate-600">매장마다 별도 링크를 만듭니다. 받은 매장만 해당 매장의 주문과 내역을 볼 수 있습니다.</p></header>
    {message && <p role="status" className="rounded border p-3 text-sm">{message}</p>}
    {createdUrl && <input aria-label="방금 만든 매장 링크" readOnly value={createdUrl}
      onFocus={(event) => event.currentTarget.select()} className="w-full rounded border p-2 text-sm" />}
    <section className="space-y-3 rounded border p-4"><h2 className="font-semibold">링크 만들기</h2>
      <label className="block text-sm">문서 선택<select className="mt-1 w-full rounded border p-2" value={documentId}
        onChange={(event) => { setDocumentId(event.target.value); setVersionId(""); }}>
        <option value="">문서 선택</option>{documents.map((item) => <option key={item.id} value={item.id}>{item.content.title}</option>)}
      </select></label>
      <label className="block text-sm">발행 버전<select className="mt-1 w-full rounded border p-2" value={versionId}
        onChange={(event) => setVersionId(event.target.value)}><option value="">발행 버전 선택</option>
        {versions.map((item) => <option key={item.id} value={item.id}>{item.content.title} · v{item.version}</option>)}</select></label>
      <div className="flex gap-2"><input aria-label="거래처 검색" className="min-w-0 flex-1 rounded border p-2" value={customerQuery}
        onChange={(event) => setCustomerQuery(event.target.value)} placeholder="매장 이름 검색" />
        <button className="rounded border px-4" onClick={() => void searchCustomers()}>검색</button></div>
      <select aria-label="링크를 받을 매장" className="w-full rounded border p-2" value={customerId}
        onChange={(event) => setCustomerId(event.target.value)}><option value="">매장 선택</option>
        {customers.map((item) => <option key={item.id} value={item.id}>{item.customer_name}</option>)}</select>
      <button disabled={busy || !versionId || !customerId} className="rounded bg-slate-900 px-4 py-2 text-white disabled:opacity-50"
        onClick={() => void action({ action: "create", customerId, documentVersionId: versionId })}>링크 만들고 복사</button>
    </section>
    <section className="space-y-3"><h2 className="font-semibold">매장별 링크</h2>
      <div className="overflow-x-auto"><table className="w-full min-w-[720px] border-collapse text-sm">
        <thead className="sticky top-0 bg-white"><tr className="border-b text-left">
          <th className="p-2">매장</th><th className="p-2">문서</th><th className="p-2">발행</th>
          <th className="p-2">열람·주문</th><th className="p-2">관심·상태</th><th className="p-2">동작</th></tr></thead>
        <tbody>{links.map((link) => <tr key={link.id} className="border-b">
          <td className="p-2"><button className="underline" onClick={() => void showDetail(link.id)}>{link.customerName}</button></td>
          <td className="p-2">{link.documentTitle} v{link.documentVersion}</td>
          <td className="p-2">{new Date(link.issuedAt).toLocaleDateString("ko-KR")}</td>
          <td className="p-2">열람 {link.viewCount}회 · 주문 {link.orderCount}건</td>
          <td className="p-2">{link.interest} · {link.revokedAt ? "회수" : link.canOrder ? "주문 가능" : "주문 중지"}</td>
          <td className="flex gap-1 p-2"><button className="rounded border px-2 py-1" onClick={() => {
            setCreatedUrl(link.url);
            void navigator.clipboard.writeText(link.url).then(() => setMessage("매장 링크를 복사했습니다."))
              .catch(() => setMessage("복사 권한이 없어 위 주소를 직접 복사해 주세요."));
          }}>복사</button>
            <button className="rounded border px-2 py-1" disabled={busy}
              title="직접 전달한 뒤에만 누르세요. 자동 발송하지 않습니다."
              onClick={() => void action({ action: "mark-sent", id: link.id })}>전달 기록</button>
            {!link.revokedAt && <><button className="rounded border px-2 py-1" disabled={busy}
              onClick={() => void action({ action: "set-ordering", id: link.id, canOrder: !link.canOrder })}>{link.canOrder ? "주문 끄기" : "주문 켜기"}</button>
              <button className="rounded border px-2 py-1" disabled={busy}
                onClick={() => void action({ action: "revoke", id: link.id })}>회수</button></>}</td>
        </tr>)}</tbody></table></div>
      <div className="flex gap-2"><button disabled={page <= 1} className="rounded border px-3 py-2" onClick={() => setPage(page - 1)}>이전</button>
        <span className="p-2">{page}페이지</span><button disabled={!hasMore} className="rounded border px-3 py-2" onClick={() => setPage(page + 1)}>다음</button></div>
    </section>
    {detail && <section className="rounded border p-4"><h2 className="font-semibold">열람 기록</h2>
      <p className="text-sm text-slate-600">최근 50건 · 연결된 매장 링크 기준</p>
      <ul className="mt-2 divide-y text-sm">{detail.events.map((event) => <li key={event.id} className="py-2">
        {new Date(event.occurred_at).toLocaleString("ko-KR")} · {event.event_type} · {event.actor_name || event.device_class || ""}</li>)}</ul>
      <button className="mt-2 rounded border px-3 py-2" onClick={() => setDetail(null)}>닫기</button>
    </section>}
  </div>;
}
